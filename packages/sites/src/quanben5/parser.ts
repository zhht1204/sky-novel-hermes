import * as cheerio from 'cheerio';
import type { BookInfo, ChapterContent, ChapterRef } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import { absolutizeUrl, normalizeWhitespace } from '../http.js';
import { QUANBEN5_BIG5, selectors, type Quanben5SourceConfig } from './selectors.js';

const chapterPathPattern = /\/n\/[^/]+\/(\d+)\.html$/;
const chapterChromePatterns = [
  /字体\s*[:：]?\s*\d+\s*[+＋-]*/g,
  /上一页\s*(?:目錄|目录)\s*下一页/g,
  /上一章|下一章|上一页|下一页|返回目錄|返回目录|全本小說網|全本小说网/g,
];

function firstTextAfterLabel(fullText: string, label: string): string | undefined {
  const pattern = new RegExp(`${label}[:：]\\s*([^\\n]+)`);
  return fullText.match(pattern)?.[1]?.trim();
}

export function parseBookInfo(html: string, sourceUrl: string, source: Quanben5SourceConfig = QUANBEN5_BIG5): BookInfo {
  const $ = cheerio.load(html);
  const pageText = extractPageText($).replace(/\s*(作者|類別|类别|状态|狀態)[:：]/g, '\n$1:');
  const h1 = normalizeWhitespace($('h1').first().text());
  const h3 = normalizeWhitespace($('h3').first().text());
  const title = h3 || h1 || normalizeWhitespace($('title').text()).replace(/_.*$/, '');
  const cover = $(selectors.coverImage).first().attr('src');

  return {
    siteId: source.id,
    sourceUrl,
    canonicalUrl: sourceUrl,
    title,
    author: firstTextAfterLabel(pageText, '作者'),
    category: firstTextAfterLabel(pageText, '類別') ?? firstTextAfterLabel(pageText, '类别'),
    status: firstTextAfterLabel(pageText, '狀態') ?? firstTextAfterLabel(pageText, '状态'),
    coverUrl: cover ? absolutizeUrl(sourceUrl, cover) : undefined,
    description: extractDescription($, title),
    createdAt: nowIso(),
  };
}

function extractPageText($: cheerio.CheerioAPI): string {
  $('br').replaceWith('\n');
  const blockText = $('body').find('p, li, div, section, article')
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter(Boolean)
    .join('\n');
  return blockText || normalizeWhitespace($('body').text());
}

function extractDescription($: cheerio.CheerioAPI, title: string): string | undefined {
  const candidates = $('p, .intro, .description, .bookintro, .desc')
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((text) => text.length > 40 && !text.includes('當前位置') && !text.includes('当前位置') && !text.includes(title));
  return candidates[0];
}

export function parseCatalog(html: string, bookUrl: string, source: Quanben5SourceConfig = QUANBEN5_BIG5): ChapterRef[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const chapters: ChapterRef[] = [];

  $(selectors.chapterLinks).each((_, element) => {
    const href = $(element).attr('href');
    const title = normalizeWhitespace($(element).text());
    if (!href || !title || !/^第.+章/.test(title)) return;

    const sourceUrl = absolutizeUrl(bookUrl, href);
    const match = new URL(sourceUrl).pathname.match(chapterPathPattern);
    if (!match || seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    chapters.push({
      siteId: source.id,
      bookUrl,
      sourceUrl,
      index: Number(match[1]),
      title,
    });
  });

  return chapters.sort((left, right) => left.index - right.index);
}

export function parseChapter(html: string, bookUrl: string, sourceUrl: string, source: Quanben5SourceConfig = QUANBEN5_BIG5): ChapterContent {
  const $ = cheerio.load(html);
  $('script, style, iframe, ins, .ads, .advert, .nav, .footer').remove();
  const title = normalizeWhitespace($(selectors.chapterTitle).first().text()) || normalizeWhitespace($('title').text()).replace(/_.*$/, '');
  const body = $(selectors.chapterBody).first();
  const textSource = body.length > 0 ? body.text() : $('body').text();
  const text = cleanChapterText(textSource);
  const match = new URL(sourceUrl).pathname.match(chapterPathPattern);

  return {
    siteId: source.id,
    bookUrl,
    sourceUrl,
    title,
    index: match ? Number(match[1]) : undefined,
    text,
    html: body.length > 0 ? body.html() ?? undefined : undefined,
    fetchedAt: nowIso(),
  };
}

function cleanChapterText(text: string): string {
  const cleaned = chapterChromePatterns.reduce((current, pattern) => current.replace(pattern, '\n'), text.replace(/\r/g, ''));
  return normalizeWhitespace(cleaned);
}
