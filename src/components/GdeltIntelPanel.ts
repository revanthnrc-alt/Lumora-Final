import { Panel } from './Panel';
import { sanitizeUrl } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { h, replaceChildren } from '@/utils/dom-utils';
import type { ClusteredEvent, NewsItem } from '@/types';
import {
  getIntelTopics,
  fetchTopicIntelligence,
  formatArticleDate,
  extractDomain,
  type GdeltArticle,
  type IntelTopic,
  type TopicIntelligence,
} from '@/services/gdelt-intel';

interface GdeltIntelPanelContext {
  allNews: NewsItem[];
  latestClusters: ClusteredEvent[];
}

export class GdeltIntelPanel extends Panel {
  private activeTopic: IntelTopic = getIntelTopics()[0]!;
  private topicData = new Map<string, TopicIntelligence>();
  private tabsEl: HTMLElement | null = null;
  private readonly getContext?: () => GdeltIntelPanelContext;

  constructor(getContext?: () => GdeltIntelPanelContext) {
    super({
      id: 'gdelt-intel',
      title: t('panels.gdeltIntel'),
      showCount: true,
      trackActivity: true,
      infoTooltip: t('components.gdeltIntel.infoTooltip'),
    });
    this.getContext = getContext;
    this.createTabs();
    this.loadActiveTopic();
  }

  private topicTokens(topic: IntelTopic): string[] {
    return topic.query
      .toLowerCase()
      .replace(/[()"]/g, ' ')
      .split(/[^a-z0-9]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 4 && token !== 'sourcelang' && token !== 'eng');
  }

  private buildFallbackArticles(): GdeltArticle[] {
    const context = this.getContext?.();
    if (!context) return [];
    const tokens = this.topicTokens(this.activeTopic);
    const ranked = context.latestClusters
      .map((cluster) => {
        const haystack = `${cluster.primaryTitle} ${cluster.primarySource}`.toLowerCase();
        let score = 0;
        for (const token of tokens) {
          if (haystack.includes(token)) score += 3;
        }
        if (cluster.isAlert) score += 2;
        if (cluster.threat?.level === 'high' || cluster.threat?.level === 'critical') score += 2;
        return { cluster, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ cluster }) => ({
        title: cluster.primaryTitle,
        url: cluster.primaryLink,
        source: cluster.primarySource,
        date: cluster.lastUpdated.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
      } satisfies GdeltArticle));

    if (ranked.length > 0) return ranked;

    return context.allNews.slice(0, 5).map((item) => ({
      title: item.title,
      url: item.link,
      source: item.source,
      date: item.pubDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'),
    }));
  }

  private createTabs(): void {
    this.tabsEl = h('div', { className: 'gdelt-intel-tabs' },
      ...getIntelTopics().map(topic =>
        h('button', {
          className: `gdelt-intel-tab ${topic.id === this.activeTopic.id ? 'active' : ''}`,
          dataset: { topicId: topic.id },
          title: topic.description,
          onClick: () => this.selectTopic(topic),
        },
          h('span', { className: 'tab-icon' }, topic.icon),
          h('span', { className: 'tab-label' }, topic.name),
        ),
      ),
    );

    this.element.insertBefore(this.tabsEl, this.content);
  }

  private selectTopic(topic: IntelTopic): void {
    if (topic.id === this.activeTopic.id) return;

    this.activeTopic = topic;

    this.tabsEl?.querySelectorAll('.gdelt-intel-tab').forEach(tab => {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.topicId === topic.id);
    });

    const cached = this.topicData.get(topic.id);
    if (cached && Date.now() - cached.fetchedAt.getTime() < 5 * 60 * 1000) {
      this.renderArticles(cached.articles);
    } else {
      this.loadActiveTopic();
    }
  }

  private async loadActiveTopic(): Promise<void> {
    this.showLoading();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await fetchTopicIntelligence(this.activeTopic, attempt === 0 ? '24h' : '72h');
        if (!this.element?.isConnected) return;
        this.topicData.set(this.activeTopic.id, data);

        if (data.articles.length === 0 && attempt < 2) {
          this.showRetrying();
          await new Promise(r => setTimeout(r, 15_000));
          if (!this.element?.isConnected) return;
          continue;
        }

        const articles = data.articles.length > 0 ? data.articles : this.buildFallbackArticles();
        this.renderArticles(articles, data.articles.length === 0);
        this.setCount(articles.length);
        return;
      } catch (error) {
        if (this.isAbortError(error)) return;
        if (!this.element?.isConnected) return;
        console.error(`[GdeltIntelPanel] Load error (attempt ${attempt + 1}):`, error);
        if (attempt < 2) {
          this.showRetrying();
          await new Promise(r => setTimeout(r, 15_000));
          if (!this.element?.isConnected) return;
          continue;
        }
        this.showError(t('common.failedIntelFeed'));
      }
    }
  }

  private renderArticles(articles: GdeltArticle[], fallback = false): void {
    if (articles.length === 0) {
      replaceChildren(this.content,
        h('div', { className: 'empty-state' },
          h('div', {}, t('components.gdelt.empty')),
          h('div', { style: 'margin-top:8px;font-size:12px;opacity:0.7;' }, 'No recent upstream matches for this topic right now.'),
        ),
      );
      return;
    }

    replaceChildren(this.content,
      h('div', { className: 'gdelt-intel-articles' },
        ...(fallback ? [h('div', { className: 'empty-state', style: 'margin-bottom:8px;font-size:12px;opacity:0.75;' }, 'Showing Lumora context fallback while upstream intelligence is sparse.')] : []),
        ...articles.map(article => this.buildArticle(article)),
      ),
    );
  }

  private buildArticle(article: GdeltArticle): HTMLElement {
    const domain = article.source || extractDomain(article.url);
    const timeAgo = formatArticleDate(article.date);
    const toneClass = article.tone ? (article.tone < -2 ? 'tone-negative' : article.tone > 2 ? 'tone-positive' : '') : '';

    return h('a', {
      href: sanitizeUrl(article.url),
      target: '_blank',
      rel: 'noopener',
      className: `gdelt-intel-article ${toneClass}`.trim(),
    },
      h('div', { className: 'article-header' },
        h('span', { className: 'article-source' }, domain),
        h('span', { className: 'article-time' }, timeAgo),
      ),
      h('div', { className: 'article-title' }, article.title),
    );
  }

  public async refresh(): Promise<void> {
    await this.loadActiveTopic();
  }

  public async refreshAll(): Promise<void> {
    this.topicData.clear();
    await this.loadActiveTopic();
  }
}
