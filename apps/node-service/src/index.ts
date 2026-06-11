import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';
import { createLiteLlmClientFromEnv } from '@sky-novel-hermes/ai';
import { safeFileName, toMarkdown, toPlainText, toZip } from '@sky-novel-hermes/exporter';
import type { AiUsageRecord, BookInfo, ChapterContent, ChapterRef } from '@sky-novel-hermes/shared';
import { getSite, getSites } from '@sky-novel-hermes/sites';
import { HermesDatabase } from '@sky-novel-hermes/storage';
import { loadConfig, normalizeProofreadSettings, normalizeTranslationSettings, saveSettings, type AppSettings } from './config.js';
import { ActiveTaskError, DownloadManager } from './downloadManager.js';
import { ActiveProofreadTaskError, ProofreadManager } from './proofreadManager.js';
import { ActiveTranslationTaskError, TranslationManager } from './translationManager.js';

const startedAt = new Date().toISOString();
const config = loadConfig();
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
let settings: AppSettings = { storage: config.storage, exportDir: config.exportDir, autoRetryAttempts: config.autoRetryAttempts, translation: config.translation, proofreading: config.proofreading };
let db = await HermesDatabase.connect(settings.storage);
const ai = createLiteLlmClientFromEnv((record) => db.insertAiUsage(record).catch((error) => logger.warn({ error }, 'Failed to record AI usage')));
const downloads = new DownloadManager(db, getSite, settings.autoRetryAttempts);
const translations = new TranslationManager(db, ai, () => settings.translation);
const proofreads = new ProofreadManager(db, ai, () => settings.proofreading);

mkdirSync(config.exportDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp({ logger }));

app.get('/api/status', (_req, res) => {
  res.json({
    name: 'sky-novel-hermes-node-service',
    version: '0.1.0',
    startedAt,
    storage: { backend: db.backend },
    sites: getSites().map((site) => ({ id: site.id, displayName: site.displayName, baseUrl: site.baseUrl, capabilities: site.capabilities })),
  });
});

app.get('/api/settings', (_req, res) => {
  res.json({ ...settings, activeStorageBackend: db.backend });
});

