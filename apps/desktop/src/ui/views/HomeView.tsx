import { Database, Download, FileSearch, Globe2, Search } from 'lucide-react';
import type { BookInfo, DownloadTask, SiteSummary } from '../../types.js';
import { Button, Metric, Panel } from '../components/ui.js';
import { statusLabel } from '../utils.js';

export function HomeView({
  sites,
  tasks,
  books,
  onOpenImport,
}: {
  sites: SiteSummary[];
  tasks: DownloadTask[];
  books: BookInfo[];
  onOpenImport: () => void;
}) {
  const running = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length;
  return (
    <div className="home">
      <div className="metricGrid">
        <Metric label="可用站点" value={sites.length} icon={Globe2} />
        <Metric label="本地书库" value={books.length} icon={Database} />
        <Metric label="下载任务" value={tasks.length} icon={Download} />
        <Metric label="进行中" value={running} icon={FileSearch} />
      </div>
      <Panel className="wide" title="快速开始">
        <p>输入授权目录 URL，解析元数据和目录后再启动下载任务。</p>
        <div className="formRow">
          <Button variant="primary" onClick={onOpenImport}>
            <Search size={16} />
            URL 导入
          </Button>
        </div>
      </Panel>
      {tasks.length > 0 && (
        <Panel title="最近任务">
          <ul className="activityList">
            {tasks.slice(0, 6).map((task) => (
              <li key={task.id}>
                <span className={`dot dot-${task.status}`} />
                <span className="activity-main">{task.bookUrl}</span>
                <span className="activity-meta">
                  {statusLabel(task.status)} · {task.completedChapters}/{task.totalChapters}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
