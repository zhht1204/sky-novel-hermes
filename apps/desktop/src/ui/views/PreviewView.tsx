import { useEffect, useState } from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import { apiGet, apiPost } from '../../api.js';
import type { BookInfo, ChapterContent, ChapterRef, ChapterTranslation } from '../../types.js';
import { Button, EmptyState, Panel } from '../components/ui.js';
import { useToast } from '../components/toast.js';

export function PreviewView({ book, chapters }: { book?: BookInfo; chapters: ChapterRef[] }) {
  const toast = useToast();
  const [chapter, setChapter] = useState<ChapterContent | undefined>();
  const [originalChapter, setOriginalChapter] = useState<ChapterContent | undefined>();
  const [selectedRef, setSelectedRef] = useState<ChapterRef | undefined>();
  const [language, setLanguage] = useState('original');
  const [showOriginalCompare, setShowOriginalCompare] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!book) return;
    apiGet<string[]>(`/api/library/translation-languages?bookUrl=${encodeURIComponent(book.canonicalUrl)}`)
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, [book?.canonicalUrl]);

  useEffect(() => {
    if (selectedRef) openChapter(selectedRef).catch((error) => setMessage(error.message));
  }, [language]);

  useEffect(() => {
    if (language === 'original') setShowOriginalCompare(false);
  }, [language]);

  async function openChapter(ref: ChapterRef) {
    setSelectedRef(ref);
    setMessage('');
    const original = await apiGet<ChapterContent>(`/api/library/chapter?sourceUrl=${encodeURIComponent(ref.sourceUrl)}`);
    setOriginalChapter(original);
    if (language === 'original') {
      setChapter(original);
      return;
    }
    const data = await apiGet<ChapterTranslation>(
      `/api/library/chapter-translation?sourceUrl=${encodeURIComponent(ref.sourceUrl)}&language=${encodeURIComponent(language)}`,
    );
    setChapter({
      siteId: ref.siteId,
      bookUrl: data.bookUrl,
      sourceUrl: data.sourceUrl,
      title: data.title,
      index: data.chapterIndex,
      text: data.text,
      fetchedAt: data.updatedAt,
    });
  }

  async function retranslateCurrentChapter() {
    if (!selectedRef || language === 'original') return;
    try {
      await apiPost('/api/library/chapter-translation/retranslate', { sourceUrl: selectedRef.sourceUrl, targetLanguage: language });
      setMessage('已提交本章重译任务');
      toast.success('已提交本章重译任务');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      toast.error(text);
    }
  }

  const showCompare = showOriginalCompare && language !== 'original' && originalChapter && chapter;

  return (
    <div className="preview">
      <Panel title={book?.title ?? '未选择书籍'}>
        <p>{book?.description}</p>
        <div className="meta">
          <span>{book?.author}</span>
          <span>{book?.category}</span>
          <span>{book?.status}</span>
        </div>
        <div className="readerTools">
          <label>
            <span>查看语言</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="original">原文</option>
              {languages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {language !== 'original' && (
            <label className="checkLine">
              <input type="checkbox" checked={showOriginalCompare} onChange={(event) => setShowOriginalCompare(event.target.checked)} />
              原文对照
            </label>
          )}
          <Button onClick={retranslateCurrentChapter} disabled={!selectedRef || language === 'original'}>
            <RotateCcw size={14} />
            重新翻译本章
          </Button>
          <span>{message}</span>
        </div>
      </Panel>

      <Panel title="目录">
        {chapters.length === 0 ? (
          <EmptyState icon={BookOpen} title="没有可预览的章节" hint="选择已下载书籍后显示目录。" />
        ) : (
          <div className="chapterList">
            {chapters.map((item) => (
              <button
                key={item.sourceUrl}
                className={selectedRef?.sourceUrl === item.sourceUrl ? 'active' : ''}
                onClick={() => openChapter(item).catch((error) => setMessage(error.message))}
              >
                {item.index}. {item.title}
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="reader" title={chapter?.title ?? '章节预览'}>
        {showCompare ? (
          <div className="readerCompare">
            <article>
              <header>原文</header>
              <pre>{originalChapter.text}</pre>
            </article>
            <article>
              <header>{language}</header>
              <pre>{chapter.text}</pre>
            </article>
          </div>
        ) : (
          <pre className={chapter ? '' : 'reader-placeholder'}>{chapter?.text ?? '选择已下载章节后显示正文。'}</pre>
        )}
      </Panel>
    </div>
  );
}
