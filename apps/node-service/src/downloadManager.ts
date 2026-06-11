import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type { DownloadTask } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { NovelSiteAdapter } from '@sky-novel-hermes/shared';
import type { HermesDatabase } from '@sky-novel-hermes/storage';

export class DownloadManager extends EventEmitter {
  constructor(private readonly db: HermesDatabase, private readonly getSite: (siteId: string) => NovelSiteAdapter) {
    super();
  }

  createTask(siteId: string, bookUrl: string): DownloadTask {
    const task: DownloadTask = {
      id: randomUUID(),
      siteId,
      bookUrl,
      status: 'queued',
      totalChapters: 0,
      completedChapters: 0,
      failedChapters: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.db.upsertTask(task);
    void this.runTask(task);
    return task;
  }

  private async runTask(task: DownloadTask): Promise<void> {
    const site = this.getSite(task.siteId);
    try {
      this.updateTask({ ...task, status: 'running', updatedAt: nowIso(), message: 'Fetching book metadata' });
      const book = await site.getBookInfo({ url: task.bookUrl });
      this.db.upsertBook(book);
      const catalog = await site.getCatalog({ bookUrl: task.bookUrl });
      this.db.upsertCatalog(catalog);

      let current = { ...task, status: 'running' as const, totalChapters: catalog.length, updatedAt: nowIso(), message: 'Downloading chapters' };
      this.updateTask(current);

      for (const chapter of catalog) {
        try {
          const content = await site.getChapter({ bookUrl: task.bookUrl, chapterUrl: chapter.sourceUrl });
          this.db.upsertChapterContent(content);
          current = { ...current, completedChapters: current.completedChapters + 1, updatedAt: nowIso(), message: chapter.title };
          this.updateTask(current);
          await delay(800);
        } catch (error) {
          current = { ...current, failedChapters: current.failedChapters + 1, updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) };
          this.updateTask(current);
        }
      }

      this.updateTask({ ...current, status: 'completed', updatedAt: nowIso(), message: 'Completed' });
    } catch (error) {
      this.updateTask({ ...task, status: 'failed', updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) });
    }
  }

  private updateTask(task: DownloadTask): void {
    this.db.upsertTask(task);
    this.emit('task', task);
  }
}
