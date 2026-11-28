import { memo, useEffect, useRef, useState } from 'react';
import { RotateCw, AlertTriangle } from 'lucide-react';
import type { RenderTask, PDFPageProxy } from 'pdfjs-dist';
import type { PdfSession, Rect } from '../types';
import { contains, renderRegion } from '../core/geometry';
import { renderQueue } from '../core/renderQueue';
interface Props {
  session: PdfSession;
  index: number;
  scale: number;
  viewport: Rect;
  thumbnail?: boolean;
  onReady?: (sessionId: string) => void;
}
export const PageCanvas = memo(
  function PageCanvas({ session, index, scale, viewport, thumbnail = false, onReady }: Props) {
    const host = useRef<HTMLDivElement>(null),
      completed = useRef<{ scale: number; region: Rect } | null>(null);
    const [error, setError] = useState(''),
      [retry, setRetry] = useState(0),
      [ready, setReady] = useState(false);
    const latest = useRef({ scale });
    latest.current = { scale };
    useEffect(() => {
      const element = host.current;
      if (!element) return;
      const controller = new AbortController();
      let task: RenderTask | undefined,
        page: PDFPageProxy | undefined,
        canvas: HTMLCanvasElement | undefined;
      const { region, output } = renderRegion(
        session.pages[index],
        scale,
        viewport,
        thumbnail ? 1 : devicePixelRatio,
      );
      if (!region.width || !region.height) return;
      const need = {
        x: Math.max(0, viewport.x),
        y: Math.max(0, viewport.y),
        width: Math.max(
          0,
          Math.min(session.pages[index].width - Math.max(0, viewport.x), viewport.width),
        ),
        height: Math.max(
          0,
          Math.min(session.pages[index].height - Math.max(0, viewport.y), viewport.height),
        ),
      };
      if (completed.current?.scale === scale && contains(completed.current.region, need)) {
        onReady?.(session.id);
        return;
      }
      const timer = setTimeout(
        () => {
          void renderQueue
            .schedule(
              async () => {
                page = await session.doc.getPage(index + 1);
                if (controller.signal.aborted) return;
                let last: unknown;
                for (let attempt = 0; attempt < 2; attempt++) {
                  if (controller.signal.aborted) return;
                  canvas = document.createElement('canvas');
                  const k = scale * output * (attempt ? 0.65 : 1);
                  canvas.width = Math.ceil(region.width * k);
                  canvas.height = Math.ceil(region.height * k);
                  canvas.dataset.pdfCanvas = thumbnail ? 'thumbnail' : 'page';
                  canvas.style.left = `${region.x * latest.current.scale}px`;
                  canvas.style.top = `${region.y * latest.current.scale}px`;
                  canvas.style.width = `${region.width * latest.current.scale}px`;
                  canvas.style.height = `${region.height * latest.current.scale}px`;
                  try {
                    task = page.render({
                      canvas,
                      viewport: page.getViewport({
                        scale: k,
                        offsetX: -region.x * k,
                        offsetY: -region.y * k,
                      }),
                      background: '#ffffff',
                    });
                    await task.promise;
                    if (controller.signal.aborted) {
                      canvas.width = canvas.height = 0;
                      return;
                    }
                    const previous = element.querySelector('canvas');
                    element.replaceChildren(canvas);
                    if (previous) previous.width = previous.height = 0;
                    completed.current = { scale, region };
                    setError('');
                    setReady(true);
                    onReady?.(session.id);
                    return;
                  } catch (e) {
                    canvas.width = canvas.height = 0;
                    if (
                      controller.signal.aborted ||
                      (e as Error).name === 'RenderingCancelledException'
                    )
                      return;
                    last = e;
                  }
                }
                throw last;
              },
              controller.signal,
              thumbnail ? 0 : 10,
            )
            .catch((e) => {
              if (!controller.signal.aborted) {
                setError(e instanceof Error ? e.message : '无法显示此页');
                onReady?.(session.id);
              }
            });
        },
        thumbnail ? 0 : 90,
      );
      return () => {
        clearTimeout(timer);
        controller.abort();
        task?.cancel();
      };
    }, [
      session,
      index,
      scale,
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
      thumbnail,
      retry,
      onReady,
    ]);
    useEffect(() => {
      const element = host.current,
        result = completed.current;
      const canvas = element?.querySelector('canvas');
      if (canvas && result) {
        canvas.style.left = `${result.region.x * scale}px`;
        canvas.style.top = `${result.region.y * scale}px`;
        canvas.style.width = `${result.region.width * scale}px`;
        canvas.style.height = `${result.region.height * scale}px`;
      }
    }, [scale]);
    useEffect(() => {
      const element = host.current;
      return () => {
        for (const canvas of element?.querySelectorAll('canvas') ?? [])
          canvas.width = canvas.height = 0;
        void session.doc
          .getPage(index + 1)
          .then((page) => page.cleanup())
          .catch(() => {});
      };
    }, [session, index]);
    return (
      <>
        <div ref={host} className="canvas-host" />
        {!ready && !error && (
          <div className="page-loading">
            <span className="spinner" />
            {!thumbnail && '正在绘制页面'}
          </div>
        )}
        {error && (
          <div className="page-error" role="alert">
            <AlertTriangle size={18} />
            <strong>第 {index + 1} 页显示失败</strong>
            <span>{error}</span>
            <button
              onClick={() => {
                completed.current = null;
                setRetry((n) => n + 1);
              }}
            >
              <RotateCw size={14} />
              重新渲染
            </button>
          </div>
        )}
      </>
    );
  },
  (a, b) =>
    a.session === b.session &&
    a.index === b.index &&
    a.scale === b.scale &&
    a.thumbnail === b.thumbnail &&
    a.onReady === b.onReady &&
    a.viewport.x === b.viewport.x &&
    a.viewport.y === b.viewport.y &&
    a.viewport.width === b.viewport.width &&
    a.viewport.height === b.viewport.height,
);
