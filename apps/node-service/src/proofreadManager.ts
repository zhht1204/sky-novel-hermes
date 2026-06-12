import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { LiteLlmClient } from '@sky-novel-hermes/ai';
import type { ChapterContent, ProofreadFailure, ProofreadSettings, ProofreadTask } from '@sky-novel-hermes/shared';
import { nowIso } from '@sky-novel-hermes/shared';
import type { HermesDatabase } from '@sky-novel-hermes/storage';

export class ProofreadManager extends EventEmitter {
  private readonly activeTaskFreshMs = 120_000;
  private readonly activeTaskIds = new Set<string>();
  private readonly pauseRequestedTaskIds = new Set<string>();
  private readonly cancelRequestedTaskIds = new Set<string>();

  constructor(private db: HermesDatabase, private readonly ai: LiteLlmClient, private readonly getSettings: () => ProofreadSettings) {
    super();
  }

  setDatabase(db: HermesDatabase): void {
    this.db = db;
  }

  async createTask(bookUrl: string, options: { force?: boolean; applyRepairs?: boolean; chapterUrl?: string } = {}): Promise<ProofreadTask> {
    if (!this.ai.enabled) {
      throw new Error('AI is not configured. Set LITELLM_BASE_URL and LITELLM_MODEL before starting proofreading.');
    }
    const chapters = await this.listProofreadableChapters(bookUrl, Boolean(options.force), options.chapterUrl);
    const task: ProofreadTask = {
      id: randomUUID(),
      bookUrl,
      status: chapters.length === 0 ? 'completed' : 'queued',
      totalChapters: chapters.length,
      completedChapters: 0,
      failedChapters: 0,
      force: Boolean(options.force),
      applyRepairs: Boolean(options.applyRepairs),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      message: chapters.length === 0 ? 'No chapters need proofreading' : 'Queued',
    };
    await this.db.upsertProofreadTask(task);
    if (chapters.length > 0) void this.runTask(task, chapters);
    return task;
  }

  async resumeTask(taskId: string): Promise<ProofreadTask> {
    const task = await this.findTask(taskId);
    if (task.status === 'cancelled') throw new Error('Cancelled proofreading tasks cannot be resumed');
    if (this.isFreshActiveTask(task)) throw new ActiveProofreadTaskError('Proofreading task is already running');
    this.pauseRequestedTaskIds.delete(task.id);
    this.cancelRequestedTaskIds.delete(task.id);
    const chapters = await this.listProofreadableChapters(task.bookUrl, task.force);
    const resumedTask: ProofreadTask = {
      ...task,
      status: chapters.length === 0 ? 'completed' : 'queued',
      totalChapters: chapters.length,
      completedChapters: 0,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: chapters.length === 0 ? 'No chapters need proofreading' : `Continuing ${chapters.length} chapters`,
    };
    await this.db.upsertProofreadTask(resumedTask);
    if (chapters.length > 0) void this.runTask(resumedTask, chapters);
    return resumedTask;
  }

  async retryFailed(taskId: string): Promise<ProofreadTask> {
    const task = await this.findTask(taskId);
    if (task.status === 'cancelled') throw new Error('Cancelled proofreading tasks cannot be retried');
    if (this.isFreshActiveTask(task)) throw new ActiveProofreadTaskError('Proofreading task is already running');
    const failures = await this.db.listProofreadFailures(taskId);
    if (failures.length === 0) throw new Error('No failed chapters to retry');
    const chapters = await this.failuresToChapters(failures);
    const retryTask: ProofreadTask = {
      ...task,
      status: 'queued',
      totalChapters: chapters.length,
      completedChapters: 0,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: `Retrying ${chapters.length} failed chapters`,
    };
    await this.db.upsertProofreadTask(retryTask);
    void this.runTask(retryTask, chapters);
    return retryTask;
  }

  async pauseTask(taskId: string): Promise<ProofreadTask> {
    const task = await this.findTask(taskId);
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    this.pauseRequestedTaskIds.add(task.id);
    const pausedTask = {
      ...task,
      status: this.activeTaskIds.has(task.id) ? task.status : 'paused',
      updatedAt: nowIso(),
      message: this.activeTaskIds.has(task.id) ? 'Pause requested' : 'Paused',
    } as ProofreadTask;
    await this.updateTask(pausedTask);
    return pausedTask;
  }

  async cancelTask(taskId: string): Promise<ProofreadTask> {
    const task = await this.findTask(taskId);
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    this.cancelRequestedTaskIds.add(task.id);
    if (this.activeTaskIds.has(task.id)) {
      // The running loop will discard results and finalize the task via stopIfRequested.
      const cancelledTask = { ...task, updatedAt: nowIso(), message: 'Cancel requested' } as ProofreadTask;
      await this.updateTask(cancelledTask);
      return cancelledTask;
    }
    this.cancelRequestedTaskIds.delete(task.id);
    this.pauseRequestedTaskIds.delete(task.id);
    await this.discardTaskResults(task.id);
    await this.db.clearProofreadFailures(task.id);
    const cancelledTask = {
      ...task,
      status: 'cancelled',
      completedChapters: 0,
      failedChapters: 0,
      updatedAt: nowIso(),
      message: 'Cancelled',
    } as ProofreadTask;
    await this.updateTask(cancelledTask);
    return cancelledTask;
  }

  async proofreadChapter(sourceUrl: string, applyRepairs: boolean): Promise<ProofreadTask> {
    const chapter = await this.db.getChapter(sourceUrl);
    if (!chapter) throw new Error(`Chapter not found: ${sourceUrl}`);
    return this.createTask(chapter.bookUrl, { force: true, applyRepairs, chapterUrl: sourceUrl });
  }

