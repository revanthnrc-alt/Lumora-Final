import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ClusteredEvent, InvestigationReport, NewsItem } from '../src/types/index.js';
import { signalAggregator } from '../src/services/signal-aggregator.js';
import {
  buildWatchtowerCandidates,
  isWatchtowerCooldownActive,
} from '../src/services/agents/watchtower-agent.js';
import { buildInvestigationEvidence } from '../src/services/agents/investigation-agent.js';
import {
  getInvestigationHistory,
  pushInvestigationHistory,
  setDismissedWatchtowerSignatures,
} from '../src/services/agents/shared.js';

function makeSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear() { store.clear(); },
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    key(index: number) { return [...store.keys()][index] ?? null; },
    removeItem(key: string) { store.delete(key); },
    setItem(key: string, value: string) { store.set(key, String(value)); },
  };
}

function makeCluster(title: string, source = 'Reuters'): ClusteredEvent {
  const item: NewsItem = {
    source,
    title,
    link: 'https://example.com/story',
    pubDate: new Date(),
    isAlert: true,
    threat: { level: 'high', category: 'conflict', confidence: 0.8, source: 'keyword' },
  };

  return {
    id: `cluster-${title}`,
    primaryTitle: title,
    primarySource: source,
    primaryLink: item.link,
    sourceCount: 2,
    topSources: [{ name: source, tier: 1, url: item.link }],
    allItems: [item],
    firstSeen: new Date(),
    lastUpdated: new Date(),
    isAlert: true,
    threat: item.threat,
  };
}

beforeEach(() => {
  signalAggregator.clear();
  setDismissedWatchtowerSignatures([]);
  Object.defineProperty(globalThis, 'window', {
    value: { sessionStorage: makeSessionStorage(), location: { origin: 'https://example.com' } },
    configurable: true,
  });
});

describe('watchtower agent decision logic', () => {
  it('does not emit an alert for a single weak signal', () => {
    signalAggregator.ingestOutages([{
      country: 'IR',
      title: 'Minor ISP disruption',
      lat: 35.6892,
      lon: 51.389,
      severity: 'minor',
      pubDate: new Date(),
    } as any]);

    const candidates = buildWatchtowerCandidates({
      allNews: [],
      latestClusters: [],
      intelligenceCache: {},
    });

    assert.equal(candidates.length, 0);
  });

  it('emits one candidate when multiple signals converge', () => {
    signalAggregator.ingestOutages([{
      country: 'IR',
      title: 'Major internet disruption across Tehran',
      lat: 35.6892,
      lon: 51.389,
      severity: 'total',
      pubDate: new Date(),
    } as any]);
    signalAggregator.ingestTheaterPostures([{
      targetNation: 'Iran',
      totalAircraft: 8,
      totalVessels: 0,
      postureLevel: 'critical',
      theaterName: 'Gulf theater',
    }]);

    const candidates = buildWatchtowerCandidates({
      allNews: [{
        source: 'Reuters',
        title: 'Iran faces communications outage as military flights surge nearby',
        link: 'https://example.com/iran',
        pubDate: new Date(),
        isAlert: true,
      }],
      latestClusters: [makeCluster('Iran faces communications outage as military flights surge nearby')],
      intelligenceCache: {},
    });

    assert.equal(candidates.length, 1);
    assert.ok(candidates[0]!.confidence >= 0.58);
    assert.ok(candidates[0]!.evidence.some(item => item.kind === 'headline'));
    assert.ok(candidates[0]!.evidence.some(item => item.kind === 'signal'));
  });

  it('suppresses duplicate signatures during cooldown', () => {
    const now = Date.now();
    assert.equal(isWatchtowerCooldownActive('sig', now, { sig: now - 5_000 }, 60_000), true);
    assert.equal(isWatchtowerCooldownActive('sig', now, { sig: now - 120_000 }, 60_000), false);
  });
});

describe('investigation agent evidence assembly', () => {
  it('builds evidence from existing clusters before synthesis', () => {
    signalAggregator.ingestOutages([{
      country: 'TW',
      title: 'Regional network outage near Taiwan',
      lat: 25.033,
      lon: 121.5654,
      severity: 'major',
      pubDate: new Date(),
    } as any]);

    const evidence = buildInvestigationEvidence(
      'Is Taiwan escalation worsening?',
      '',
      {
        allNews: [],
        latestClusters: [
          makeCluster('Taiwan says military pressure is increasing'),
          makeCluster('Semiconductor shipping delays emerge around Taiwan Strait'),
        ],
        intelligenceCache: {},
      },
    );

    assert.ok(evidence.items.length >= 2);
    assert.ok(evidence.items.some(item => item.detail.toLowerCase().includes('taiwan')));
  });

  it('stores recent investigation history in session storage', () => {
    const report: InvestigationReport = {
      id: 'report-1',
      status: 'complete',
      lastRunAt: Date.now(),
      inputs: { query: 'Test query', geoContext: 'Test context' },
      evidence: [],
      assessment: '## Bottom Line\nTest',
      sections: {
        bottomLine: 'Test',
        evidence: '',
        competingInterpretations: '',
        outlook: '',
        uncertainty: '',
      },
      confidence: 0.72,
      providerMeta: { provider: 'rules', model: 'test', cached: false },
    };

    pushInvestigationHistory(report);
    const history = getInvestigationHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0]!.id, 'report-1');
  });
});
