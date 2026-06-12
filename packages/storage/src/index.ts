import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool, type QueryResultRow } from 'pg';
import type { AiUsageRecord, BookInfo, ChapterContent, ChapterProofread, ChapterRef, ChapterTranslation, DownloadFailure, DownloadTask, LanguageProfile, ProofreadFailure, ProofreadTask, TranslationFailure, TranslationTask } from '@sky-novel-hermes/shared';

export type StorageBackend = 'sqlite' | 'postgres';

export interface HermesDatabaseOptions {
  backend: StorageBackend;
  sqlitePath?: string;
  postgresUrl?: string;
}

interface DatabaseDriver {
  readonly backend: StorageBackend;
  migrate(): Promise<void>;
  close(): Promise<void>;
  upsertBook(book: BookInfo): Promise<void>;
  upsertCatalog(chapters: ChapterRef[]): Promise<void>;
  upsertChapterContent(chapter: ChapterContent): Promise<void>;
  listBooks(): Promise<BookInfo[]>;
  deleteBook(bookUrl: string): Promise<boolean>;
  listChapters(bookUrl: string): Promise<ChapterRef[]>;
  getChapter(sourceUrl: string): Promise<ChapterContent | undefined>;
  upsertTask(task: DownloadTask): Promise<void>;
  listTasks(): Promise<DownloadTask[]>;
  upsertFailure(failure: DownloadFailure): Promise<void>;
  listFailures(taskId: string): Promise<DownloadFailure[]>;
  clearFailure(taskId: string, chapterUrl: string): Promise<void>;
  clearFailures(taskId: string): Promise<void>;
  upsertLanguageProfile(profile: LanguageProfile): Promise<void>;
  getLanguageProfile(bookUrl: string): Promise<LanguageProfile | undefined>;
  upsertTranslation(translation: ChapterTranslation): Promise<void>;
  getTranslation(sourceUrl: string, targetLanguage: string): Promise<ChapterTranslation | undefined>;
  listTranslationLanguages(bookUrl: string): Promise<string[]>;
  upsertTranslationTask(task: TranslationTask): Promise<void>;
  listTranslationTasks(): Promise<TranslationTask[]>;
  upsertTranslationFailure(failure: TranslationFailure): Promise<void>;
  listTranslationFailures(taskId: string): Promise<TranslationFailure[]>;
  clearTranslationFailure(taskId: string, chapterUrl: string): Promise<void>;
  clearTranslationFailures(taskId: string): Promise<void>;
  upsertProofread(proofread: ChapterProofread): Promise<void>;
  getProofread(sourceUrl: string): Promise<ChapterProofread | undefined>;
  deleteProofread(sourceUrl: string): Promise<boolean>;
  upsertProofreadTask(task: ProofreadTask): Promise<void>;
  listProofreadTasks(): Promise<ProofreadTask[]>;
  upsertProofreadFailure(failure: ProofreadFailure): Promise<void>;
  listProofreadFailures(taskId: string): Promise<ProofreadFailure[]>;
  clearProofreadFailure(taskId: string, chapterUrl: string): Promise<void>;
  clearProofreadFailures(taskId: string): Promise<void>;
  insertAiUsage(record: AiUsageRecord): Promise<void>;
  listAiUsage(limit?: number): Promise<AiUsageRecord[]>;
}

export class HermesDatabase implements DatabaseDriver {
  readonly backend: StorageBackend;
  private readonly driver: DatabaseDriver;

  private constructor(driver: DatabaseDriver) {
    this.driver = driver;
    this.backend = driver.backend;
  }

  static async connect(options: HermesDatabaseOptions): Promise<HermesDatabase> {
    const driver = options.backend === 'postgres'
      ? new PostgresDatabaseDriver(required(options.postgresUrl, 'postgresUrl'))
      : new SqliteDatabaseDriver(required(options.sqlitePath, 'sqlitePath'));
    await driver.migrate();
    return new HermesDatabase(driver);
  }

  migrate(): Promise<void> { return this.driver.migrate(); }
  close(): Promise<void> { return this.driver.close(); }
  upsertBook(book: BookInfo): Promise<void> { return this.driver.upsertBook(book); }
  upsertCatalog(chapters: ChapterRef[]): Promise<void> { return this.driver.upsertCatalog(chapters); }
  upsertChapterContent(chapter: ChapterContent): Promise<void> { return this.driver.upsertChapterContent(chapter); }
  listBooks(): Promise<BookInfo[]> { return this.driver.listBooks(); }
  deleteBook(bookUrl: string): Promise<boolean> { return this.driver.deleteBook(bookUrl); }
  listChapters(bookUrl: string): Promise<ChapterRef[]> { return this.driver.listChapters(bookUrl); }
  getChapter(sourceUrl: string): Promise<ChapterContent | undefined> { return this.driver.getChapter(sourceUrl); }
  upsertTask(task: DownloadTask): Promise<void> { return this.driver.upsertTask(task); }
  listTasks(): Promise<DownloadTask[]> { return this.driver.listTasks(); }
  upsertFailure(failure: DownloadFailure): Promise<void> { return this.driver.upsertFailure(failure); }
  listFailures(taskId: string): Promise<DownloadFailure[]> { return this.driver.listFailures(taskId); }
  clearFailure(taskId: string, chapterUrl: string): Promise<void> { return this.driver.clearFailure(taskId, chapterUrl); }
  clearFailures(taskId: string): Promise<void> { return this.driver.clearFailures(taskId); }
  upsertLanguageProfile(profile: LanguageProfile): Promise<void> { return this.driver.upsertLanguageProfile(profile); }
  getLanguageProfile(bookUrl: string): Promise<LanguageProfile | undefined> { return this.driver.getLanguageProfile(bookUrl); }
  upsertTranslation(translation: ChapterTranslation): Promise<void> { return this.driver.upsertTranslation(translation); }
  getTranslation(sourceUrl: string, targetLanguage: string): Promise<ChapterTranslation | undefined> { return this.driver.getTranslation(sourceUrl, targetLanguage); }
  listTranslationLanguages(bookUrl: string): Promise<string[]> { return this.driver.listTranslationLanguages(bookUrl); }
  upsertTranslationTask(task: TranslationTask): Promise<void> { return this.driver.upsertTranslationTask(task); }
  listTranslationTasks(): Promise<TranslationTask[]> { return this.driver.listTranslationTasks(); }
  upsertTranslationFailure(failure: TranslationFailure): Promise<void> { return this.driver.upsertTranslationFailure(failure); }
  listTranslationFailures(taskId: string): Promise<TranslationFailure[]> { return this.driver.listTranslationFailures(taskId); }
  clearTranslationFailure(taskId: string, chapterUrl: string): Promise<void> { return this.driver.clearTranslationFailure(taskId, chapterUrl); }
  clearTranslationFailures(taskId: string): Promise<void> { return this.driver.clearTranslationFailures(taskId); }
  upsertProofread(proofread: ChapterProofread): Promise<void> { return this.driver.upsertProofread(proofread); }
  getProofread(sourceUrl: string): Promise<ChapterProofread | undefined> { return this.driver.getProofread(sourceUrl); }
  deleteProofread(sourceUrl: string): Promise<boolean> { return this.driver.deleteProofread(sourceUrl); }
  upsertProofreadTask(task: ProofreadTask): Promise<void> { return this.driver.upsertProofreadTask(task); }
  listProofreadTasks(): Promise<ProofreadTask[]> { return this.driver.listProofreadTasks(); }
  upsertProofreadFailure(failure: ProofreadFailure): Promise<void> { return this.driver.upsertProofreadFailure(failure); }
  listProofreadFailures(taskId: string): Promise<ProofreadFailure[]> { return this.driver.listProofreadFailures(taskId); }
  clearProofreadFailure(taskId: string, chapterUrl: string): Promise<void> { return this.driver.clearProofreadFailure(taskId, chapterUrl); }
  clearProofreadFailures(taskId: string): Promise<void> { return this.driver.clearProofreadFailures(taskId); }
  insertAiUsage(record: AiUsageRecord): Promise<void> { return this.driver.insertAiUsage(record); }
  listAiUsage(limit?: number): Promise<AiUsageRecord[]> { return this.driver.listAiUsage(limit); }
}

