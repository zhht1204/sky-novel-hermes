import { useEffect, useState } from 'react';
import { Download, FileSearch, Search } from 'lucide-react';
import { ApiError, apiPost } from '../../api.js';
import type {
  AggregatedSearchResponse,
  BookInfo,
  ChapterRef,
  ImportConflictResponse,
  SiteSearchResultGroup,
  SiteSummary,
  UrlImportResponse,
} from '../../types.js';
import { Button, EmptyState, Panel } from '../components/ui.js';
import { useToast } from '../components/toast.js';

function isImportConflict(value: unknown): value is ImportConflictResponse {
  return Boolean(value && typeof value === 'object' && (value as ImportConflictResponse).code === 'IMPORT_CONFLICT');
}

export function SearchView({
  sites,
  selectedBookUrl,
  setSelectedBookUrl,
  onImportUrl,
  onDownload,
}: {
  sites: SiteSummary[];
  selectedBookUrl: string;
  setSelectedBookUrl: (value: string) => void;
  onImportUrl: (
    url: string,
    options?: { duplicateMode?: 'overwrite' | 'append'; duplicateSuffix?: string },
  ) => Promise<UrlImportResponse>;
  onDownload: () => void;
}) {
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [searchGroups, setSearchGroups] = useState<SiteSearchResultGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importedBook, setImportedBook] = useState<BookInfo | undefined>();
  const [catalogPreview, setCatalogPreview] = useState<ChapterRef[]>([]);
  const [importConflict, setImportConflict] = useState<ImportConflictResponse | undefined>();
  const [duplicateSuffix, setDuplicateSuffix] = useState('副本');

  const searchableSites = sites.filter((site) => site.capabilities.includes('search'));

  useEffect(() => {
    setSelectedSiteIds((current) => (current.length > 0 ? current : searchableSites.map((site) => site.id)));
  }, [searchableSites.map((site) => site.id).join('|')]);

  function toggleSite(siteId: string) {
    setSelectedSiteIds((current) =>
      current.includes(siteId) ? current.filter((candidate) => candidate !== siteId) : [...current, siteId],
    );
  }

  async function search() {
    setSearching(true);
    try {
      const data = await apiPost<AggregatedSearchResponse>('/api/search', { keyword, siteIds: selectedSiteIds, limit: 20 });
      setSearchGroups(data.sites);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  async function parseUrl() {
    setParsing(true);
    try {
      const result = await onImportUrl(selectedBookUrl);
      setImportConflict(undefined);
      setImportedBook(result.book);
      setCatalogPreview(result.catalog);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && isImportConflict(error.data)) {
        setImportConflict(error.data);
        return;
      }
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setParsing(false);
    }
  }

  async function resolveDuplicate(duplicateMode: 'overwrite' | 'append') {
    try {
      const result = await onImportUrl(selectedBookUrl, { duplicateMode, duplicateSuffix });
      setImportConflict(undefined);
      setImportedBook(result.book);
      setCatalogPreview(result.catalog);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="stack">
      <Panel title="聚合搜索">
        <div className="sitePicker">
          {searchableSites.map((site) => (
            <label key={site.id} className={selectedSiteIds.includes(site.id) ? 'active' : ''}>
              <input type="checkbox" checked={selectedSiteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
              {site.displayName}
            </label>
          ))}
        </div>
        <div className="formRow">
          <input
            placeholder="书名或作者"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && selectedSiteIds.length > 0 && keyword.trim()) search();
            }}
          />
          <Button variant="primary" onClick={search} loading={searching} disabled={selectedSiteIds.length === 0 || !keyword.trim()}>
            <Search size={15} />
            同步搜索
          </Button>
        </div>
        <div className="searchGroups">
          {searchGroups.map((group) => (
            <section className="sourceGroup" key={group.siteId}>
              <header>
                <strong>{group.displayName}</strong>
                <span>{group.error ? group.error : `${group.results.length} 条结果`}</span>
              </header>
              <div className="resultList">
                {group.results.map((result) => (
                  <button key={`${result.siteId}:${result.url}`} onClick={() => setSelectedBookUrl(result.url)}>
                    <strong>{result.title}</strong>
                    <span>{result.author ?? result.url}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {searchGroups.length === 0 && !searching && (
            <EmptyState icon={FileSearch} title="尚无搜索结果" hint="选择站点并输入关键字后开始检索。" />
          )}
        </div>
      </Panel>

      <Panel title="URL 导入">
        <div className="formRow">
          <input
            value={selectedBookUrl}
            onChange={(event) => {
              setSelectedBookUrl(event.target.value);
              setImportConflict(undefined);
            }}
            placeholder="https://source.example/path/book.html"
          />
          <Button onClick={parseUrl} loading={parsing} disabled={!selectedBookUrl.trim()}>
            <FileSearch size={15} />
            解析目录
          </Button>
          <Button variant="primary" onClick={onDownload} disabled={!selectedBookUrl.trim()}>
            <Download size={15} />
            开始下载
          </Button>
        </div>
        {importConflict && (
          <ImportConflictPanel
            conflict={importConflict}
            duplicateSuffix={duplicateSuffix}
            setDuplicateSuffix={setDuplicateSuffix}
            onResolve={resolveDuplicate}
          />
        )}
        {importedBook && (
          <div className="bookSummary">
            {importedBook.coverUrl && <img src={importedBook.coverUrl} alt="" />}
            <div>
              <strong>{importedBook.title}</strong>
              <span>{[importedBook.author, importedBook.category, importedBook.status].filter(Boolean).join(' · ')}</span>
              <p>{importedBook.description}</p>
            </div>
          </div>
        )}
        <CatalogPreview chapters={catalogPreview} />
      </Panel>
    </div>
  );
}

function ImportConflictPanel({
  conflict,
  duplicateSuffix,
  setDuplicateSuffix,
  onResolve,
}: {
  conflict: ImportConflictResponse;
  duplicateSuffix: string;
  setDuplicateSuffix: (value: string) => void;
  onResolve: (mode: 'overwrite' | 'append') => Promise<void>;
}) {
  const chainCount = conflict.existingBooks.length + conflict.downloadTasks.length + conflict.translationTasks.length;
  return (
    <div className="conflictPanel">
      <header>
        <strong>检测到相同 URL</strong>
        <span>{chainCount} 条关联记录</span>
      </header>
      <p>此 URL 已存在本地书籍或任务。可以覆盖原记录，也可以作为副本导入，副本会用后缀标识为不同书籍。</p>
      <div className="conflictList">
        {conflict.existingBooks.map((book) => (
          <span key={book.canonicalUrl}>书籍：{book.title}</span>
        ))}
        {conflict.downloadTasks.map((task) => (
          <span key={task.id}>下载任务：{task.status}</span>
        ))}
        {conflict.translationTasks.map((task) => (
          <span key={task.id}>
            翻译任务：{task.status} · {task.targetLanguage}
          </span>
        ))}
      </div>
      <div className="formRow">
        <input value={duplicateSuffix} onChange={(event) => setDuplicateSuffix(event.target.value)} placeholder="副本后缀" />
        <Button onClick={() => onResolve('append')}>作为副本导入</Button>
        <Button variant="primary" onClick={() => onResolve('overwrite')}>
          覆盖导入
        </Button>
      </div>
    </div>
  );
}

function CatalogPreview({ chapters }: { chapters: ChapterRef[] }) {
  if (chapters.length === 0) return null;
  return (
    <div className="catalogPreview">
      <header>
        <strong>目录预览</strong>
        <span>{chapters.length} 章</span>
      </header>
      <div>
        {chapters.slice(0, 80).map((chapter) => (
          <button key={chapter.sourceUrl}>
            {chapter.index}. {chapter.title}
          </button>
        ))}
      </div>
      {chapters.length > 80 && <p>已显示前 80 章，其余章节已写入本地目录。</p>}
    </div>
  );
}
