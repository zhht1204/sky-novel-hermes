import { BookOpen, BrainCircuit, ClipboardCheck, Download, Eye, Home, Languages, Library, Moon, Package, RefreshCw, Search, Settings, Sun } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, serviceWsUrl } from '../api.js';
import type { BookInfo, ChapterRef, DownloadTask, ProofreadTask, SiteSummary, TranslationTask, UrlImportResponse } from '../types.js';
import { ToastProvider, useToast } from './components/toast.js';
import { Button } from './components/ui.js';
import { useTheme } from './theme.js';
import { matchSiteByUrl } from './utils.js';
import { HomeView } from './views/HomeView.js';
import { SearchView } from './views/SearchView.js';
import { DownloadsView } from './views/DownloadsView.js';
import { TranslationsView } from './views/TranslationsView.js';
import { ProofreadsView } from './views/ProofreadsView.js';
import { LibraryView } from './views/LibraryView.js';
import { PackageView } from './views/PackageView.js';
import { PreviewView } from './views/PreviewView.js';
import { AiUsageView } from './views/AiUsageView.js';
import { SettingsView } from './views/SettingsView.js';

const navSections = [
  {
    label: '工作区',
    items: [
      { id: 'home', label: '主页', icon: Home },
      { id: 'search', label: '搜索', icon: Search },
      { id: 'downloads', label: '下载管理', icon: Download },
    ],
  },
  {
    label: '处理',
    items: [
      { id: 'translations', label: '多语言处理', icon: Languages },
      { id: 'proofreads', label: '内容校对', icon: ClipboardCheck },
    ],
  },
  {
    label: '内容',
    items: [
      { id: 'library', label: '已下载内容', icon: Library },
      { id: 'package', label: '打包压缩', icon: Package },
      { id: 'preview', label: '预览', icon: Eye },
    ],
  },
  {
    label: '配置',
    items: [
      { id: 'ai', label: 'AI 配置', icon: BrainCircuit },
      { id: 'settings', label: '设置', icon: Settings },
    ],
  },
];

const navItems = navSections.flatMap((section) => section.items);