class SqliteDatabaseDriver implements DatabaseDriver {
  readonly backend = 'sqlite' as const;
  private readonly db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
  }

  async migrate(): Promise<void> {
    this.db.exec(`
      create table if not exists books (
        canonical_url text primary key,
        site_id text not null,
        source_url text not null,
        title text not null,
        author text,
        category text,
        status text,
        cover_url text,
        description text,
        created_at text not null
      );

      create table if not exists chapters (
        source_url text primary key,
        site_id text not null,
        book_url text not null,
        chapter_index integer not null,
        title text not null,
        text text,
        html text,
        fetched_at text,
        foreign key(book_url) references books(canonical_url)
      );

      create table if not exists download_tasks (
        id text primary key,
        site_id text not null,
        book_url text not null,
        status text not null,
        total_chapters integer not null,
        completed_chapters integer not null,
        failed_chapters integer not null,
        created_at text not null,
        updated_at text not null,
        message text
      );

      create table if not exists download_failures (
        task_id text not null,
        site_id text not null,
        book_url text not null,
        chapter_url text not null,
        chapter_index integer not null,
        title text not null,
        attempts integer not null,
        error text not null,
        last_failed_at text not null,
        primary key(task_id, chapter_url),
        foreign key(task_id) references download_tasks(id)
      );

      create table if not exists analyses (
        id integer primary key autoincrement,
        kind text not null,
        source_id text not null,
        model text not null,
        summary text not null,
        data_json text not null,
        created_at text not null
      );

      create table if not exists book_language_profiles (
        book_url text primary key,
        language text not null,
        confidence real not null,
        sample_size integer not null,
        detected_at text not null,
        detector text not null
      );

      create table if not exists chapter_translations (
        source_url text not null,
        book_url text not null,
        chapter_index integer not null,
        title text not null,
        source_language text not null,
        target_language text not null,
        text text not null,
        model text not null,
        prompt_hash text not null,
        created_at text not null,
        updated_at text not null,
        primary key(source_url, target_language),
        foreign key(source_url) references chapters(source_url)
      );

      create table if not exists translation_tasks (
        id text primary key,
        book_url text not null,
        source_language text not null,
        target_language text not null,
        status text not null,
        total_chapters integer not null,
        completed_chapters integer not null,
        failed_chapters integer not null,
        force integer not null,
        created_at text not null,
        updated_at text not null,
        message text
      );

      create table if not exists translation_failures (
        task_id text not null,
        book_url text not null,
        chapter_url text not null,
        chapter_index integer not null,
        title text not null,
        target_language text not null,
        attempts integer not null,
        error text not null,
        last_failed_at text not null,
        primary key(task_id, chapter_url),
        foreign key(task_id) references translation_tasks(id)
      );

      create table if not exists chapter_proofreads (
        source_url text primary key,
        book_url text not null,
        chapter_index integer not null,
        title text not null,
        original_text text not null,
        corrected_text text not null,
        applied integer not null,
        model text not null,
        prompt_hash text not null,
        created_at text not null,
        updated_at text not null,
        foreign key(source_url) references chapters(source_url)
      );

      create table if not exists proofread_tasks (
        id text primary key,
        book_url text not null,
        status text not null,
        total_chapters integer not null,
        completed_chapters integer not null,
        failed_chapters integer not null,
        force integer not null,
        apply_repairs integer not null,
        created_at text not null,
        updated_at text not null,
        message text
      );

      create table if not exists proofread_failures (
        task_id text not null,
        book_url text not null,
        chapter_url text not null,
        chapter_index integer not null,
        title text not null,
        attempts integer not null,
        error text not null,
        last_failed_at text not null,
        primary key(task_id, chapter_url),
        foreign key(task_id) references proofread_tasks(id)
      );

      create table if not exists ai_request_logs (
        id integer primary key autoincrement,
        operation text not null,
        task_id text,
        source_id text,
        model text not null,
        prompt_tokens integer,
        completion_tokens integer,
        total_tokens integer,
        created_at text not null
      );
    `);
  }

  async close(): Promise<void> { this.db.close(); }

  async upsertBook(book: BookInfo): Promise<void> {
    this.db.prepare(`
      insert into books (canonical_url, site_id, source_url, title, author, category, status, cover_url, description, created_at)
      values (@canonicalUrl, @siteId, @sourceUrl, @title, @author, @category, @status, @coverUrl, @description, @createdAt)
      on conflict(canonical_url) do update set
        title=excluded.title,
        author=excluded.author,
        category=excluded.category,
        status=excluded.status,
        cover_url=excluded.cover_url,
        description=excluded.description
    `).run(bookToSqlParams(book));
  }

  async upsertCatalog(chapters: ChapterRef[]): Promise<void> {
    const statement = this.db.prepare(`
      insert into chapters (source_url, site_id, book_url, chapter_index, title)
      values (@sourceUrl, @siteId, @bookUrl, @index, @title)
      on conflict(source_url) do update set title=excluded.title, chapter_index=excluded.chapter_index
    `);
    const transaction = this.db.transaction((items: ChapterRef[]) => items.forEach((item) => statement.run(item)));
    transaction(chapters);
  }

  async upsertChapterContent(chapter: ChapterContent): Promise<void> {
    this.db.prepare(`
      insert into chapters (source_url, site_id, book_url, chapter_index, title, text, html, fetched_at)
      values (@sourceUrl, @siteId, @bookUrl, @index, @title, @text, @html, @fetchedAt)
      on conflict(source_url) do update set
        title=excluded.title,
        text=excluded.text,
        html=excluded.html,
        fetched_at=excluded.fetched_at
    `).run(chapterToSqlParams(chapter));
  }

  async listBooks(): Promise<BookInfo[]> {
    return this.db.prepare('select * from books order by created_at desc').all().map(rowToBook);
  }

  async deleteBook(bookUrl: string): Promise<boolean> {
    const book = this.db.prepare('select canonical_url from books where canonical_url = ? or source_url = ? order by created_at desc limit 1').get(bookUrl, bookUrl) as { canonical_url: string } | undefined;
    const targetBookUrl = book?.canonical_url ?? bookUrl;
    const transaction = this.db.transaction(() => {
      this.db.prepare('delete from chapter_proofreads where book_url = ? or source_url in (select source_url from chapters where book_url = ?)').run(targetBookUrl, targetBookUrl);
      this.db.prepare('delete from proofread_failures where book_url = ?').run(targetBookUrl);
      this.db.prepare('delete from chapter_translations where book_url = ? or source_url in (select source_url from chapters where book_url = ?)').run(targetBookUrl, targetBookUrl);
      this.db.prepare('delete from translation_failures where book_url = ?').run(targetBookUrl);
      this.db.prepare('delete from download_failures where book_url = ?').run(targetBookUrl);
      this.db.prepare('delete from book_language_profiles where book_url = ?').run(targetBookUrl);
      this.db.prepare('delete from chapters where book_url = ?').run(targetBookUrl);
      return this.db.prepare('delete from books where canonical_url = ?').run(targetBookUrl).changes;
    });
    return transaction() > 0;
  }

  async listChapters(bookUrl: string): Promise<ChapterRef[]> {
    return this.db.prepare('select * from chapters where book_url = ? order by chapter_index asc').all(bookUrl).map(rowToChapterRef);
  }

  async getChapter(sourceUrl: string): Promise<ChapterContent | undefined> {
    const row = this.db.prepare('select * from chapters where source_url = ?').get(sourceUrl);
    return row ? rowToChapterContent(row) : undefined;
  }

  async upsertTask(task: DownloadTask): Promise<void> {
    this.db.prepare(`
      insert into download_tasks (id, site_id, book_url, status, total_chapters, completed_chapters, failed_chapters, created_at, updated_at, message)
      values (@id, @siteId, @bookUrl, @status, @totalChapters, @completedChapters, @failedChapters, @createdAt, @updatedAt, @message)
      on conflict(id) do update set
        status=excluded.status,
        total_chapters=excluded.total_chapters,
        completed_chapters=excluded.completed_chapters,
        failed_chapters=excluded.failed_chapters,
        updated_at=excluded.updated_at,
        message=excluded.message
    `).run(taskToSqlParams(task));
  }

  async listTasks(): Promise<DownloadTask[]> {
    return this.db.prepare('select * from download_tasks order by created_at desc').all().map(rowToTask);
  }

  async upsertFailure(failure: DownloadFailure): Promise<void> {
    this.db.prepare(`
      insert into download_failures (task_id, site_id, book_url, chapter_url, chapter_index, title, attempts, error, last_failed_at)
      values (@taskId, @siteId, @bookUrl, @chapterUrl, @chapterIndex, @title, @attempts, @error, @lastFailedAt)
      on conflict(task_id, chapter_url) do update set
        attempts=excluded.attempts,
        error=excluded.error,
        last_failed_at=excluded.last_failed_at
    `).run(failure);
  }

  async listFailures(taskId: string): Promise<DownloadFailure[]> {
    return this.db.prepare('select * from download_failures where task_id = ? order by chapter_index asc').all(taskId).map(rowToFailure);
  }

  async clearFailure(taskId: string, chapterUrl: string): Promise<void> {
    this.db.prepare('delete from download_failures where task_id = ? and chapter_url = ?').run(taskId, chapterUrl);
  }

  async clearFailures(taskId: string): Promise<void> {
    this.db.prepare('delete from download_failures where task_id = ?').run(taskId);
  }

  async upsertLanguageProfile(profile: LanguageProfile): Promise<void> {
    this.db.prepare(`
      insert into book_language_profiles (book_url, language, confidence, sample_size, detected_at, detector)
      values (@bookUrl, @language, @confidence, @sampleSize, @detectedAt, @detector)
      on conflict(book_url) do update set
        language=excluded.language,
        confidence=excluded.confidence,
        sample_size=excluded.sample_size,
        detected_at=excluded.detected_at,
        detector=excluded.detector
    `).run(profileToSqlParams(profile));
  }

  async getLanguageProfile(bookUrl: string): Promise<LanguageProfile | undefined> {
    const row = this.db.prepare('select * from book_language_profiles where book_url = ?').get(bookUrl);
    return row ? rowToLanguageProfile(row) : undefined;
  }

  async upsertTranslation(translation: ChapterTranslation): Promise<void> {
    this.db.prepare(`
      insert into chapter_translations (source_url, book_url, chapter_index, title, source_language, target_language, text, model, prompt_hash, created_at, updated_at)
      values (@sourceUrl, @bookUrl, @chapterIndex, @title, @sourceLanguage, @targetLanguage, @text, @model, @promptHash, @createdAt, @updatedAt)
      on conflict(source_url, target_language) do update set
        title=excluded.title,
        source_language=excluded.source_language,
        text=excluded.text,
        model=excluded.model,
        prompt_hash=excluded.prompt_hash,
        updated_at=excluded.updated_at
    `).run(translationToSqlParams(translation));
  }

  async getTranslation(sourceUrl: string, targetLanguage: string): Promise<ChapterTranslation | undefined> {
    const row = this.db.prepare('select * from chapter_translations where source_url = ? and target_language = ?').get(sourceUrl, targetLanguage);
    return row ? rowToTranslation(row) : undefined;
  }

  async listTranslationLanguages(bookUrl: string): Promise<string[]> {
    return this.db.prepare('select distinct target_language from chapter_translations where book_url = ? order by target_language asc').all(bookUrl).map((row: any) => row.target_language);
  }

  async upsertTranslationTask(task: TranslationTask): Promise<void> {
    this.db.prepare(`
      insert into translation_tasks (id, book_url, source_language, target_language, status, total_chapters, completed_chapters, failed_chapters, force, created_at, updated_at, message)
      values (@id, @bookUrl, @sourceLanguage, @targetLanguage, @status, @totalChapters, @completedChapters, @failedChapters, @force, @createdAt, @updatedAt, @message)
      on conflict(id) do update set
        status=excluded.status,
        total_chapters=excluded.total_chapters,
        completed_chapters=excluded.completed_chapters,
        failed_chapters=excluded.failed_chapters,
        force=excluded.force,
        updated_at=excluded.updated_at,
        message=excluded.message
    `).run(translationTaskToSqlParams(task));
  }

  async listTranslationTasks(): Promise<TranslationTask[]> {
    return this.db.prepare('select * from translation_tasks order by created_at desc').all().map(rowToTranslationTask);
  }

  async upsertTranslationFailure(failure: TranslationFailure): Promise<void> {
    this.db.prepare(`
      insert into translation_failures (task_id, book_url, chapter_url, chapter_index, title, target_language, attempts, error, last_failed_at)
      values (@taskId, @bookUrl, @chapterUrl, @chapterIndex, @title, @targetLanguage, @attempts, @error, @lastFailedAt)
      on conflict(task_id, chapter_url) do update set
        attempts=excluded.attempts,
        error=excluded.error,
        last_failed_at=excluded.last_failed_at
    `).run(failure);
  }

  async listTranslationFailures(taskId: string): Promise<TranslationFailure[]> {
    return this.db.prepare('select * from translation_failures where task_id = ? order by chapter_index asc').all(taskId).map(rowToTranslationFailure);
  }

  async clearTranslationFailure(taskId: string, chapterUrl: string): Promise<void> {
    this.db.prepare('delete from translation_failures where task_id = ? and chapter_url = ?').run(taskId, chapterUrl);
  }

  async clearTranslationFailures(taskId: string): Promise<void> {
    this.db.prepare('delete from translation_failures where task_id = ?').run(taskId);
  }

  async upsertProofread(proofread: ChapterProofread): Promise<void> {
    this.db.prepare(`
      insert into chapter_proofreads (source_url, book_url, chapter_index, title, original_text, corrected_text, applied, model, prompt_hash, created_at, updated_at)
      values (@sourceUrl, @bookUrl, @chapterIndex, @title, @originalText, @correctedText, @applied, @model, @promptHash, @createdAt, @updatedAt)
      on conflict(source_url) do update set
        title=excluded.title,
        original_text=excluded.original_text,
        corrected_text=excluded.corrected_text,
        applied=excluded.applied,
        model=excluded.model,
        prompt_hash=excluded.prompt_hash,
        updated_at=excluded.updated_at
    `).run(proofreadToSqlParams(proofread));
  }

  async getProofread(sourceUrl: string): Promise<ChapterProofread | undefined> {
    const row = this.db.prepare('select * from chapter_proofreads where source_url = ?').get(sourceUrl);
    return row ? rowToProofread(row) : undefined;
  }

  async deleteProofread(sourceUrl: string): Promise<boolean> {
    const result = this.db.prepare('delete from chapter_proofreads where source_url = ?').run(sourceUrl);
    return result.changes > 0;
  }

  async upsertProofreadTask(task: ProofreadTask): Promise<void> {
    this.db.prepare(`
      insert into proofread_tasks (id, book_url, status, total_chapters, completed_chapters, failed_chapters, force, apply_repairs, created_at, updated_at, message)
      values (@id, @bookUrl, @status, @totalChapters, @completedChapters, @failedChapters, @force, @applyRepairs, @createdAt, @updatedAt, @message)
      on conflict(id) do update set
        status=excluded.status,
        total_chapters=excluded.total_chapters,
        completed_chapters=excluded.completed_chapters,
        failed_chapters=excluded.failed_chapters,
        force=excluded.force,
        apply_repairs=excluded.apply_repairs,
        updated_at=excluded.updated_at,
        message=excluded.message
    `).run(proofreadTaskToSqlParams(task));
  }

  async listProofreadTasks(): Promise<ProofreadTask[]> {
    return this.db.prepare('select * from proofread_tasks order by created_at desc').all().map(rowToProofreadTask);
  }

  async upsertProofreadFailure(failure: ProofreadFailure): Promise<void> {
    this.db.prepare(`
      insert into proofread_failures (task_id, book_url, chapter_url, chapter_index, title, attempts, error, last_failed_at)
      values (@taskId, @bookUrl, @chapterUrl, @chapterIndex, @title, @attempts, @error, @lastFailedAt)
      on conflict(task_id, chapter_url) do update set
        attempts=excluded.attempts,
        error=excluded.error,
        last_failed_at=excluded.last_failed_at
    `).run(failure);
  }

  async listProofreadFailures(taskId: string): Promise<ProofreadFailure[]> {
    return this.db.prepare('select * from proofread_failures where task_id = ? order by chapter_index asc').all(taskId).map(rowToProofreadFailure);
  }

  async clearProofreadFailure(taskId: string, chapterUrl: string): Promise<void> {
    this.db.prepare('delete from proofread_failures where task_id = ? and chapter_url = ?').run(taskId, chapterUrl);
  }

  async clearProofreadFailures(taskId: string): Promise<void> {
    this.db.prepare('delete from proofread_failures where task_id = ?').run(taskId);
  }

  async insertAiUsage(record: AiUsageRecord): Promise<void> {
    this.db.prepare(`
      insert into ai_request_logs (operation, task_id, source_id, model, prompt_tokens, completion_tokens, total_tokens, created_at)
      values (@operation, @taskId, @sourceId, @model, @promptTokens, @completionTokens, @totalTokens, @createdAt)
    `).run(aiUsageToSqlParams(record));
  }

  async listAiUsage(limit = 200): Promise<AiUsageRecord[]> {
    return this.db.prepare('select * from ai_request_logs order by created_at desc, id desc limit ?').all(Math.max(1, Math.floor(limit))).map(rowToAiUsage);
  }
}

