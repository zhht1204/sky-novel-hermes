import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { LiteLlmClient } from '@sky-novel-hermes/ai';
import type { ChapterContent, TranslationFailure, TranslationSettings, TranslationTask } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { HermesDatabase } from '@sky-novel-hermes/storage';

export class TranslationManager extends EventEmitter {
  private readonly activeTaskFreshMs = 120_000;
  private readonly activeTaskIds = new Set<string>();
  private readonly pauseRequestedTaskIds = new Set<string>();
  private readonly cancelRequestedTaskIds = new Set<string>();

  constructor(private db: HermesDatabase, private readonly ai: LiteLlmClient, private readonly getSettings: () => TranslationSettings) {
    super();
  }

  setDatabase(db: HermesDatabase): void {
    this.db = db;
  }

  async detectBookLanguage(bookUrl: string): Promise<void> {
    const chapters = await this.db.listChapters(bookUrl);
    const texts: string[] = [];
    for (const ref of chapters.slice(0, 8)) {
      const chapter = await this.db.getChapter(ref.sourceUrl);
      if (chapter?.text) texts.push(chapter.text);
      if (texts.join('\n\n').length >= 12000) break;
    }
    const sample = texts.join('\n\n').slice(0, 12000);
    if (!sample.trim()) return;
    await this.db.upsertLanguageProfile(await this.ai.detectLanguage(bookUrl, sample));
  }

  async createTask(bookUrl: string, targetLanguage: string, options: { force?: boolean; sourceLanguage?: string; chapterUrl?: string } = {}): Promise<TranslationTask> {
    const sourceLanguage = options.sourceLanguage || await this.resolveSourceLanguage(bookUrl);
    const chapters = await this.listTranslatableChapters(bookUrl, targetLanguage, Boolean(options.force), options.chapterUrl);
    const task: TranslationTask = {
      id: randomUUID(),
      bookUrl,
      sourceLanguage,
      targetLanguage,
      status: chapters.length === 0 ? 'completed' : 'queued',
      totalChapters: chapters.length,
      completedChapters: 0,
      failedChapters: 0,
      force: Boolean(options.force),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      message: chapters.length === 0 ? 'No chapters need translation' : 'Queued',
    };
    await this.db.upsertTranslationTask(task);
    if (chapters.length > 0) void this.runTask(task, chapters);
    return task;
  }

  async resumeTask(taskId: string): Promise<TranslationTask> {
    const task = await this.findTask(taskId);
    if (this.isFreshActiveTask(task)) throw new ActiveTranslationTaskError('Translation task is already running');
    this.pauseRequestedTaskIds.delete(task.id);
    this.cancelRequestedTaskIds.delete(task.id);
    const chapters = await this.listTranslatableChapters(task.bookUrl, task.targetLanguage, task.force);
    const resumedTask: TranslationTask = {
      ...task,
      status: chapters.length === 0 ? 'completed' : 'queued',
      totalChapters: chapters.length,
      completedChapters: 0,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: chapters.length === 0 ? 'No chapters need translation' : `Continuing ${chapters.length} chapters`,
    };
    await this.db.upsertTranslationTask(resumedTask);
    if (chapters.length > 0) void this.runTask(resumedTask, chapters);
    return resumedTask;
  }

  async retryFailed(taskId: string): Promise<TranslationTask> {
    const task = await this.findTask(taskId);
    if (this.isFreshActiveTask(task)) throw new ActiveTranslationTaskError('Translation task is already running');
    const failures = await this.db.listTranslationFailures(taskId);
    if (failures.length === 0) throw new Error('No failed chapters to retry');
    const chapters = await this.failuresToChapters(failures);
    const retryTask: TranslationTask = {
      ...task,
      status: 'queued',
      totalChapters: chapters.length,
      completedChapters: 0,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: `Retrying ${chapters.length} failed chapters`,
    };
    await this.db.upsertTranslationTask(retryTask);
    void this.runTask(retryTask, chapters);
    return retryTask;
  }

  async pauseTask(taskId: string): Promise<TranslationTask> {
    const task = await this.findTask(taskId);
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    this.pauseRequestedTaskIds.add(task.id);
    const pausedTask = {
      ...task,
      status: this.activeTaskIds.has(task.id) ? task.status : 'paused',
      updatedAt: nowIso(),
      message: this.activeTaskIds.has(task.id) ? 'Pause requested' : 'Paused',
    } as TranslationTask;
    await this.updateTask(pausedTask);
    return pausedTask;
  }

  async cancelTask(taskId: string): Promise<TranslationTask> {
    const task = await this.findTask(taskId);
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    this.cancelRequestedTaskIds.add(task.id);
    const cancelledTask = {
      ...task,
      status: this.activeTaskIds.has(task.id) ? task.status : 'cancelled',
      updatedAt: nowIso(),
      message: this.activeTaskIds.has(task.id) ? 'Cancel requested' : 'Cancelled',
    } as TranslationTask;
    await this.updateTask(cancelledTask);
    return cancelledTask;
  }

  async retranslateChapter(sourceUrl: string, targetLanguage: string): Promise<TranslationTask> {
    const chapter = await this.db.getChapter(sourceUrl);
    if (!chapter) throw new Error(`Chapter not found: ${sourceUrl}`);
    return this.createTask(chapter.bookUrl, targetLanguage, { force: true, chapterUrl: sourceUrl });
  }