  private async runTask(task: ProofreadTask, chapters: ChapterContent[]): Promise<void> {
    this.activeTaskIds.add(task.id);
    let current = { ...task, status: 'running' as const, updatedAt: nowIso(), message: 'Proofreading chapters' };
    await this.updateTask(current);
    await this.db.clearProofreadFailures(task.id);

    try {
      for (const chapter of chapters) {
        if (await this.stopIfRequested(current)) return;
        try {
          const correctedText = await this.proofreadWithRetries(current, chapter);
          const settings = this.getSettings();
          const timestamp = nowIso();
          const existing = await this.db.getProofread(chapter.sourceUrl);
          await this.db.upsertProofread({
            sourceUrl: chapter.sourceUrl,
            bookUrl: chapter.bookUrl,
            chapterIndex: chapter.index ?? 0,
            title: chapter.title,
            originalText: chapter.text,
            correctedText,
            applied: current.applyRepairs,
            taskId: current.id,
            model: this.ai.model,
            promptHash: hashPrompt(settings.defaultPrompt),
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          });
          if (current.applyRepairs) {
            await this.db.upsertChapterContent({ ...chapter, text: correctedText, fetchedAt: chapter.fetchedAt || timestamp });
          }
          await this.db.clearProofreadFailure(task.id, chapter.sourceUrl);
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

  private async proofreadWithRetries(task: ProofreadTask, chapter: ChapterContent): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxChapterAttempts; attempt += 1) {
      try {
        const settings = this.getSettings();
        return await this.ai.proofreadChapter({
          title: chapter.title,
          text: chapter.text,
          prompt: settings.defaultPrompt,
          maxChunkChars: settings.maxChunkChars,
          taskId: task.id,
          sourceId: chapter.sourceUrl,
        });
      } catch (error) {
        lastError = error;
        if (attempt < this.maxChapterAttempts) await delay(500 * attempt);
      }
    }
    throw lastError;
  }

  private async listProofreadableChapters(bookUrl: string, force: boolean, chapterUrl?: string): Promise<ChapterContent[]> {
    const refs = chapterUrl ? (await this.db.listChapters(bookUrl)).filter((ref) => ref.sourceUrl === chapterUrl) : await this.db.listChapters(bookUrl);
    const chapters: ChapterContent[] = [];
    for (const ref of refs) {
      const chapter = await this.db.getChapter(ref.sourceUrl);
      if (!chapter?.text) continue;
      if (!force && await this.db.getProofread(ref.sourceUrl)) continue;
      chapters.push(chapter);
    }
    return chapters;
  }

  private async failuresToChapters(failures: ProofreadFailure[]): Promise<ChapterContent[]> {
    const chapters: ChapterContent[] = [];
    for (const failure of failures) {
      const chapter = await this.db.getChapter(failure.chapterUrl);
      if (chapter?.text) chapters.push(chapter);
    }
    return chapters;
  }

  private async findTask(taskId: string): Promise<ProofreadTask> {
    const task = (await this.db.listProofreadTasks()).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Proofreading task not found: ${taskId}`);
    return task;
  }

  private async recordFailure(task: ProofreadTask, chapter: ChapterContent, attempts: number, error: unknown): Promise<void> {
    await this.db.upsertProofreadFailure({
      taskId: task.id,
      bookUrl: task.bookUrl,
      chapterUrl: chapter.sourceUrl,
      chapterIndex: chapter.index ?? 0,
      title: chapter.title,
      attempts,
      error: error instanceof Error ? error.message : String(error),
      lastFailedAt: nowIso(),
    });
  }

  private get maxChapterAttempts(): number {
    return this.getSettings().autoRetryAttempts + 1;
  }

  private async updateTask(task: ProofreadTask): Promise<void> {
    await this.db.upsertProofreadTask(task);
    this.emit('task', task);
  }

  private async stopIfRequested(task: ProofreadTask): Promise<boolean> {
    if (this.cancelRequestedTaskIds.has(task.id)) {
      this.cancelRequestedTaskIds.delete(task.id);
      this.pauseRequestedTaskIds.delete(task.id);
      await this.discardTaskResults(task.id);
      await this.db.clearProofreadFailures(task.id);
      await this.updateTask({ ...task, status: 'cancelled', completedChapters: 0, failedChapters: 0, updatedAt: nowIso(), message: 'Cancelled' });
      return true;
    }
    if (this.pauseRequestedTaskIds.has(task.id)) {
      this.pauseRequestedTaskIds.delete(task.id);
      await this.updateTask({ ...task, status: 'paused', updatedAt: nowIso(), message: 'Paused' });
      return true;
    }
    return false;
  }

  // Removes the proofread records this task produced; restores the original chapter text when repairs were applied.
  private async discardTaskResults(taskId: string): Promise<void> {
    const records = await this.db.listProofreadsByTask(taskId);
    for (const record of records) {
      if (record.applied) {
        const chapter = await this.db.getChapter(record.sourceUrl);
        if (chapter) await this.db.upsertChapterContent({ ...chapter, text: record.originalText });
      }
    }
    await this.db.deleteProofreadsByTask(taskId);
  }

  private isFreshActiveTask(task: ProofreadTask): boolean {
    if (!this.activeTaskIds.has(task.id)) return false;
    const updatedAt = Date.parse(task.updatedAt);
    return Number.isFinite(updatedAt) && Date.now() - updatedAt < this.activeTaskFreshMs;
  }
}

export class ActiveProofreadTaskError extends Error {}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}
