/**
 * What-If Scenario Simulator Panel
 * Modal-based component for selecting, viewing, and simulating geopolitical scenarios
 */
import { SCENARIOS, type Scenario, type ScenarioEffect } from '@/config/scenarios';
import { generateSummary } from '@/services/summarization';
import { escapeHtml } from '@/utils/sanitize';
import type { MapContainer } from '@/components/MapContainer';
import type { MapLayers } from '@/types';

export class ScenarioPanel {
    private overlay: HTMLElement | null = null;
    private hud: HTMLElement | null = null;
    private map: MapContainer | null = null;
    private getMap: () => MapContainer | null;
    private savedMapState: { lat: number; lon: number; zoom: number; layers: MapLayers } | null = null;
    private simulationTimers: number[] = [];
    private isSimulating = false;

    constructor(getMap: () => MapContainer | null) {
        this.getMap = getMap;
    }

    open(): void {
        this.map = this.getMap();
        this.showGrid();
    }

    close(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    private showGrid(): void {
        this.close();

        this.overlay = document.createElement('div');
        this.overlay.className = 'scenario-overlay';
        this.overlay.innerHTML = `
      <div class="scenario-modal">
        <div class="scenario-modal-header">
          <span class="scenario-modal-title">⚡ What-If Scenario Simulator</span>
          <button class="scenario-modal-close" id="scenarioModalClose">×</button>
        </div>
        <div class="scenario-grid">
          ${SCENARIOS.map(s => `
            <div class="scenario-card" data-scenario-id="${s.id}">
              <div class="scenario-card-header">
                <span class="scenario-card-icon">${s.icon}</span>
                <div class="scenario-card-info">
                  <div class="scenario-card-title">${escapeHtml(s.title)}</div>
                  <div class="scenario-card-subtitle">${escapeHtml(s.subtitle)}</div>
                  <span class="scenario-badge ${s.category}">${s.category}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

        document.body.appendChild(this.overlay);

        // Close on backdrop click
        this.overlay.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('scenario-overlay')) this.close();
        });

        // Close button
        this.overlay.querySelector('#scenarioModalClose')?.addEventListener('click', () => this.close());

        // Escape key
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.close(); document.removeEventListener('keydown', onEsc); }
        };
        document.addEventListener('keydown', onEsc);

        // Card clicks
        this.overlay.querySelectorAll('.scenario-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = (card as HTMLElement).dataset.scenarioId;
                const scenario = SCENARIOS.find(s => s.id === id);
                if (scenario) this.showDetail(scenario);
            });
        });
    }

    private showDetail(scenario: Scenario): void {

        this.close();

        this.overlay = document.createElement('div');
        this.overlay.className = 'scenario-overlay';
        this.overlay.innerHTML = `
      <div class="scenario-modal">
        <div class="scenario-modal-header">
          <span class="scenario-modal-title">${scenario.icon} ${escapeHtml(scenario.title)}</span>
          <button class="scenario-modal-close" id="scenarioModalClose">×</button>
        </div>
        <div class="scenario-detail">
          <div class="scenario-detail-header">
            <button class="scenario-back-btn" id="scenarioBackBtn">← Back</button>
            <span class="scenario-badge ${scenario.category}">${scenario.category}</span>
          </div>

          <div class="scenario-detail-desc">${escapeHtml(scenario.description)}</div>

          <div class="scenario-section-title">Cascading Effects</div>
          <div class="scenario-effects-list">
            ${scenario.effects.map(e => `
              <div class="scenario-effect-item severity-${e.severity}">
                <span class="scenario-effect-icon">${e.icon}</span>
                <div class="scenario-effect-info">
                  <div class="scenario-effect-label">${escapeHtml(e.label)}</div>
                  <div class="scenario-effect-desc">${escapeHtml(e.description)}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="scenario-section-title">Market Impact Assessment</div>
          <table class="market-impact-table">
            <thead>
              <tr><th>Asset</th><th>Dir</th><th>Magnitude</th><th>Rationale</th></tr>
            </thead>
            <tbody>
              ${scenario.marketImpacts.map(m => `
                <tr>
                  <td>${escapeHtml(m.asset)}</td>
                  <td class="${m.direction === 'up' ? 'market-up' : 'market-down'}">${m.direction === 'up' ? '▲' : '▼'}</td>
                  <td class="${m.direction === 'up' ? 'market-up' : 'market-down'}">${escapeHtml(m.magnitude)}</td>
                  <td style="color: var(--text-secondary)">${escapeHtml(m.rationale)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="scenario-section-title">Affected Countries</div>
          <div class="scenario-countries">
            ${scenario.affectedCountries.map(c => `<span class="scenario-country-tag">${escapeHtml(c)}</span>`).join('')}
          </div>

          <div class="scenario-section-title">Supply Chain Risks</div>
          <ul class="scenario-supply-risks">
            ${scenario.supplyChainRisks.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>

          <div id="scenarioAiBriefContainer"></div>

          <div class="scenario-actions">
            <button class="scenario-simulate-btn" id="scenarioSimulateBtn">🎬 Simulate on Map</button>
            <button class="scenario-ai-btn" id="scenarioAiBtn">🧠 Generate AI Brief</button>
          </div>
        </div>
      </div>
    `;

        document.body.appendChild(this.overlay);

        // Close on backdrop
        this.overlay.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('scenario-overlay')) this.close();
        });

        this.overlay.querySelector('#scenarioModalClose')?.addEventListener('click', () => this.close());
        this.overlay.querySelector('#scenarioBackBtn')?.addEventListener('click', () => this.showGrid());

        // Escape key
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.close(); document.removeEventListener('keydown', onEsc); }
        };
        document.addEventListener('keydown', onEsc);

        // Simulate button
        this.overlay.querySelector('#scenarioSimulateBtn')?.addEventListener('click', () => {
            this.startSimulation(scenario);
        });

        // AI Brief button
        this.overlay.querySelector('#scenarioAiBtn')?.addEventListener('click', () => {
            this.generateAiBrief(scenario);
        });
    }

    private startSimulation(scenario: Scenario): void {
        this.close();
        this.isSimulating = true;
        this.map = this.getMap();

        // Save current map state
        if (this.map) {
            const state = this.map.getState();
            const center = this.map.getCenter();
            this.savedMapState = {
                lat: center?.lat ?? 0,
                lon: center?.lon ?? 0,
                zoom: state.zoom,
                layers: { ...state.layers },
            };
        }

        // Create HUD
        this.hud = document.createElement('div');
        this.hud.className = 'simulation-hud pulse';
        this.hud.innerHTML = `
      <div class="sim-header">
        <span class="sim-title">⚡ Simulation Mode</span>
        <button class="sim-stop-btn" id="simStopBtn">Stop</button>
      </div>
      <div class="sim-scenario-name">${escapeHtml(scenario.title)}</div>
      <div class="sim-progress-bar"><div class="sim-progress-fill" id="simProgressFill"></div></div>
      <div class="sim-effects-log" id="simEffectsLog"></div>
    `;
        document.body.appendChild(this.hud);

        this.hud.querySelector('#simStopBtn')?.addEventListener('click', () => this.stopSimulation());

        // Zoom to trigger region
        if (this.map) {
            this.map.setCenter(scenario.triggerRegion.lat, scenario.triggerRegion.lon, scenario.triggerRegion.zoom);
        }

        // Calculate total duration
        const maxDelay = Math.max(...scenario.effects.map(e => e.delayMs));
        const totalDuration = maxDelay + 3000; // +3s after last effect

        // Play effects one by one
        scenario.effects.forEach((effect, index) => {
            const timer = window.setTimeout(() => {
                if (!this.isSimulating) return;
                this.playEffect(effect, index, scenario.effects.length, totalDuration);
            }, effect.delayMs);
            this.simulationTimers.push(timer);
        });

        // Remove pulse after all effects
        const endTimer = window.setTimeout(() => {
            if (this.hud) {
                this.hud.classList.remove('pulse');
                const fill = this.hud.querySelector('#simProgressFill') as HTMLElement;
                if (fill) fill.style.width = '100%';
            }
        }, totalDuration);
        this.simulationTimers.push(endTimer);
    }

    private playEffect(effect: ScenarioEffect, _index: number, _total: number, totalDuration: number): void {
        if (!this.isSimulating) return;

        // Flash location on map
        if (this.map) {
            this.map.flashLocation(effect.lat, effect.lon, 3000);

            // Enable affected layers
            if (effect.affectedLayers) {
                for (const layer of effect.affectedLayers) {
                    this.map.enableLayer(layer as keyof MapLayers);
                }
            }
        }

        // Update progress bar
        const fill = this.hud?.querySelector('#simProgressFill') as HTMLElement;
        if (fill) {
            const progress = ((effect.delayMs + 1500) / totalDuration) * 100;
            fill.style.width = `${Math.min(progress, 95)}%`;
        }

        // Add to effects log
        const log = this.hud?.querySelector('#simEffectsLog');
        if (log) {
            const effectEl = document.createElement('div');
            effectEl.className = 'sim-effect';
            effectEl.innerHTML = `
        <span class="sim-effect-icon">${effect.icon}</span>
        <span class="sim-effect-text"><strong>${escapeHtml(effect.label)}</strong>: ${escapeHtml(effect.description)}</span>
      `;
            log.appendChild(effectEl);
            log.scrollTop = log.scrollHeight;
        }
    }

    stopSimulation(): void {
        this.isSimulating = false;

        // Clear all timers
        this.simulationTimers.forEach(t => clearTimeout(t));
        this.simulationTimers = [];

        // Remove HUD
        if (this.hud) {
            this.hud.remove();
            this.hud = null;
        }

        // Restore map state
        if (this.map && this.savedMapState) {
            this.map.setCenter(this.savedMapState.lat, this.savedMapState.lon, this.savedMapState.zoom);
            this.map.setLayers(this.savedMapState.layers);
            this.savedMapState = null;
        }
    }

    private async generateAiBrief(scenario: Scenario): Promise<void> {
        const btn = this.overlay?.querySelector('#scenarioAiBtn') as HTMLButtonElement | null;
        const container = this.overlay?.querySelector('#scenarioAiBriefContainer') as HTMLElement | null;
        if (!btn || !container) return;

        btn.classList.add('loading');
        btn.textContent = '🧠 Generating...';
        btn.disabled = true;

        // Build prompt as headlines array (the function expects string[])
        const promptLines = [
            'SCENARIO INTELLIGENCE BRIEF REQUEST',
            'You are a geopolitical intelligence analyst. Write a classified-style situation brief for the following hypothetical scenario.',
            `SCENARIO: ${scenario.title}`,
            `DESCRIPTION: ${scenario.description}`,
            `TRIGGER REGION: ${scenario.triggerRegion.lat}, ${scenario.triggerRegion.lon}`,
            'CASCADING EFFECTS:',
            ...scenario.effects.map(e => `- ${e.label}: ${e.description} [Severity: ${e.severity}]`),
            'MARKET IMPACTS:',
            ...scenario.marketImpacts.map(m => `- ${m.asset}: ${m.direction === 'up' ? '+' : '-'}${m.magnitude} (${m.rationale})`),
            `AFFECTED COUNTRIES: ${scenario.affectedCountries.join(', ')}`,
            'SUPPLY CHAIN RISKS:',
            ...scenario.supplyChainRisks.map(r => `- ${r}`),
            scenario.aiPromptContext,
            'Format as: SITUATION (what happened), ASSESSMENT (cascading consequences), OUTLOOK (likely next 48-72h developments).',
            'Use concise, professional military intelligence style. Mark uncertainty with \'(ASSESSED)\' or \'(LIKELY)\'. Keep under 250 words.',
        ];

        try {
            const result = await generateSummary(promptLines);

            if (result?.summary) {
                // Parse sections from the AI response
                const summary = result.summary;
                container.innerHTML = `
          <div class="intel-brief">
            <div class="intel-brief-title">Intelligence Brief — ${escapeHtml(scenario.title)}</div>
            <div class="intel-brief-text">${escapeHtml(summary)}</div>
            <div style="margin-top:12px;font-size:9px;color:var(--text-secondary);opacity:0.6;">
              Provider: ${escapeHtml(result.provider)} | Model: ${escapeHtml(result.model)} ${result.cached ? '(cached)' : ''}
            </div>
          </div>
        `;
            } else {
                container.innerHTML = `
          <div class="intel-brief" style="border-color: rgba(239,68,68,0.3);">
            <div class="intel-brief-title">Brief Generation Failed</div>
            <div class="intel-brief-text">Unable to generate AI brief. Please check that GROQ_API_KEY or OPENROUTER_API_KEY is configured in Settings.</div>
          </div>
        `;
            }
        } catch (err) {
            container.innerHTML = `
        <div class="intel-brief" style="border-color: rgba(239,68,68,0.3);">
          <div class="intel-brief-title">Error</div>
          <div class="intel-brief-text">${escapeHtml(String(err))}</div>
        </div>
      `;
        } finally {
            btn.classList.remove('loading');
            btn.textContent = '🧠 Generate AI Brief';
            btn.disabled = false;
        }
    }

    destroy(): void {
        this.stopSimulation();
        this.close();
    }
}
