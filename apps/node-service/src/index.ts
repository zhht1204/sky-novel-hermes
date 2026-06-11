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
import type { ChapterContent } from '@sky-novel-hermes/shared';
import { SAMPLE_BOOK_URL } from '@sky-novel-hermes/shared';
import { getSite, getSites } from '@sky-novel-hermes/sites';
import { HermesDatabase } from '@sky-novel-hermes/storage';
import { loadConfig, saveSettings, type AppSettings } from './config.js';
import { ActiveTaskError, DownloadManager } from './downloadManager.js';

const startedAt = new Date().toISOString();
const config = loadConfig();
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
let settings: AppSettings = { storage: config.storage, exportDir: config.exportDir, autoRetryAttempts: config.autoRetryAttempts };
let db = await HermesDatabase.connect(settings.storage);
const ai = createLiteLlmClientFromEnv();
const downloads = new DownloadManager(db, getSite, settings.autoRetryAttempts);

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
    const siteId = typeof req.body.siteId === 'string' && req.body.siteId ? req.body.siteId : undefined;
    const site = siteId ? getSite(siteId) : getSiteForUrl(url);
    const book = await site.getBookInfo({ url });
    const catalog = await site.getCatalog({ bookUrl: url });
    await db.upsertBook(book);
    await db.upsertCatalog(catalog);
    res.json({ book, catalog, catalogCount: catalog.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sample/import', async (_req, res, next) => {
  try {
    const site = getSite('quanben5-big5');
    const book = await site.getBookInfo({ url: SAMPLE_BOOK_URL });
    const catalog = await site.getCatalog({ bookUrl: SAMPLE_BOOK_URL });
    await db.upsertBook(book);
    await db.upsertCatalog(catalog);
    res.json({ book, catalogCount: catalog.length });
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

app.post('/api/analysis/summary', async (req, res, next) => {
  try {
    res.json(await ai.summarize(req.body.sourceId, req.body.text));
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
    const chapterRefs = await db.listChapters(bookUrl);
    const chapters = (await Promise.all(chapterRefs.map((chapter) => db.getChapter(chapter.sourceUrl)))).filter((chapter): chapter is ChapterContent => Boolean(chapter));
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
  res.status(error instanceof ActiveTaskError ? 409 : 500).json({ error: message });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

downloads.on('task', (task) => {
  const payload = JSON.stringify({ type: 'task', task });
  for (const client of wss.clients) {
    client.send(payload);
  }
});

server.listen(config.port, config.host, () => {
  logger.info(`Sky Novel Hermes service listening on http://${config.host}:${config.port}`);
});

function getSiteForUrl(url: string) {
  const site = getSites().find((candidate) => url.startsWith(candidate.baseUrl));
  if (!site) {
    throw new Error(`No registered site supports URL: ${url}`);
  }
  return site;
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
  return { storage: { backend, sqlitePath, postgresUrl }, exportDir: body?.exportDir || settings.exportDir, autoRetryAttempts };
}

function normalizeRetryAttempts(value: unknown, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function stripKnownExtension(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  return ['.txt', '.md', '.markdown', '.zip'].includes(extension) ? fileName.slice(0, -extension.length) : fileName;
}
