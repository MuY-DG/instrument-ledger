import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelsTopLeft, List, LockKeyhole, Circle } from 'lucide-react';
import type { Marker, PdfSession } from '../types';
import { PageCanvas } from './PageCanvas';
export function Sidebar({
  open,
  session,
  markers,
  currentPage,
  onJump,
  selected,
  onSelect,
  tab,
  onTab,
}: {
  open: boolean;
  session: PdfSession | null;
  markers: Marker[];
  currentPage: number;
  onJump: (page: number) => void;
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  tab: 'pages' | 'markers';
  onTab: (tab: 'pages' | 'markers') => void;
}) {
  const [top, setTop] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const rowHeight = 132;
  useEffect(() => {
    const el = scroll.current;
    if (!el || !open || tab !== 'pages' || !session) return;
    const itemTop = (currentPage - 1) * rowHeight;
    if (itemTop < el.scrollTop || itemTop + rowHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = itemTop;
    setTop(el.scrollTop);
  }, [currentPage, tab, session?.id, open]);
  const counts = useMemo(() => {
    const result = new Map<number, number>();
    markers.forEach((a) => result.set(a.page, (result.get(a.page) ?? 0) + 1));
    return result;
  }, [markers]);
  const start = Math.max(0, Math.floor(top / rowHeight) - 1),
    end = Math.min(session?.pages.length ?? 0, start + 9);
  return (
    <aside className="sidebar">
      <div className="side-tabs">
        <button className={tab === 'pages' ? 'active' : ''} onClick={() => onTab('pages')}
          aria-label={`页面 ${session?.pages.length ?? 0}`} title="页面" aria-pressed={tab === 'pages'}>
          <PanelsTopLeft size={15} />
          <span className="tool-window-name">页面</span><span className="tool-window-count">{session?.pages.length ?? 0}</span>
        </button>
        <button className={tab === 'markers' ? 'active' : ''} onClick={() => onTab('markers')}
          aria-label={`标注 ${markers.length}`} title="标注" aria-pressed={tab === 'markers'}>
          <List size={15} />
          <span className="tool-window-name">标注</span><span className="tool-window-count">{markers.length}</span>
        </button>
      </div>
      <div ref={scroll} className="side-scroll" onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
        {!session ? (
          <div className="side-placeholder">
            <PanelsTopLeft size={28} />
            <p>
              打开 PDF 后<br />
              在这里浏览页面
            </p>
          </div>
        ) : tab === 'pages' ? (
          <div style={{ height: session.pages.length * rowHeight, position: 'relative' }}>
            {session.pages.slice(start, end).map((p, j) => {
              const scale = Math.min(124 / p.width, 88 / p.height),
                index = start + j;
              return (
                <button
                  className={`thumbnail-card ${currentPage === p.number ? 'current' : ''}`}
                  key={`${session.id}-${p.number}`}
                  style={{ position: 'absolute', top: index * rowHeight, left: 10, right: 10 }}
                  onClick={() => onJump(p.number)}
                  aria-label={`前往第 ${p.number} 页`}
                  aria-current={currentPage === p.number ? 'page' : undefined}
                >
                  <div
                    className="thumbnail-paper"
                    style={{ width: p.width * scale, height: p.height * scale }}
                  >
                    {open && <PageCanvas
                      session={session}
                      index={index}
                      scale={scale}
                      viewport={{ x: 0, y: 0, width: p.width, height: p.height }}
                      thumbnail
                    />}
                  </div>
                  <div className="thumbnail-caption">
                    <span>第 {p.number} 页</span>
                    {counts.get(p.number) ? (
                      <span className="marker-count">
                        <Circle size={10} />
                        {counts.get(p.number)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : !markers.length ? (
          <div className="side-placeholder">
            <Circle size={28} />
            <p>
              还没有标注
              <br />按 N 开始添加
            </p>
          </div>
        ) : (
          <div className="marker-list">
            {markers.map((a) => (
              <button
                key={a.id}
                className={selected.has(a.id) ? 'selected' : ''}
                aria-label={`序号 ${a.number}，第 ${a.page} 页`}
                onClick={() => {
                  onSelect(new Set([a.id]));
                  onJump(a.page);
                }}
              >
                <span
                  className="number-badge"
                  style={{ color: a.textColor, borderColor: a.borderColor ?? '#d4d4d4' }}
                >
                  {a.number}
                </span>
                <span className="marker-row-page">第 {a.page} 页</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="local-note">
        <LockKeyhole size={13} />
        <span>PDF 文件不上传</span>
      </div>
    </aside>
  );
}
