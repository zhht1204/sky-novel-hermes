export const QUANBEN5_BIG5 = {
  id: 'quanben5-big5',
  displayName: '全本小說網 Big5',
  baseUrl: 'https://big5.quanben5.io',
  sampleBookUrl: 'https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html',
};

export const selectors = {
  chapterLinks: 'a[href$=".html"]',
  coverImage: 'img[src*="book_images"], img[src*="upload"]',
  chapterTitle: 'h1, h2, .title',
  chapterBody: '#content, .content, .chapter-content, article, .read-content',
};
