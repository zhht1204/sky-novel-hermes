import { Archive, BookOpen, Download, Eye, Home, Package, Search, Settings, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, serviceWsUrl } from '../api.js';
import type { BookInfo, ChapterContent, ChapterRef, DownloadTask, SearchResult, SiteSummary } from '../types.js';

const sampleUrl = 'https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html';
const nav = [
  { id: 'home', label: '主页', icon: Home },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'downloads', label: '下载管理', icon: Download },
  { id: 'library', label: '已下载内容', icon: Archive },
  { id: 'package', label: '打包压缩', icon: Package },
  { id: 'preview', label: '预览', icon: Eye },
  { id: 'settings', label: '设置', icon: Settings },
];

export function App() {
  const [active, setActive] = useState('home');
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [selectedBookUrl, setSelectedBookUrl] = useState(sampleUrl);
  const [message, setMessage] = useState('准备就绪');

  async function refresh() {
    const [siteList, taskList, bookList] = await Promise.all([
      apiGet<SiteSummary[]>('/api/sites'),
      apiGet<DownloadTask[]>('/api/downloads'),
      apiGet<BookInfo[]>('/api/library/books'),
    ]);
    setSites(siteList);
    setTasks(taskList);
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
        {active === 'search' && <SearchView selectedBookUrl={selectedBookUrl} setSelectedBookUrl={setSelectedBookUrl} onImport={importSample} onDownload={startDownload} />}
        {active === 'downloads' && <DownloadsView tasks={tasks} />}
        {active === 'library' && <LibraryView books={books} setSelectedBookUrl={setSelectedBookUrl} setActive={setActive} />}
        {active === 'package' && <PackageView selectedBookUrl={selectedBookUrl} />}
        {active === 'preview' && <PreviewView book={selectedBook} chapters={chapters} />}
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

function SearchView({ selectedBookUrl, setSelectedBookUrl, onImport, onDownload }: { selectedBookUrl: string; setSelectedBookUrl: (value: string) => void; onImport: () => void; onDownload: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  async function search() {
    const data = await apiPost<SearchResult[]>('/api/sites/quanben5-big5/search', { keyword, limit: 20 });
    setResults(data);
  }

  return <div className="stack"><section className="panel"><h2>关键词搜索</h2><div className="formRow"><input placeholder="书名或作者" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><button onClick={search}>搜索</button></div><div className="resultList">{results.map((result) => <button key={result.url} onClick={() => setSelectedBookUrl(result.url)}><strong>{result.title}</strong><span>{result.author ?? result.url}</span></button>)}</div></section><section className="panel"><h2>URL 导入</h2><div className="formRow"><input value={selectedBookUrl} onChange={(event) => setSelectedBookUrl(event.target.value)} /><button onClick={onImport}>解析目录</button><button className="primary" onClick={onDownload}>开始下载</button></div></section></div>;
}

function DownloadsView({ tasks }: { tasks: DownloadTask[] }) {
  return <section className="panel"><h2>下载队列</h2><table><thead><tr><th>状态</th><th>进度</th><th>失败</th><th>消息</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><span className={`badge ${task.status}`}>{task.status}</span></td><td>{task.completedChapters}/{task.totalChapters}</td><td>{task.failedChapters}</td><td>{task.message}</td></tr>)}</tbody></table></section>;
}

function LibraryView({ books, setSelectedBookUrl, setActive }: { books: BookInfo[]; setSelectedBookUrl: (value: string) => void; setActive: (value: string) => void }) {
  return <section className="panel"><h2>本地书库</h2><table><thead><tr><th>书名</th><th>作者</th><th>分类</th><th>状态</th></tr></thead><tbody>{books.map((book) => <tr key={book.canonicalUrl} onClick={() => { setSelectedBookUrl(book.canonicalUrl); setActive('preview'); }}><td>{book.title}</td><td>{book.author}</td><td>{book.category}</td><td>{book.status}</td></tr>)}</tbody></table></section>;
}

function PackageView({ selectedBookUrl }: { selectedBookUrl: string }) {
  const [format, setFormat] = useState('markdown');
  const [result, setResult] = useState('');
  async function exportBook() {
    const response = await apiPost<{ filePath: string }>('/api/export', { bookUrl: selectedBookUrl, format });
    setResult(response.filePath);
  }
  return <section className="panel"><h2>导出</h2><div className="formRow"><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="markdown">Markdown</option><option value="txt">TXT</option><option value="zip">ZIP</option></select><button className="primary" onClick={exportBook}>导出</button></div><p>{result}</p></section>;
}

function PreviewView({ book, chapters }: { book?: BookInfo; chapters: ChapterRef[] }) {
  const [chapter, setChapter] = useState<ChapterContent | undefined>();

  async function openChapter(ref: ChapterRef) {
    const data = await apiGet<ChapterContent>(`/api/library/chapter?sourceUrl=${encodeURIComponent(ref.sourceUrl)}`);
    setChapter(data);
  }

  return <div className="preview"><section className="panel"><h2>{book?.title ?? '未选择书籍'}</h2><p>{book?.description}</p><div className="meta"><span>{book?.author}</span><span>{book?.category}</span><span>{book?.status}</span></div></section><section className="panel"><h2>目录</h2><div className="chapterList">{chapters.map((item) => <button key={item.sourceUrl} onClick={() => openChapter(item)}>{item.index}. {item.title}</button>)}</div></section><section className="panel reader"><h2>{chapter?.title ?? '章节预览'}</h2><pre>{chapter?.text ?? '选择已下载章节后显示正文。'}</pre></section></div>;
}

function SettingsView() {
  return <section className="panel"><h2>服务设置</h2><p>Node sidecar: http://127.0.0.1:17891</p><p>AI 接入通过外部 LiteLLM/OpenAI-compatible API 环境变量配置。</p></section>;
}