class PostgresDatabaseDriver implements DatabaseDriver {
  readonly backend = 'postgres' as const;
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      create table if not exists books (
        canonical_url text primary key,
        site_id text not null,
        source_url text not null,
        title text not null,
        author text,
        category text,
        status text,
        cover_url text,
        description text,
        created_at text not null
      );

      create table if not exists chapters (
        source_url text primary key,
        site_id text not null,
        book_url text not null,
        chapter_index integer not null,
        title text not null,
        text text,
        html text,
        fetched_at text,
        foreign key(book_url) references books(canonical_url)
      );

      create table if not exists download_tasks (
        id text primary key,
        site_id text not null,
        book_url text not null,
        status text not null,
        total_chapters integer not null,
        completed_chapters integer not null,
        failed_chapters integer not null,
        created_at text not null,
        updated_at text not null,
        message text
      );

      create table if not exists download_failures (
        task_id text not null,
        site_id text not null,
        book_url text not null,
        chapter_url text not null,
        chapter_index integer not null,
        title text not null,
        attempts integer not null,
        error text not null,
        last_failed_at text not null,
        primary key(task_id, chapter_url),
        foreign key(task_id) references download_tasks(id)
      );

      create table if not exists analyses (
        id integer generated by default as identity primary key,
        kind text not null,
        source_id text not null,
        model text not null,
        summary text not null,
        data_json text not null,
        created_at text not null
      );