app.post('/api/settings', async (req, res, next) => {
  try {
    const nextSettings = normalizeSettings(req.body);
    const nextDb = await HermesDatabase.connect(nextSettings.storage);
    const previousDb = db;
    settings = nextSettings;
    db = nextDb;
    downloads.setDatabase(nextDb);
    translations.setDatabase(nextDb);
    proofreads.setDatabase(nextDb);
    downloads.setAutoRetryAttempts(nextSettings.autoRetryAttempts);
    saveSettings(config.settingsPath, nextSettings);
    await previousDb.close();
    res.json({ ...settings, activeStorageBackend: db.backend });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sites', (_req, res) => {
  res.json(getSites().map((site) => ({ id: site.id, displayName: site.displayName, baseUrl: site.baseUrl, capabilities: site.capabilities })));
});

app.get('/api/sites/:siteId/check', async (req, res, next) => {
  try {
    res.json(await getSite(req.params.siteId).checkConnection());
  } catch (error) {
    next(error);
  }
});

app.post('/api/sites/:siteId/search', async (req, res, next) => {
  try {
    res.json(await getSite(req.params.siteId).search({ keyword: req.body.keyword, limit: req.body.limit ?? 20 }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/search', async (req, res, next) => {
  try {
    const keyword = String(req.body.keyword ?? '').trim();
    const limit = Number(req.body.limit ?? 20);
    const requestedSiteIds = Array.isArray(req.body.siteIds) ? req.body.siteIds.map(String) : [];
    const searchableSites = getSites().filter((site) => site.capabilities.includes('search'));
    const selectedSites = requestedSiteIds.length > 0
      ? searchableSites.filter((site) => requestedSiteIds.includes(site.id))
      : searchableSites;

    if (!keyword) {
      res.status(400).json({ error: 'keyword is required' });
      return;
    }

    const searchJobs = selectedSites.map((site) => ({
      siteId: site.id,
      displayName: site.displayName,
      run: site.search({ keyword, limit }),
    }));

    const settled = await Promise.allSettled(searchJobs.map(async (job) => ({
      siteId: job.siteId,
      displayName: job.displayName,
      results: await job.run,
    })));

    res.json({
      keyword,
      sites: settled.map((result, index) => {
        if (result.status === 'fulfilled') return result.value;
        const job = searchJobs[index];
        return {
          siteId: job?.siteId ?? 'unknown',
          displayName: job?.displayName ?? 'Unknown source',
          results: [],
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }),
      results: settled.flatMap((result) => result.status === 'fulfilled' ? result.value.results : []),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sites/:siteId/book-info', async (req, res, next) => {
  try {
    const book = await getSite(req.params.siteId).getBookInfo({ url: req.body.url });
    await db.upsertBook(book);
    res.json(book);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sites/:siteId/catalog', async (req, res, next) => {
  try {
    const catalog = await getSite(req.params.siteId).getCatalog({ bookUrl: req.body.bookUrl });
    await db.upsertCatalog(catalog);
    res.json(catalog);
  } catch (error) {
    next(error);
  }
});

app.post('/api/import-url', async (req, res, next) => {
  try {
    const url = String(req.body.url ?? '').trim();
    const duplicateMode = req.body.duplicateMode === 'append' || req.body.duplicateMode === 'overwrite' ? req.body.duplicateMode as 'append' | 'overwrite' : undefined;
    const conflict = await getImportConflict(url);
    if (!duplicateMode && hasImportConflict(conflict)) {
      res.status(409).json({ error: 'Import target already exists', code: 'IMPORT_CONFLICT', ...conflict });
      return;
    }
    const site = getSiteForUrl(url);
    const normalizedUrl = normalizeImportUrl(url);
    const fetchedBook = await site.getBookInfo({ url: normalizedUrl });
    const fetchedCatalog = await site.getCatalog({ bookUrl: normalizedUrl });
    const { book, catalog } = duplicateMode === 'append'
      ? applyCopyIdentity(fetchedBook, fetchedCatalog, createCopyMarker(String(req.body.duplicateSuffix ?? 'copy')), String(req.body.duplicateSuffix ?? 'copy'))
      : { book: fetchedBook, catalog: fetchedCatalog };
    await db.upsertBook(book);
    await db.upsertCatalog(catalog);
    res.json({ book, catalog, catalogCount: catalog.length, duplicateMode: duplicateMode ?? 'overwrite' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/downloads', async (req, res, next) => {
  try {
    res.status(202).json(await downloads.createTask(req.body.siteId, req.body.bookUrl));
  } catch (error) {
    next(error);
  }
});

app.get('/api/downloads', async (_req, res, next) => {
  try {
    res.json(await db.listTasks());
  } catch (error) {
    next(error);
  }
});

app.get('/api/downloads/:taskId/failures', async (req, res, next) => {
  try {
    res.json(await db.listFailures(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/downloads/:taskId/retry-failed', async (req, res, next) => {
  try {
    res.status(202).json(await downloads.retryFailed(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/downloads/:taskId/pause', async (req, res, next) => {
  try {
    res.json(await downloads.pauseTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/downloads/:taskId/cancel', async (req, res, next) => {
  try {
    res.json(await downloads.cancelTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/downloads/:taskId/resume', async (req, res, next) => {
  try {
    res.status(202).json(await downloads.resumeTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/books', async (_req, res, next) => {
  try {
    res.json(await db.listBooks());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/library/books', async (req, res, next) => {
  try {
    const bookUrl = String(req.query.bookUrl ?? '').trim();
    if (!bookUrl) {
      res.status(400).json({ error: 'bookUrl is required' });
      return;
    }
    const deleted = await db.deleteBook(bookUrl);
    if (!deleted) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }
    res.json({ deleted: true, bookUrl });
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/chapters', async (req, res, next) => {
  try {
    res.json(await db.listChapters(String(req.query.bookUrl ?? '')));
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/chapter', async (req, res, next) => {
  try {
    const chapter = await db.getChapter(String(req.query.sourceUrl ?? ''));
    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }
    res.json(chapter);
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/language-profile', async (req, res, next) => {
  try {
    const bookUrl = String(req.query.bookUrl ?? '');
    const profile = await db.getLanguageProfile(bookUrl);
    if (!profile) {
      res.status(404).json({ error: 'Language profile not found' });
      return;
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.post('/api/library/language-profile/detect', async (req, res, next) => {
  try {
    const bookUrl = String(req.body.bookUrl ?? '');
    await translations.detectBookLanguage(bookUrl);
    const profile = await db.getLanguageProfile(bookUrl);
    if (!profile) {
      res.status(404).json({ error: 'No downloaded chapter text available for language detection' });
      return;
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/translation-languages', async (req, res, next) => {
  try {
    res.json(await db.listTranslationLanguages(String(req.query.bookUrl ?? '')));
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/chapter-translation', async (req, res, next) => {
  try {
    const translation = await db.getTranslation(String(req.query.sourceUrl ?? ''), String(req.query.language ?? ''));
    if (!translation) {
      res.status(404).json({ error: 'Chapter translation not found' });
      return;
    }
    res.json(translation);
  } catch (error) {
    next(error);
  }
});

app.post('/api/library/chapter-translation/retranslate', async (req, res, next) => {
  try {
    res.status(202).json(await translations.retranslateChapter(String(req.body.sourceUrl ?? ''), String(req.body.targetLanguage ?? settings.translation.defaultTargetLanguage)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/library/chapter-proofread', async (req, res, next) => {
  try {
    const proofread = await db.getProofread(String(req.query.sourceUrl ?? ''));
    if (!proofread) {
      res.status(404).json({ error: 'Chapter proofreading result not found' });
      return;
    }
    res.json(proofread);
  } catch (error) {
    next(error);
  }
});

app.post('/api/library/chapter-proofread/reproofread', async (req, res, next) => {
  try {
    res.status(202).json(await proofreads.proofreadChapter(String(req.body.sourceUrl ?? ''), Boolean(req.body.applyRepairs)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/translations/tasks', async (_req, res, next) => {
  try {
    res.json(await db.listTranslationTasks());
  } catch (error) {
    next(error);
  }
});

app.post('/api/translations/tasks', async (req, res, next) => {
  try {
    res.status(202).json(await translations.createTask(
      String(req.body.bookUrl ?? ''),
      String(req.body.targetLanguage ?? settings.translation.defaultTargetLanguage),
      { force: Boolean(req.body.force), sourceLanguage: typeof req.body.sourceLanguage === 'string' ? req.body.sourceLanguage : undefined },
    ));
  } catch (error) {
    next(error);
  }
});

app.get('/api/translations/tasks/:taskId/failures', async (req, res, next) => {
  try {
    res.json(await db.listTranslationFailures(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/translations/tasks/:taskId/pause', async (req, res, next) => {
  try {
    res.json(await translations.pauseTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/translations/tasks/:taskId/resume', async (req, res, next) => {
  try {
    res.status(202).json(await translations.resumeTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/translations/tasks/:taskId/cancel', async (req, res, next) => {
  try {
    res.json(await translations.cancelTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/translations/tasks/:taskId/retry-failed', async (req, res, next) => {
  try {
    res.status(202).json(await translations.retryFailed(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.get('/api/proofreads/tasks', async (_req, res, next) => {
  try {
    res.json(await db.listProofreadTasks());
  } catch (error) {
    next(error);
  }
});

app.post('/api/proofreads/tasks', async (req, res, next) => {
  try {
    res.status(202).json(await proofreads.createTask(
      String(req.body.bookUrl ?? ''),
      { force: Boolean(req.body.force), applyRepairs: Boolean(req.body.applyRepairs) },
    ));
  } catch (error) {
    next(error);
  }
});

app.get('/api/proofreads/tasks/:taskId/failures', async (req, res, next) => {
  try {
    res.json(await db.listProofreadFailures(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/proofreads/tasks/:taskId/pause', async (req, res, next) => {
  try {
    res.json(await proofreads.pauseTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/proofreads/tasks/:taskId/resume', async (req, res, next) => {
  try {
    res.status(202).json(await proofreads.resumeTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/proofreads/tasks/:taskId/cancel', async (req, res, next) => {
  try {
    res.json(await proofreads.cancelTask(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/proofreads/tasks/:taskId/retry-failed', async (req, res, next) => {
  try {
    res.status(202).json(await proofreads.retryFailed(req.params.taskId));
  } catch (error) {
    next(error);
  }
});

app.post('/api/analysis/summary', async (req, res, next) => {
  try {
    res.json(await ai.summarize(req.body.sourceId, req.body.text));
  } catch (error) {
    next(error);
  }
});

app.get('/api/ai/usage', async (req, res, next) => {
  try {
    res.json(await db.listAiUsage(Number(req.query.limit ?? 200)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/ai/usage/summary', async (_req, res, next) => {
  try {
    const records = await db.listAiUsage(5000);
    res.json(summarizeAiUsage(records));
  } catch (error) {
    next(error);
  }
});

app.post('/api/export', async (req, res, next) => {
  try {
    const bookUrl = String(req.body.bookUrl);
    const format = String(req.body.format ?? 'markdown');
    const exportDir = String(req.body.outputDir || settings.exportDir || config.exportDir);
    const book = (await db.listBooks()).find((candidate) => candidate.canonicalUrl === bookUrl || candidate.sourceUrl === bookUrl);
    if (!book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }
    const language = String(req.body.language ?? 'original');
    const chapterRefs = await db.listChapters(bookUrl);
    const chapters = language === 'original'
      ? (await Promise.all(chapterRefs.map((chapter) => db.getChapter(chapter.sourceUrl)))).filter((chapter): chapter is ChapterContent => Boolean(chapter))
      : await getTranslatedChapters(chapterRefs, language);
    const baseName = safeFileName(stripKnownExtension(String(req.body.fileName || book.title || 'novel')) || 'novel');
    mkdirSync(exportDir, { recursive: true });
    if (format === 'zip') {
      const zip = await toZip({ [`${baseName}.md`]: toMarkdown(book, chapters), [`${baseName}.txt`]: toPlainText(book, chapters) });
      const filePath = join(exportDir, `${baseName}.zip`);
      writeFileSync(filePath, zip);
      res.json({ filePath, format, chapterCount: chapters.length });
      return;
    }
    const extension = format === 'txt' ? 'txt' : 'md';
    const filePath = join(exportDir, `${baseName}.${extension}`);
    writeFileSync(filePath, extension === 'txt' ? toPlainText(book, chapters) : toMarkdown(book, chapters), 'utf8');
    res.json({ filePath, format: extension === 'txt' ? 'txt' : 'markdown', chapterCount: chapters.length });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error({ error }, message);
  const status = error instanceof ActiveTaskError || error instanceof ActiveTranslationTaskError || error instanceof ActiveProofreadTaskError || message.startsWith('Cancelled ') ? 409 : 500;
  res.status(status).json({ error: message });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

downloads.on('task', (task) => {
  const payload = JSON.stringify({ type: 'task', task });
  for (const client of wss.clients) {
    client.send(payload);
  }
  if (task.status === 'completed') {
    translations.detectBookLanguage(task.bookUrl).catch((error) => logger.warn({ error, taskId: task.id }, 'Language detection failed'));
  }
});

translations.on('task', (task) => {
  const payload = JSON.stringify({ type: 'translation-task', task });
  for (const client of wss.clients) {
    client.send(payload);
  }
});

proofreads.on('task', (task) => {
  const payload = JSON.stringify({ type: 'proofread-task', task });
  for (const client of wss.clients) {
    client.send(payload);
  }
});

server.listen(config.port, config.host, () => {
  logger.info(`Sky Novel Hermes service listening on http://${config.host}:${config.port}`);
});

function getSiteForUrl(url: string) {
  const target = new URL(url);
  const site = getSites().find((candidate) => {
    const base = new URL(candidate.baseUrl);
    return target.protocol === base.protocol && target.hostname === base.hostname;
  });
  if (!site) {
    throw new Error(`No registered site supports URL: ${url}`);
  }
  return site;
}

async function getImportConflict(url: string) {
  const normalizedUrl = normalizeImportUrl(url);
  const [books, downloadTasks, translationTasks] = await Promise.all([db.listBooks(), db.listTasks(), db.listTranslationTasks()]);
  return {
    normalizedUrl,
    existingBooks: books
      .filter((book) => normalizeImportUrl(book.sourceUrl) === normalizedUrl || normalizeImportUrl(book.canonicalUrl) === normalizedUrl)
      .map((book) => ({ title: book.title, canonicalUrl: book.canonicalUrl, sourceUrl: book.sourceUrl, createdAt: book.createdAt })),
    downloadTasks: downloadTasks
      .filter((task) => normalizeImportUrl(task.bookUrl) === normalizedUrl)
      .map((task) => ({ id: task.id, status: task.status, bookUrl: task.bookUrl, updatedAt: task.updatedAt })),
    translationTasks: translationTasks
      .filter((task) => normalizeImportUrl(task.bookUrl) === normalizedUrl)
      .map((task) => ({ id: task.id, status: task.status, bookUrl: task.bookUrl, targetLanguage: task.targetLanguage, updatedAt: task.updatedAt })),
  };
}

function hasImportConflict(conflict: Awaited<ReturnType<typeof getImportConflict>>): boolean {
  return conflict.existingBooks.length > 0 || conflict.downloadTasks.length > 0 || conflict.translationTasks.length > 0;
}

function normalizeImportUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hash.startsWith('#hermes-copy-')) parsed.hash = '';
  return parsed.toString();
}

function createCopyMarker(suffix: string): string {
  return `hermes-copy-${Date.now()}-${encodeURIComponent((suffix.trim() || 'copy').replace(/\s+/g, '-'))}`;
}

function applyCopyIdentity(book: BookInfo, catalog: ChapterRef[], marker: string, suffix: string): { book: BookInfo; catalog: ChapterRef[] } {
  const cleanSuffix = suffix.trim() || 'copy';
  const copyBookUrl = withCopyMarker(book.canonicalUrl, marker);
  return {
    book: {
      ...book,
      sourceUrl: withCopyMarker(book.sourceUrl, marker),
      canonicalUrl: copyBookUrl,
      title: book.title.endsWith(`（${cleanSuffix}）`) ? book.title : `${book.title}（${cleanSuffix}）`,
    },
    catalog: catalog.map((chapter) => ({
      ...chapter,
      bookUrl: copyBookUrl,
      sourceUrl: withCopyMarker(chapter.sourceUrl, marker),
    })),
  };
}

function withCopyMarker(url: string, marker: string): string {
  const parsed = new URL(normalizeImportUrl(url));
  parsed.hash = marker;
  return parsed.toString();
}

function normalizeSettings(input: unknown): AppSettings {
  const body = input as Partial<AppSettings> | undefined;
  const storage = body?.storage;
  const backend = storage?.backend === 'postgres' ? 'postgres' : 'sqlite';
  const sqlitePath = storage?.sqlitePath || settings.storage.sqlitePath;
  const postgresUrl = storage?.postgresUrl ?? settings.storage.postgresUrl;
  if (backend === 'sqlite' && !sqlitePath) {
    throw new Error('SQLite path is required');
  }
  if (backend === 'postgres' && !postgresUrl) {
    throw new Error('PostgreSQL connection URL is required');
  }
  const autoRetryAttempts = normalizeRetryAttempts(body?.autoRetryAttempts, settings.autoRetryAttempts);
  return {
    storage: { backend, sqlitePath, postgresUrl },
    exportDir: body?.exportDir || settings.exportDir,
    autoRetryAttempts,
    translation: normalizeTranslationSettings(body?.translation ?? settings.translation),
    proofreading: normalizeProofreadSettings(body?.proofreading ?? settings.proofreading),
  };
}

function normalizeRetryAttempts(value: unknown, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function stripKnownExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  return ['.txt', '.md', '.markdown', '.zip'].includes(extension) ? fileName.slice(0, -extension.length) : fileName;
}

async function getTranslatedChapters(chapterRefs: Array<{ sourceUrl: string; bookUrl: string; siteId: string; title: string; index: number }>, language: string): Promise<ChapterContent[]> {
  const chapters: ChapterContent[] = [];
  const missing: string[] = [];
  for (const ref of chapterRefs) {
    const translation = await db.getTranslation(ref.sourceUrl, language);
    if (!translation) {
      missing.push(ref.title);
      continue;
    }
    chapters.push({
      siteId: ref.siteId,
      bookUrl: ref.bookUrl,
      sourceUrl: ref.sourceUrl,
      title: translation.title,
      index: translation.chapterIndex,
      text: translation.text,
      fetchedAt: translation.updatedAt,
    });
  }
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.length} translated chapters for ${language}`);
  }
  return chapters;
}

function summarizeAiUsage(records: AiUsageRecord[]) {
  const totals = { requests: records.length, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const byTask = new Map<string, { taskId: string; requests: number; promptTokens: number; completionTokens: number; totalTokens: number }>();
  for (const record of records) {
    totals.promptTokens += record.promptTokens ?? 0;
    totals.completionTokens += record.completionTokens ?? 0;
    totals.totalTokens += record.totalTokens ?? 0;
    if (!record.taskId) continue;
    const current = byTask.get(record.taskId) ?? { taskId: record.taskId, requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    current.requests += 1;
    current.promptTokens += record.promptTokens ?? 0;
    current.completionTokens += record.completionTokens ?? 0;
    current.totalTokens += record.totalTokens ?? 0;
    byTask.set(record.taskId, current);
  }
  return { totals, byTask: [...byTask.values()].sort((left, right) => right.totalTokens - left.totalTokens) };
}
