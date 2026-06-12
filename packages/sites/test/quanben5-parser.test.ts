import { describe, expect, it } from 'vitest';
import { parseBookInfo, parseCatalog, parseChapter, parseSearchResults } from '../src/quanben5/parser.js';
import { QUANBEN5_SIMPLIFIED } from '../src/quanben5/selectors.js';

describe('quanben5 catalog parser', () => {
  it('extracts chapter links in numeric order', () => {
    const html = '<h2>正文</h2><a href="/n/book/2.html">第二章 B</a><a href="/n/book/1.html">第一章 A</a>';
    const chapters = parseCatalog(html, 'https://big5.quanben5.io/n/book/xiaoshuo.html');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.index).toBe(1);
    expect(chapters[1]?.index).toBe(2);
  });

  it('uses the simplified source id for www.quanben5.io catalogs', () => {
    const html = '<a href="/n/book/1.html">第一章 A</a>';
    const chapters = parseCatalog(html, 'https://www.quanben5.io/n/book/xiaoshuo.html', QUANBEN5_SIMPLIFIED);
    expect(chapters[0]?.siteId).toBe('quanben5-simplified');
    expect(chapters[0]?.sourceUrl).toBe('https://www.quanben5.io/n/book/1.html');
  });

  it('extracts simplified metadata labels', () => {
    const html = '<h1>测试书</h1><p>作者：张三 类别：科幻 状态：连载</p><p>这是一段足够长的简介内容，用来验证简体页面的简介解析不会因为标签差异失败。</p>';
    const book = parseBookInfo(html, 'https://www.quanben5.io/n/book/xiaoshuo.html', QUANBEN5_SIMPLIFIED);
    expect(book.siteId).toBe('quanben5-simplified');
    expect(book.category).toBe('科幻');
    expect(book.status).toBe('连载');
  });

  it('removes simplified navigation text from chapters', () => {
    const html = '<h1>第一章 A</h1><div id="content">正文内容上一章下一章返回目录全本小说网</div>';
    const chapter = parseChapter(html, 'https://www.quanben5.io/n/book/xiaoshuo.html', 'https://www.quanben5.io/n/book/1.html', QUANBEN5_SIMPLIFIED);
    expect(chapter.siteId).toBe('quanben5-simplified');
    expect(chapter.text).toBe('正文内容');
  });

  it('preserves paragraph boundaries in simplified chapters', () => {
    const html = '<h1>第一章 A</h1><div id="content"><div class="chapter"><p>第一段文字。</p><p>第二段文字。<br>第二段下一行。</p></div><div>第三段文字。</div></div>';
    const chapter = parseChapter(html, 'https://www.quanben5.io/n/book/xiaoshuo.html', 'https://www.quanben5.io/n/book/1.html', QUANBEN5_SIMPLIFIED);
    expect(chapter.text).toBe('第一段文字。\n\n第二段文字。\n第二段下一行。\n\n第三段文字。');
  });

  it('removes font controls and page navigation from chapters', () => {
    const html = '<h1>第一章 A</h1><div id="content">正文上\n字体:16+-\n上一页\n目录\n下一页\n正文下</div>';
    const chapter = parseChapter(html, 'https://www.quanben5.io/n/book/xiaoshuo.html', 'https://www.quanben5.io/n/book/1.html', QUANBEN5_SIMPLIFIED);
    expect(chapter.text).toBe('正文上\n\n正文下');
    expect(chapter.text).not.toContain('字体');
    expect(chapter.text).not.toContain('上一页');
    expect(chapter.text).not.toContain('目录');
    expect(chapter.text).not.toContain('下一页');
  });
});

describe('quanben5 search parser', () => {
  const html =
    '<div class="pic_txt_list">' +
    '<div class="pic"><img src="https://img.example/cover.jpg" /></div>' +
    '<h3><a href="/n/jianlai/"><span class="name">剑来</span></a></h3>' +
    '<p class="info">作者: <span class="author">烽火戏诸侯</span> (连载)</p>' +
    '<p class="description"><span class="read_ico">简</span>大千世界，无奇不有。</p>' +
    '</div>';

  it('extracts book results from search content', () => {
    const results = parseSearchResults(html, 'https://www.quanben5.io', QUANBEN5_SIMPLIFIED);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      siteId: 'quanben5-simplified',
      title: '剑来',
      author: '烽火戏诸侯',
      url: 'https://www.quanben5.io/n/jianlai/',
      description: '大千世界，无奇不有。',
    });
  });

  it('respects the result limit', () => {
    const doubled = html + html.replace('jianlai', 'jianlai2').replace('剑来', '剑来2');
    const results = parseSearchResults(doubled, 'https://www.quanben5.io', QUANBEN5_SIMPLIFIED, 1);
    expect(results).toHaveLength(1);
  });

  it('returns an empty list when no results are present', () => {
    const empty = '<p class="tip">没有搜索到：<b>剑来</b></p>';
    expect(parseSearchResults(empty, 'https://www.quanben5.io', QUANBEN5_SIMPLIFIED)).toEqual([]);
  });
});