      create table if not exists book_language_profiles (
        book_url text primary key,
        language text not null,
        confidence real not null,
        sample_size integer not null,
        detected_at text not null,
        detector text not null
      );

      create table if not exists chapter_translations (
        source_url text not null,
        book_url text not null,
        chapter_index integer not null,
        title text not null,
        source_language text not null,
        target_language text not null,
        text text not null,
        model text not null,
        prompt_hash text not null,
        created_at text not null,
        updated_at text not null,
        primary key(source_url, target_language),
        foreign key(source_url) references chapters(source_url)
      );

      create table if not exists translation_tasks (
        id text primary key,
        book_url text not null,
        source_language text not null,
        target_language text not null,
        status text not null,
        total_chapters integer not null,
        completed_chapters integer not null,
        failed_chapters integer not null,
        force boolean not null,
        created_at text not null,
        updated_at text not null,
        message text
      );

      create table if not exists translation_failures (
        task_id text not null,
        book_url text not null,
        chapter_url text not null,
        chapter_index integer not null,
        title text not null,
        target_language text not null,
        attempts integer not null,
        error text not null,
        last_failed_at text not null,
        primary key(task_id, chapter_url),
        foreign key(task_id) references translation_tasks(id)
      );

      create table if not exists chapter_proofreads (
        source_url text primary key,
        book_url text not null,
        chapter_index integer not null,
        title text not null,
        original_text text not null,
        corrected_text text not null,
        applied boolean not null,
        model text not null,
        prompt_hash text not null,
        created_at text not null,
        updated_at text not null,
        foreign key(source_url) references chapters(source_url)
      );

