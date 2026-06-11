import JSZip from 'jszip';
import type { BookInfo, ChapterContent } from '@sky-novel-hermes/shared';

export function toMarkdown(book: BookInfo, chapters: ChapterContent[]): string {
  const lines = [`# ${book.title}`, '', `作者: ${book.author ?? '未知'}`, `来源: ${book.sourceUrl}`, ''];
  for (const chapter of chapters) {
    lines.push(`## ${chapter.title}`, '', chapter.text, '');
  }
  return lines.join('\n');
}

export function toPlainText(book: BookInfo, chapters: ChapterContent[]): string {
  return toMarkdown(book, chapters).replace(/^#+\s/gm, '');
}

export async function toZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
}
