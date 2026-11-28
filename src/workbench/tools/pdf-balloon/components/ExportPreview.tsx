import { useEffect, useRef, useState } from 'react';
import type { Marker, PdfSession } from '../types';
import { PageCanvas } from './PageCanvas';
import { MarkerGlyph } from './MarkerGlyph';

export function ExportPreview({
  session,
  pageNumber,
  markers,
  annotations,
}: {
  session: PdfSession;
  pageNumber: number;
  markers: Marker[];
  annotations: boolean;
}) {
  const page = session.pages[pageNumber - 1];
  const paper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = paper.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [pageNumber]);
  const scale = width / page.width;
  return (
    <div
      className="export-preview-paper"
      ref={paper}
      style={{ width: Math.min(260, 184 * page.width / page.height), aspectRatio: `${page.width} / ${page.height}` }}
      role="img"
      aria-label={`第 ${pageNumber} 页缩略预览${annotations ? '，包含圆圈标注' : '，不含圆圈标注'}`}
    >
      {width > 0 && (
        <PageCanvas
          key={`${session.id}-${pageNumber}`}
          session={session}
          index={pageNumber - 1}
          scale={scale}
          viewport={{ x: 0, y: 0, width: page.width, height: page.height }}
          thumbnail
        />
      )}
      {annotations && markers.filter((marker) => marker.page === pageNumber).map((marker) => (
        <span
          key={marker.id}
          className="export-preview-marker"
          style={{
            left: `${marker.x / page.width * 100}%`,
            top: `${marker.y / page.height * 100}%`,
            width: marker.size * scale,
            height: marker.size * scale,
          }}
        >
          <MarkerGlyph style={marker} number={marker.number} />
        </span>
      ))}
    </div>
  );
}
