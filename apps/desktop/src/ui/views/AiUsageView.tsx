import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../../api.js';
import type { AiUsageRecord, AiUsageSummary, ServiceSettings } from '../../types.js';
import { Button, Metric, Panel } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { formatToken, shortId } from '../utils.js';

export function AiUsageView() {
  const toast = useToast();
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [summary, setSummary] = useState<AiUsageSummary | undefined>();
  const [records, setRecords] = useState<AiUsageRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('正在读取 AI 使用量');

  async function refreshUsage() {
    setBusy(true);
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
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshUsage();
  }, []);

  return (
    <div className="stack">
      <Panel
        title="AI 配置与使用量"
        actions={
          <Button variant="primary" onClick={refreshUsage} loading={busy}>
            <RefreshCw size={15} />
            刷新使用量
          </Button>
        }
      >
        <div className="metricGrid">
          <Metric label="请求" value={summary?.totals.requests ?? 0} />
          <Metric label="Prompt Tokens" value={summary?.totals.promptTokens ?? 0} />
          <Metric label="Completion Tokens" value={summary?.totals.completionTokens ?? 0} />
          <Metric label="Total Tokens" value={summary?.totals.totalTokens ?? 0} />
        </div>
        <p>{message}</p>
        <p className="muted">
          周期剩余额度需要供应商提供配额 API；当前 OpenAI-compatible chat response 通常只返回本次 token usage，因此这里统计本地已记录请求。
        </p>
        {settings && <p className="muted">默认翻译目标：{settings.translation.defaultTargetLanguage}</p>}
      </Panel>

      <Panel title="按任务统计">
        <table>
          <thead>
            <tr>
              <th>任务</th>
              <th>请求</th>
              <th>Prompt</th>
              <th>Completion</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {summary?.byTask.map((task) => (
              <tr key={task.taskId}>
                <td className="mono">{shortId(task.taskId)}</td>
                <td>{task.requests}</td>
                <td>{task.promptTokens}</td>
                <td>{task.completionTokens}</td>
                <td>{task.totalTokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary && summary.byTask.length === 0 && <p>还没有可按任务归属的 AI 请求。</p>}
      </Panel>

      <Panel title="最近请求">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作</th>
              <th>模型</th>
              <th>任务</th>
              <th>Prompt</th>
              <th>Completion</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id ?? `${record.createdAt}:${record.sourceId}`}>
                <td>{new Date(record.createdAt).toLocaleString()}</td>
                <td>{record.operation}</td>
                <td className="mono">{record.model}</td>
                <td className="mono">{record.taskId ? shortId(record.taskId) : '-'}</td>
                <td>{formatToken(record.promptTokens)}</td>
                <td>{formatToken(record.completionTokens)}</td>
                <td>{formatToken(record.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && <p>还没有 AI 请求记录。</p>}
      </Panel>
    </div>
  );
}
