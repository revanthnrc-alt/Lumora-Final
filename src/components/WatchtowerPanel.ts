import { Panel } from './Panel';
import type { ClusteredEvent, NewsItem, WatchtowerAlert } from '@/types';
import type { IntelligenceCache } from '@/app/app-context';
import { buildWatchtowerWatchlist, runWatchtowerAgent, type WatchtowerLead } from '@/services/agents/watchtower-agent';
import {
  dismissWatchtowerSignature,
  getDismissedWatchtowerSignatures,
  setDismissedWatchtowerSignatures,
} from '@/services/agents/shared';
import { escapeHtml } from '@/utils/sanitize';

interface WatchtowerPanelContext {
  allNews: NewsItem[];
  latestClusters: ClusteredEvent[];
  intelligenceCache: IntelligenceCache;
}

export class WatchtowerPanel extends Panel {
  private readonly getContext: () => WatchtowerPanelContext;
  private alerts: WatchtowerAlert[] = [];
  private watchlist: WatchtowerLead[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private isRefreshing = false;

  constructor(getContext: () => WatchtowerPanelContext) {
    super({
      id: 'watchtower',
      title: 'Watchtower Agent',
      showCount: true,
      infoTooltip: 'Passive escalation agent that watches Lumora signals for multi-source convergence and surfaces short analyst-style alerts.',
    });
    this.getContext = getContext;
    this.ensureStyles();
    void this.refresh();
    this.refreshTimer = setInterval(() => void this.refresh(), 90_000);
  }

  public override destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    super.destroy();
  }

  public async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.setDataBadge('live', 'monitoring');

