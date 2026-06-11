import { useEffect, useState } from 'react';
import { Languages, Pause, Play, RotateCcw, X } from 'lucide-react';
import { apiGet, apiPost } from '../../api.js';
import type { BookInfo, LanguageProfile, ServiceSettings, TranslationFailure, TranslationTask } from '../../types.js';
import { Button, EmptyState, Panel, ProgressBar, StatusBadge } from '../components/ui.js';
import { useToast } from '../components/toast.js';

export function TranslationsView({
  books,
  selectedBookUrl,
  setSelectedBookUrl,
  tasks,
  refresh,
  flashIds,
}: {
  books: BookInfo[];
  selectedBookUrl: string;
  setSelectedBookUrl: (value: string) => void;
  tasks: TranslationTask[];
  refresh: () => Promise<void>;
  flashIds: Set<string>;
}) {
  const toast = useToast();
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [profile, setProfile] = useState<LanguageProfile | undefined>();
  const [targetLanguage, setTargetLanguage] = useState('zh-Hans');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [openTaskId, setOpenTaskId] = useState('');
  const [failures, setFailures] = useState<Record<string, TranslationFailure[]>>({});

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings')
      .then((data) => {
        setSettings(data);
        setTargetLanguage((current) => current || data.translation.defaultTargetLanguage);
      })
      .catch((error) => setMessage(error.message));
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
      const text = `检测结果：${data.language} (${Math.round(data.confidence * 100)}%)`;
      setMessage(text);
      toast.success(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    }
  }

  async function startTranslation() {
    setBusy(true);
    try {
      setMessage('正在提交翻译任务');
      await apiPost('/api/translations/tasks', { bookUrl: selectedBookUrl, targetLanguage, force, sourceLanguage: profile?.language });
      setMessage('翻译任务已提交');
      toast.success('翻译任务已提交');
      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
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

  async function run(action: () => Promise<void>, okMessage?: string) {
    try {
      await action();
      await refresh();
      if (okMessage) toast.success(okMessage);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    }
  }

  async function retryFailed(task: TranslationTask) {
    await run(async () => {
      await apiPost(`/api/translations/tasks/${task.id}/retry-failed`, {});
      setFailures((current) => ({ ...current, [task.id]: [] }));
    }, '已重新排队失败章节');
  }

  const bookTasks = tasks.filter((task) => !selectedBookUrl || task.bookUrl === selectedBookUrl);
  const selectedBook = books.find((book) => book.canonicalUrl === selectedBookUrl || book.sourceUrl === selectedBookUrl);

  return (
    <div className="stack">
      <Panel title="翻译任务">
        <div className="translationControls">
          <label>
            <span>书籍</span>
            <select value={selectedBookUrl} onChange={(event) => setSelectedBookUrl(event.target.value)}>
              {books.map((book) => (
                <option key={book.canonicalUrl} value={book.canonicalUrl}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>目标语言</span>
            <input list="language-options" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} />
          </label>
          <label className="checkLine">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            重新翻译已有译文
          </label>
        </div>
        <datalist id="language-options">
          <option value="zh-Hans" />
          <option value="zh-Hant" />
          <option value="en" />
          <option value="ja" />
          <option value="ko" />
        </datalist>
        <div className="formRow">
          <Button onClick={detectLanguage} disabled={!selectedBookUrl}>
            检测源语言
          </Button>
          <Button variant="primary" onClick={startTranslation} loading={busy} disabled={!selectedBookUrl || !targetLanguage.trim()}>
            <Languages size={15} />
            开始翻译
          </Button>
          <span>
            {profile
              ? `源语言：${profile.language} · ${Math.round(profile.confidence * 100)}% · ${profile.detector}`
              : selectedBook
                ? '尚未检测源语言'
                : '未选择书籍'}
          </span>
        </div>
        <p>{message || (settings ? `默认目标语言：${settings.translation.defaultTargetLanguage}` : '正在读取翻译设置...')}</p>
      </Panel>

      <Panel title="多语言队列">
        <table>
          <thead>
            <tr>
              <th>状态</th>
              <th>语言</th>
              <th>进度</th>
              <th>失败</th>
              <th>消息</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {bookTasks.map((task) => (
              <tr key={task.id} className={flashIds.has(task.id) ? 'row-flash' : ''}>
                <td>
                  <StatusBadge status={task.status} />
                </td>
                <td>
                  {task.sourceLanguage} → {task.targetLanguage}
                </td>
                <td>
                  <ProgressBar value={task.completedChapters} total={task.totalChapters} status={task.status} />
                </td>
                <td>{task.failedChapters}</td>
                <td>{task.message}</td>
                <td>
                  <div className="tableActions">
                    <Button
                      variant="ghost"
                      onClick={() => run(() => apiPost(`/api/translations/tasks/${task.id}/pause`, {}))}
                      disabled={!['queued', 'running'].includes(task.status)}
                    >
                      <Pause size={14} />
                      暂停
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => run(() => apiPost(`/api/translations/tasks/${task.id}/resume`, {}))}
                      disabled={task.status === 'running' || task.status === 'completed'}
                    >
                      <Play size={14} />
                      继续
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => run(() => apiPost(`/api/translations/tasks/${task.id}/cancel`, {}))}
                      disabled={['completed', 'failed', 'cancelled'].includes(task.status)}
                    >
                      <X size={14} />
                      取消
                    </Button>
                    <Button variant="ghost" onClick={() => toggleFailures(task)} disabled={task.failedChapters === 0}>
                      失败明细
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => retryFailed(task)}
                      disabled={task.failedChapters === 0 || task.status === 'running'}
                    >
                      <RotateCcw size={14} />
                      重试失败
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookTasks.length === 0 && <EmptyState icon={Languages} title="还没有这本书的翻译任务" hint="选择书籍并设置目标语言后提交。" />}
        {openTaskId && <TranslationFailureList failures={failures[openTaskId] ?? []} />}
      </Panel>
    </div>
  );
}

function TranslationFailureList({ failures }: { failures: TranslationFailure[] }) {
  if (failures.length === 0) return <div className="failureList"><p>没有失败章节记录。</p></div>;
  return (
    <div className="failureList">
      <header>
        <strong>翻译失败章节</strong>
        <span>{failures.length} 条</span>
      </header>
      <table>
        <thead>
          <tr>
            <th>序号</th>
            <th>章节</th>
            <th>目标语言</th>
            <th>尝试</th>
            <th>错误</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((failure) => (
            <tr key={failure.chapterUrl}>
              <td>{failure.chapterIndex}</td>
              <td>{failure.title}</td>
              <td>{failure.targetLanguage}</td>
              <td>{failure.attempts}</td>
              <td>{failure.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
