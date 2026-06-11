import type { MouseEvent } from 'react';
import { Library, Trash2 } from 'lucide-react';
import { apiDelete } from '../../api.js';
import type { BookInfo } from '../../types.js';
import { Button, EmptyState, Panel, SkeletonRows } from '../components/ui.js';
import { useToast } from '../components/toast.js';

export function LibraryView({
  books,
  selectedBookUrl,
  setSelectedBookUrl,
  setActive,
  refresh,
  loading,
}: {
  books: BookInfo[];
  selectedBookUrl: string;
  setSelectedBookUrl: (value: string) => void;
  setActive: (value: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}) {
  const toast = useToast();

  async function deleteBook(book: BookInfo, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const confirmed = window.confirm(`删除《${book.title}》及其本地章节、译文和语言检测记录？`);
    if (!confirmed) return;
    try {
      await apiDelete(`/api/library/books?bookUrl=${encodeURIComponent(book.canonicalUrl)}`);
      if (selectedBookUrl === book.canonicalUrl || selectedBookUrl === book.sourceUrl) {
        setSelectedBookUrl('');
      }
      toast.success(`已删除《${book.title}》`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Panel title="本地书库">
      <table>
        <thead>
          <tr>
            <th>书名</th>
            <th>作者</th>
            <th>分类</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        {loading && books.length === 0 ? (
          <SkeletonRows rows={5} cols={5} />
        ) : (
          <tbody>
            {books.map((book) => (
              <tr
                key={book.canonicalUrl}
                onClick={() => {
                  setSelectedBookUrl(book.canonicalUrl);
                  setActive('preview');
                }}
              >
                <td>
                  <div className="bookCell">
                    <strong>{book.title}</strong>
                  </div>
                </td>
                <td>{book.author}</td>
                <td>{book.category}</td>
                <td>{book.status}</td>
                <td>
                  <div className="tableActions">
                    <Button variant="danger" onClick={(event) => deleteBook(book, event)} title="删除本地书籍">
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
      {!loading && books.length === 0 && <EmptyState icon={Library} title="还没有已下载或已导入的书籍" hint="在搜索页导入授权目录后入库。" />}
    </Panel>
  );
}