      create table if not exists proofread_tasks (
        id text primary key,
        book_url text not null,
        status text not null,
        total_chapters integer not null,
        completed_chapters integer not null,
        failed_chapters integer not null,
        force boolean not null,
        apply_repairs boolean not null,
        created_at text not null,
        updated_at text not null,
        message text
      );

      create table if not exists proofread_failures (
        task_id text not null,
        book_url text not null,
        chapter_url text not null,
        chapter_index integer not null,
        title text not null,
        attempts integer not null,
        error text not null,
        last_failed_at text not null,
        primary key(task_id, chapter_url),
        foreign key(task_id) references proofread_tasks(id)
      );

      create table if not exists ai_request_logs (
        id integer generated by default as identity primary key,
        operation text not null,
        task_id text,
        source_id text,
        model text not null,
        prompt_tokens integer,
        completion_tokens integer,
        total_tokens integer,
        created_at text not null
      );
    `);
  }

  async close(): Promise<void> { await this.pool.end(); }

  async upsertBook(book: BookInfo): Promise<void> {
    await this.pool.query(`
      insert into books (canonical_url, site_id, source_url, title, author, category, status, cover_url, description, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict(canonical_url) do update set
        title = excluded.title,
        author = excluded.author,
        category = excluded.category,
        status = excluded.status,
        cover_url = excluded.cover_url,
        description = excluded.description
    `, [book.canonicalUrl, book.siteId, book.sourceUrl, book.title, book.author, book.category, book.status, book.coverUrl, book.description, book.createdAt]);
  }

  async upsertCatalog(chapters: ChapterRef[]): Promise<void> {
    if (chapters.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      for (const chapter of chapters) {
        await client.query(`
          insert into chapters (source_url, site_id, book_url, chapter_index, title)
          values ($1, $2, $3, $4, $5)
          on conflict(source_url) do update set title = excluded.title, chapter_index = excluded.chapter_index
        `, [chapter.sourceUrl, chapter.siteId, chapter.bookUrl, chapter.index, chapter.title]);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertChapterContent(chapter: ChapterContent): Promise<void> {
    await this.pool.query(`
      insert into chapters (source_url, site_id, book_url, chapter_index, title, text, html, fetched_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict(source_url) do update set
        title = excluded.title,
        text = excluded.text,
        html = excluded.html,
        fetched_at = excluded.fetched_at
    `, [chapter.sourceUrl, chapter.siteId, chapter.bookUrl, chapter.index ?? 0, chapter.title, chapter.text, chapter.html, chapter.fetchedAt]);
  }

  async listBooks(): Promise<BookInfo[]> {
    const result = await this.pool.query('select * from books order by created_at desc');
    return result.rows.map(rowToBook);
  }

  async deleteBook(bookUrl: string): Promise<boolean> {
    const bookResult = await this.pool.query('select canonical_url from books where canonical_url = $1 or source_url = $1 order by created_at desc limit 1', [bookUrl]);
    const book = bookResult.rows[0] as { canonical_url?: string } | undefined;
    const targetBookUrl = book?.canonical_url ?? bookUrl;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from chapter_proofreads where book_url = $1 or source_url in (select source_url from chapters where book_url = $1)', [targetBookUrl]);
      await client.query('delete from proofread_failures where book_url = $1', [targetBookUrl]);
      await client.query('delete from chapter_translations where book_url = $1 or source_url in (select source_url from chapters where book_url = $1)', [targetBookUrl]);
      await client.query('delete from translation_failures where book_url = $1', [targetBookUrl]);
      await client.query('delete from download_failures where book_url = $1', [targetBookUrl]);
      await client.query('delete from book_language_profiles where book_url = $1', [targetBookUrl]);
      await client.query('delete from chapters where book_url = $1', [targetBookUrl]);
      const result = await client.query('delete from books where canonical_url = $1', [targetBookUrl]);
      await client.query('commit');
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listChapters(bookUrl: string): Promise<ChapterRef[]> {
    const result = await this.pool.query('select * from chapters where book_url = $1 order by chapter_index asc', [bookUrl]);
    return result.rows.map(rowToChapterRef);
  }

  async getChapter(sourceUrl: string): Promise<ChapterContent | undefined> {
    const result = await this.pool.query('select * from chapters where source_url = $1', [sourceUrl]);
    const row = result.rows[0];
    return row ? rowToChapterContent(row) : undefined;
  }

  async upsertTask(task: DownloadTask): Promise<void> {
    await this.pool.query(`
      insert into download_tasks (id, site_id, book_url, status, total_chapters, completed_chapters, failed_chapters, created_at, updated_at, message)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict(id) do update set
        status = excluded.status,
        total_chapters = excluded.total_chapters,
        completed_chapters = excluded.completed_chapters,
        failed_chapters = excluded.failed_chapters,
        updated_at = excluded.updated_at,
        message = excluded.message
    `, [task.id, task.siteId, task.bookUrl, task.status, task.totalChapters, task.completedChapters, task.failedChapters, task.createdAt, task.updatedAt, task.message]);
  }

  async listTasks(): Promise<DownloadTask[]> {
    const result = await this.pool.query('select * from download_tasks order by created_at desc');
    return result.rows.map(rowToTask);
  }

  async upsertFailure(failure: DownloadFailure): Promise<void> {
    await this.pool.query(`
      insert into download_failures (task_id, site_id, book_url, chapter_url, chapter_index, title, attempts, error, last_failed_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict(task_id, chapter_url) do update set
        attempts = excluded.attempts,
        error = excluded.error,
        last_failed_at = excluded.last_failed_at
    `, [failure.taskId, failure.siteId, failure.bookUrl, failure.chapterUrl, failure.chapterIndex, failure.title, failure.attempts, failure.error, failure.lastFailedAt]);
  }

  async listFailures(taskId: string): Promise<DownloadFailure[]> {
    const result = await this.pool.query('select * from download_failures where task_id = $1 order by chapter_index asc', [taskId]);
    return result.rows.map(rowToFailure);
  }

  async clearFailure(taskId: string, chapterUrl: string): Promise<void> {
    await this.pool.query('delete from download_failures where task_id = $1 and chapter_url = $2', [taskId, chapterUrl]);
  }

  async clearFailures(taskId: string): Promise<void> {
    await this.pool.query('delete from download_failures where task_id = $1', [taskId]);
  }

  async upsertLanguageProfile(profile: LanguageProfile): Promise<void> {
    await this.pool.query(`
      insert into book_language_profiles (book_url, language, confidence, sample_size, detected_at, detector)
      values ($1, $2, $3, $4, $5, $6)
      on conflict(book_url) do update set
        language = excluded.language,
        confidence = excluded.confidence,
        sample_size = excluded.sample_size,
        detected_at = excluded.detected_at,
        detector = excluded.detector
    `, [profile.bookUrl, profile.language, profile.confidence, profile.sampleSize, profile.detectedAt, profile.detector]);
  }

  async getLanguageProfile(bookUrl: string): Promise<LanguageProfile | undefined> {
    const result = await this.pool.query('select * from book_language_profiles where book_url = $1', [bookUrl]);
    const row = result.rows[0];
    return row ? rowToLanguageProfile(row) : undefined;
  }

  async upsertTranslation(translation: ChapterTranslation): Promise<void> {
    await this.pool.query(`
      insert into chapter_translations (source_url, book_url, chapter_index, title, source_language, target_language, text, model, prompt_hash, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict(source_url, target_language) do update set
        title = excluded.title,
        source_language = excluded.source_language,
        text = excluded.text,
        model = excluded.model,
        prompt_hash = excluded.prompt_hash,
        updated_at = excluded.updated_at
    `, [translation.sourceUrl, translation.bookUrl, translation.chapterIndex, translation.title, translation.sourceLanguage, translation.targetLanguage, translation.text, translation.model, translation.promptHash, translation.createdAt, translation.updatedAt]);
  }

  async getTranslation(sourceUrl: string, targetLanguage: string): Promise<ChapterTranslation | undefined> {
    const result = await this.pool.query('select * from chapter_translations where source_url = $1 and target_language = $2', [sourceUrl, targetLanguage]);
    const row = result.rows[0];
    return row ? rowToTranslation(row) : undefined;
  }

  async listTranslationLanguages(bookUrl: string): Promise<string[]> {
    const result = await this.pool.query('select distinct target_language from chapter_translations where book_url = $1 order by target_language asc', [bookUrl]);
    return result.rows.map((row) => row.target_language as string);
  }

  async upsertTranslationTask(task: TranslationTask): Promise<void> {
    await this.pool.query(`
      insert into translation_tasks (id, book_url, source_language, target_language, status, total_chapters, completed_chapters, failed_chapters, force, created_at, updated_at, message)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict(id) do update set
        status = excluded.status,
        total_chapters = excluded.total_chapters,
        completed_chapters = excluded.completed_chapters,
        failed_chapters = excluded.failed_chapters,
        force = excluded.force,
        updated_at = excluded.updated_at,
        message = excluded.message
    `, [task.id, task.bookUrl, task.sourceLanguage, task.targetLanguage, task.status, task.totalChapters, task.completedChapters, task.failedChapters, task.force, task.createdAt, task.updatedAt, task.message]);
  }

  async listTranslationTasks(): Promise<TranslationTask[]> {
    const result = await this.pool.query('select * from translation_tasks order by created_at desc');
    return result.rows.map(rowToTranslationTask);
  }

  async upsertTranslationFailure(failure: TranslationFailure): Promise<void> {
    await this.pool.query(`
      insert into translation_failures (task_id, book_url, chapter_url, chapter_index, title, target_language, attempts, error, last_failed_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict(task_id, chapter_url) do update set
        attempts = excluded.attempts,
        error = excluded.error,
        last_failed_at = excluded.last_failed_at
    `, [failure.taskId, failure.bookUrl, failure.chapterUrl, failure.chapterIndex, failure.title, failure.targetLanguage, failure.attempts, failure.error, failure.lastFailedAt]);
  }

  async listTranslationFailures(taskId: string): Promise<TranslationFailure[]> {
    const result = await this.pool.query('select * from translation_failures where task_id = $1 order by chapter_index asc', [taskId]);
    return result.rows.map(rowToTranslationFailure);
  }

  async clearTranslationFailure(taskId: string, chapterUrl: string): Promise<void> {
    await this.pool.query('delete from translation_failures where task_id = $1 and chapter_url = $2', [taskId, chapterUrl]);
  }

  async clearTranslationFailures(taskId: string): Promise<void> {
    await this.pool.query('delete from translation_failures where task_id = $1', [taskId]);
  }

  async upsertProofread(proofread: ChapterProofread): Promise<void> {
    await this.pool.query(`
      insert into chapter_proofreads (source_url, book_url, chapter_index, title, original_text, corrected_text, applied, model, prompt_hash, created_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict(source_url) do update set
        title = excluded.title,
        original_text = excluded.original_text,
        corrected_text = excluded.corrected_text,
        applied = excluded.applied,
        model = excluded.model,
        prompt_hash = excluded.prompt_hash,
        updated_at = excluded.updated_at
    `, [proofread.sourceUrl, proofread.bookUrl, proofread.chapterIndex, proofread.title, proofread.originalText, proofread.correctedText, proofread.applied, proofread.model, proofread.promptHash, proofread.createdAt, proofread.updatedAt]);
  }

  async getProofread(sourceUrl: string): Promise<ChapterProofread | undefined> {
    const result = await this.pool.query('select * from chapter_proofreads where source_url = $1', [sourceUrl]);
    const row = result.rows[0];
    return row ? rowToProofread(row) : undefined;
  }

  async deleteProofread(sourceUrl: string): Promise<boolean> {
    const result = await this.pool.query('delete from chapter_proofreads where source_url = $1', [sourceUrl]);
    return (result.rowCount ?? 0) > 0;
  }

  async upsertProofreadTask(task: ProofreadTask): Promise<void> {
    await this.pool.query(`
      insert into proofread_tasks (id, book_url, status, total_chapters, completed_chapters, failed_chapters, force, apply_repairs, created_at, updated_at, message)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict(id) do update set
        status = excluded.status,
        total_chapters = excluded.total_chapters,
        completed_chapters = excluded.completed_chapters,
        failed_chapters = excluded.failed_chapters,
        force = excluded.force,
        apply_repairs = excluded.apply_repairs,
        updated_at = excluded.updated_at,
        message = excluded.message
    `, [task.id, task.bookUrl, task.status, task.totalChapters, task.completedChapters, task.failedChapters, task.force, task.applyRepairs, task.createdAt, task.updatedAt, task.message]);
  }

  async listProofreadTasks(): Promise<ProofreadTask[]> {
    const result = await this.pool.query('select * from proofread_tasks order by created_at desc');
    return result.rows.map(rowToProofreadTask);
  }

  async upsertProofreadFailure(failure: ProofreadFailure): Promise<void> {
    await this.pool.query(`
      insert into proofread_failures (task_id, book_url, chapter_url, chapter_index, title, attempts, error, last_failed_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict(task_id, chapter_url) do update set
        attempts = excluded.attempts,
        error = excluded.error,
        last_failed_at = excluded.last_failed_at
    `, [failure.taskId, failure.bookUrl, failure.chapterUrl, failure.chapterIndex, failure.title, failure.attempts, failure.error, failure.lastFailedAt]);
  }

  async listProofreadFailures(taskId: string): Promise<ProofreadFailure[]> {
    const result = await this.pool.query('select * from proofread_failures where task_id = $1 order by chapter_index asc', [taskId]);
    return result.rows.map(rowToProofreadFailure);
  }

  async clearProofreadFailure(taskId: string, chapterUrl: string): Promise<void> {
    await this.pool.query('delete from proofread_failures where task_id = $1 and chapter_url = $2', [taskId, chapterUrl]);
  }

  async clearProofreadFailures(taskId: string): Promise<void> {
    await this.pool.query('delete from proofread_failures where task_id = $1', [taskId]);
  }

  async insertAiUsage(record: AiUsageRecord): Promise<void> {
    await this.pool.query(`
      insert into ai_request_logs (operation, task_id, source_id, model, prompt_tokens, completion_tokens, total_tokens, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [record.operation, record.taskId, record.sourceId, record.model, record.promptTokens, record.completionTokens, record.totalTokens, record.createdAt]);
  }

  async listAiUsage(limit = 200): Promise<AiUsageRecord[]> {
    const result = await this.pool.query('select * from ai_request_logs order by created_at desc, id desc limit $1', [Math.max(1, Math.floor(limit))]);
    return result.rows.map(rowToAiUsage);
  }
}

function rowToBook(row: QueryResultRow | any): BookInfo {
  return {
    siteId: row.site_id,
    sourceUrl: row.source_url,
    canonicalUrl: row.canonical_url,
    title: row.title,
    author: row.author ?? undefined,
    category: row.category ?? undefined,
    status: row.status ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToChapterRef(row: QueryResultRow | any): ChapterRef {
  return {
    siteId: row.site_id,
    bookUrl: row.book_url,
    sourceUrl: row.source_url,
    index: row.chapter_index,
    title: row.title,
  };
}

function rowToChapterContent(row: QueryResultRow | any): ChapterContent {
  return {
    siteId: row.site_id,
    bookUrl: row.book_url,
    sourceUrl: row.source_url,
    title: row.title,
    index: row.chapter_index,
    text: row.text ?? '',
    html: row.html ?? undefined,
    fetchedAt: row.fetched_at ?? '',
  };
}

function rowToTask(row: QueryResultRow | any): DownloadTask {
  return {
    id: row.id,
    siteId: row.site_id,
    bookUrl: row.book_url,
    status: row.status,
    totalChapters: row.total_chapters,
    completedChapters: row.completed_chapters,
    failedChapters: row.failed_chapters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    message: row.message ?? undefined,
  };
}

function rowToFailure(row: QueryResultRow | any): DownloadFailure {
  return {
    taskId: row.task_id,
    siteId: row.site_id,
    bookUrl: row.book_url,
    chapterUrl: row.chapter_url,
    chapterIndex: row.chapter_index,
    title: row.title,
    attempts: row.attempts,
    error: row.error,
    lastFailedAt: row.last_failed_at,
  };
}

function rowToLanguageProfile(row: QueryResultRow | any): LanguageProfile {
  return {
    bookUrl: row.book_url,
    language: row.language,
    confidence: Number(row.confidence),
    sampleSize: row.sample_size,
    detectedAt: row.detected_at,
    detector: row.detector,
  };
}

function rowToTranslation(row: QueryResultRow | any): ChapterTranslation {
  return {
    sourceUrl: row.source_url,
    bookUrl: row.book_url,
    chapterIndex: row.chapter_index,
    title: row.title,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    text: row.text,
    model: row.model,
    promptHash: row.prompt_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTranslationTask(row: QueryResultRow | any): TranslationTask {
  return {
    id: row.id,
    bookUrl: row.book_url,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    status: row.status,
    totalChapters: row.total_chapters,
    completedChapters: row.completed_chapters,
    failedChapters: row.failed_chapters,
    force: Boolean(row.force),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    message: row.message ?? undefined,
  };
}

function rowToTranslationFailure(row: QueryResultRow | any): TranslationFailure {
  return {
    taskId: row.task_id,
    bookUrl: row.book_url,
    chapterUrl: row.chapter_url,
    chapterIndex: row.chapter_index,
    title: row.title,
    targetLanguage: row.target_language,
    attempts: row.attempts,
    error: row.error,
    lastFailedAt: row.last_failed_at,
  };
}

function rowToProofread(row: QueryResultRow | any): ChapterProofread {
  return {
    sourceUrl: row.source_url,
    bookUrl: row.book_url,
    chapterIndex: row.chapter_index,
    title: row.title,
    originalText: row.original_text,
    correctedText: row.corrected_text,
    applied: Boolean(row.applied),
    model: row.model,
    promptHash: row.prompt_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProofreadTask(row: QueryResultRow | any): ProofreadTask {
  return {
    id: row.id,
    bookUrl: row.book_url,
    status: row.status,
    totalChapters: row.total_chapters,
    completedChapters: row.completed_chapters,
    failedChapters: row.failed_chapters,
    force: Boolean(row.force),
    applyRepairs: Boolean(row.apply_repairs),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    message: row.message ?? undefined,
  };
}

function rowToProofreadFailure(row: QueryResultRow | any): ProofreadFailure {
  return {
    taskId: row.task_id,
    bookUrl: row.book_url,
    chapterUrl: row.chapter_url,
    chapterIndex: row.chapter_index,
    title: row.title,
    attempts: row.attempts,
    error: row.error,
    lastFailedAt: row.last_failed_at,
  };
}

function rowToAiUsage(row: QueryResultRow | any): AiUsageRecord {
  return {
    id: row.id,
    operation: row.operation,
    taskId: row.task_id ?? undefined,
    sourceId: row.source_id ?? undefined,
    model: row.model,
    promptTokens: row.prompt_tokens ?? undefined,
    completionTokens: row.completion_tokens ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    createdAt: row.created_at,
  };
}

function bookToSqlParams(book: BookInfo) {
  return {
    ...book,
    author: book.author ?? null,
    category: book.category ?? null,
    status: book.status ?? null,
    coverUrl: book.coverUrl ?? null,
    description: book.description ?? null,
  };
}

function chapterToSqlParams(chapter: ChapterContent) {
  return {
    ...chapter,
    index: chapter.index ?? 0,
    html: chapter.html ?? null,
    fetchedAt: chapter.fetchedAt ?? null,
  };
}

function taskToSqlParams(task: DownloadTask) {
  return {
    ...task,
    message: task.message ?? null,
  };
}

function profileToSqlParams(profile: LanguageProfile) {
  return profile;
}

function translationToSqlParams(translation: ChapterTranslation) {
  return translation;
}

function translationTaskToSqlParams(task: TranslationTask) {
  return {
    ...task,
    force: task.force ? 1 : 0,
    message: task.message ?? null,
  };
}

function proofreadToSqlParams(proofread: ChapterProofread) {
  return {
    ...proofread,
    applied: proofread.applied ? 1 : 0,
  };
}

function proofreadTaskToSqlParams(task: ProofreadTask) {
  return {
    ...task,
    force: task.force ? 1 : 0,
    applyRepairs: task.applyRepairs ? 1 : 0,
    message: task.message ?? null,
  };
}

function aiUsageToSqlParams(record: AiUsageRecord) {
  return {
    ...record,
    taskId: record.taskId ?? null,
    sourceId: record.sourceId ?? null,
    promptTokens: record.promptTokens ?? null,
    completionTokens: record.completionTokens ?? null,
    totalTokens: record.totalTokens ?? null,
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
