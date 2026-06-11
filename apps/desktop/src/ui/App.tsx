import { Archive, BookOpen, BrainCircuit, Download, Eye, Home, Languages, Package, Pause, Play, RotateCcw, Search, Settings, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, serviceWsUrl } from '../api.js';
import type { AggregatedSearchResponse, AiUsageRecord, AiUsageSummary, BookInfo, ChapterContent, ChapterRef, ChapterTranslation, DownloadFailure, DownloadTask, ExportResponse, LanguageProfile, ServiceSettings, SiteSearchResultGroup, SiteSummary, TranslationFailure, TranslationTask, UrlImportResponse } from '../types.js';

const sampleUrl = 'https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html';
const nav = [
  { id: 'home', label: '主页', icon: Home },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'downloads', label: '下载管理', icon: Download },
  { id: 'translations', label: '多语言处理', icon: Languages },
  { id: 'library', label: '已下载内容', icon: Archive },
  { id: 'package', label: '打包压缩', icon: Package },
  { id: 'preview', label: '预览', icon: Eye },
  { id: 'ai', label: 'AI 配置', icon: BrainCircuit },
  { id: 'settings', label: '设置', icon: Settings },
];

export function App() {
  const [active, setActive] = useState('home');
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [translationTasks, setTranslationTasks] = useState<TranslationTask[]>([]);
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [selectedBookUrl, setSelectedBookUrl] = useState(sampleUrl);
  const [message, setMessage] = useState('准备就绪');

  async function refresh() {
    const [siteList, taskList, translationTaskList, bookList] = await Promise.all([
      apiGet<SiteSummary[]>('/api/sites'),
      apiGet<DownloadTask[]>('/api/downloads'),
      apiGet<TranslationTask[]>('/api/translations/tasks'),
      apiGet<BookInfo[]>('/api/library/books'),
    ]);
    setSites(siteList);
    setTasks(taskList);
    setTranslationTasks(translationTaskList);
    setBooks(bookList);
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
    const ws = new WebSocket(serviceWsUrl());
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'task') {
        setTasks((current) => [payload.task, ...current.filter((task) => task.id !== payload.task.id)]);
      }
      if (payload.type === 'translation-task') {
        setTranslationTasks((current) => [payload.task, ...current.filter((task) => task.id !== payload.task.id)]);
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (!selectedBookUrl) return;
    apiGet<ChapterRef[]>(`/api/library/chapters?bookUrl=${encodeURIComponent(selectedBookUrl)}`)
      .then(setChapters)
      .catch(() => setChapters([]));
  }, [selectedBookUrl, books.length]);

  const selectedBook = useMemo(() => books.find((book) => book.canonicalUrl === selectedBookUrl || book.sourceUrl === selectedBookUrl), [books, selectedBookUrl]);

  async function importSample() {
    setMessage('正在导入样本元数据和目录');
    const result = await apiPost<{ book: BookInfo; catalogCount: number }>('/api/sample/import');
    setSelectedBookUrl(result.book.canonicalUrl);
    setMessage(`已导入目录 ${result.catalogCount} 章`);
    await refresh();
  }

  async function importUrl(url: string, siteId?: string): Promise<UrlImportResponse> {
    setMessage('正在解析 URL 并导入目录');
    const result = await apiPost<UrlImportResponse>('/api/import-url', { url, siteId });
    setSelectedBookUrl(result.book.canonicalUrl);
    setChapters(result.catalog);
    setMessage(`已导入《${result.book.title}》目录 ${result.catalogCount} 章`);
    await refresh();
    return result;
  }

  async function startDownload() {
    setMessage('下载任务已提交');
    await apiPost('/api/downloads', { siteId: 'quanben5-big5', bookUrl: selectedBookUrl || sampleUrl });
    await refresh();
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><BookOpen size={22} /> Sky Novel Hermes</div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}><Icon size={17} />{item.label}</button>;
          })}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <strong>{nav.find((item) => item.id === active)?.label}</strong>
            <span>{message}</span>
          </div>
          <button className="primary" onClick={() => refresh()}>刷新</button>
        </header>
        {active === 'home' && <HomeView sites={sites} tasks={tasks} books={books} onImport={importSample} />}
        {active === 'search' && <SearchView sites={sites} selectedBookUrl={selectedBookUrl} setSelectedBookUrl={setSelectedBookUrl} onImportUrl={importUrl} onDownload={startDownload} />}
        {active === 'downloads' && <DownloadsView tasks={tasks} refresh={refresh} />}
        {active === 'translations' && <TranslationsView books={books} selectedBookUrl={selectedBookUrl} setSelectedBookUrl={setSelectedBookUrl} tasks={translationTasks} refresh={refresh} />}
        {active === 'library' && <LibraryView books={books} setSelectedBookUrl={setSelectedBookUrl} setActive={setActive} />}
        {active === 'package' && <PackageView books={books} selectedBookUrl={selectedBookUrl} setSelectedBookUrl={setSelectedBookUrl} />}
        {active === 'preview' && <PreviewView book={selectedBook} chapters={chapters} />}
        {active === 'ai' && <AiUsageView />}
        {active === 'settings' && <SettingsView />}
      </section>
    </main>
  );
}

