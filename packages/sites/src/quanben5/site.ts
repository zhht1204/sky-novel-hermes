import type { BookInfoInput, CatalogInput, ChapterInput, ConnectionCheck, NovelSiteAdapter, SearchQuery, SearchResult, SiteCapability } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { BrowserProvider } from '../browser/browserProvider.js';
import { CloakBrowserProvider } from '../browser/browserProvider.js';
import { fetchText } from '../http.js';
import { parseBookInfo, parseCatalog, parseChapter, parseSearchResults } from './parser.js';
import { QUANBEN5_BIG5, QUANBEN5_SIMPLIFIED, SEARCH_OBFUSCATION_CHARS, type Quanben5SourceConfig } from './selectors.js';

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
    const encodedKeyword = encodeURI(query.keyword);
    const obfuscated = encodeURI(obfuscateKeyword(encodedKeyword));
    const params = new URLSearchParams({
      c: 'book',
      a: 'search.json',
      callback: 'search',
      t: String(Date.now()),
      keywords: query.keyword,
    });
    // The obfuscated `b` value mirrors the site's client encoding and must be sent
    // unescaped (its `%` markers are not standard percent-encoding).
    const searchUrl = `${this.baseUrl}/?${params.toString()}&b=${obfuscated}`;
    const { text } = await this.fetchHtml(searchUrl, {
      headers: { referer: `${this.baseUrl}/search.html` },
    });
    const content = extractJsonpContent(text);
    if (!content) return [];
    return parseSearchResults(content, this.baseUrl, this.source, query.limit);
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

  private async fetchHtml(url: string, options?: { headers?: Record<string, string> }): Promise<{ text: string; status: number }> {
    return fetchText(url, options);
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

/**
 * Mirrors the site's client-side keyword obfuscation: each character is shifted
 * three positions within the static table (unknown characters are kept as-is)
 * and wrapped between two random padding characters.
 */
function obfuscateKeyword(value: string): string {
  const table = SEARCH_OBFUSCATION_CHARS;
  let encoded = '';
  for (const char of value) {
    const index = table.indexOf(char);
    const code = index === -1 ? char : table[(index + 3) % table.length];
    const left = table[Math.floor(Math.random() * table.length)];
    const right = table[Math.floor(Math.random() * table.length)];
    encoded += `${left}${code}${right}`;
  }
  return encoded;
}

/** Extracts the JSON payload from a `callback({ ... })` JSONP response. */
function extractJsonpContent(text: string): string | undefined {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start === -1 || end <= start) return undefined;
  try {
    const data = JSON.parse(text.slice(start + 1, end)) as { content?: unknown };
    return typeof data.content === 'string' ? data.content : undefined;
  } catch {
    return undefined;
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
