import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';
import { createLiteLlmClientFromEnv } from '@sky-novel-hermes/ai';
import { safeFileName, toMarkdown, toPlainText, toZip } from '@sky-novel-hermes/exporter';
import type { ChapterContent } from '@sky-novel-hermes/shared';
import { SAMPLE_BOOK_URL } from '@sky-novel-hermes/shared';
import { getSite, getSites } from '@sky-novel-hermes/sites';
import { HermesDatabase } from '@sky-novel-hermes/storage';
import { loadConfig } from './config.js';
import { DownloadManager } from './downloadManager.js';

const startedAt = new Date().toISOString();
const config = loadConfig();
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const db = new HermesDatabase(config.dbPath);
const ai = createLiteLlmClientFromEnv();
const downloads = new DownloadManager(db, getSite);

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
    sites: getSites().map((site) => ({ id: site.id, displayName: site.displayName, baseUrl: site.baseUrl, capabilities: site.capabilities })),
  });
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

app.post('/api/sites/:siteId/book-info', async (req, res, next) => {
  try {
    const book = await getSite(req.params.siteId).getBookInfo({ url: req.body.url });
    db.upsertBook(book);
    res.json(book);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sites/:siteId/catalog', async (req, res, next) => {
  try {
    const catalog = await getSite(req.params.siteId).getCatalog({ bookUrl: req.body.bookUrl });
    db.upsertCatalog(catalog);
    res.json(catalog);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sample/import', async (_req, res, next) => {
  try {
    const site = getSite('quanben5-big5');
    const book = await site.getBookInfo({ url: SAMPLE_BOOK_URL });
    const catalog = await site.getCatalog({ bookUrl: SAMPLE_BOOK_URL });
    db.upsertBook(book);
    db.upsertCatalog(catalog);
    res.json({ book, catalogCount: catalog.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/downloads', (req, res, next) => {
  try {
    res.status(202).json(downloads.createTask(req.body.siteId, req.body.bookUrl));
  } catch (error) {
    next(error);
  }
});

app.get('/api/downloads', (_req, res) => {
  res.json(db.listTasks());
});

app.get('/api/library/books', (_req, res) => {
  res.json(db.listBooks());
});

app.get('/api/library/chapters', (req, res) => {
  res.json(db.listChapters(String(req.query.bookUrl ?? '')));
});

app.get('/api/library/chapter', (req, res) => {
  const chapter = db.getChapter(String(req.query.sourceUrl ?? ''));
  if (!chapter) {
    res.status(404).json({ error: 'Chapter not found' });
    return;
  }
  res.json(chapter);
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
    const book = db.listBooks().find((candidate) => candidate.canonicalUrl === bookUrl || candidate.sourceUrl === bookUrl);
    if (!book) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }
    const chapters = db.listChapters(bookUrl).flatMap((chapter) => {
      const content = db.getChapter(chapter.sourceUrl);
      return content ? [content] : [];
    }) satisfies ChapterContent[];
    const baseName = safeFileName(book.title || 'novel');
    if (format === 'zip') {
      const zip = await toZip({ [`${baseName}.md`]: toMarkdown(book, chapters), [`${baseName}.txt`]: toPlainText(book, chapters) });
      const filePath = join(config.exportDir, `${baseName}.zip`);
      writeFileSync(filePath, zip);
      res.json({ filePath });
      return;
    }
    const extension = format === 'txt' ? 'txt' : 'md';
    const filePath = join(config.exportDir, `${baseName}.${extension}`);
    writeFileSync(filePath, extension === 'txt' ? toPlainText(book, chapters) : toMarkdown(book, chapters), 'utf8');
    res.json({ filePath });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error({ error }, message);
  res.status(500).json({ error: message });
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