  private async runTask(task: TranslationTask, chapters: ChapterContent[]): Promise<void> {
    this.activeTaskIds.add(task.id);
    let current = { ...task, status: 'running' as const, updatedAt: nowIso(), message: 'Translating chapters' };
    await this.updateTask(current);
    await this.db.clearTranslationFailures(task.id);

    try {
      for (const chapter of chapters) {
        if (await this.stopIfRequested(current)) return;
        try {
          const translatedText = await this.translateWithRetries(current, chapter);
          const settings = this.getSettings();
          const timestamp = nowIso();
          const existing = await this.db.getTranslation(chapter.sourceUrl, current.targetLanguage);
          await this.db.upsertTranslation({
            sourceUrl: chapter.sourceUrl,
            bookUrl: chapter.bookUrl,
            chapterIndex: chapter.index ?? 0,
            title: chapter.title,
            sourceLanguage: current.sourceLanguage,
            targetLanguage: current.targetLanguage,
            text: translatedText,
            model: this.ai.model,
            promptHash: hashPrompt(settings.defaultPrompt),
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          });
          await this.db.clearTranslationFailure(task.id, chapter.sourceUrl);
          current = { ...current, completedChapters: current.completedChapters + 1, updatedAt: nowIso(), message: chapter.title };
          await this.updateTask(current);
          await delay(250);
        } catch (error) {
          await this.recordFailure(current, chapter, this.maxChapterAttempts, error);
          current = { ...current, failedChapters: current.failedChapters + 1, updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) };
          await this.updateTask(current);
        }
        if (await this.stopIfRequested(current)) return;
      }
      await this.updateTask({
        ...current,
        status: current.failedChapters > 0 ? 'failed' : 'completed',
        updatedAt: nowIso(),
        message: current.failedChapters > 0 ? `Completed with ${current.failedChapters} failed chapters` : 'Completed',
      });
    } catch (error) {
      await this.updateTask({ ...current, status: 'failed', updatedAt: nowIso(), message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.activeTaskIds.delete(task.id);
    }
  }

  private async translateWithRetries(task: TranslationTask, chapter: ChapterContent): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxChapterAttempts; attempt += 1) {
      try {
        const settings = this.getSettings();
        return await this.ai.translateChapter({
          title: chapter.title,
          text: chapter.text,
          sourceLanguage: task.sourceLanguage,
          targetLanguage: task.targetLanguage,
          prompt: settings.defaultPrompt,
          maxChunkChars: settings.maxChunkChars,
        });
      } catch (error) {
        lastError = error;
        if (attempt < this.maxChapterAttempts) await delay(500 * attempt);
      }
    }
    throw lastError;
  }

  private async listTranslatableChapters(bookUrl: string, targetLanguage: string, force: boolean, chapterUrl?: string): Promise<ChapterContent[]> {
    const refs = chapterUrl ? (await this.db.listChapters(bookUrl)).filter((ref) => ref.sourceUrl === chapterUrl) : await this.db.listChapters(bookUrl);
    const chapters: ChapterContent[] = [];
    for (const ref of refs) {
      const chapter = await this.db.getChapter(ref.sourceUrl);
      if (!chapter?.text) continue;
      if (!force && await this.db.getTranslation(ref.sourceUrl, targetLanguage)) continue;
      chapters.push(chapter);
    }
    return chapters;
  }

  private async failuresToChapters(failures: TranslationFailure[]): Promise<ChapterContent[]> {
    const chapters: ChapterContent[] = [];
    for (const failure of failures) {
      const chapter = await this.db.getChapter(failure.chapterUrl);
      if (chapter?.text) chapters.push(chapter);
    }
    return chapters;
  }

  private async resolveSourceLanguage(bookUrl: string): Promise<string> {
    const profile = await this.db.getLanguageProfile(bookUrl);
    if (profile) return profile.language;
    await this.detectBookLanguage(bookUrl);
    return (await this.db.getLanguageProfile(bookUrl))?.language ?? 'unknown';
  }

  private async findTask(taskId: string): Promise<TranslationTask> {
    const task = (await this.db.listTranslationTasks()).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Translation task not found: ${taskId}`);
    return task;
  }

  private async recordFailure(task: TranslationTask, chapter: ChapterContent, attempts: number, error: unknown): Promise<void> {
    await this.db.upsertTranslationFailure({
      taskId: task.id,
      bookUrl: task.bookUrl,
      chapterUrl: chapter.sourceUrl,
      chapterIndex: chapter.index ?? 0,
      title: chapter.title,
      targetLanguage: task.targetLanguage,
      attempts,
      error: error instanceof Error ? error.message : String(error),
      lastFailedAt: nowIso(),
    });
  }

  private get maxChapterAttempts(): number {
    return this.getSettings().autoRetryAttempts + 1;
  }

  private async updateTask(task: TranslationTask): Promise<void> {
    await this.db.upsertTranslationTask(task);
    this.emit('task', task);
  }

  private async stopIfRequested(task: TranslationTask): Promise<boolean> {
    if (this.cancelRequestedTaskIds.has(task.id)) {
      this.cancelRequestedTaskIds.delete(task.id);
      this.pauseRequestedTaskIds.delete(task.id);
      await this.updateTask({ ...task, status: 'cancelled', updatedAt: nowIso(), message: 'Cancelled' });
      return true;
    }
    if (this.pauseRequestedTaskIds.has(task.id)) {
      this.pauseRequestedTaskIds.delete(task.id);
      await this.updateTask({ ...task, status: 'paused', updatedAt: nowIso(), message: 'Paused' });
      return true;
    }
    return false;
  }

  private isFreshActiveTask(task: TranslationTask): boolean {
    if (!this.activeTaskIds.has(task.id)) return false;
    const updatedAt = Date.parse(task.updatedAt);
    return Number.isFinite(updatedAt) && Date.now() - updatedAt < this.activeTaskFreshMs;
  }
}

export class ActiveTranslationTaskError extends Error {}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}
