import { useEffect, useId, useRef, useState } from 'react';
import { Search, Trash2, FileText } from 'lucide-react';
import { deleteDraft, listDrafts } from '../core/drafts';
import type { DraftPage, DraftSummary } from '../core/drafts';
import { Dialog } from './Dialog';
import { Filename } from './Filename';

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function dateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Details({ item }: { item: DraftSummary }) {
  return (
    <span className="recent-details">
      {item.pageCount > 0 && <span>{item.pageCount} 页</span>}
      <span>{bytesLabel(item.byteLength)}</span>
      <span>{item.markerCount} 个标注</span>
      <time dateTime={new Date(item.updatedAt).toISOString()}>{dateLabel(item.updatedAt)}</time>
    </span>
  );
}

function visibleCount() {
  const narrow = window.innerWidth <= 720;
  return Math.max(
    3,
    Math.min(narrow ? 5 : 8, Math.floor((window.innerHeight - (narrow ? 480 : 390)) / 40)),
  );
}

function RecentPicker({
  revision,
  busy,
  protectedId,
  onClose,
  onOpen,
  onDelete,
}: {
  protectedId?: string;
  revision: string;
  busy: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (item: DraftSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<DraftPage>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const generation = useRef(0),
    results = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    setPage({ items: [], total: 0 });
    setActive(0);
    const timer = window.setTimeout(
      () => {
        void listDrafts(undefined, 40, query)
          .then((value) => {
            if (generation.current === request) setPage(value);
          })
          .catch((error) => {
            if (generation.current === request)
              setError(error instanceof Error ? error.message : String(error));
          })
          .finally(() => {
            if (generation.current === request) setLoading(false);
          });
      },
      query ? 120 : 0,
    );
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [query, revision]);

  useEffect(() => {
    results.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  async function loadMore() {
    if (loading || !page.cursor) return;
    const request = generation.current;
    setLoading(true);
    setError('');
    try {
      const next = await listDrafts(page.cursor, 40, query);
      if (request === generation.current)
        setPage((current) => ({ ...next, items: [...current.items, ...next.items] }));
    } catch (error) {
      if (request === generation.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  function open(id: string) {
    if (busy || loading) return;
    onClose();
    onOpen(id);
  }

  return (
    <Dialog
      title="打开最近工作"
      className="recent-picker"
      initialFocus="[data-recent-search]"
      onClose={onClose}
    >
      <div className="recent-search">
        <Search size={17} aria-hidden="true" />
        <input
          data-recent-search
          value={query}
          placeholder="输入文件名，搜索最近工作…"
          aria-label="搜索最近工作"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={page.items[active] ? `${listId}-${active}` : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (page.items.length)
                setActive(
                  (value) =>
                    (value + (event.key === 'ArrowDown' ? 1 : -1) + page.items.length) %
                    page.items.length,
                );
            } else if (event.key === 'Enter' && page.items[active]) {
              event.preventDefault();
              open(page.items[active].id);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="recent-picker-caption">
        <span>{query.trim() ? '搜索结果' : '最近打开'}</span>
        <span>{page.total} 份本机草稿</span>
      </div>
      <div
        className="recent-picker-results"
        ref={results}
        role="listbox"
        id={listId}
        aria-label="最近工作文件"
        aria-busy={loading}
      >
        {page.items.map((item, index) => (
          <div
            key={item.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={active === index}
            className={`recent-picker-option ${active === index ? 'active' : ''}`}
            onPointerMove={() => setActive(index)}
            onClick={() => open(item.id)}
          >
            <FileText size={15} aria-hidden="true" />
            <span className="recent-name">
              <Filename value={`${item.name}.pdf`} fit />
            </span>
            <Details item={item} />
            {item.id !== protectedId ? (
              <button
                className="icon-btn recent-picker-delete"
                disabled={busy || loading}
                tabIndex={active === index ? 0 : -1}
                aria-label={`删除草稿 ${item.name}.pdf`}
                title="删除草稿"
                onFocus={() => setActive(index)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!busy && !loading) onDelete(item);
                }}
              >
                <Trash2 size={14} />
              </button>
            ) : (
              <span className="recent-picker-action-space" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      {!loading && !page.items.length && !error && (
        <p className="recent-picker-empty" role="status">
          {query.trim() ? '没有找到匹配的文件，试试其他关键词。' : '还没有最近工作，先打开一份 PDF 吧。'}
        </p>
      )}
      {error && (
        <p role="alert" className="recent-error">
          {error}
        </p>
      )}
      {loading && (
        <p className="recent-picker-loading" role="status">
          正在读取…
        </p>
      )}
      {page.cursor && (
        <button className="recent-load-more" disabled={loading} onClick={() => void loadMore()}>
          显示更多结果
        </button>
      )}
      <footer className="recent-picker-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> 选择 <kbd>Enter</kbd> 打开
        </span>
      </footer>
    </Dialog>
  );
}

export function RecentDocuments({
  active = true,
  hostOverlayOpen = false,
  activeId,
  revision,
  busy,
  home,
  protectedId,
  pickerOpen,
  onPickerOpenChange: setPickerOpen,
  onOpen,
  onDeleted,
}: {
  active?: boolean;
  hostOverlayOpen?: boolean;
  activeId?: string;
  protectedId?: string;
  revision: number;
  busy: boolean;
  home: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [limit, setLimit] = useState(visibleCount);
  const [page, setPage] = useState<DraftPage & { revision?: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [removing, setRemoving] = useState<DraftSummary | null>(null),
    [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [touchPreview, setTouchPreview] = useState<string>();
  const previewTap = useRef(false);
  const current = useRef({ busy, active, hostOverlayOpen });
  current.current = { busy, active, hostOverlayOpen };

  useEffect(() => {
    const resize = () => setLimit(visibleCount());
    window.addEventListener('resize', resize);
    const key = (event: KeyboardEvent) => {
      if (!current.current.active || current.current.hostOverlayOpen) return;
      if (
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'p'
      )
        return;
      event.preventDefault();
      if (!current.current.busy && !document.querySelector('.folio-workbench [role="dialog"]'))
        setPickerOpen(true);
    };
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('keydown', key);
    };
  }, [setPickerOpen]);

  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void listDrafts(undefined, limit)
      .then((value) => {
        if (!cancelled) setPage({ ...value, revision });
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [home, limit, revision, refresh]);

  async function confirmDelete() {
    if (!removing || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteDraft(removing.id);
      onDeleted(removing.id);
      setRemoving(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {home && page.revision === revision && page.items.length > 0 && (
        <section className="recent-documents" aria-label="最近" aria-busy={loading}>
          <header className="recent-heading">
            <h2>最近</h2>
            <span>{page.total} 份草稿</span>
          </header>
          {error ? (
            <div className="recent-error" role="alert">
              {error}
              <button onClick={() => setRefresh((value) => value + 1)}>重新读取</button>
            </div>
          ) : (
            <div className="recent-list">
              {page.items.map((item) => (
                <div
                  key={item.id}
                  className={`recent-row ${touchPreview === item.id ? 'is-peeking' : ''}`}
                >
                  <button
                    className="recent-open"
                    disabled={busy || loading}
                    onPointerDown={(event) => {
                      previewTap.current =
                        event.pointerType === 'touch' && touchPreview !== item.id;
                      if (event.pointerType === 'touch') setTouchPreview(item.id);
                    }}
                    onClick={(event) => {
                      if (event.detail > 0 && previewTap.current) {
                        previewTap.current = false;
                        return;
                      }
                      onOpen(item.id);
                    }}
                    aria-label={`${item.id === activeId ? '恢复上次工作' : '继续编辑'} ${item.name}.pdf，${item.markerCount} 个标注`}
                  >
                    <span className="recent-name">
                      <Filename value={`${item.name}.pdf`} fit />
                    </span>
                    <Details item={item} />
                  </button>
                  <button
                    className="icon-btn recent-delete"
                    disabled={busy || loading}
                    aria-label={`删除草稿 ${item.name}.pdf`}
                    onClick={() => {
                      setDeleteError('');
                      setRemoving(item);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {page.total > limit && (
            <button
              className="recent-more"
              disabled={busy || loading}
              onClick={() => setPickerOpen(true)}
              aria-keyshortcuts="Meta+P Control+P"
            >
              更多
            </button>
          )}
          <p className="recent-touch-hint">轻触查看详情，再次轻触打开</p>
        </section>
      )}
      {pickerOpen && (
        <RecentPicker
          revision={`${revision}:${refresh}`}
          busy={busy}
          protectedId={protectedId}
          onClose={() => setPickerOpen(false)}
          onOpen={onOpen}
          onDelete={(item) => {
            setPickerOpen(false);
            setDeleteError('');
            setRemoving(item);
          }}
        />
      )}
      {removing && (
        <Dialog
          title="删除这份草稿？"
          descriptionId="delete-recent-description"
          initialFocus="[data-delete-cancel]"
          closeDisabled={deleting}
          onClose={() => {
            if (!deleting) setRemoving(null);
          }}
        >
          <p className="dialog-description" id="delete-recent-description">
            将删除“{removing.name}.pdf”的本机副本、标注和查看位置，无法撤销。磁盘上的原文件不受影响，其他草稿会保留。
          </p>
          {deleteError && (
            <p role="alert" className="form-error">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <button data-delete-cancel disabled={deleting} onClick={() => setRemoving(null)}>
              保留草稿
            </button>
            <button
              className="danger-button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? '正在删除…' : '删除草稿'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
