export interface Quanben5SourceConfig {
  id: string;
  displayName: string;
  baseUrl: string;
}

export const QUANBEN5_BIG5: Quanben5SourceConfig = {
  id: 'quanben5-big5',
  displayName: '全本小說網 Big5',
  baseUrl: 'https://big5.quanben5.io',
};

export const QUANBEN5_SIMPLIFIED: Quanben5SourceConfig = {
  id: 'quanben5-simplified',
  displayName: '全本小说网 简体',
  baseUrl: 'https://www.quanben5.io',
};

export const selectors = {
  chapterLinks: 'a[href$=".html"]',
  coverImage: 'img[src*="book_images"], img[src*="upload"]',
  chapterTitle: 'h1, h2, .title',
  chapterBody: '#content, .content, .chapter-content, article, .read-content',
};
