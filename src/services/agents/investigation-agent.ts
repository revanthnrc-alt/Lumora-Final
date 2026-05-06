import type {
  ClusteredEvent,
  EvidenceItem,
  InvestigationEvidence,
  InvestigationQuery,
  InvestigationReport,
  NewsItem,
} from '@/types';
import type { IntelligenceCache } from '@/app/app-context';
import { IntelligenceServiceClient } from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { focalPointDetector } from '@/services/focal-point-detector';
import { signalAggregator } from '@/services/signal-aggregator';
import { getApiBaseUrl, toRuntimeUrl } from '@/services/runtime';
import { getCurrentLanguage } from '@/services/i18n';
import { getCountryNameByCode, nameToCountryCode } from '@/services/country-geometry';
import { CURATED_COUNTRIES } from '@/config/countries';
import {
  buildEvidenceMarkdown,
  clampConfidence,
  fallbackProviderMeta,
  parseStructuredSections,
  pushInvestigationHistory,
  simpleHash,
} from './shared';

export interface InvestigationAgentContext {
  allNews: NewsItem[];
  latestClusters: ClusteredEvent[];
  intelligenceCache: IntelligenceCache;
}

const client = new IntelligenceServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });

function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
}

function matchesCountryText(text: string, countryCode: string): boolean {
  const config = CURATED_COUNTRIES[countryCode];
  if (!config) return false;
  const lower = text.toLowerCase();
  return [config.name, ...config.searchAliases].some(alias => alias && lower.includes(alias.toLowerCase()));
}

function clusterScore(tokens: string[], cluster: ClusteredEvent): number {
  const haystack = `${cluster.primaryTitle} ${cluster.primarySource} ${cluster.allItems.map(item => `${item.title} ${item.locationName || ''}`).join(' ')}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 3;
  }
  if (cluster.isAlert) score += 2;
  if ((cluster.threat?.level === 'critical') || (cluster.threat?.level === 'high')) score += 2;
  score += Math.min(3, cluster.sourceCount - 1);
  return score;
}

function newsScore(tokens: string[], item: NewsItem): number {
  const haystack = `${item.title} ${item.source} ${item.locationName || ''}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 3;
  }
  if (item.isAlert) score += 2;
  if (item.threat?.level === 'critical' || item.threat?.level === 'high') score += 2;
  return score;
}

function detectCountryCode(query: string, geoContext: string): string | undefined {
  const combined = `${query} ${geoContext}`.trim();
  if (!combined) return undefined;
  const direct = nameToCountryCode(combined);
  if (direct) return direct;
  const lower = combined.toLowerCase();
  for (const [code, config] of Object.entries(CURATED_COUNTRIES)) {
    if (lower.includes(config.name.toLowerCase()) || config.searchAliases.some(alias => lower.includes(alias.toLowerCase()))) {
      return code;
    }
  }
  const tokens = combined.split(/[\s,.;:!?()[\]-]+/).filter(Boolean);
  for (const token of tokens) {
    const code = nameToCountryCode(token);
    if (code) return code;
    if (/^[A-Z]{2}$/.test(token)) return token.toUpperCase();
  }
  return undefined;
}

async function fetchCountryBrief(countryCode: string, context: string): Promise<string> {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(toRuntimeUrl('/api/intelligence/v1/get-country-intel-brief'), window.location.origin);
    url.searchParams.set('country_code', countryCode);
    if (context) url.searchParams.set('context', context);
    url.searchParams.set('lang', getCurrentLanguage() || 'en');
    const resp = await fetch(getApiBaseUrl() ? url.toString() : `${url.pathname}${url.search}`);
    if (!resp.ok) return '';
    const data = await resp.json() as { brief?: string };
    return typeof data.brief === 'string' ? data.brief.trim() : '';
  } catch {
    return '';
  }
}

