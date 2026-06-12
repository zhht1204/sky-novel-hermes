import { useEffect, useState } from 'react';
import { Moon, Save, Sun } from 'lucide-react';
import { apiGet, apiPost } from '../../api.js';
import type { ServiceSettings } from '../../types.js';
import { Button, Panel } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import type { Theme } from '../theme.js';

export function SettingsView({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ServiceSettings | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings').then(setSettings).catch((error) => setMessage(error.message));
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const saved = await apiPost<ServiceSettings>('/api/settings', settings);
      setSettings(saved);
      const text = `已切换到 ${saved.activeStorageBackend === 'postgres' ? 'PostgreSQL' : 'SQLite'}`;
      setMessage(text);
      toast.success(text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Panel title="外观">
        <div className="themeToggle" role="group" aria-label="主题">
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
            <Moon size={15} />
            暗色
          </button>
          <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
            <Sun size={15} />
            亮色
          </button>
        </div>
        <p className="muted">主题选择会保存在本地，下次启动时自动应用。</p>
      </Panel>

      <Panel title="关于">
        <div className="formRow">
          <span>应用版本</span>
          <span className="mono">v{__APP_VERSION__}</span>
        </div>
        <p className="muted">使用 <code>pnpm version:bump</code> 升级版本号并打 git tag（默认 +0.0.1）。</p>
      </Panel>

      {!settings ? (
        <Panel title="服务设置">
          <p>{message || '正在读取设置...'}</p>
        </Panel>
      ) : (
        <Panel title="服务设置">
          <div className="settingsGrid">
            <label>
              <span>存储后端</span>
              <select
                value={settings.storage.backend}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    storage: { ...settings.storage, backend: event.target.value === 'postgres' ? 'postgres' : 'sqlite' },
                  })
                }
              >
                <option value="sqlite">SQLite 本地文件</option>
                <option value="postgres">PostgreSQL 数据库</option>
              </select>
            </label>
            <label>
              <span>SQLite 文件</span>
              <input
                value={settings.storage.sqlitePath ?? ''}
                onChange={(event) => setSettings({ ...settings, storage: { ...settings.storage, sqlitePath: event.target.value } })}
              />
            </label>
            <label>
              <span>PostgreSQL URL</span>
              <input
                value={settings.storage.postgresUrl ?? ''}
                onChange={(event) => setSettings({ ...settings, storage: { ...settings.storage, postgresUrl: event.target.value } })}
                placeholder="postgres://user:password@host:5432/database"
              />
            </label>
            <label>
              <span>默认导出目录</span>
              <input value={settings.exportDir} onChange={(event) => setSettings({ ...settings, exportDir: event.target.value })} placeholder="./exports" />
            </label>
            <label>
              <span>下载自动重试次数</span>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.autoRetryAttempts}
                onChange={(event) => setSettings({ ...settings, autoRetryAttempts: Math.max(0, Number.parseInt(event.target.value || '0', 10)) })}
              />
            </label>
            <label>
              <span>默认翻译目标语言</span>
              <input
                value={settings.translation.defaultTargetLanguage}
                onChange={(event) =>
                  setSettings({ ...settings, translation: { ...settings.translation, defaultTargetLanguage: event.target.value } })
                }
              />
            </label>
            <label>
              <span>翻译分块字符数</span>
              <input
                type="number"
                min="1000"
                step="500"
                value={settings.translation.maxChunkChars}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    translation: { ...settings.translation, maxChunkChars: Math.max(1000, Number.parseInt(event.target.value || '1000', 10)) },
                  })
                }
              />
            </label>
            <label>
              <span>翻译自动重试次数</span>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.translation.autoRetryAttempts}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    translation: { ...settings.translation, autoRetryAttempts: Math.max(0, Number.parseInt(event.target.value || '0', 10)) },
                  })
                }
              />
            </label>
            <label className="promptField">
              <span>翻译 Prompt</span>
              <textarea
                value={settings.translation.defaultPrompt}
                onChange={(event) => setSettings({ ...settings, translation: { ...settings.translation, defaultPrompt: event.target.value } })}
              />
            </label>
            <label>
              <span>校对分块字符数</span>
              <input
                type="number"
                min="1000"
                step="500"
                value={settings.proofreading.maxChunkChars}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    proofreading: { ...settings.proofreading, maxChunkChars: Math.max(1000, Number.parseInt(event.target.value || '1000', 10)) },
                  })
                }
              />
            </label>
            <label>
              <span>校对自动重试次数</span>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.proofreading.autoRetryAttempts}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    proofreading: { ...settings.proofreading, autoRetryAttempts: Math.max(0, Number.parseInt(event.target.value || '0', 10)) },
                  })
                }
              />
            </label>
            <label className="promptField">
              <span>校对 Prompt</span>
              <textarea
                value={settings.proofreading.defaultPrompt}
                onChange={(event) => setSettings({ ...settings, proofreading: { ...settings.proofreading, defaultPrompt: event.target.value } })}
              />
            </label>
          </div>
          <div className="formRow">
            <Button variant="primary" onClick={save} loading={busy}>
              <Save size={15} />
              保存设置
            </Button>
            <span>当前：{settings.activeStorageBackend === 'postgres' ? 'PostgreSQL' : 'SQLite'}</span>
          </div>
          <p>{message || '元数据、目录缓存、章节缓存、下载任务、翻译任务和校对任务会写入所选后端。'}</p>
          <p className="muted">下载、翻译和校对超过自动重试次数后会进入失败明细，需手动重试。</p>
          <p className="muted">AI 接入通过外部 LiteLLM/OpenAI-compatible API 环境变量配置。</p>
        </Panel>
      )}
    </div>
  );
}
