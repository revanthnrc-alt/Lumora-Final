import type {
  EvidenceItem,
  FocalPoint,
  NewsItem,
  WatchtowerAlert,
  WatchtowerAssessment,
} from '@/types';
import type { ClusteredEvent, WatchtowerSignal } from '@/types';
import type { IntelligenceCache } from '@/app/app-context';
import { signalAggregator } from '@/services/signal-aggregator';
import type { GeoSignal } from '@/services/signal-aggregator';
import { focalPointDetector } from '@/services/focal-point-detector';
import { IntelligenceServiceClient } from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { CURATED_COUNTRIES } from '@/config/countries';
import {
  buildEvidenceMarkdown,
  buildFallbackWatchtowerAssessment,
  clampConfidence,
  fallbackProviderMeta,
  getDismissedWatchtowerSignatures,
  getWatchtowerAlertCache,
  getWatchtowerCooldownMap,
  parseStructuredSections,
  setWatchtowerAlertCache,
  setWatchtowerCooldownMap,
  severityFromConfidence,
  simpleHash,
} from './shared';

export interface WatchtowerAgentContext {
  allNews: NewsItem[];
  latestClusters: ClusteredEvent[];
  intelligenceCache: IntelligenceCache;
}

export interface WatchtowerCandidate {
  signature: string;
  signal: WatchtowerSignal;
  evidence: EvidenceItem[];
  confidence: number;
  recommendedPanels: string[];
}

export interface WatchtowerLead extends WatchtowerCandidate {
  actionable: boolean;
}

const client = new IntelligenceServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const WATCHTOWER_COOLDOWN_MS = 20 * 60 * 1000;
const MAX_ALERTS = 3;

const SIGNAL_PANEL_MAP: Record<string, string[]> = {
  active_strike: ['Live News', 'Strategic Risk', 'UCDP Events'],
  military_flight: ['Strategic Posture', 'Global Map', 'Live News'],
  military_vessel: ['Strategic Posture', 'Global Map', 'Live News'],
  protest: ['Live News', 'Country Instability', 'Global Map'],
  internet_outage: ['Service Status', 'Global Map', 'Live News'],
  ais_disruption: ['Supply Chain', 'Global Map', 'Markets'],
  temporal_anomaly: ['AI Insights', 'Country Instability', 'Live News'],
  satellite_fire: ['Fires', 'Global Map', 'Live News'],
};

function isKnownCountry(countryCode: string, countryName: string): boolean {
  if (!countryCode || countryCode === 'XX' || countryCode === 'ZZ') return false;
  if (!countryName || countryName === countryCode) return false;
  return Boolean(CURATED_COUNTRIES[countryCode]);
}

function isGenericSignalNoise(signal: GeoSignal): boolean {
  const lower = signal.title.toLowerCase();
  return (
    signal.type === 'military_vessel' &&
    (/naval vessels near region/.test(lower) || /^\d+\s+naval vessels near region$/.test(lower))
  );
}

function scoreLeadQuality(params: {
  confidence: number;
  relevantNewsCount: number;
  relevantClusterCount: number;
  signalTypes: string[];
  evidence: EvidenceItem[];
  highSeverityCount: number;
}): number {
  let score = params.confidence * 100;
  score += Math.min(20, params.relevantNewsCount * 6);
  score += Math.min(20, params.relevantClusterCount * 6);
  score += Math.min(15, params.highSeverityCount * 5);
  if (params.signalTypes.length >= 2) score += 12;
  if (params.signalTypes.length === 1 && params.signalTypes[0] === 'military_vessel') score -= 18;
  if (params.evidence.some(item => item.kind === 'headline')) score += 10;
  if (params.evidence.some(item => item.kind === 'system')) score += 6;
  return score;
}

function matchesCountry(text: string, countryCode: string): boolean {
  const config = CURATED_COUNTRIES[countryCode];
  if (!config) return false;
  const lower = text.toLowerCase();
  return [config.name, ...config.searchAliases].some(alias => alias && lower.includes(alias.toLowerCase()));
}

