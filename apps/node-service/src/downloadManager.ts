import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type { DownloadTask } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { NovelSiteAdapter } from '@sky-novel-hermes/shared';
import type { HermesDatabase } from '@sky-novel-hermes/storage';

export class DownloadManager extends EventEmitter {
  constructor(private db: HermesDatabase, private readonly getSite: (siteId: string) => NovelSiteAdapter) {
    super();
  }

  setDatabase(db: HermesDatabase): void {
    this.db = db;
  }

  async createTask(siteId: string, bookUrl: string): Promise<DownloadTask> {
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
    await this.db.upsertTask(task);
    void this.runTask(task);
    return task;
  }

  private async runTask(task: DownloadTask): Promise<void> {
    const site = this.getSite(task.siteId);
    try {
      await this.updateTask({ ...task, status: 'running', updatedAt: nowIso(), message: 'Fetching book metadata' });
      const book = await site.getBookInfo({ url: task.bookUrl });
      await this.db.upsertBook(book);
      const catalog = await site.getCatalog({ bookUrl: task.bookUrl });
      await this.db.upsertCatalog(catalog);

      let current = { ...task, status: 'running' as const, totalChapters: catalog.length, updatedAt: nowIso(), message: 'Downloading chapters' };
      await this.updateTask(current);

      for (const chapter of catalog) {
        try {
          const content = await site.getChapter({ bookUrl: task.bookUrl, chapterUrl: chapter.sourceUrl });
          await this.db.upsertChapterContent(content);
          current = { ...current, completedChapters: current.completedChapters + 1, updatedAt: nowIso(), message: chapter.title };
          await this.updateTask(current);
          await delay(800);
        } catch (error) {
          current = { ...current, failedChapters: current.failedChapters + 1, updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) };
          await this.updateTask(current);
        }
      }

      await this.updateTask({ ...current, status: 'completed', updatedAt: nowIso(), message: 'Completed' });
    } catch (error) {
      await this.updateTask({ ...task, status: 'failed', updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async updateTask(task: DownloadTask): Promise<void> {
    await this.db.upsertTask(task);
    this.emit('task', task);
  }
}