    try {
      const context = this.getContext();
      this.watchlist = buildWatchtowerWatchlist(context);
      const alerts = await runWatchtowerAgent(context);
      if (!this.element?.isConnected) return;
      const dismissed = new Set(getDismissedWatchtowerSignatures());
      this.alerts = alerts.filter(alert => !dismissed.has(alert.inputs.signature));
      this.render();
    } catch (error) {
      console.error('[WatchtowerPanel] refresh failed:', error);
      if (this.element?.isConnected) {
        this.setDataBadge('unavailable');
        this.showError('Watchtower monitoring unavailable.');
      }
    } finally {
      this.isRefreshing = false;
    }
  }

  private render(): void {
    this.setCount(this.alerts.length);
    const dismissedCount = getDismissedWatchtowerSignatures().length;
    if (this.alerts.length === 0) {
      const emerging = this.watchlist.filter(item => !item.actionable).slice(0, 3);
      this.setContent(`
        <div class="watchtower-empty">
          <div class="watchtower-empty-title">No active convergence alerts</div>
          <div class="watchtower-empty-copy">Watchtower is scanning live Lumora signals for corroborated escalation patterns.</div>
        </div>
        <div class="watchtower-actions">
          <button class="watchtower-scan-now" type="button">Scan now</button>
        </div>
        ${emerging.length > 0 ? `
          <div class="watchtower-watchlist">
            <div class="watchtower-watchlist-title">Emerging watchlist</div>
            ${emerging.map(item => `
              <button class="watchtower-watch-item" type="button" data-signature="${escapeHtml(item.signature)}">
                <span class="watchtower-watch-item-title">${escapeHtml(item.signal.countryName)}</span>
                <span class="watchtower-watch-item-meta">${Math.round(item.confidence * 100)}% confidence · ${escapeHtml(item.signal.signalTypes.join(', '))}</span>
                <span class="watchtower-watch-item-detail">${escapeHtml(item.evidence[0]?.detail || 'Monitoring for corroboration')}</span>
              </button>
            `).join('')}
          </div>
        ` : ''}
        ${dismissedCount > 0 ? '<button class="watchtower-reset-dismissed" type="button">Restore dismissed alerts</button>' : ''}
      `);
      this.content.querySelector<HTMLButtonElement>('.watchtower-scan-now')?.addEventListener('click', () => {
        this.refresh().catch(() => {});
      });
      this.content.querySelectorAll<HTMLButtonElement>('.watchtower-watch-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const signature = btn.dataset.signature;
          const lead = this.watchlist.find(item => item.signature === signature);
          if (!lead) return;
          this.setContent(`
            <div class="watchtower-lead-detail">
              <div class="watchtower-card-title">${escapeHtml(lead.signal.countryName)}</div>
              <div class="watchtower-card-meta">
                <span class="watchtower-badge">${Math.round(lead.confidence * 100)}% confidence</span>
                <span>status: emerging</span>
              </div>
              <div class="watchtower-section">
                <div class="watchtower-section-title">Signals observed</div>
                <div>${escapeHtml(lead.signal.signalTypes.join(', '))}</div>
              </div>
              <div class="watchtower-evidence">
                ${lead.evidence.map(item => `<span class="watchtower-evidence-chip">${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</span>`).join('')}
              </div>
              <div class="watchtower-chips">
                ${lead.recommendedPanels.map(panel => `<span class="watchtower-chip">${escapeHtml(panel)}</span>`).join('')}
              </div>
              <div class="watchtower-actions">
                <button class="watchtower-scan-now" type="button">Back to watchlist</button>
              </div>
            </div>
          `);
          this.content.querySelector<HTMLButtonElement>('.watchtower-scan-now')?.addEventListener('click', () => this.render());
        });
      });
      this.content.querySelector<HTMLButtonElement>('.watchtower-reset-dismissed')?.addEventListener('click', () => {
        setDismissedWatchtowerSignatures([]);
        this.refresh().catch(() => {});
      });
      return;
    }

    this.setContent(`
      <div class="watchtower-actions">
        <button class="watchtower-scan-now" type="button">Scan now</button>
      </div>
      <div class="watchtower-list">
        ${this.alerts.map(alert => `
          <section class="watchtower-card confidence-${alert.confidence >= 0.8 ? 'high' : alert.confidence >= 0.6 ? 'medium' : 'low'}">
            <div class="watchtower-card-header">
              <div>
                <div class="watchtower-card-title">${escapeHtml(alert.inputs.countryName)}</div>
                <div class="watchtower-card-meta">
                  <span class="watchtower-badge">${Math.round(alert.confidence * 100)}% confidence</span>
                  <span>${escapeHtml(alert.providerMeta.provider || 'rules')}</span>
                </div>
              </div>
              <button class="watchtower-dismiss" data-signature="${escapeHtml(alert.inputs.signature)}" title="Dismiss this alert">Dismiss</button>
            </div>
            <div class="watchtower-section">
              <div class="watchtower-section-title">Trigger</div>
              <div>${escapeHtml(alert.assessment.trigger)}</div>
            </div>
            <div class="watchtower-section">
              <div class="watchtower-section-title">Why It Matters</div>
              <div>${escapeHtml(alert.assessment.whyItMatters)}</div>
            </div>
            <div class="watchtower-section">
              <div class="watchtower-section-title">Likely Next 6-24h</div>
              <div>${escapeHtml(alert.assessment.outlook)}</div>
            </div>
            <div class="watchtower-chips">
              ${alert.assessment.recommendedPanels.map(panel => `<span class="watchtower-chip">${escapeHtml(panel)}</span>`).join('')}
            </div>
            <div class="watchtower-evidence">
              ${alert.evidence.slice(0, 4).map(item => `<span class="watchtower-evidence-chip">${escapeHtml(item.label)}: ${escapeHtml(item.detail)}</span>`).join('')}
            </div>
          </section>
        `).join('')}
      </div>
      <button class="watchtower-reset-dismissed" type="button">Restore dismissed alerts</button>
    `);

    this.content.querySelector<HTMLButtonElement>('.watchtower-scan-now')?.addEventListener('click', () => {
      this.refresh().catch(() => {});
    });

    this.content.querySelectorAll<HTMLButtonElement>('.watchtower-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        const signature = btn.dataset.signature;
        if (!signature) return;
        dismissWatchtowerSignature(signature);
        this.alerts = this.alerts.filter(alert => alert.inputs.signature !== signature);
        this.render();
      });
    });

    this.content.querySelector<HTMLButtonElement>('.watchtower-reset-dismissed')?.addEventListener('click', () => {
      setDismissedWatchtowerSignatures([]);
      this.refresh().catch(() => {});
    });
  }

  private ensureStyles(): void {
    if (document.getElementById('watchtower-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'watchtower-panel-styles';
    style.textContent = `
      .watchtower-list { display: flex; flex-direction: column; gap: 12px; padding: 8px; }
      .watchtower-card { border: 1px solid rgba(255,255,255,0.08); border-left-width: 4px; border-radius: 10px; padding: 12px; background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); }
      .watchtower-card.confidence-high { border-left-color: #ef4444; }
      .watchtower-card.confidence-medium { border-left-color: #f59e0b; }
      .watchtower-card.confidence-low { border-left-color: #38bdf8; }
      .watchtower-card-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
      .watchtower-card-title { font-size: 0.98rem; font-weight: 700; color: var(--text-primary, #fff); }
      .watchtower-card-meta { display: flex; gap: 8px; flex-wrap: wrap; color: var(--text-secondary, #9ca3af); font-size: 0.76rem; margin-top: 4px; }
      .watchtower-badge, .watchtower-chip, .watchtower-evidence-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 0.72rem; }
      .watchtower-badge { background: rgba(239,68,68,0.12); color: #fecaca; }
      .watchtower-chip { background: rgba(59,130,246,0.12); color: #bfdbfe; }
      .watchtower-evidence { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .watchtower-evidence-chip { background: rgba(255,255,255,0.06); color: var(--text-secondary, #d1d5db); }
      .watchtower-section { margin-top: 8px; color: var(--text-secondary, #d1d5db); line-height: 1.45; }
      .watchtower-section-title { color: var(--text-primary, #fff); font-weight: 600; margin-bottom: 4px; }
      .watchtower-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      .watchtower-dismiss, .watchtower-reset-dismissed { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text-primary, #fff); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
      .watchtower-scan-now, .watchtower-watch-item { border: 1px solid rgba(59,130,246,0.18); background: rgba(37,99,235,0.08); color: var(--text-primary, #fff); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
      .watchtower-dismiss:hover, .watchtower-reset-dismissed:hover { background: rgba(255,255,255,0.08); }
      .watchtower-scan-now:hover, .watchtower-watch-item:hover { background: rgba(37,99,235,0.14); }
      .watchtower-reset-dismissed { margin: 0 8px 8px; }
      .watchtower-empty { padding: 16px; color: var(--text-secondary, #9ca3af); }
      .watchtower-empty-title { font-weight: 700; color: var(--text-primary, #fff); margin-bottom: 6px; }
      .watchtower-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 0 8px 8px; }
      .watchtower-watchlist { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 8px; }
      .watchtower-watchlist-title { color: var(--text-primary, #fff); font-weight: 700; padding: 0 4px; }
      .watchtower-watch-item { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; }
      .watchtower-watch-item-title { font-weight: 700; }
      .watchtower-watch-item-meta { color: var(--text-secondary, #cbd5e1); font-size: 0.76rem; }
      .watchtower-watch-item-detail { color: var(--text-secondary, #d1d5db); font-size: 0.82rem; line-height: 1.4; }
      .watchtower-lead-detail { padding: 8px; }
    `;
    document.head.appendChild(style);
  }
}