function HomeView({ sites, tasks, books, onImport }: { sites: SiteSummary[]; tasks: DownloadTask[]; books: BookInfo[]; onImport: () => void }) {
  return <div className="grid"><Metric label="站点" value={sites.length} /><Metric label="书库" value={books.length} /><Metric label="任务" value={tasks.length} /><section className="panel wide"><h2>快速开始</h2><p>导入第一个样本的元数据和目录，确认后可启动授权下载任务。</p><button className="primary" onClick={onImport}><Sparkles size={16} />导入样本目录</button></section></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="metric"><span>{label}</span><strong>{value}</strong></section>;
}

function SearchView({ sites, selectedBookUrl, setSelectedBookUrl, onImportUrl, onDownload }: { sites: SiteSummary[]; selectedBookUrl: string; setSelectedBookUrl: (value: string) => void; onImportUrl: (url: string, siteId?: string) => Promise<UrlImportResponse>; onDownload: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [searchGroups, setSearchGroups] = useState<SiteSearchResultGroup[]>([]);
  const [urlSiteId, setUrlSiteId] = useState('');
  const [importedBook, setImportedBook] = useState<BookInfo | undefined>();
  const [catalogPreview, setCatalogPreview] = useState<ChapterRef[]>([]);

  const searchableSites = sites.filter((site) => site.capabilities.includes('search'));

  useEffect(() => {
    setSelectedSiteIds((current) => current.length > 0 ? current : searchableSites.map((site) => site.id));
  }, [searchableSites.map((site) => site.id).join('|')]);

  useEffect(() => {
    const firstSiteId = sites[0]?.id;
    if (!urlSiteId && firstSiteId) {
      setUrlSiteId(firstSiteId);
    }
  }, [sites, urlSiteId]);

  function toggleSite(siteId: string) {
    setSelectedSiteIds((current) => current.includes(siteId) ? current.filter((candidate) => candidate !== siteId) : [...current, siteId]);
  }

  async function search() {
    const data = await apiPost<AggregatedSearchResponse>('/api/search', { keyword, siteIds: selectedSiteIds, limit: 20 });
    setSearchGroups(data.sites);
  }

  async function parseUrl() {
    const result = await onImportUrl(selectedBookUrl, urlSiteId || undefined);
    setImportedBook(result.book);
    setCatalogPreview(result.catalog);
  }

  return <div className="stack"><section className="panel"><h2>聚合搜索</h2><div className="sitePicker">{searchableSites.map((site) => <label key={site.id}><input type="checkbox" checked={selectedSiteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />{site.displayName}</label>)}</div><div className="formRow"><input placeholder="书名或作者" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><button onClick={search} disabled={selectedSiteIds.length === 0 || !keyword.trim()}>同步搜索</button></div><div className="searchGroups">{searchGroups.map((group) => <section className="sourceGroup" key={group.siteId}><header><strong>{group.displayName}</strong><span>{group.error ? group.error : `${group.results.length} 条结果`}</span></header><div className="resultList">{group.results.map((result) => <button key={`${result.siteId}:${result.url}`} onClick={() => setSelectedBookUrl(result.url)}><strong>{result.title}</strong><span>{result.author ?? result.url}</span></button>)}</div></section>)}</div></section><section className="panel"><h2>URL 导入</h2><div className="formRow"><select value={urlSiteId} onChange={(event) => setUrlSiteId(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.displayName}</option>)}</select><input value={selectedBookUrl} onChange={(event) => setSelectedBookUrl(event.target.value)} /><button onClick={parseUrl}>解析目录</button><button className="primary" onClick={onDownload}>开始下载</button></div>{importedBook && <div className="bookSummary">{importedBook.coverUrl && <img src={importedBook.coverUrl} alt="" />}<div><strong>{importedBook.title}</strong><span>{[importedBook.author, importedBook.category, importedBook.status].filter(Boolean).join(' · ')}</span><p>{importedBook.description}</p></div></div>}<CatalogPreview chapters={catalogPreview} /></section></div>;
}

function CatalogPreview({ chapters }: { chapters: ChapterRef[] }) {
  if (chapters.length === 0) return null;
  return <div className="catalogPreview"><header><strong>目录预览</strong><span>{chapters.length} 章</span></header><div>{chapters.slice(0, 80).map((chapter) => <button key={chapter.sourceUrl}>{chapter.index}. {chapter.title}</button>)}</div>{chapters.length > 80 && <p>已显示前 80 章，其余章节已写入本地目录。</p>}</div>;
}

function DownloadsView({ tasks, refresh }: { tasks: DownloadTask[]; refresh: () => Promise<void> }) {
  const [openTaskId, setOpenTaskId] = useState('');
  const [failures, setFailures] = useState<Record<string, DownloadFailure[]>>({});

  async function toggleFailures(task: DownloadTask) {
    const nextOpenTaskId = openTaskId === task.id ? '' : task.id;
    setOpenTaskId(nextOpenTaskId);
    if (nextOpenTaskId && !failures[task.id]) {
      const data = await apiGet<DownloadFailure[]>(`/api/downloads/${task.id}/failures`);
      setFailures((current) => ({ ...current, [task.id]: data }));
    }
  }

  async function retryFailed(task: DownloadTask) {
    await apiPost(`/api/downloads/${task.id}/retry-failed`, {});
    setFailures((current) => ({ ...current, [task.id]: [] }));
    await refresh();
  }

  async function resumeTask(task: DownloadTask) {
    await apiPost(`/api/downloads/${task.id}/resume`, {});
    await refresh();
  }

  async function pauseTask(task: DownloadTask) {
    await apiPost(`/api/downloads/${task.id}/pause`, {});
    await refresh();
  }

  async function cancelTask(task: DownloadTask) {
    await apiPost(`/api/downloads/${task.id}/cancel`, {});
    await refresh();
  }

  return <section className="panel"><h2>下载队列</h2><table><thead><tr><th>状态</th><th>进度</th><th>失败</th><th>消息</th><th>操作</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><span className={`badge ${task.status}`}>{task.status}</span></td><td>{task.completedChapters}/{task.totalChapters}</td><td>{task.failedChapters}</td><td>{task.message}</td><td><div className="tableActions"><button onClick={() => pauseTask(task)} disabled={!['queued', 'running'].includes(task.status)} title="暂停任务"><Pause size={14} />暂停</button><button onClick={() => resumeTask(task)} disabled={task.status === 'running' || task.status === 'completed'} title="继续缺失章节"><Play size={14} />继续</button><button onClick={() => cancelTask(task)} disabled={['completed', 'failed', 'cancelled'].includes(task.status)} title="取消任务"><X size={14} />取消</button><button onClick={() => toggleFailures(task)} disabled={task.failedChapters === 0}>失败明细</button><button onClick={() => retryFailed(task)} disabled={task.failedChapters === 0 || task.status === 'running'}>重试失败</button></div></td></tr>)}</tbody></table>{openTaskId && <FailureList failures={failures[openTaskId] ?? []} />}</section>;
}

