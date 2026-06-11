import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type { ChapterRef, DownloadFailure, DownloadTask } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { NovelSiteAdapter } from '@sky-novel-hermes/shared';
import type { HermesDatabase } from '@sky-novel-hermes/storage';

export class DownloadManager extends EventEmitter {
  private readonly activeTaskFreshMs = 120_000;
  private autoRetryAttempts: number;
  private readonly activeTaskIds = new Set<string>();
  private readonly pauseRequestedTaskIds = new Set<string>();
  private readonly cancelRequestedTaskIds = new Set<string>();

  constructor(private db: HermesDatabase, private readonly getSite: (siteId: string) => NovelSiteAdapter, autoRetryAttempts = 1) {
    super();
    this.autoRetryAttempts = autoRetryAttempts;
  }

  setDatabase(db: HermesDatabase): void {
    this.db = db;
  }

  setAutoRetryAttempts(value: number): void {
    this.autoRetryAttempts = Math.max(0, Math.floor(value));
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

  async resumeTask(taskId: string): Promise<DownloadTask> {
    const task = (await this.db.listTasks()).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Download task not found: ${taskId}`);
    if (this.isFreshActiveTask(task)) {
      throw new ActiveTaskError('Download task is already running');
    }
    this.pauseRequestedTaskIds.delete(task.id);
    const catalog = await this.ensureCatalog(task);
    const downloadedCount = await this.countDownloadedChapters(catalog);
    const resumedTask: DownloadTask = {
      ...task,
      status: 'queued',
      totalChapters: catalog.length,
      completedChapters: downloadedCount,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: `Continuing from ${downloadedCount}/${catalog.length}`,
    };
    await this.db.upsertTask(resumedTask);
    void this.runMissingChapters(resumedTask, catalog);
    return resumedTask;
  }

  async retryFailed(taskId: string): Promise<DownloadTask> {
    const task = (await this.db.listTasks()).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Download task not found: ${taskId}`);
    if (this.isFreshActiveTask(task)) {
      throw new ActiveTaskError('Download task is already running');
    }
    this.pauseRequestedTaskIds.delete(task.id);
    const failures = await this.db.listFailures(taskId);
    if (failures.length === 0) throw new Error('No failed chapters to retry');

    const retryTask: DownloadTask = {
      ...task,
      status: 'queued',
      totalChapters: failures.length,
      completedChapters: 0,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: `Retrying ${failures.length} failed chapters`,
    };
    await this.db.upsertTask(retryTask);
    void this.runFailedChapters(retryTask, failures);
    return retryTask;
  }

