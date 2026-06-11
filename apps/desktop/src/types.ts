export interface SiteSummary {
  id: string;
  displayName: string;
  baseUrl: string;
  capabilities: string[];
}

export interface BookInfo {
  siteId: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  author?: string;
  category?: string;
  status?: string;
  coverUrl?: string;
  description?: string;
  createdAt: string;
}

export interface ChapterRef {
  siteId: string;
  bookUrl: string;
  sourceUrl: string;
  index: number;
  title: string;
}

export interface ChapterContent extends ChapterRef {
  text: string;
  html?: string;
  fetchedAt: string;
}

export interface LanguageProfile {
  bookUrl: string;
  language: string;
  confidence: number;
  sampleSize: number;
  detectedAt: string;
  detector: string;
}

export interface ChapterTranslation {
  sourceUrl: string;
  bookUrl: string;
  chapterIndex: number;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
  model: string;
  promptHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  siteId: string;
  title: string;
  author?: string;
  url: string;
  latestChapterTitle?: string;
  description?: string;
}

export interface SiteSearchResultGroup {
  siteId: string;
  displayName: string;
  results: SearchResult[];
  error?: string;
}

export interface AggregatedSearchResponse {
  keyword: string;
  sites: SiteSearchResultGroup[];
  results: SearchResult[];
}

export interface UrlImportResponse {
  book: BookInfo;
  catalog: ChapterRef[];
  catalogCount: number;
}

export type StorageBackend = 'sqlite' | 'postgres';

export interface ServiceSettings {
  storage: {
    backend: StorageBackend;
    sqlitePath?: string;
    postgresUrl?: string;
  };
  exportDir: string;
  autoRetryAttempts: number;
  translation: {
    defaultTargetLanguage: string;
    defaultPrompt: string;
    maxChunkChars: number;
    autoRetryAttempts: number;
  };
  activeStorageBackend?: StorageBackend;
}

export interface ExportResponse {
  filePath: string;
  format: string;
  chapterCount: number;
}

export interface DownloadTask {
  id: string;
  siteId: string;
  bookUrl: string;
  status: string;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  createdAt: string;
  updatedAt: string;
  message?: string;
}

export interface DownloadFailure {
  taskId: string;
  siteId: string;
  bookUrl: string;
  chapterUrl: string;
  chapterIndex: number;
  title: string;
  attempts: number;
  error: string;
  lastFailedAt: string;
}

export interface TranslationTask {
  id: string;
  bookUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  force: boolean;
  createdAt: string;
  updatedAt: string;
  message?: string;
}

export interface TranslationFailure {
  taskId: string;
  bookUrl: string;
  chapterUrl: string;
  chapterIndex: number;
  title: string;
  targetLanguage: string;
  attempts: number;
  error: string;
  lastFailedAt: string;
}

export interface AiUsageRecord {
  id?: number;
  operation: 'summary' | 'language-detection' | 'translation';
  taskId?: string;
  sourceId?: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  createdAt: string;
}

export interface AiUsageSummary {
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  byTask: Array<{
    taskId: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
}
