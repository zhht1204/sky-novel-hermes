import type { BookInfoInput, CatalogInput, ChapterInput, ConnectionCheck, NovelSiteAdapter, SearchQuery, SearchResult, SiteCapability } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { BrowserProvider } from '../browser/browserProvider.js';
import { CloakBrowserProvider } from '../browser/browserProvider.js';
import { fetchText } from '../http.js';
import { parseBookInfo, parseCatalog, parseChapter } from './parser.js';
import { QUANBEN5_BIG5, QUANBEN5_SIMPLIFIED, type Quanben5SourceConfig } from './selectors.js';

export class Quanben5SiteAdapter implements NovelSiteAdapter {
  readonly capabilities: SiteCapability[] = ['connection-check', 'search', 'book-info', 'catalog', 'chapter-content'];

  constructor(
    private readonly source: Quanben5SourceConfig,
    private readonly browserProvider: BrowserProvider = new CloakBrowserProvider()
  ) {}

  get id(): string {
    return this.source.id;
  }

  get displayName(): string {
    return this.source.displayName;
  }

  get baseUrl(): string {
    return this.source.baseUrl;
  }

  async checkConnection(): Promise<ConnectionCheck> {
    const started = performance.now();
    try {
      const response = await fetch(this.baseUrl, { method: 'HEAD' });
      return {
        siteId: this.id,
        ok: response.ok,
        status: response.status,
        latencyMs: Math.round(performance.now() - started),
        checkedAt: nowIso(),
      };
    } catch (error) {
      return {
        siteId: this.id,
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        checkedAt: nowIso(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const searchUrl = new URL('/index.php', this.baseUrl);
    searchUrl.searchParams.set('c', 'search');
    searchUrl.searchParams.set('keyword', query.keyword);
    const { text } = await this.fetchHtml(searchUrl.toString());
    const catalog = parseCatalog(text, this.baseUrl, this.source).slice(0, query.limit);
    return catalog.map((chapter) => ({
      siteId: this.id,
      title: chapter.title,
      url: chapter.sourceUrl,
    }));
  }

  async getBookInfo(input: BookInfoInput) {
    const { text } = await this.fetchHtml(input.url);
    return parseBookInfo(text, input.url, this.source);
  }

  async getCatalog(input: CatalogInput) {
    const { text } = await this.fetchHtml(input.bookUrl);
    const catalog = parseCatalog(text, input.bookUrl, this.source);
    if (catalog.length > 0) return catalog;
    const rendered = await this.renderHtml(input.bookUrl);
    return parseCatalog(rendered, input.bookUrl, this.source);
  }

  async getChapter(input: ChapterInput) {
    const { text } = await this.fetchHtml(input.chapterUrl);
    const chapter = parseChapter(text, input.bookUrl, input.chapterUrl, this.source);
    if (chapter.text.length > 200) return chapter;
    const rendered = await this.renderHtml(input.chapterUrl);
    return parseChapter(rendered, input.bookUrl, input.chapterUrl, this.source);
  }

  private async fetchHtml(url: string): Promise<{ text: string; status: number }> {
    return fetchText(url);
  }

  private async renderHtml(url: string): Promise<string> {
    const browser = await this.browserProvider.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return page.content();
    } finally {
      await browser.close();
    }
  }
}

export class Quanben5Big5SiteAdapter extends Quanben5SiteAdapter {
  constructor(browserProvider?: BrowserProvider) {
    super(QUANBEN5_BIG5, browserProvider);
  }
}

export class Quanben5SimplifiedSiteAdapter extends Quanben5SiteAdapter {
  constructor(browserProvider?: BrowserProvider) {
    super(QUANBEN5_SIMPLIFIED, browserProvider);
  }
}