  async pauseTask(taskId: string): Promise<DownloadTask> {
    const task = (await this.db.listTasks()).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Download task not found: ${taskId}`);
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return task;
    }
    this.pauseRequestedTaskIds.add(task.id);
    const pausedTask: DownloadTask = {
      ...task,
      status: this.activeTaskIds.has(task.id) ? task.status : 'paused',
      updatedAt: nowIso(),
      message: this.activeTaskIds.has(task.id) ? 'Pause requested' : 'Paused',
    };
    await this.updateTask(pausedTask);
    return pausedTask;
  }

  async cancelTask(taskId: string): Promise<DownloadTask> {
    const task = (await this.db.listTasks()).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Download task not found: ${taskId}`);
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return task;
    }
    this.cancelRequestedTaskIds.add(task.id);
    const cancelledTask: DownloadTask = {
      ...task,
      status: this.activeTaskIds.has(task.id) ? task.status : 'cancelled',
      updatedAt: nowIso(),
      message: this.activeTaskIds.has(task.id) ? 'Cancel requested' : 'Cancelled',
    };
    await this.updateTask(cancelledTask);
    return cancelledTask;
  }

  private async runTask(task: DownloadTask): Promise<void> {
    this.activeTaskIds.add(task.id);
    const site = this.getSite(task.siteId);
    try {
      await this.updateTask({ ...task, status: 'running', updatedAt: nowIso(), message: 'Fetching book metadata' });
      await this.db.clearFailures(task.id);
      const book = await site.getBookInfo({ url: task.bookUrl });
      await this.db.upsertBook(book);
      const catalog = await site.getCatalog({ bookUrl: task.bookUrl });
      await this.db.upsertCatalog(catalog);

      let current = { ...task, status: 'running' as const, totalChapters: catalog.length, updatedAt: nowIso(), message: 'Downloading chapters' };
      await this.updateTask(current);

      for (const chapter of catalog) {
        if (await this.pauseIfRequested(current)) return;
        try {
          const content = await this.fetchChapterWithRetries(site, task.bookUrl, chapter);
          await this.db.upsertChapterContent(content);
          await this.db.clearFailure(task.id, chapter.sourceUrl);
          current = { ...current, completedChapters: current.completedChapters + 1, updatedAt: nowIso(), message: chapter.title };
          await this.updateTask(current);
          await delay(800);
        } catch (error) {
          await this.recordFailure(task, chapter, this.maxChapterAttempts, error);
          current = { ...current, failedChapters: current.failedChapters + 1, updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) };
          await this.updateTask(current);
        }
        if (await this.pauseIfRequested(current)) return;
      }

      await this.updateTask({ ...current, status: current.failedChapters > 0 ? 'failed' : 'completed', updatedAt: nowIso(), message: current.failedChapters > 0 ? `Completed with ${current.failedChapters} failed chapters` : 'Completed' });
    } catch (error) {
      await this.updateTask({ ...task, status: 'failed', updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.activeTaskIds.delete(task.id);
    }
  }

  private async runMissingChapters(task: DownloadTask, catalog: ChapterRef[]): Promise<void> {
    this.activeTaskIds.add(task.id);
    const site = this.getSite(task.siteId);
    let current = { ...task, status: 'running' as const, updatedAt: nowIso(), message: 'Continuing missing chapters' };
    await this.updateTask(current);

    try {
      for (const chapter of catalog) {
        if (await this.pauseIfRequested(current)) return;
        if (await this.isChapterDownloaded(chapter)) continue;
        try {
          const content = await this.fetchChapterWithRetries(site, task.bookUrl, chapter);
          await this.db.upsertChapterContent(content);
          await this.db.clearFailure(task.id, chapter.sourceUrl);
          current = { ...current, completedChapters: current.completedChapters + 1, updatedAt: nowIso(), message: chapter.title };
          await this.updateTask(current);
          await delay(800);
        } catch (error) {
          await this.recordFailure(task, chapter, this.maxChapterAttempts, error);
          current = { ...current, failedChapters: current.failedChapters + 1, updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) };
          await this.updateTask(current);
        }
        if (await this.pauseIfRequested(current)) return;
      }

      await this.updateTask({ ...current, status: current.failedChapters > 0 ? 'failed' : 'completed', updatedAt: nowIso(), message: current.failedChapters > 0 ? `Continue finished with ${current.failedChapters} failed chapters` : 'Continue completed' });
    } catch (error) {
      await this.updateTask({ ...current, status: 'failed', updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.activeTaskIds.delete(task.id);
    }
  }

  private async runFailedChapters(task: DownloadTask, failures: DownloadFailure[]): Promise<void> {
    this.activeTaskIds.add(task.id);
    const site = this.getSite(task.siteId);
    let current = { ...task, status: 'running' as const, updatedAt: nowIso(), message: 'Retrying failed chapters' };
    await this.updateTask(current);

    try {
      for (const failure of failures) {
        if (await this.pauseIfRequested(current)) return;
        const chapter: ChapterRef = {
          siteId: failure.siteId,
          bookUrl: failure.bookUrl,
          sourceUrl: failure.chapterUrl,
          index: failure.chapterIndex,
          title: failure.title,
        };
        try {
          const content = await this.fetchChapterWithRetries(site, task.bookUrl, chapter);
          await this.db.upsertChapterContent(content);
          await this.db.clearFailure(task.id, failure.chapterUrl);
          current = { ...current, completedChapters: current.completedChapters + 1, updatedAt: nowIso(), message: chapter.title };
          await this.updateTask(current);
          await delay(800);
        } catch (error) {
          await this.recordFailure(task, chapter, failure.attempts + this.maxChapterAttempts, error);
          current = { ...current, failedChapters: current.failedChapters + 1, updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) };
          await this.updateTask(current);
        }
        if (await this.pauseIfRequested(current)) return;
      }

      await this.updateTask({ ...current, status: current.failedChapters > 0 ? 'failed' : 'completed', updatedAt: nowIso(), message: current.failedChapters > 0 ? `Retry finished with ${current.failedChapters} failed chapters` : 'Retry completed' });
    } finally {
      this.activeTaskIds.delete(task.id);
    }
  }

  private async ensureCatalog(task: DownloadTask): Promise<ChapterRef[]> {
    const cached = await this.db.listChapters(task.bookUrl);
    if (cached.length > 0) return cached;
    const site = this.getSite(task.siteId);
    const book = await site.getBookInfo({ url: task.bookUrl });
    await this.db.upsertBook(book);
    const catalog = await site.getCatalog({ bookUrl: task.bookUrl });
    await this.db.upsertCatalog(catalog);
    return catalog;
  }

  private async countDownloadedChapters(catalog: ChapterRef[]): Promise<number> {
    let count = 0;
    for (const chapter of catalog) {
      if (await this.isChapterDownloaded(chapter)) count += 1;
    }
    return count;
  }

  private async isChapterDownloaded(chapter: ChapterRef): Promise<boolean> {
    const content = await this.db.getChapter(chapter.sourceUrl);
    return Boolean(content?.fetchedAt);
  }

  private async fetchChapterWithRetries(site: NovelSiteAdapter, bookUrl: string, chapter: ChapterRef) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxChapterAttempts; attempt += 1) {
      try {
        return await site.getChapter({ bookUrl, chapterUrl: chapter.sourceUrl });
      } catch (error) {
        lastError = error;
        if (attempt < this.maxChapterAttempts) await delay(500 * attempt);
      }
    }
    throw lastError;
  }

  private get maxChapterAttempts(): number {
    return this.autoRetryAttempts + 1;
  }

  private async recordFailure(task: DownloadTask, chapter: ChapterRef, attempts: number, error: unknown): Promise<void> {
    await this.db.upsertFailure({
      taskId: task.id,
      siteId: chapter.siteId,
      bookUrl: chapter.bookUrl,
      chapterUrl: chapter.sourceUrl,
      chapterIndex: chapter.index,
      title: chapter.title,
      attempts,
      error: error instanceof Error ? error.message : String(error),
      lastFailedAt: nowIso(),
    });
  }

  private async updateTask(task: DownloadTask): Promise<void> {
    await this.db.upsertTask(task);
    this.emit('task', task);
  }

  private async pauseIfRequested(task: DownloadTask): Promise<boolean> {
    if (this.cancelRequestedTaskIds.has(task.id)) {
      this.cancelRequestedTaskIds.delete(task.id);
      this.pauseRequestedTaskIds.delete(task.id);
      await this.updateTask({ ...task, status: 'cancelled', updatedAt: nowIso(), message: 'Cancelled' });
      return true;
    }
    if (!this.pauseRequestedTaskIds.has(task.id)) return false;
    this.pauseRequestedTaskIds.delete(task.id);
    await this.updateTask({ ...task, status: 'paused', updatedAt: nowIso(), message: 'Paused' });
    return true;
  }

  private isFreshActiveTask(task: DownloadTask): boolean {
    if (!this.activeTaskIds.has(task.id)) return false;
    const updatedAt = Date.parse(task.updatedAt);
    return Number.isFinite(updatedAt) && Date.now() - updatedAt < this.activeTaskFreshMs;
  }
}

export class ActiveTaskError extends Error {}