function inferSignalTypesFromText(text: string, cluster: ClusteredEvent): string[] {
  const lower = text.toLowerCase();
  const types = new Set<string>();

  if (cluster.threat?.category === 'conflict' || /\bstrike|missile|drone|shelling|airstrike|attack\b/.test(lower)) {
    types.add('active_strike');
  }
  if (/\bflight|jet|aircraft|sortie|air force\b/.test(lower)) {
    types.add('military_flight');
  }
  if (/\bnavy|vessel|warship|carrier|strait|shipping|port|tanker\b/.test(lower)) {
    types.add('military_vessel');
  }
  if (/\bprotest|riot|demonstration|unrest\b/.test(lower)) {
    types.add('protest');
  }
  if (/\boutage|internet|telecom|blackout|offline|network\b/.test(lower)) {
    types.add('internet_outage');
  }
  if (/\bais|shipping disruption|chokepoint|congestion\b/.test(lower)) {
    types.add('ais_disruption');
  }

  return types.size > 0 ? [...types] : [cluster.isAlert ? 'active_strike' : 'temporal_anomaly'];
}

function buildDerivedCountryClusters(context: WatchtowerAgentContext): Array<{
  country: string;
  countryName: string;
  signalTypes: Set<any>;
  totalCount: number;
  highSeverityCount: number;
  signals: GeoSignal[];
}> {
  const byCountry = new Map<string, {
    country: string;
    countryName: string;
    signalTypes: Set<any>;
    totalCount: number;
    highSeverityCount: number;
    signals: GeoSignal[];
  }>();

  for (const cluster of context.latestClusters.slice(0, 40)) {
    const text = [
      cluster.primaryTitle,
      ...cluster.allItems.map(item => `${item.title} ${item.locationName || ''}`),
    ].join(' ');

    for (const [countryCode, config] of Object.entries(CURATED_COUNTRIES)) {
      if (!matchesCountry(text, countryCode)) continue;
      const existing = byCountry.get(countryCode) || {
        country: countryCode,
        countryName: config.name,
        signalTypes: new Set<any>(),
        totalCount: 0,
        highSeverityCount: 0,
        signals: [],
      };
      const inferredTypes = inferSignalTypesFromText(text, cluster);
      for (const type of inferredTypes) existing.signalTypes.add(type);
      existing.totalCount += Math.max(1, cluster.sourceCount);
      if (cluster.isAlert || cluster.threat?.level === 'high' || cluster.threat?.level === 'critical') {
        existing.highSeverityCount += 1;
      }
      existing.signals.push({
        type: inferredTypes[0] as any,
        country: countryCode,
        countryName: config.name,
        lat: cluster.lat || 0,
        lon: cluster.lon || 0,
        severity: cluster.threat?.level === 'critical' || cluster.threat?.level === 'high' ? 'high' : 'medium',
        title: cluster.primaryTitle,
        timestamp: cluster.lastUpdated,
      });
      byCountry.set(countryCode, existing);
    }
  }

  return [...byCountry.values()].sort((a, b) => (b.highSeverityCount * 5 + b.totalCount) - (a.highSeverityCount * 5 + a.totalCount));
}

function buildClusterFallbackLeads(context: WatchtowerAgentContext): WatchtowerLead[] {
  const leads: WatchtowerLead[] = [];
  for (const cluster of context.latestClusters.slice(0, 12)) {
    const text = `${cluster.primaryTitle} ${cluster.allItems.map(item => `${item.title} ${item.locationName || ''}`).join(' ')}`;
    const countryCode = Object.keys(CURATED_COUNTRIES).find(code => matchesCountry(text, code));
    if (!countryCode) continue;
    const countryName = CURATED_COUNTRIES[countryCode]!.name;
    const signalTypes = inferSignalTypesFromText(text, cluster);
    const confidence = clampConfidence(
      0.42
      + (cluster.isAlert ? 0.08 : 0)
      + ((cluster.threat?.level === 'high' || cluster.threat?.level === 'critical') ? 0.08 : 0)
      + Math.min(0.12, cluster.sourceCount * 0.03),
    );
    const evidence: EvidenceItem[] = [{
      id: `fallback-${cluster.id}`,
      kind: 'headline',
      label: cluster.primarySource,
      detail: cluster.primaryTitle,
      source: cluster.primarySource,
      url: cluster.primaryLink,
      severity: cluster.threat?.level === 'critical' || cluster.threat?.level === 'high' ? 'high' : 'medium',
    }];
    leads.push({
      signature: simpleHash(`${countryCode}::${cluster.id}`),
      signal: buildWatchtowerSignal(countryCode, countryName, signalTypes, Math.max(1, cluster.sourceCount), cluster.isAlert ? 1 : 0, cluster.isAlert ? 'elevated' : 'watch'),
      evidence,
      confidence,
      recommendedPanels: deriveRecommendedPanels(signalTypes),
      actionable: false,
    });
  }
  return leads.slice(0, 4);
}

