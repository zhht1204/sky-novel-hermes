import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../src/quanben5-big5/parser.js';

describe('quanben5 catalog parser', () => {
  it('extracts chapter links in numeric order', () => {
    const html = '<h2>正文</h2><a href="/n/book/2.html">第二章 B</a><a href="/n/book/1.html">第一章 A</a>';
    const chapters = parseCatalog(html, 'https://big5.quanben5.io/n/book/xiaoshuo.html');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.index).toBe(1);
    expect(chapters[1]?.index).toBe(2);
  });
});
