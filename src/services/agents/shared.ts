import type {
  AgentProviderMeta,
  EvidenceItem,
  InvestigationReport,
  WatchtowerAssessment,
} from '@/types';

const WATCHTOWER_ALERTS_KEY = 'wm-agent-watchtower-alerts';
const WATCHTOWER_COOLDOWN_KEY = 'wm-agent-watchtower-cooldowns';
const WATCHTOWER_DISMISSED_KEY = 'wm-agent-watchtower-dismissed';
const INVESTIGATION_HISTORY_KEY = 'wm-agent-investigation-history';

type JsonRecord = Record<string, unknown>;

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function readSessionJson<T>(key: string, fallback: T): T {
  if (!canUseSessionStorage()) return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSessionJson<T>(key: string, value: T): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore session storage write failures
  }
}

export function getWatchtowerAlertCache(): Record<string, JsonRecord> {
  return readSessionJson<Record<string, JsonRecord>>(WATCHTOWER_ALERTS_KEY, {});
}

export function setWatchtowerAlertCache(value: Record<string, JsonRecord>): void {
  writeSessionJson(WATCHTOWER_ALERTS_KEY, value);
}

export function getWatchtowerCooldownMap(): Record<string, number> {
  return readSessionJson<Record<string, number>>(WATCHTOWER_COOLDOWN_KEY, {});
}

export function setWatchtowerCooldownMap(value: Record<string, number>): void {
  writeSessionJson(WATCHTOWER_COOLDOWN_KEY, value);
}

export function getDismissedWatchtowerSignatures(): string[] {
  return readSessionJson<string[]>(WATCHTOWER_DISMISSED_KEY, []);
}

export function setDismissedWatchtowerSignatures(signatures: string[]): void {
  writeSessionJson(WATCHTOWER_DISMISSED_KEY, signatures);
}

export function dismissWatchtowerSignature(signature: string): void {
  const dismissed = new Set(getDismissedWatchtowerSignatures());
  dismissed.add(signature);
  setDismissedWatchtowerSignatures([...dismissed]);
}

export function clearDismissedWatchtowerSignature(signature: string): void {
  const dismissed = new Set(getDismissedWatchtowerSignatures());
  dismissed.delete(signature);
  setDismissedWatchtowerSignatures([...dismissed]);
}

export function getInvestigationHistory(): InvestigationReport[] {
  return readSessionJson<InvestigationReport[]>(INVESTIGATION_HISTORY_KEY, []);
}

export function pushInvestigationHistory(report: InvestigationReport, maxItems = 6): void {
  const current = getInvestigationHistory().filter(item => item.id !== report.id);
  current.unshift(report);
  writeSessionJson(INVESTIGATION_HISTORY_KEY, current.slice(0, maxItems));
}

export function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.98, Number.isFinite(value) ? value : 0.1));
}

export function severityFromConfidence(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export function fallbackProviderMeta(provider = 'deterministic', model = 'rules'): AgentProviderMeta {
  return { provider, model, cached: false };
}

function normalizeSectionBody(body: string | undefined): string {
  return (body || '').trim().replace(/\n{3,}/g, '\n\n');
}

export function parseStructuredSections(markdown: string): {
  bottomLine: string;
  evidence: string;
  competingInterpretations: string;
  outlook: string;
  uncertainty: string;
} {
  const cleaned = markdown.trim();
  const sectionDefs = [
    { key: 'bottomLine', names: ['Bottom Line'] },
    { key: 'evidence', names: ['Evidence'] },
    { key: 'competingInterpretations', names: ['Competing Interpretations'] },
    { key: 'outlook', names: ['Outlook'] },
    { key: 'uncertainty', names: ['Uncertainty / Missing Data', 'Uncertainty', 'Missing Data'] },
  ] as const;

  const normalized = cleaned.replace(/\r\n/g, '\n');
  const result: Record<string, string> = {
    bottomLine: '',
    evidence: '',
    competingInterpretations: '',
    outlook: '',
    uncertainty: '',
  };

  for (let i = 0; i < sectionDefs.length; i += 1) {
    const current = sectionDefs[i]!;
    const startRegex = new RegExp(`(?:^|\\n)#{1,3}\\s*(?:${current.names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*\\n`, 'i');
    const startMatch = normalized.match(startRegex);
    if (!startMatch || startMatch.index == null) continue;
    const contentStart = startMatch.index + startMatch[0].length;

    let contentEnd = normalized.length;
    for (let j = i + 1; j < sectionDefs.length; j += 1) {
      const next = sectionDefs[j]!;
      const nextRegex = new RegExp(`\\n#{1,3}\\s*(?:${next.names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*\\n`, 'i');
      const nextMatch = normalized.slice(contentStart).match(nextRegex);
      if (nextMatch && nextMatch.index != null) {
        contentEnd = contentStart + nextMatch.index;
        break;
      }
    }
    result[current.key] = normalizeSectionBody(normalized.slice(contentStart, contentEnd));
  }

  if (!result.bottomLine && cleaned) {
    result.bottomLine = cleaned;
  }

  return {
    bottomLine: result.bottomLine || '',
    evidence: result.evidence || '',
    competingInterpretations: result.competingInterpretations || '',
    outlook: result.outlook || '',
    uncertainty: result.uncertainty || '',
  };
}

export function buildEvidenceMarkdown(items: EvidenceItem[]): string {
  if (items.length === 0) return 'No corroborating evidence collected.';
  return items.map(item => `- ${item.label}: ${item.detail}`).join('\n');
}

export function buildFallbackWatchtowerAssessment(
  countryName: string,
  evidence: EvidenceItem[],
  recommendedPanels: string[],
): WatchtowerAssessment {
  const trigger = evidence[0]?.detail || `Escalation signals converging around ${countryName}.`;
  const whyItMatters = evidence.slice(0, 2).map(item => item.detail).join(' ');
  const outlook = evidence.some(item => item.kind === 'signal')
    ? `LIKELY near-term pressure persists while corroborating signals remain active around ${countryName}.`
    : `WATCH for additional corroboration in the next refresh cycle before escalating further.`;
  return {
    trigger,
    whyItMatters: whyItMatters || `Multiple weak signals are aligning around ${countryName}.`,
    outlook,
    recommendedPanels,
    markdown: [
      '## Trigger',
      trigger,
      '',
      '## Why It Matters',
      whyItMatters || `Multiple weak signals are aligning around ${countryName}.`,
      '',
      '## Likely Next 6-24h',
      outlook,
      '',
      '## Recommended Panels/Layers',
      recommendedPanels.map(panel => `- ${panel}`).join('\n') || '- Live News',
    ].join('\n'),
  };
}

export {
  INVESTIGATION_HISTORY_KEY,
  WATCHTOWER_ALERTS_KEY,
  WATCHTOWER_COOLDOWN_KEY,
  WATCHTOWER_DISMISSED_KEY,
};