function buildWatchtowerSignal(
  countryCode: string,
  countryName: string,
  signalTypes: string[],
  totalSignals: number,
  highSeverityCount: number,
  urgency: 'watch' | 'elevated' | 'critical',
): WatchtowerSignal {
  return { countryCode, countryName, signalTypes, totalSignals, highSeverityCount, urgency };
}

function gatherHeadlineEvidence(fp: FocalPoint | null, news: NewsItem[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  if (fp?.topHeadlines?.length) {
    for (const headline of fp.topHeadlines.slice(0, 2)) {
      items.push({
        id: `headline-${simpleHash(headline.title)}`,
        kind: 'headline',
        label: 'Corroborating headline',
        detail: headline.title,
        url: headline.url,
      });
    }
  } else {
    for (const item of news.slice(0, 2)) {
      items.push({
        id: `headline-${simpleHash(item.title)}`,
        kind: 'headline',
        label: item.source,
        detail: item.title,
        source: item.source,
        url: item.link,
      });
    }
  }
  return items;
}

function gatherSignalEvidence(countryCode: string, signals: GeoSignal[]): EvidenceItem[] {
  return signals.slice(0, 4).map((signal, index) => ({
    id: `${countryCode}-signal-${index}`,
    kind: 'signal',
    label: signal.type.replace(/_/g, ' '),
    detail: signal.title,
    severity: signal.severity,
  }));
}

function deriveRecommendedPanels(signalTypes: string[]): string[] {
  const ordered = new Set<string>();
  for (const type of signalTypes) {
    for (const panel of SIGNAL_PANEL_MAP[type] || []) {
      ordered.add(panel);
    }
  }
  if (ordered.size === 0) {
    ordered.add('Live News');
    ordered.add('AI Insights');
  }
  return [...ordered].slice(0, 4);
}

export function computeWatchtowerConfidence(params: {
  signalTypeCount: number;
  totalSignals: number;
  highSeverityCount: number;
  urgency: 'watch' | 'elevated' | 'critical';
  newsMentions: number;
  hasOrefAlert: boolean;
}): number {
  let score = 0.32;
  score += Math.min(0.22, params.signalTypeCount * 0.09);
  score += Math.min(0.16, params.totalSignals * 0.03);
  score += Math.min(0.14, params.highSeverityCount * 0.06);
  score += Math.min(0.08, params.newsMentions * 0.02);
  if (params.urgency === 'critical') score += 0.16;
  else if (params.urgency === 'elevated') score += 0.08;
  if (params.hasOrefAlert) score += 0.1;
  return clampConfidence(score);
}

export function isWatchtowerSignalActionable(candidate: {
  signalTypes: string[];
  totalSignals: number;
  highSeverityCount: number;
  urgency: 'watch' | 'elevated' | 'critical';
  confidence: number;
}): boolean {
  const corroborated = candidate.signalTypes.length >= 2 || candidate.totalSignals >= 3;
  const severe = candidate.highSeverityCount > 0 || candidate.urgency !== 'watch';
  return corroborated && severe && candidate.confidence >= 0.58;
}

export function isWatchtowerCooldownActive(
  signature: string,
  now: number,
  cooldownMap: Record<string, number>,
  cooldownMs = WATCHTOWER_COOLDOWN_MS,
): boolean {
  const last = cooldownMap[signature];
  return typeof last === 'number' && now - last < cooldownMs;
}

function buildWatchtowerLeads(context: WatchtowerAgentContext): WatchtowerLead[] {
  const signalSummary = signalAggregator.getSummary();
  const dismissed = new Set(getDismissedWatchtowerSignatures());
  const sourceCountries = signalSummary.topCountries.length > 0
    ? signalSummary.topCountries
    : buildDerivedCountryClusters(context);

  return sourceCountries.slice(0, 6).flatMap((cluster) => {
    const fp = focalPointDetector.getFocalPointForCountry(cluster.country);
    const urgency = fp?.urgency || (cluster.signalTypes.size >= 3 ? 'critical' : cluster.signalTypes.size >= 2 ? 'elevated' : 'watch');
    const countryName = CURATED_COUNTRIES[cluster.country]?.name || cluster.countryName;
    if (!isKnownCountry(cluster.country, countryName)) {
      return [];
    }
    const relevantNews = context.allNews.filter(item =>
      item.locationName === countryName || item.title.toLowerCase().includes(countryName.toLowerCase())
    );
    const relevantClusters = context.latestClusters.filter(item =>
      matchesCountry(`${item.primaryTitle} ${item.allItems.map(news => `${news.title} ${news.locationName || ''}`).join(' ')}`, cluster.country)
    );
    const hasOrefAlert = cluster.country === 'IL' && (context.intelligenceCache.orefAlerts?.alertCount || 0) > 0;
    const confidence = computeWatchtowerConfidence({
      signalTypeCount: cluster.signalTypes.size,
      totalSignals: cluster.totalCount,
      highSeverityCount: cluster.highSeverityCount,
      urgency,
      newsMentions: fp?.newsMentions || Math.max(relevantNews.length, relevantClusters.length),
      hasOrefAlert,
    });

    const candidateSignal = buildWatchtowerSignal(
      cluster.country,
      countryName,
      [...cluster.signalTypes],
      cluster.totalCount,
      cluster.highSeverityCount,
      urgency,
    );

    const actionable = isWatchtowerSignalActionable({
      signalTypes: candidateSignal.signalTypes,
      totalSignals: candidateSignal.totalSignals,
      highSeverityCount: candidateSignal.highSeverityCount,
      urgency: candidateSignal.urgency,
      confidence,
    });

    const evidence: EvidenceItem[] = [
      ...gatherHeadlineEvidence(fp, relevantNews.length > 0 ? relevantNews : relevantClusters.flatMap(item => item.allItems)),
      ...gatherSignalEvidence(cluster.country, cluster.signals).filter(item => {
        const signal = cluster.signals.find(s => s.title === item.detail);
        return signal ? !isGenericSignalNoise(signal) : true;
      }),
    ];

    if (evidence.length < 2) {
      for (const item of relevantClusters.slice(0, 2)) {
        evidence.push({
          id: `cluster-${item.id}`,
          kind: 'headline',
          label: item.primarySource,
          detail: item.primaryTitle,
          source: item.primarySource,
          url: item.primaryLink,
          severity: item.threat?.level === 'critical' || item.threat?.level === 'high' ? 'high' : 'medium',
        });
      }
    }

    if (hasOrefAlert) {
      evidence.push({
        id: `${cluster.country}-oref`,
        kind: 'signal',
        label: 'OREF alert',
        detail: `${context.intelligenceCache.orefAlerts?.alertCount || 0} active siren alerts in the last refresh.`,
        severity: 'high',
      });
    }

    if (fp?.correlationEvidence?.length) {
      evidence.push({
        id: `${cluster.country}-correlation`,
        kind: 'system',
        label: 'Correlation evidence',
        detail: fp.correlationEvidence[0]!,
        severity: severityFromConfidence(confidence),
      });
    }

    const signature = simpleHash([
      cluster.country,
      [...cluster.signalTypes].sort().join(','),
      evidence.slice(0, 2).map(item => item.detail).join('|'),
    ].join('::'));

    if (dismissed.has(signature)) {
      return [];
    }

    const hasHeadlineEvidence = evidence.some(item => item.kind === 'headline');
    const onlyGenericVesselSignals = candidateSignal.signalTypes.length === 1
      && candidateSignal.signalTypes[0] === 'military_vessel'
      && !hasHeadlineEvidence;
    if (onlyGenericVesselSignals) {
      return [];
    }

    const qualityScore = scoreLeadQuality({
      confidence,
      relevantNewsCount: relevantNews.length,
      relevantClusterCount: relevantClusters.length,
      signalTypes: candidateSignal.signalTypes,
      evidence,
      highSeverityCount: candidateSignal.highSeverityCount,
    });

    if (qualityScore < 55) {
      return [];
    }

    return [{
      signature,
      signal: candidateSignal,
      evidence: evidence.slice(0, 6),
      confidence,
      recommendedPanels: deriveRecommendedPanels(candidateSignal.signalTypes),
      actionable,
    }];
  }).sort((a, b) => {
    const aHeadline = a.evidence.some(item => item.kind === 'headline') ? 1 : 0;
    const bHeadline = b.evidence.some(item => item.kind === 'headline') ? 1 : 0;
    if (bHeadline !== aHeadline) return bHeadline - aHeadline;
    if (b.signal.signalTypes.length !== a.signal.signalTypes.length) {
      return b.signal.signalTypes.length - a.signal.signalTypes.length;
    }
    return b.confidence - a.confidence;
  });
}

export function buildWatchtowerCandidates(context: WatchtowerAgentContext): WatchtowerCandidate[] {
  return buildWatchtowerLeads(context).filter(candidate => candidate.actionable);
}

export function buildWatchtowerWatchlist(context: WatchtowerAgentContext, maxItems = 4): WatchtowerLead[] {
  const leads = buildWatchtowerLeads(context).slice(0, maxItems);
  if (leads.length > 0) return leads;
  return buildClusterFallbackLeads(context).slice(0, maxItems);
}

function buildWatchtowerPrompt(candidate: WatchtowerCandidate): { query: string; geoContext: string } {
  const countryLabel = `${candidate.signal.countryName} (${candidate.signal.signalTypes.join(', ')})`;
  const query = [
    `Create a short watchtower escalation alert for ${countryLabel}.`,
    'Use exactly these sections:',
    '## Trigger',
    '## Why It Matters',
    '## Likely Next 6-24h',
    '## Recommended Panels/Layers',
    'Keep it under 180 words. Use concise intelligence language with no AI preamble.',
  ].join('\n');

  const geoContext = [
    `Country: ${candidate.signal.countryName}`,
    `Urgency: ${candidate.signal.urgency}`,
    `Total signals: ${candidate.signal.totalSignals}`,
    `High severity signals: ${candidate.signal.highSeverityCount}`,
    `Signal types: ${candidate.signal.signalTypes.join(', ')}`,
    'Evidence:',
    buildEvidenceMarkdown(candidate.evidence),
    '',
    `Recommended panels: ${candidate.recommendedPanels.join(', ')}`,
  ].join('\n');

  return { query, geoContext };
}

function sectionOrFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

async function synthesizeWatchtowerAssessment(candidate: WatchtowerCandidate): Promise<{
  assessment: WatchtowerAssessment;
  providerMeta: WatchtowerAlert['providerMeta'];
}> {
  const { query, geoContext } = buildWatchtowerPrompt(candidate);
  try {
    const resp = await client.deductSituation({ query, geoContext });
    if (resp.analysis) {
      const sections = parseStructuredSections(resp.analysis);
      const fallback = buildFallbackWatchtowerAssessment(
        candidate.signal.countryName,
        candidate.evidence,
        candidate.recommendedPanels,
      );
      return {
        assessment: {
          trigger: sectionOrFallback(sections.bottomLine, fallback.trigger),
          whyItMatters: sectionOrFallback(sections.evidence, fallback.whyItMatters),
          outlook: sectionOrFallback(sections.outlook, fallback.outlook),
          recommendedPanels: candidate.recommendedPanels,
          markdown: resp.analysis,
        },
        providerMeta: {
          provider: resp.provider || 'AI',
          model: resp.model || '',
          cached: false,
        },
      };
    }
  } catch (error) {
    console.warn('[WatchtowerAgent] synthesis failed:', error);
  }

  return {
    assessment: buildFallbackWatchtowerAssessment(
      candidate.signal.countryName,
      candidate.evidence,
      candidate.recommendedPanels,
    ),
    providerMeta: fallbackProviderMeta(),
  };
}

export async function runWatchtowerAgent(context: WatchtowerAgentContext): Promise<WatchtowerAlert[]> {
  const cooldownMap = getWatchtowerCooldownMap();
  const cache = getWatchtowerAlertCache();
  const now = Date.now();
  const candidates = buildWatchtowerCandidates(context)
    .filter(candidate => !isWatchtowerCooldownActive(candidate.signature, now, cooldownMap))
    .slice(0, MAX_ALERTS);

  const alerts: WatchtowerAlert[] = [];

  for (const candidate of candidates) {
    const cached = cache[candidate.signature] as WatchtowerAlert | undefined;
    if (cached?.assessment) {
      alerts.push({
        ...cached,
        lastRunAt: cached.lastRunAt || now,
        providerMeta: {
          ...cached.providerMeta,
          cached: true,
        },
      });
      cooldownMap[candidate.signature] = now;
      continue;
    }

    const { assessment, providerMeta } = await synthesizeWatchtowerAssessment(candidate);
    const alert: WatchtowerAlert = {
      id: `watchtower-${candidate.signature}`,
      status: 'complete',
      lastRunAt: now,
      inputs: {
        signature: candidate.signature,
        countryCode: candidate.signal.countryCode,
        countryName: candidate.signal.countryName,
      },
      evidence: candidate.evidence,
      assessment,
      confidence: candidate.confidence,
      providerMeta,
    };

    alerts.push(alert);
    cache[candidate.signature] = alert as unknown as Record<string, unknown>;
    cooldownMap[candidate.signature] = now;
  }

  setWatchtowerAlertCache(cache);
  setWatchtowerCooldownMap(cooldownMap);

  return alerts;
}