export function buildInvestigationEvidence(
  query: string,
  geoContext: string,
  context: InvestigationAgentContext,
): InvestigationEvidence {
  const signalSummary = signalAggregator.getSummary();
  const focalSummary = focalPointDetector.getLastSummary();
  const countryCode = detectCountryCode(query, geoContext);
  const tokens = tokenizeQuery(`${query} ${geoContext} ${countryCode || ''}`);
  const countrySpecificTokens = countryCode
    ? [countryCode.toLowerCase(), CURATED_COUNTRIES[countryCode]?.name.toLowerCase() || '']
    : [];
  const effectiveTokens = [...new Set([...tokens, ...countrySpecificTokens.filter(Boolean)])];

  const rankedClusters = context.latestClusters
    .map(cluster => {
      let score = clusterScore(effectiveTokens, cluster);
      if (countryCode && matchesCountryText(`${cluster.primaryTitle} ${cluster.allItems.map(item => `${item.title} ${item.locationName || ''}`).join(' ')}`, countryCode)) {
        score += 5;
      }
      return { cluster, score };
    })
    .filter(entry => entry.score > 0 || (countryCode ? matchesCountryText(entry.cluster.primaryTitle, countryCode) : false))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(entry => entry.cluster);

  const fallbackClusters = rankedClusters.length > 0
    ? rankedClusters
    : context.latestClusters.filter(cluster => cluster.isAlert).slice(0, 3);

  const items: EvidenceItem[] = fallbackClusters.map((cluster, index) => ({
    id: `investigation-headline-${index}`,
    kind: 'headline',
    label: cluster.primarySource,
    detail: cluster.primaryTitle,
    source: cluster.primarySource,
    url: cluster.primaryLink,
    severity: cluster.threat?.level === 'critical' || cluster.threat?.level === 'high' ? 'high' : 'medium',
  }));

  if (items.length < 3) {
    const rankedNews = context.allNews
      .map(item => {
        let score = newsScore(effectiveTokens, item);
        if (countryCode && matchesCountryText(`${item.title} ${item.locationName || ''}`, countryCode)) {
          score += 4;
        }
        return { item, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    for (const { item } of rankedNews) {
      if (items.some(existing => existing.detail === item.title)) continue;
      items.push({
        id: `investigation-news-${simpleHash(item.title)}`,
        kind: 'headline',
        label: item.source,
        detail: item.title,
        source: item.source,
        url: item.link,
        severity: item.threat?.level === 'critical' || item.threat?.level === 'high' ? 'high' : item.isAlert ? 'medium' : 'low',
      });
      if (items.length >= 6) break;
    }
  }

  const topCountry = countryCode
    ? signalSummary.topCountries.find(item => item.country === countryCode)
    : signalSummary.topCountries[0];

  if (topCountry) {
    items.push({
      id: `investigation-signal-${topCountry.country}`,
      kind: 'signal',
      label: `${topCountry.countryName} signal convergence`,
      detail: `${topCountry.totalCount} signals across ${Array.from(topCountry.signalTypes).join(', ')}.`,
      severity: topCountry.highSeverityCount > 0 ? 'high' : 'medium',
    });
  }

  if (focalSummary?.focalPoints?.length) {
    const focal = countryCode
      ? focalSummary.focalPoints.find(point => point.entityId === countryCode)
      : focalSummary.focalPoints[0];
    if (focal) {
      items.push({
        id: `investigation-focal-${focal.entityId}`,
        kind: 'country',
        label: `${focal.displayName} focal point`,
        detail: focal.narrative,
        severity: focal.urgency === 'critical' ? 'high' : focal.urgency === 'elevated' ? 'medium' : 'low',
      });
    }
  }

  if (geoContext.trim()) {
    items.push({
      id: 'investigation-context',
      kind: 'context',
      label: 'User context',
      detail: geoContext.trim(),
      severity: 'medium',
    });
  }

  if (items.length === 0) {
    items.push({
      id: `investigation-query-${simpleHash(query)}`,
      kind: 'context',
      label: 'Requested investigation',
      detail: query.trim(),
      severity: 'medium',
    });
  }

  if (countryCode && context.intelligenceCache.orefAlerts?.alertCount && countryCode === 'IL') {
    items.push({
      id: 'investigation-oref',
      kind: 'signal',
      label: 'OREF sirens',
      detail: `${context.intelligenceCache.orefAlerts.alertCount} active siren alerts and ${context.intelligenceCache.orefAlerts.historyCount24h} alerts in the last 24h.`,
      severity: 'high',
    });
  }

  return {
    query,
    geoContext,
    items: items.slice(0, 8),
    countryCode,
  };
}

function buildInvestigationPrompt(evidence: InvestigationEvidence): { query: string; geoContext: string } {
  const countryLine = evidence.countryCode
    ? `Primary country context: ${getCountryNameByCode(evidence.countryCode) || CURATED_COUNTRIES[evidence.countryCode]?.name || evidence.countryCode}`
    : 'Primary country context: not confidently identified';

  return {
    query: [
      evidence.query,
      '',
      'Return exactly these markdown headings:',
      '## Bottom Line',
      '## Evidence',
      '## Competing Interpretations',
      '## Outlook',
      '## Uncertainty / Missing Data',
      'Be concise, evidence-led, and avoid AI preambles.',
    ].join('\n'),
    geoContext: [
      countryLine,
      evidence.geoContext ? `Operator context: ${evidence.geoContext}` : '',
      'Collected evidence:',
      buildEvidenceMarkdown(evidence.items),
      evidence.countryBrief ? `\nCountry brief:\n${evidence.countryBrief}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function fallbackInvestigationReport(
  evidence: InvestigationEvidence,
  assessment: string,
): InvestigationReport {
  const sections = parseStructuredSections(assessment);
  const confidence = clampConfidence(0.45 + Math.min(0.4, evidence.items.length * 0.06));
  return {
    id: `investigation-${simpleHash(`${evidence.query}|${evidence.geoContext}`)}`,
    status: 'complete',
    lastRunAt: Date.now(),
    inputs: {
      query: evidence.query,
      geoContext: evidence.geoContext,
    },
    evidence: evidence.items,
    assessment,
    sections: {
      bottomLine: sections.bottomLine || assessment,
      evidence: sections.evidence || evidence.items.map(item => `- ${item.detail}`).join('\n'),
      competingInterpretations: sections.competingInterpretations,
      outlook: sections.outlook,
      uncertainty: sections.uncertainty,
    },
    confidence,
    providerMeta: fallbackProviderMeta(),
  };
}

export async function runInvestigationAgent(
  input: InvestigationQuery,
  context: InvestigationAgentContext,
): Promise<InvestigationReport> {
  const evidence = buildInvestigationEvidence(input.query, input.geoContext || '', context);
  if (evidence.countryCode) {
    evidence.countryBrief = await fetchCountryBrief(evidence.countryCode, evidence.items.map(item => item.detail).join('\n'));
  }

  const prompt = buildInvestigationPrompt(evidence);

  try {
    const resp = await client.deductSituation({
      query: prompt.query,
      geoContext: prompt.geoContext,
    });
    if (resp.analysis) {
      const sections = parseStructuredSections(resp.analysis);
      const report: InvestigationReport = {
        id: `investigation-${simpleHash(`${input.query}|${input.geoContext || ''}`)}`,
        status: 'complete',
        lastRunAt: Date.now(),
        inputs: input,
        evidence: evidence.items,
        assessment: resp.analysis,
        sections: {
          bottomLine: sections.bottomLine || resp.analysis,
          evidence: sections.evidence || '',
          competingInterpretations: sections.competingInterpretations || '',
          outlook: sections.outlook || '',
          uncertainty: sections.uncertainty || '',
        },
        confidence: clampConfidence(0.5 + Math.min(0.38, evidence.items.length * 0.05) + (evidence.countryBrief ? 0.08 : 0)),
        providerMeta: {
          provider: resp.provider || 'AI',
          model: resp.model || '',
          cached: false,
        },
      };
      pushInvestigationHistory(report);
      return report;
    }
  } catch (error) {
    console.warn('[InvestigationAgent] synthesis failed:', error);
  }

  const fallbackMarkdown = [
    '## Bottom Line',
    `Assessment requested: ${input.query}`,
    '',
    '## Evidence',
    buildEvidenceMarkdown(evidence.items),
    '',
    '## Competing Interpretations',
    '- Some signals may reflect short-term reporting noise rather than durable escalation.',
    '',
    '## Outlook',
    '- Monitor the next refresh cycle for confirmation or contradiction.',
    '',
    '## Uncertainty / Missing Data',
    '- Evidence is limited to currently loaded dashboard context.',
  ].join('\n');
  const fallback = fallbackInvestigationReport(evidence, fallbackMarkdown);
  pushInvestigationHistory(fallback);
  return fallback;
}
