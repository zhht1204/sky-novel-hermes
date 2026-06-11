import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { apiGet, apiPost } from '../../api.js';
import type { BookInfo, ExportResponse, ServiceSettings } from '../../types.js';
import { Button, Panel } from '../components/ui.js';
import { useToast } from '../components/toast.js';

export function PackageView({
  books,
  selectedBookUrl,
  setSelectedBookUrl,
}: {
  books: BookInfo[];
  selectedBookUrl: string;
  setSelectedBookUrl: (value: string) => void;
}) {
  const toast = useToast();
  const [format, setFormat] = useState('markdown');
  const [language, setLanguage] = useState('original');
  const [languages, setLanguages] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const selectedBook = books.find((book) => book.canonicalUrl === selectedBookUrl || book.sourceUrl === selectedBookUrl);

  useEffect(() => {
    apiGet<ServiceSettings>('/api/settings')
      .then((settings) => setOutputDir((current) => current || settings.exportDir))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedBookUrl) return;
    apiGet<string[]>(`/api/library/translation-languages?bookUrl=${encodeURIComponent(selectedBookUrl)}`)
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, [selectedBookUrl]);

  useEffect(() => {
    if (selectedBook && !fileName) {
      setFileName(selectedBook.title);
    }
  }, [selectedBook?.canonicalUrl]);

  async function exportBook() {
    setBusy(true);
    try {
      const response = await apiPost<ExportResponse>('/api/export', { bookUrl: selectedBookUrl, format, outputDir, fileName, language });
      const text = `${response.filePath} (${response.chapterCount} 章)`;
      setResult(text);
      toast.success('导出完成');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setResult(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="导出">
      <div className="exportGrid">
        <label>
          <span>书籍</span>
          <select
            value={selectedBookUrl}
            onChange={(event) => {
              setSelectedBookUrl(event.target.value);
              setFileName('');
              setLanguage('original');
            }}
          >
            {books.map((book) => (
              <option key={book.canonicalUrl} value={book.canonicalUrl}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>格式</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="markdown">Markdown</option>
            <option value="txt">TXT</option>
            <option value="zip">ZIP: Markdown + TXT</option>
          </select>
        </label>
        <label>
          <span>内容语言</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="original">原文</option>
            {languages.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>导出目录</span>
          <input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} placeholder="./exports" />
        </label>
        <label>
          <span>文件名</span>
          <input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder={selectedBook?.title ?? 'novel'} />
        </label>
      </div>
      <div className="formRow">
        <Button variant="primary" onClick={exportBook} loading={busy} disabled={!selectedBookUrl || books.length === 0}>
          <Package size={15} />
          导出文件
        </Button>
        <span>{selectedBook ? `${selectedBook.author ?? '未知作者'} · ${selectedBook.category ?? '未分类'}` : '未选择书籍'}</span>
      </div>
      <p>{result || '下载内容保存在当前存储后端，导出时按这里的格式和路径生成文件。'}</p>
    </Panel>
  );
}
