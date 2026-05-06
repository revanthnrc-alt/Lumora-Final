import { Panel } from './Panel';
import type { ClusteredEvent, InvestigationReport, NewsItem } from '@/types';
import type { IntelligenceCache } from '@/app/app-context';
import { runInvestigationAgent } from '@/services/agents/investigation-agent';
import { getInvestigationHistory } from '@/services/agents/shared';
import { h, replaceChildren } from '@/utils/dom-utils';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { escapeHtml } from '@/utils/sanitize';

interface InvestigationPanelContext {
  allNews: NewsItem[];
  latestClusters: ClusteredEvent[];
  intelligenceCache: IntelligenceCache;
}

export class InvestigationPanel extends Panel {
  private readonly getContext: () => InvestigationPanelContext;
  private formEl: HTMLFormElement;
  private queryEl: HTMLTextAreaElement;
  private geoEl: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private resultEl: HTMLElement;
  private historyEl: HTMLElement;
  private isRunning = false;

  constructor(getContext: () => InvestigationPanelContext) {
    super({
      id: 'investigation',
      title: 'Investigation Agent',
      infoTooltip: 'Evidence-first analyst agent. It gathers Lumora context first, then produces a structured investigation brief.',
    });
    this.getContext = getContext;
    this.ensureStyles();

    this.queryEl = h('textarea', {
      className: 'investigation-input',
      placeholder: 'Ask a strategic question, e.g. Is Taiwan escalation worsening this week?',
      rows: 3,
      required: true,
    }) as HTMLTextAreaElement;
    this.geoEl = h('input', {
      className: 'investigation-geo',
      type: 'text',
      placeholder: 'Optional geography or operator context...',
    }) as HTMLInputElement;
    this.submitBtn = h('button', { className: 'investigation-submit', type: 'submit' }, 'Investigate') as HTMLButtonElement;
    this.formEl = h('form', { className: 'investigation-form' }, this.queryEl, this.geoEl, this.submitBtn) as HTMLFormElement;
    this.resultEl = h('div', { className: 'investigation-result' });
    this.historyEl = h('div', { className: 'investigation-history' });

    replaceChildren(this.content,
      h('div', { className: 'investigation-layout' },
        this.formEl,
        this.historyEl,
        this.resultEl,
      ),
    );

    this.formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.run();
    });

    this.renderHistory();
  }

  private async run(): Promise<void> {
    if (this.isRunning) return;
    const query = this.queryEl.value.trim();
    if (!query) return;
    this.isRunning = true;
    this.submitBtn.disabled = true;
    this.setDataBadge('live', 'analyzing');
    this.resultEl.className = 'investigation-result loading';
    this.resultEl.textContent = 'Collecting evidence and drafting assessment...';

    try {
      const report = await runInvestigationAgent({
        query,
        geoContext: this.geoEl.value.trim(),
      }, this.getContext());
      if (!this.element?.isConnected) return;
      await this.renderReport(report);
      this.renderHistory();
    } catch (error) {
      console.error('[InvestigationPanel] run failed:', error);
      if (this.element?.isConnected) {
        this.setDataBadge('unavailable');
        this.resultEl.className = 'investigation-result error';
        this.resultEl.textContent = 'Unable to complete investigation.';
      }
    } finally {
      this.isRunning = false;
      if (this.element?.isConnected) {
        this.submitBtn.disabled = false;
      }
    }
  }

  private async renderReport(report: InvestigationReport): Promise<void> {
    this.setDataBadge(report.providerMeta.cached ? 'cached' : 'live', report.providerMeta.provider || 'AI');
    const html = await marked.parse(report.assessment);
    if (!this.element?.isConnected) return;
    this.resultEl.className = 'investigation-result';
    this.resultEl.innerHTML = `
      <div class="investigation-query-summary">
        <div class="investigation-query-label">Question</div>
        <div class="investigation-query-text">${escapeHtml(report.inputs.query)}</div>
        ${report.inputs.geoContext ? `<div class="investigation-query-context">${escapeHtml(report.inputs.geoContext)}</div>` : ''}
      </div>
      ${DOMPurify.sanitize(html)}
    `;

    const meta = document.createElement('div');
    meta.className = 'investigation-meta';
    meta.innerHTML = `
      <span>${escapeHtml(report.providerMeta.provider || 'AI')} ${report.providerMeta.model ? `(${escapeHtml(report.providerMeta.model)})` : ''}</span>
      <span>${Math.round(report.confidence * 100)}% confidence</span>
      <span>${report.evidence.length} evidence items</span>
    `;
    this.resultEl.appendChild(meta);
  }

  private renderHistory(): void {
    const history = getInvestigationHistory();
    if (history.length === 0) {
      this.historyEl.innerHTML = '';
      return;
    }

    this.historyEl.innerHTML = `
      <div class="investigation-history-title">Recent investigations</div>
      <div class="investigation-history-list">
        ${history.map(item => `
          <button class="investigation-history-item" data-query="${escapeHtml(item.inputs.query)}" data-context="${escapeHtml(item.inputs.geoContext || '')}">
            <span class="investigation-history-query">${escapeHtml(item.inputs.query)}</span>
            <span class="investigation-history-meta">${Math.round(item.confidence * 100)}% confidence</span>
          </button>
        `).join('')}
      </div>
    `;

    this.historyEl.querySelectorAll<HTMLButtonElement>('.investigation-history-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.queryEl.value = btn.dataset.query || '';
        this.geoEl.value = btn.dataset.context || '';
        void this.run();
      });
    });
  }

  private ensureStyles(): void {
    if (document.getElementById('investigation-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'investigation-panel-styles';
    style.textContent = `
      .investigation-layout { display: flex; flex-direction: column; gap: 12px; padding: 8px; height: 100%; overflow-y: auto; }
      .investigation-form { display: flex; flex-direction: column; gap: 8px; }
      .investigation-input, .investigation-geo { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text-primary, #fff); }
      .investigation-submit { align-self: flex-end; border-radius: 8px; border: none; padding: 8px 14px; background: linear-gradient(135deg, #2563eb, #0f766e); color: #fff; cursor: pointer; font-weight: 600; }
      .investigation-submit:disabled { opacity: 0.6; cursor: not-allowed; }
      .investigation-result { color: var(--text-secondary, #d1d5db); line-height: 1.55; }
      .investigation-query-summary { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(59,130,246,0.18); background: rgba(37,99,235,0.08); }
      .investigation-query-label { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: #93c5fd; margin-bottom: 4px; }
      .investigation-query-text { color: var(--text-primary, #fff); font-weight: 600; }
      .investigation-query-context { margin-top: 4px; font-size: 0.85rem; color: var(--text-secondary, #cbd5e1); }
      .investigation-result.loading { opacity: 0.75; font-style: italic; }
      .investigation-result.error { color: #fca5a5; }
      .investigation-result h2, .investigation-result h3 { color: var(--text-primary, #fff); margin-top: 12px; margin-bottom: 6px; }
      .investigation-result ul { padding-left: 20px; }
      .investigation-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; font-size: 0.76rem; color: var(--text-secondary, #9ca3af); }
      .investigation-history-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary, #9ca3af); }
      .investigation-history-list { display: flex; flex-direction: column; gap: 8px; }
      .investigation-history-item { display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text-primary, #fff); cursor: pointer; text-align: left; }
      .investigation-history-item:hover { background: rgba(255,255,255,0.07); }
      .investigation-history-query { font-size: 0.88rem; }
      .investigation-history-meta { font-size: 0.74rem; color: var(--text-secondary, #9ca3af); white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }
}
