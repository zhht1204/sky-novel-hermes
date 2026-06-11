import { z } from 'zod';

export const SiteCapabilitySchema = z.enum([
  'connection-check',
  'search',
  'book-info',
  'catalog',
  'chapter-content',
]);

export type SiteCapability = z.infer<typeof SiteCapabilitySchema>;

export const ConnectionCheckSchema = z.object({
  siteId: z.string(),
  ok: z.boolean(),
  status: z.number().optional(),
  latencyMs: z.number().nonnegative(),
  checkedAt: z.string(),
  message: z.string().optional(),
});

export type ConnectionCheck = z.infer<typeof ConnectionCheckSchema>;

export const SearchQuerySchema = z.object({
  keyword: z.string().min(1),
  limit: z.number().int().positive().max(50).default(20),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResultSchema = z.object({
  siteId: z.string(),
  title: z.string(),
  author: z.string().optional(),
  url: z.string().url(),
  latestChapterTitle: z.string().optional(),
  description: z.string().optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const BookInfoInputSchema = z.object({
  url: z.string().url(),
});

export type BookInfoInput = z.infer<typeof BookInfoInputSchema>;

export const BookInfoSchema = z.object({
  siteId: z.string(),
  sourceUrl: z.string().url(),
  canonicalUrl: z.string().url(),
  title: z.string(),
  author: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  coverUrl: z.string().url().optional(),
  description: z.string().optional(),
  createdAt: z.string(),
});

export type BookInfo = z.infer<typeof BookInfoSchema>;

export const CatalogInputSchema = z.object({
  bookUrl: z.string().url(),
});

export type CatalogInput = z.infer<typeof CatalogInputSchema>;

export const ChapterRefSchema = z.object({
  siteId: z.string(),
  bookUrl: z.string().url(),
  sourceUrl: z.string().url(),
  index: z.number().int().nonnegative(),
  title: z.string(),
});

export type ChapterRef = z.infer<typeof ChapterRefSchema>;

export const ChapterInputSchema = z.object({
  bookUrl: z.string().url(),
  chapterUrl: z.string().url(),
});

export type ChapterInput = z.infer<typeof ChapterInputSchema>;

export const ChapterContentSchema = z.object({
  siteId: z.string(),
  bookUrl: z.string().url(),
  sourceUrl: z.string().url(),
  title: z.string(),
  index: z.number().int().nonnegative().optional(),
  text: z.string(),
  html: z.string().optional(),
  fetchedAt: z.string(),
});

export type ChapterContent = z.infer<typeof ChapterContentSchema>;

export const DownloadStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);

export type DownloadStatus = z.infer<typeof DownloadStatusSchema>;

export const DownloadTaskSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  bookUrl: z.string().url(),
  status: DownloadStatusSchema,
  totalChapters: z.number().int().nonnegative(),
  completedChapters: z.number().int().nonnegative(),
  failedChapters: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  message: z.string().optional(),
});

export type DownloadTask = z.infer<typeof DownloadTaskSchema>;

export const DownloadFailureSchema = z.object({
  taskId: z.string(),
  siteId: z.string(),
  bookUrl: z.string().url(),
  chapterUrl: z.string().url(),
  chapterIndex: z.number().int().nonnegative(),
  title: z.string(),
  attempts: z.number().int().nonnegative(),
  error: z.string(),
  lastFailedAt: z.string(),
});

export type DownloadFailure = z.infer<typeof DownloadFailureSchema>;

export const AnalysisKindSchema = z.enum(['metadata', 'chapter-summary', 'book-summary', 'quality-check']);
export type AnalysisKind = z.infer<typeof AnalysisKindSchema>;

export const AnalysisResultSchema = z.object({
  kind: AnalysisKindSchema,
  sourceId: z.string(),
  model: z.string(),
  summary: z.string(),
  data: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export interface NovelSiteAdapter {
  id: string;
  displayName: string;
  baseUrl: string;
  capabilities: SiteCapability[];
  checkConnection(): Promise<ConnectionCheck>;
  search(query: SearchQuery): Promise<SearchResult[]>;
  getBookInfo(input: BookInfoInput): Promise<BookInfo>;
  getCatalog(input: CatalogInput): Promise<ChapterRef[]>;
  getChapter(input: ChapterInput): Promise<ChapterContent>;
}

export interface ServiceStatus {
  name: string;
  version: string;
  startedAt: string;
  sites: Array<{
    id: string;
    displayName: string;
    baseUrl: string;
    capabilities: SiteCapability[];
  }>;
}

export const SAMPLE_BOOK_URL = 'https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html';

export function nowIso(): string {
  return new Date().toISOString();
}