function FailureList({ failures }: { failures: DownloadFailure[] }) {
  if (failures.length === 0) return <div className="failureList"><p>没有失败章节记录。</p></div>;
  return <div className="failureList"><header><strong>失败章节</strong><span>{failures.length} 条</span></header><table><thead><tr><th>序号</th><th>章节</th><th>尝试</th><th>错误</th></tr></thead><tbody>{failures.map((failure) => <tr key={failure.chapterUrl}><td>{failure.chapterIndex}</td><td>{failure.title}</td><td>{failure.attempts}</td><td>{failure.error}</td></tr>)}</tbody></table></div>;
}

function TranslationsView({ books, selectedBookUrl, setSelectedBookUrl, tasks, refresh }: { books: BookInfo[]; selectedBookUrl: string; setSelectedBookUrl: (value: string) => void; tasks: TranslationTask[]; refresh: () => Promise<void> }) {
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [profile, setProfile] = useState<LanguageProfile | undefined>();
  const [targetLanguage, setTargetLanguage] = useState('zh-Hans');
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState('');
  const [openTaskId, setOpenTaskId] = useState('');
  const [failures, setFailures] = useState<Record<string, TranslationFailure[]>>({});

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings').then((data) => {
      setSettings(data);
      setTargetLanguage((current) => current || data.translation.defaultTargetLanguage);
    }).catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!selectedBookUrl) return;
    apiGet<LanguageProfile>(`/api/library/language-profile?bookUrl=${encodeURIComponent(selectedBookUrl)}`)
      .then(setProfile)
      .catch(() => setProfile(undefined));
  }, [selectedBookUrl]);

  async function detectLanguage() {
    try {
      setMessage('正在检测源语言');
      const data = await apiPost<LanguageProfile>('/api/library/language-profile/detect', { bookUrl: selectedBookUrl });
      setProfile(data);
      setMessage(`检测结果：${data.language} (${Math.round(data.confidence * 100)}%)`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function startTranslation() {
    try {
      setMessage('正在提交翻译任务');
      await apiPost('/api/translations/tasks', { bookUrl: selectedBookUrl, targetLanguage, force, sourceLanguage: profile?.language });
      setMessage('翻译任务已提交');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function toggleFailures(task: TranslationTask) {
    const nextOpenTaskId = openTaskId === task.id ? '' : task.id;
    setOpenTaskId(nextOpenTaskId);
    if (nextOpenTaskId && !failures[task.id]) {
      const data = await apiGet<TranslationFailure[]>(`/api/translations/tasks/${task.id}/failures`);
      setFailures((current) => ({ ...current, [task.id]: data }));
    }
  }

  async function pauseTask(task: TranslationTask) {
    await apiPost(`/api/translations/tasks/${task.id}/pause`, {});
    await refresh();
  }

  async function resumeTask(task: TranslationTask) {
    await apiPost(`/api/translations/tasks/${task.id}/resume`, {});
    await refresh();
  }

  async function cancelTask(task: TranslationTask) {
    await apiPost(`/api/translations/tasks/${task.id}/cancel`, {});
    await refresh();
  }

  async function retryFailed(task: TranslationTask) {
    try {
      await apiPost(`/api/translations/tasks/${task.id}/retry-failed`, {});
      setFailures((current) => ({ ...current, [task.id]: [] }));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const bookTasks = tasks.filter((task) => !selectedBookUrl || task.bookUrl === selectedBookUrl);
  const selectedBook = books.find((book) => book.canonicalUrl === selectedBookUrl || book.sourceUrl === selectedBookUrl);

  return <div className="stack"><section className="panel"><h2>翻译任务</h2><div className="translationControls"><label><span>书籍</span><select value={selectedBookUrl} onChange={(event) => setSelectedBookUrl(event.target.value)}>{books.map((book) => <option key={book.canonicalUrl} value={book.canonicalUrl}>{book.title}</option>)}</select></label><label><span>目标语言</span><input list="language-options" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} /></label><label className="checkLine"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />重新翻译已有译文</label></div><datalist id="language-options"><option value="zh-Hans" /><option value="zh-Hant" /><option value="en" /><option value="ja" /><option value="ko" /></datalist><div className="formRow"><button onClick={detectLanguage} disabled={!selectedBookUrl}>检测源语言</button><button className="primary" onClick={startTranslation} disabled={!selectedBookUrl || !targetLanguage.trim()}>开始翻译</button><span>{profile ? `源语言：${profile.language} · ${Math.round(profile.confidence * 100)}% · ${profile.detector}` : selectedBook ? '尚未检测源语言' : '未选择书籍'}</span></div><p>{message || (settings ? `默认目标语言：${settings.translation.defaultTargetLanguage}` : '正在读取翻译设置...')}</p></section><section className="panel"><h2>多语言队列</h2><table><thead><tr><th>状态</th><th>语言</th><th>进度</th><th>失败</th><th>消息</th><th>操作</th></tr></thead><tbody>{bookTasks.map((task) => <tr key={task.id}><td><span className={`badge ${task.status}`}>{task.status}</span></td><td>{task.sourceLanguage} → {task.targetLanguage}</td><td>{task.completedChapters}/{task.totalChapters}</td><td>{task.failedChapters}</td><td>{task.message}</td><td><div className="tableActions"><button onClick={() => pauseTask(task)} disabled={!['queued', 'running'].includes(task.status)}><Pause size={14} />暂停</button><button onClick={() => resumeTask(task)} disabled={task.status === 'running' || task.status === 'completed'}><Play size={14} />继续</button><button onClick={() => cancelTask(task)} disabled={['completed', 'failed', 'cancelled'].includes(task.status)}><X size={14} />取消</button><button onClick={() => toggleFailures(task)} disabled={task.failedChapters === 0}>失败明细</button><button onClick={() => retryFailed(task)} disabled={task.failedChapters === 0 || task.status === 'running'}><RotateCcw size={14} />重试失败</button></div></td></tr>)}</tbody></table>{bookTasks.length === 0 && <p>还没有这本书的翻译任务。</p>}{openTaskId && <TranslationFailureList failures={failures[openTaskId] ?? []} />}</section></div>;
}

function TranslationFailureList({ failures }: { failures: TranslationFailure[] }) {
  if (failures.length === 0) return <div className="failureList"><p>没有失败章节记录。</p></div>;
  return <div className="failureList"><header><strong>翻译失败章节</strong><span>{failures.length} 条</span></header><table><thead><tr><th>序号</th><th>章节</th><th>目标语言</th><th>尝试</th><th>错误</th></tr></thead><tbody>{failures.map((failure) => <tr key={failure.chapterUrl}><td>{failure.chapterIndex}</td><td>{failure.title}</td><td>{failure.targetLanguage}</td><td>{failure.attempts}</td><td>{failure.error}</td></tr>)}</tbody></table></div>;
}

function LibraryView({ books, setSelectedBookUrl, setActive }: { books: BookInfo[]; setSelectedBookUrl: (value: string) => void; setActive: (value: string) => void }) {
  return <section className="panel"><h2>本地书库</h2><table><thead><tr><th>书名</th><th>作者</th><th>分类</th><th>状态</th></tr></thead><tbody>{books.map((book) => <tr key={book.canonicalUrl} onClick={() => { setSelectedBookUrl(book.canonicalUrl); setActive('preview'); }}><td>{book.title}</td><td>{book.author}</td><td>{book.category}</td><td>{book.status}</td></tr>)}</tbody></table></section>;
}

function PackageView({ books, selectedBookUrl, setSelectedBookUrl }: { books: BookInfo[]; selectedBookUrl: string; setSelectedBookUrl: (value: string) => void }) {
  const [format, setFormat] = useState('markdown');
  const [language, setLanguage] = useState('original');
  const [languages, setLanguages] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState('');

  const selectedBook = books.find((book) => book.canonicalUrl === selectedBookUrl || book.sourceUrl === selectedBookUrl);

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings').then((settings) => setOutputDir((current) => current || settings.exportDir)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedBookUrl) return;
    apiGet<string[]>(`/api/library/translation-languages?bookUrl=${encodeURIComponent(selectedBookUrl)}`).then(setLanguages).catch(() => setLanguages([]));
  }, [selectedBookUrl]);

  useEffect(() => {
    if (selectedBook && !fileName) {
      setFileName(selectedBook.title);
    }
  }, [selectedBook?.canonicalUrl]);

  async function exportBook() {
    try {
      const response = await apiPost<ExportResponse>('/api/export', { bookUrl: selectedBookUrl, format, outputDir, fileName, language });
      setResult(`${response.filePath} (${response.chapterCount} 章)`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    }
  }

  return <section className="panel"><h2>导出</h2><div className="exportGrid"><label><span>书籍</span><select value={selectedBookUrl} onChange={(event) => { setSelectedBookUrl(event.target.value); setFileName(''); setLanguage('original'); }}>{books.map((book) => <option key={book.canonicalUrl} value={book.canonicalUrl}>{book.title}</option>)}</select></label><label><span>格式</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="markdown">Markdown</option><option value="txt">TXT</option><option value="zip">ZIP: Markdown + TXT</option></select></label><label><span>内容语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="original">原文</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>导出目录</span><input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} placeholder="./exports" /></label><label><span>文件名</span><input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder={selectedBook?.title ?? 'novel'} /></label></div><div className="formRow"><button className="primary" onClick={exportBook} disabled={!selectedBookUrl || books.length === 0}>导出文件</button><span>{selectedBook ? `${selectedBook.author ?? '未知作者'} · ${selectedBook.category ?? '未分类'}` : '未选择书籍'}</span></div><p>{result || '下载内容保存在当前存储后端，导出时按这里的格式和路径生成文件。'}</p></section>;
}

function PreviewView({ book, chapters }: { book?: BookInfo; chapters: ChapterRef[] }) {
  const [chapter, setChapter] = useState<ChapterContent | undefined>();
  const [selectedRef, setSelectedRef] = useState<ChapterRef | undefined>();
  const [language, setLanguage] = useState('original');
  const [languages, setLanguages] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!book) return;
    apiGet<string[]>(`/api/library/translation-languages?bookUrl=${encodeURIComponent(book.canonicalUrl)}`)
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, [book?.canonicalUrl]);

  useEffect(() => {
    if (selectedRef) openChapter(selectedRef).catch((error) => setMessage(error.message));
  }, [language]);

  async function openChapter(ref: ChapterRef) {
    setSelectedRef(ref);
    setMessage('');
    if (language === 'original') {
      const data = await apiGet<ChapterContent>(`/api/library/chapter?sourceUrl=${encodeURIComponent(ref.sourceUrl)}`);
      setChapter(data);
      return;
    }
    const data = await apiGet<ChapterTranslation>(`/api/library/chapter-translation?sourceUrl=${encodeURIComponent(ref.sourceUrl)}&language=${encodeURIComponent(language)}`);
    setChapter({ siteId: ref.siteId, bookUrl: data.bookUrl, sourceUrl: data.sourceUrl, title: data.title, index: data.chapterIndex, text: data.text, fetchedAt: data.updatedAt });
  }

  async function retranslateCurrentChapter() {
    if (!selectedRef || language === 'original') return;
    try {
      await apiPost('/api/library/chapter-translation/retranslate', { sourceUrl: selectedRef.sourceUrl, targetLanguage: language });
      setMessage('已提交本章重译任务');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return <div className="preview"><section className="panel"><h2>{book?.title ?? '未选择书籍'}</h2><p>{book?.description}</p><div className="meta"><span>{book?.author}</span><span>{book?.category}</span><span>{book?.status}</span></div><div className="readerTools"><label><span>查看语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="original">原文</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button onClick={retranslateCurrentChapter} disabled={!selectedRef || language === 'original'}><RotateCcw size={14} />重新翻译本章</button><span>{message}</span></div></section><section className="panel"><h2>目录</h2><div className="chapterList">{chapters.map((item) => <button key={item.sourceUrl} onClick={() => openChapter(item)}>{item.index}. {item.title}</button>)}</div></section><section className="panel reader"><h2>{chapter?.title ?? '章节预览'}</h2><pre>{chapter?.text ?? '选择已下载章节后显示正文。'}</pre></section></div>;
}

function AiUsageView() {
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [summary, setSummary] = useState<AiUsageSummary | undefined>();
  const [records, setRecords] = useState<AiUsageRecord[]>([]);
  const [message, setMessage] = useState('正在读取 AI 使用量');

  async function refreshUsage() {
    try {
      const [nextSettings, nextSummary, nextRecords] = await Promise.all([
        apiGet<ServiceSettings>('/api/settings'),
        apiGet<AiUsageSummary>('/api/ai/usage/summary'),
        apiGet<AiUsageRecord[]>('/api/ai/usage?limit=200'),
      ]);
      setSettings(nextSettings);
      setSummary(nextSummary);
      setRecords(nextRecords);
      setMessage('AI 请求使用量按服务端返回的 usage 字段统计；供应商不返回时显示为 -。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    refreshUsage();
  }, []);

  return <div className="stack"><section className="panel"><h2>AI 配置与使用量</h2><div className="grid usageGrid"><Metric label="请求" value={summary?.totals.requests ?? 0} /><Metric label="Prompt Tokens" value={summary?.totals.promptTokens ?? 0} /><Metric label="Completion Tokens" value={summary?.totals.completionTokens ?? 0} /><Metric label="Total Tokens" value={summary?.totals.totalTokens ?? 0} /></div><div className="formRow"><button className="primary" onClick={refreshUsage}>刷新使用量</button><span>{settings ? `默认翻译目标：${settings.translation.defaultTargetLanguage}` : '正在读取设置'}</span></div><p>{message}</p><p>周期剩余额度需要供应商提供配额 API；当前 OpenAI-compatible chat response 通常只返回本次 token usage，因此这里统计本地已记录请求。</p></section><section className="panel"><h2>按任务统计</h2><table><thead><tr><th>任务</th><th>请求</th><th>Prompt</th><th>Completion</th><th>Total</th></tr></thead><tbody>{summary?.byTask.map((task) => <tr key={task.taskId}><td>{shortId(task.taskId)}</td><td>{task.requests}</td><td>{task.promptTokens}</td><td>{task.completionTokens}</td><td>{task.totalTokens}</td></tr>)}</tbody></table>{summary && summary.byTask.length === 0 && <p>还没有可按任务归属的 AI 请求。</p>}</section><section className="panel"><h2>最近请求</h2><table><thead><tr><th>时间</th><th>操作</th><th>模型</th><th>任务</th><th>Prompt</th><th>Completion</th><th>Total</th></tr></thead><tbody>{records.map((record) => <tr key={record.id ?? `${record.createdAt}:${record.sourceId}`}><td>{new Date(record.createdAt).toLocaleString()}</td><td>{record.operation}</td><td>{record.model}</td><td>{record.taskId ? shortId(record.taskId) : '-'}</td><td>{formatToken(record.promptTokens)}</td><td>{formatToken(record.completionTokens)}</td><td>{formatToken(record.totalTokens)}</td></tr>)}</tbody></table>{records.length === 0 && <p>还没有 AI 请求记录。</p>}</section></div>;
}

function formatToken(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function SettingsView() {
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings').then(setSettings).catch((error) => setMessage(error.message));
  }, []);

  async function save() {
    if (!settings) return;
    const saved = await apiPost<ServiceSettings>('/api/settings', settings);
    setSettings(saved);
    setMessage(`已切换到 ${saved.activeStorageBackend === 'postgres' ? 'PostgreSQL' : 'SQLite'}`);
  }

  if (!settings) return <section className="panel"><h2>服务设置</h2><p>{message || '正在读取设置...'}</p></section>;

  return <section className="panel"><h2>服务设置</h2><div className="settingsGrid"><label><span>存储后端</span><select value={settings.storage.backend} onChange={(event) => setSettings({ ...settings, storage: { ...settings.storage, backend: event.target.value === 'postgres' ? 'postgres' : 'sqlite' } })}><option value="sqlite">SQLite 本地文件</option><option value="postgres">PostgreSQL 数据库</option></select></label><label><span>SQLite 文件</span><input value={settings.storage.sqlitePath ?? ''} onChange={(event) => setSettings({ ...settings, storage: { ...settings.storage, sqlitePath: event.target.value } })} /></label><label><span>PostgreSQL URL</span><input value={settings.storage.postgresUrl ?? ''} onChange={(event) => setSettings({ ...settings, storage: { ...settings.storage, postgresUrl: event.target.value } })} placeholder="postgres://user:password@host:5432/database" /></label><label><span>默认导出目录</span><input value={settings.exportDir} onChange={(event) => setSettings({ ...settings, exportDir: event.target.value })} placeholder="./exports" /></label><label><span>下载自动重试次数</span><input type="number" min="0" step="1" value={settings.autoRetryAttempts} onChange={(event) => setSettings({ ...settings, autoRetryAttempts: Math.max(0, Number.parseInt(event.target.value || '0', 10)) })} /></label><label><span>默认翻译目标语言</span><input value={settings.translation.defaultTargetLanguage} onChange={(event) => setSettings({ ...settings, translation: { ...settings.translation, defaultTargetLanguage: event.target.value } })} /></label><label><span>翻译分块字符数</span><input type="number" min="1000" step="500" value={settings.translation.maxChunkChars} onChange={(event) => setSettings({ ...settings, translation: { ...settings.translation, maxChunkChars: Math.max(1000, Number.parseInt(event.target.value || '1000', 10)) } })} /></label><label><span>翻译自动重试次数</span><input type="number" min="0" step="1" value={settings.translation.autoRetryAttempts} onChange={(event) => setSettings({ ...settings, translation: { ...settings.translation, autoRetryAttempts: Math.max(0, Number.parseInt(event.target.value || '0', 10)) } })} /></label><label className="promptField"><span>翻译 Prompt</span><textarea value={settings.translation.defaultPrompt} onChange={(event) => setSettings({ ...settings, translation: { ...settings.translation, defaultPrompt: event.target.value } })} /></label></div><div className="formRow"><button className="primary" onClick={save}>保存设置</button><span>当前：{settings.activeStorageBackend === 'postgres' ? 'PostgreSQL' : 'SQLite'}</span></div><p>{message || '元数据、目录缓存、章节缓存、下载任务和翻译任务会写入所选后端。'}</p><p>下载和翻译超过自动重试次数后会进入失败明细，需手动重试。</p><p>AI 接入通过外部 LiteLLM/OpenAI-compatible API 环境变量配置。</p></section>;
}
