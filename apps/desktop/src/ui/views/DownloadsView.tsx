import { useState } from 'react';
import { BookOpen, Inbox, Pause, Play, RotateCcw, X } from 'lucide-react';
import { apiGet, apiPost } from '../../api.js';
import type { BookInfo, DownloadFailure, DownloadTask } from '../../types.js';
import { Button, EmptyState, Panel, ProgressBar, SkeletonRows, StatusBadge } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { normalizeLocalUrl, shortUrl } from '../utils.js';

export function DownloadsView({
  tasks,
  books,
  setSelectedBookUrl,
  setActive,
  refresh,
  flashIds,
  loading,
}: {
  tasks: DownloadTask[];
  books: BookInfo[];
  setSelectedBookUrl: (value: string) => void;
  setActive: (value: string) => void;
  refresh: () => Promise<void>;
  flashIds: Set<string>;
  loading: boolean;
}) {
  const toast = useToast();
  const [openTaskId, setOpenTaskId] = useState('');
  const [failures, setFailures] = useState<Record<string, DownloadFailure[]>>({});

  function bookForTask(task: DownloadTask): BookInfo | undefined {
    return books.find(
      (book) =>
        book.canonicalUrl === task.bookUrl ||
        book.sourceUrl === task.bookUrl ||
        normalizeLocalUrl(book.canonicalUrl) === normalizeLocalUrl(task.bookUrl) ||
        normalizeLocalUrl(book.sourceUrl) === normalizeLocalUrl(task.bookUrl),
    );
  }

  function openDownloadedBook(task: DownloadTask) {
    const book = bookForTask(task);
    if (!book) return;
    setSelectedBookUrl(book.canonicalUrl);
    setActive('preview');
  }

  async function toggleFailures(task: DownloadTask) {
    const nextOpenTaskId = openTaskId === task.id ? '' : task.id;
    setOpenTaskId(nextOpenTaskId);
    if (nextOpenTaskId && !failures[task.id]) {
      const data = await apiGet<DownloadFailure[]>(`/api/downloads/${task.id}/failures`);
      setFailures((current) => ({ ...current, [task.id]: data }));
    }
  }

  async function run(action: () => Promise<void>, okMessage?: string) {
    try {
      await action();
      await refresh();
      if (okMessage) toast.success(okMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function retryFailed(task: DownloadTask) {
    await run(async () => {
      await apiPost(`/api/downloads/${task.id}/retry-failed`, {});
      setFailures((current) => ({ ...current, [task.id]: [] }));
    }, '已重新排队失败章节');
  }

  return (
    <Panel title="下载队列">
      <table>
        <thead>
          <tr>
            <th>书籍</th>
            <th>状态</th>
            <th>进度</th>
            <th>失败</th>
            <th>消息</th>
            <th>操作</th>
          </tr>
        </thead>
        {loading && tasks.length === 0 ? (
          <SkeletonRows rows={4} cols={6} />
        ) : (
          <tbody>
            {tasks.map((task) => {
              const book = bookForTask(task);
              const canPause = ['queued', 'running'].includes(task.status);
              const canResume = !['running', 'completed', 'cancelled'].includes(task.status);
              const canRetry = task.failedChapters > 0 && !['running', 'cancelled'].includes(task.status);
              const canCancel = !['completed', 'failed', 'cancelled'].includes(task.status);
              return (
                <tr key={task.id} className={flashIds.has(task.id) ? 'row-flash' : ''}>
                  <td>
                    <div className="bookCell">
                      <strong>{book?.title ?? shortUrl(task.bookUrl)}</strong>
                      <span>{book ? [book.author, book.category].filter(Boolean).join(' · ') : task.bookUrl}</span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <ProgressBar value={task.completedChapters} total={task.totalChapters} status={task.status} />
                  </td>
                  <td>{task.failedChapters}</td>
                  <td>{task.message}</td>
                  <td>
                    <div className="tableActions">
                      <Button variant="ghost" onClick={() => openDownloadedBook(task)} disabled={!book} title="打开已下载书籍">
                        <BookOpen size={14} />
                        打开
                      </Button>
                      {canPause ? (
                        <Button variant="ghost" onClick={() => run(() => apiPost(`/api/downloads/${task.id}/pause`, {}))} title="暂停任务">
                          <Pause size={14} />
                          暂停
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => run(() => apiPost(`/api/downloads/${task.id}/resume`, {}))}
                          disabled={!canResume}
                          title="继续缺失章节"
                        >
                          <Play size={14} />
                          继续
                        </Button>
                      )}
                      {canRetry ? (
                        <Button variant="ghost" onClick={() => retryFailed(task)}>
                          <RotateCcw size={14} />
                          重试失败
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => run(() => apiPost(`/api/downloads/${task.id}/cancel`, {}))}
                          disabled={!canCancel}
                          title="取消任务"
                        >
                          <X size={14} />
                          取消
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => toggleFailures(task)} disabled={task.failedChapters === 0}>
                        失败明细
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        )}
      </table>
      {!loading && tasks.length === 0 && <EmptyState icon={Inbox} title="下载队列为空" hint="在搜索页解析授权目录后开始下载。" />}
      {openTaskId && <FailureList failures={failures[openTaskId] ?? []} />}
    </Panel>
  );
}

function FailureList({ failures }: { failures: DownloadFailure[] }) {
  if (failures.length === 0) return <div className="failureList"><p>没有失败章节记录。</p></div>;
  return (
    <div className="failureList">
      <header>
        <strong>失败章节</strong>
        <span>{failures.length} 条</span>
      </header>
      <table>
        <thead>
          <tr>
            <th>序号</th>
            <th>章节</th>
            <th>尝试</th>
            <th>错误</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((failure) => (
            <tr key={failure.chapterUrl}>
              <td>{failure.chapterIndex}</td>
              <td>{failure.title}</td>
              <td>{failure.attempts}</td>
              <td>{failure.error}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