export function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const toast = useToast();
  const { theme, setTheme, toggleTheme } = useTheme();
  const [active, setActive] = useState('home');
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [translationTasks, setTranslationTasks] = useState<TranslationTask[]>([]);
  const [proofreadTasks, setProofreadTasks] = useState<ProofreadTask[]>([]);
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [selectedBookUrl, setSelectedBookUrl] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, number>>(new Map());

  function flash(id: string) {
    setFlashIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    const existing = flashTimers.current.get(id);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      setFlashIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      flashTimers.current.delete(id);
    }, 1400);
    flashTimers.current.set(id, timer);
  }

  async function refresh() {
    const [siteList, taskList, translationTaskList, proofreadTaskList, bookList] = await Promise.all([
      apiGet<SiteSummary[]>('/api/sites'),
      apiGet<DownloadTask[]>('/api/downloads'),
      apiGet<TranslationTask[]>('/api/translations/tasks'),
      apiGet<ProofreadTask[]>('/api/proofreads/tasks'),
      apiGet<BookInfo[]>('/api/library/books'),
    ]);
    setSites(siteList);
    setTasks(taskList);
    setTranslationTasks(translationTaskList);
    setProofreadTasks(proofreadTaskList);
    setBooks(bookList);
    setMessage('');
  }

  async function refreshWithMessage() {
    try {
      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshWithMessage();
    const ws = new WebSocket(serviceWsUrl());
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => {
      setConnected(false);
      setMessage(`WebSocket 无法连接 ${serviceWsUrl()}`);
    };
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'task') {
        setTasks((current) => [payload.task, ...current.filter((task) => task.id !== payload.task.id)]);
        flash(payload.task.id);
      }
      if (payload.type === 'translation-task') {
        setTranslationTasks((current) => [payload.task, ...current.filter((task) => task.id !== payload.task.id)]);
        flash(payload.task.id);
      }
      if (payload.type === 'proofread-task') {
        setProofreadTasks((current) => [payload.task, ...current.filter((task) => task.id !== payload.task.id)]);
        flash(payload.task.id);
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

  const selectedBook = useMemo(
    () => books.find((book) => book.canonicalUrl === selectedBookUrl || book.sourceUrl === selectedBookUrl),
    [books, selectedBookUrl],
  );

  async function importUrl(
    url: string,
    options: { duplicateMode?: 'overwrite' | 'append'; duplicateSuffix?: string } = {},
  ): Promise<UrlImportResponse> {
    setMessage('正在解析 URL 并导入目录');
    const result = await apiPost<UrlImportResponse>('/api/import-url', { url, ...options });
    setSelectedBookUrl(result.book.canonicalUrl);
    setChapters(result.catalog);
    await refresh();
    const text = `已${result.duplicateMode === 'append' ? '作为副本' : '导入'}《${result.book.title}》目录 ${result.catalogCount} 章`;
    setMessage(text);
    toast.success(text);
    return result;
  }

  async function startDownload() {
    const bookUrl = selectedBookUrl.trim();
    if (!bookUrl) {
      toast.error('请输入授权目录 URL');
      return;
    }
    const siteId = selectedBook?.siteId ?? matchSiteByUrl(sites, bookUrl)?.id;
    if (!siteId) {
      toast.error('未找到匹配此 URL domain 的站点');
      return;
    }
    try {
      await apiPost('/api/downloads', { siteId, bookUrl });
      await refresh();
      toast.success('下载任务已提交');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const activeLabel = navItems.find((item) => item.id === active)?.label;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BookOpen size={20} /> Sky Novel Hermes
        </div>
        <nav>
          {navSections.map((section) => (
            <div className="nav-section" key={section.label}>
              <span className="nav-section-label">{section.label}</span>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}>
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button className="theme-switch" onClick={toggleTheme} title="切换主题">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          {theme === 'dark' ? '亮色主题' : '暗色主题'}
        </button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <strong>{activeLabel}</strong>
            <span className={`conn ${connected ? 'on' : 'off'}`}>
              <i />
              {connected ? '服务已连接' : '服务未连接'}
            </span>
            {message && <span className="topbar-message">{message}</span>}
          </div>
          <Button variant="primary" onClick={refreshWithMessage}>
            <RefreshCw size={15} />
            刷新
          </Button>
        </header>
        <div className="view" key={active}>
          {active === 'home' && <HomeView sites={sites} tasks={tasks} books={books} onOpenImport={() => setActive('search')} />}
          {active === 'search' && (
            <SearchView
              sites={sites}
              selectedBookUrl={selectedBookUrl}
              setSelectedBookUrl={setSelectedBookUrl}
              onImportUrl={importUrl}
              onDownload={startDownload}
            />
          )}
          {active === 'downloads' && (
            <DownloadsView
              tasks={tasks}
              books={books}
              setSelectedBookUrl={setSelectedBookUrl}
              setActive={setActive}
              refresh={refresh}
              flashIds={flashIds}
              loading={loading}
            />
          )}
          {active === 'translations' && (
            <TranslationsView
              books={books}
              selectedBookUrl={selectedBookUrl}
              setSelectedBookUrl={setSelectedBookUrl}
              tasks={translationTasks}
              refresh={refresh}
              flashIds={flashIds}
            />
          )}
          {active === 'proofreads' && (
            <ProofreadsView
              books={books}
              selectedBookUrl={selectedBookUrl}
              setSelectedBookUrl={setSelectedBookUrl}
              tasks={proofreadTasks}
              refresh={refresh}
              flashIds={flashIds}
            />
          )}
          {active === 'library' && (
            <LibraryView
              books={books}
              selectedBookUrl={selectedBookUrl}
              setSelectedBookUrl={setSelectedBookUrl}
              setActive={setActive}
              refresh={refresh}
              loading={loading}
            />
          )}
          {active === 'package' && <PackageView books={books} selectedBookUrl={selectedBookUrl} setSelectedBookUrl={setSelectedBookUrl} />}
          {active === 'preview' && <PreviewView book={selectedBook} chapters={chapters} />}
          {active === 'ai' && <AiUsageView />}
          {active === 'settings' && <SettingsView theme={theme} setTheme={setTheme} />}
        </div>
      </section>
    </main>
  );
}
