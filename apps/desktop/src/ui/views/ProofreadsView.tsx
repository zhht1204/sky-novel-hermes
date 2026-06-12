import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Pause, Play, RotateCcw, X } from 'lucide-react';
import { apiGet, apiPost } from '../../api.js';
import type { BookInfo, ChapterProofread, ChapterRef, ProofreadFailure, ProofreadTask, ServiceSettings } from '../../types.js';
import { Button, EmptyState, Panel, ProgressBar, StatusBadge } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { buildInlineDiff, diffStats } from '../diff.js';

export function ProofreadsView({
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
  tasks: ProofreadTask[];
  refresh: () => Promise<void>;
  flashIds: Set<string>;
}) {
  const toast = useToast();
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [force, setForce] = useState(false);
  const [applyRepairs, setApplyRepairs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [openTaskId, setOpenTaskId] = useState('');
  const [failures, setFailures] = useState<Record<string, ProofreadFailure[]>>({});
  const [chapterRefs, setChapterRefs] = useState<ChapterRef[]>([]);
  const [selectedChapterUrl, setSelectedChapterUrl] = useState('');
  const [proofread, setProofread] = useState<ChapterProofread | undefined>();
  const [compareMode, setCompareMode] = useState<'diff' | 'split'>('diff');

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings').then(setSettings).catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!selectedBookUrl) {
      setChapterRefs([]);
      setSelectedChapterUrl('');
      setProofread(undefined);
      return;
    }
    apiGet<ChapterRef[]>(`/api/library/chapters?bookUrl=${encodeURIComponent(selectedBookUrl)}`)
      .then((data) => {
        setChapterRefs(data);
        setSelectedChapterUrl((current) => current || data[0]?.sourceUrl || '');
      })
      .catch(() => setChapterRefs([]));
  }, [selectedBookUrl]);

  async function startProofread() {
    setBusy(true);
    try {
      setMessage('正在提交校对任务');
      await apiPost('/api/proofreads/tasks', { bookUrl: selectedBookUrl, force, applyRepairs });
      const text = applyRepairs ? '校对任务已提交，完成章节会自动写回正文' : '校对任务已提交，仅保存校对结果';
      setMessage(text);
      toast.success(text);
      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function loadProofread(sourceUrl = selectedChapterUrl) {
    if (!sourceUrl) return;
    try {
      const data = await apiGet<ChapterProofread>(`/api/library/chapter-proofread?sourceUrl=${encodeURIComponent(sourceUrl)}`);
      setProofread(data);
      setMessage(data.applied ? '此校对结果已写回正文' : '此校对结果尚未写回正文');
    } catch (error) {
      setProofread(undefined);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function reproofreadChapter() {
    if (!selectedChapterUrl) return;
    try {
      await apiPost('/api/library/chapter-proofread/reproofread', { sourceUrl: selectedChapterUrl, applyRepairs });
      setMessage('已提交本章重新校对任务');
      toast.success('已提交本章重新校对任务');
      await refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    }
  }

  async function toggleFailures(task: ProofreadTask) {
    const nextOpenTaskId = openTaskId === task.id ? '' : task.id;
    setOpenTaskId(nextOpenTaskId);
    if (nextOpenTaskId && !failures[task.id]) {
      const data = await apiGet<ProofreadFailure[]>(`/api/proofreads/tasks/${task.id}/failures`);
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

  async function retryFailed(task: ProofreadTask) {
    await run(async () => {
      await apiPost(`/api/proofreads/tasks/${task.id}/retry-failed`, {});
      setFailures((current) => ({ ...current, [task.id]: [] }));
    }, '已重新排队失败章节');
  }

  const bookTasks = tasks.filter((task) => !selectedBookUrl || task.bookUrl === selectedBookUrl);

  const diffSegments = useMemo(
    () => (proofread ? buildInlineDiff(proofread.originalText, proofread.correctedText) : []),
    [proofread],
  );
  const stats = useMemo(() => diffStats(diffSegments), [diffSegments]);
  const hasChanges = stats.changes > 0;

  return (
    <div className="stack">
      <Panel title="内容校对">
        <div className="translationControls">
          <label>
            <span>书籍</span>
            <select value={selectedBookUrl} onChange={(event) => setSelectedBookUrl(event.target.value)}>
              <option value="">选择书籍</option>
              {books.map((book) => (
                <option key={book.canonicalUrl} value={book.canonicalUrl}>
                  {book.title}
                </option>
              ))}
            </select>
          </label>
          <label className="checkLine">
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            重新校对已有结果
          </label>
          <label className="checkLine">
            <input type="checkbox" checked={applyRepairs} onChange={(event) => setApplyRepairs(event.target.checked)} />
            自动修复正文
          </label>
        </div>
        <div className="formRow">
          <Button variant="primary" onClick={startProofread} loading={busy} disabled={!selectedBookUrl}>
            <ClipboardCheck size={15} />
            开始校对
          </Button>
          <span>{settings ? `校对分块：${settings.proofreading.maxChunkChars} 字符` : '正在读取校对设置'}</span>
        </div>
        <p>{message || '校对结果会保存原文和修正文本；勾选自动修复时正文会写回修正版本。'}</p>
      </Panel>

      <Panel title="校对队列">
        <table>
          <thead>
            <tr>
              <th>状态</th>
              <th>模式</th>
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
                <td>{task.applyRepairs ? '自动修复' : '仅保存结果'}</td>
                <td>
                  <ProgressBar value={task.completedChapters} total={task.totalChapters} status={task.status} />
                </td>
                <td>{task.failedChapters}</td>
                <td>{task.message}</td>
                <td>
                  <div className="tableActions">
                    <Button
                      variant="ghost"
                      onClick={() => run(() => apiPost(`/api/proofreads/tasks/${task.id}/pause`, {}))}
                      disabled={!['queued', 'running'].includes(task.status)}
                    >
                      <Pause size={14} />
                      暂停
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => run(() => apiPost(`/api/proofreads/tasks/${task.id}/resume`, {}))}
                      disabled={task.status === 'running' || task.status === 'completed'}
                    >
                      <Play size={14} />
                      继续
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => retryFailed(task)}
                      disabled={task.failedChapters === 0 || task.status === 'running' || task.status === 'cancelled'}
                    >
                      <RotateCcw size={14} />
                      重试失败
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => run(() => apiPost(`/api/proofreads/tasks/${task.id}/cancel`, {}))}
                      disabled={['completed', 'failed', 'cancelled'].includes(task.status)}
                    >
                      <X size={14} />
                      取消
                    </Button>
                    <Button variant="ghost" onClick={() => toggleFailures(task)} disabled={task.failedChapters === 0}>
                      失败明细
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookTasks.length === 0 && <EmptyState icon={ClipboardCheck} title="当前书籍还没有校对任务" hint="选择书籍后提交校对任务。" />}
        {openTaskId && <ProofreadFailureList failures={failures[openTaskId] ?? []} />}
      </Panel>

      <Panel className="reader" title="校对对照">
        <div className="readerTools">
          <label>
            <span>章节</span>
            <select
              value={selectedChapterUrl}
              onChange={(event) => {
                setSelectedChapterUrl(event.target.value);
                setProofread(undefined);
              }}
            >
              {chapterRefs.map((chapter) => (
                <option key={chapter.sourceUrl} value={chapter.sourceUrl}>
                  {chapter.index}. {chapter.title}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => loadProofread()} disabled={!selectedChapterUrl}>
            查看结果
          </Button>
          <Button onClick={reproofreadChapter} disabled={!selectedChapterUrl}>
            <RotateCcw size={14} />
            重新校对本章
          </Button>
          {proofread && (
            <div className="segmented" role="group" aria-label="对照模式">
              <button
                type="button"
                className={compareMode === 'diff' ? 'active' : ''}
                onClick={() => setCompareMode('diff')}
              >
                差异标记
              </button>
              <button
                type="button"
                className={compareMode === 'split' ? 'active' : ''}
                onClick={() => setCompareMode('split')}
              >
                左右对照
              </button>
            </div>
          )}
        </div>
        {proofread ? (
          <div className="proofreadResult">
            <div className="diffSummary">
              <StatusBadge status={proofread.applied ? 'completed' : 'queued'} />
              <span>{proofread.applied ? '已写回正文' : '未写回正文'}</span>
              {hasChanges ? (
                <>
                  <span className="diffSummary-chip diffSummary-changes">{stats.changes} 处改动</span>
                  <span className="diffSummary-chip diffSummary-add">+{stats.added} 字</span>
                  <span className="diffSummary-chip diffSummary-del">-{stats.removed} 字</span>
                </>
              ) : (
                <span className="diffSummary-chip">AI 未改动本章内容</span>
              )}
            </div>
            {compareMode === 'diff' ? (
              <pre className="diffView">
                {hasChanges ? (
                  diffSegments.map((seg, index) => (
                    <span
                      key={index}
                      className={
                        seg.type === 'insert' ? 'diff-ins' : seg.type === 'delete' ? 'diff-del' : undefined
                      }
                    >
                      {seg.value}
                    </span>
                  ))
                ) : (
                  proofread.correctedText
                )}
              </pre>
            ) : (
              <div className="readerCompare">
                <article>
                  <header>原文</header>
                  <pre>{proofread.originalText}</pre>
                </article>
                <article>
                  <header>校对结果</header>
                  <pre>{proofread.correctedText}</pre>
                </article>
              </div>
            )}
          </div>
        ) : (
          <pre className="reader-placeholder">选择章节后查看已保存的校对对照。</pre>
        )}
      </Panel>
    </div>
  );
}

function ProofreadFailureList({ failures }: { failures: ProofreadFailure[] }) {
  if (failures.length === 0) return <div className="failureList"><p>没有失败章节记录。</p></div>;
  return (
    <div className="failureList">
      <header>
        <strong>校对失败章节</strong>
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
