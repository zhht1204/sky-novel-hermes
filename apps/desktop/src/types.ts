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

export interface SearchResult {
  siteId: string;
  title: string;
  author?: string;
  url: string;
  latestChapterTitle?: string;
  description?: string;
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
