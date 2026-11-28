import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Marker, PdfSession } from '../types';
import type { PdfMarker, PdfSaveOptions } from './pdf-format';
import { runPdfWorker } from './pdf-worker-client';
import { exportDimensions, exportScale } from './geometry';
import { normalizeImageBudgetMode, resolveImageBudget, type ImageBudgetMode } from './image-budget';
import { imageDpiLimit, imagePlan } from './image-plan';
import { saveExportBlob, type SaveFileResult } from '../../../desktopBridge';

export interface ImageOptions {
  format: 'png' | 'jpg' | 'webp';
  dpi: string;
  quality: number;
  pages: number[];
  annotations: boolean;
  budgetMode: ImageBudgetMode;
}

export async function download(blob: Blob, name: string): Promise<SaveFileResult> {
  return saveExportBlob(blob, name);
}

export async function exportPdf(
  session: PdfSession,
  markers: Marker[],
  signal: AbortSignal,
  options: PdfSaveOptions = {},
) {
  const positions: PdfMarker[] = [];
  const viewports = new Map<
    number,
    ReturnType<Awaited<ReturnType<typeof session.doc.getPage>>['getViewport']>
  >();
  for (const a of markers) {
    signal.throwIfAborted();
    let viewport = viewports.get(a.page);
    if (!viewport) {
      viewport = (await session.doc.getPage(a.page)).getViewport({ scale: 1 });
      viewports.set(a.page, viewport);
    }
    const [pdfX, pdfY] = viewport.convertToPdfPoint(a.x, a.y);
    positions.push({
      ...a,
      pdfX,
      pdfY,
      pdfScale: Math.hypot(viewport.transform[0], viewport.transform[1]),
      rotation: viewport.rotation,
    });
  }
  signal.throwIfAborted();
  const result = await runPdfWorker(
    { action: 'export', bytes: session.bytes, markers: positions, options },
    signal,
  );
  return new Blob([result.bytes], { type: 'application/pdf' });
}

const dpiCache = new WeakMap<PdfSession, Map<number, number>>();

export async function imageDpi(session: PdfSession, number: number) {
  const cache = dpiCache.get(session) ?? new Map<number, number>();
  dpiCache.set(session, cache);
  if (cache.has(number)) return cache.get(number)!;
  const { fnArray, argsArray } = await (await session.doc.getPage(number)).getOperatorList();
  let matrix = [1, 0, 0, 1, 0, 0],
    best = 0;
  const stack: number[][] = [];
  const multiply = (m: number[], n: number[]) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i],
      a = argsArray[i];
    if (op === OPS.save) stack.push(matrix);
    else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) matrix = stack.pop() ?? matrix;
    else if (op === OPS.transform) matrix = multiply(matrix, a);
    else if (op === OPS.paintFormXObjectBegin) {
      stack.push(matrix);
      if (a[0]) matrix = multiply(matrix, a[0]);
    } else if (
      [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op)
    ) {
      const w = op === OPS.paintImageXObject ? a[1] : a[0]?.width,
        h = op === OPS.paintImageXObject ? a[2] : a[0]?.height;
      const wp = Math.hypot(matrix[0], matrix[1]),
        hp = Math.hypot(matrix[2], matrix[3]);
      if (w && h && wp > 1 && hp > 1) best = Math.max(best, (w / wp) * 72, (h / hp) * 72);
    }
  }
  const dpi = best ? Math.min(1600, Math.max(300, Math.ceil(best / 50) * 50)) : 400;
  cache.set(number, dpi);
  return dpi;
}

function drawMarkers(ctx: CanvasRenderingContext2D, markers: Marker[], scale: number) {
  for (const a of markers) {
    const bw = a.borderColor ? a.borderWidth : 0;
    ctx.beginPath();
    ctx.arc(a.x * scale, a.y * scale, Math.max(0, ((a.size - bw) / 2) * scale), 0, Math.PI * 2);
    if (a.fillColor) {
      ctx.fillStyle = a.fillColor;
      ctx.fill();
    }
    if (bw && a.borderColor) {
      ctx.strokeStyle = a.borderColor;
      ctx.lineWidth = bw * scale;
      ctx.stroke();
    }
    ctx.fillStyle = a.textColor;
    ctx.font = `bold ${a.textSize * scale}px Arial,Helvetica,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(a.number), a.x * scale, (a.y + a.textSize * 0.358) * scale);
  }
}

export async function exportImages(
  session: PdfSession,
  markers: Marker[],
  options: ImageOptions,
  signal: AbortSignal,
  progress: (value: number, label: string) => void,
) {
  const budget = resolveImageBudget(normalizeImageBudgetMode(options.budgetMode));
  if (options.dpi !== 'auto') {
    const dpi = Number(options.dpi);
    if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('请选择有效的导出 DPI');
    for (const number of options.pages) {
      const limit = imageDpiLimit(session.pages[number - 1], options.format, budget);
      if (dpi > limit)
        throw new Error(
          `当前${budget.label}档下第 ${number} 页最高支持 ${limit} DPI，请调整档位或降低清晰度${options.format === 'webp' ? '；超大图片可改用 PNG / JPEG 分块导出' : ''}`,
        );
    }
  }
  const { default: JSZip } = await import('jszip');
  const zip = options.pages.length > 1 ? new JSZip() : null;
  let total = 0,
    capped = false,
    single: Blob | null = null;
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[options.format];
  for (let i = 0; i < options.pages.length; i++) {
    signal.throwIfAborted();
    const number = options.pages[i],
      info = session.pages[number - 1],
      page = await session.doc.getPage(number);
    progress(
      (i / options.pages.length) * 90,
      `正在导出第 ${number} 页（${i + 1}/${options.pages.length}）`,
    );
    const dpi = options.dpi === 'auto' ? await imageDpi(session, number) : Number(options.dpi);
    let scale = options.dpi === 'auto' ? exportScale(info, dpi, budget) : dpi / 72;
    capped ||= scale < dpi / 72;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 3 && !blob; attempt++) {
      signal.throwIfAborted();
      if (options.format !== 'webp' && imagePlan(info, scale, options.format, budget).tiled) {
        const { renderStripes } = await import('./image-stripes');
        const pageMarkers = options.annotations ? markers.filter((a) => a.page === number) : [];
        // Errors are surfaced at the requested resolution; no partially encoded file is downloaded.
        blob = await renderStripes(
          page,
          scale,
          options.format,
          options.quality,
          scale * 72,
          budget,
          128 * 1024 * 1024 - total,
          signal,
          (ctx) => drawMarkers(ctx, pageMarkers, scale),
          (fraction) =>
            progress(
              ((i + fraction) / options.pages.length) * 90,
              `正在分块导出第 ${number} 页（${Math.floor(fraction * 100)}%）`,
            ),
        );
        break;
      }
      const canvas = document.createElement('canvas'),
        viewport = page.getViewport({ scale }),
        dimensions = exportDimensions(viewport, 1);
      let task: ReturnType<typeof page.render> | undefined;
      const abort = () => task?.cancel();
      try {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        task = page.render({ canvas, viewport, background: '#ffffff' });
        signal.addEventListener('abort', abort, { once: true });
        await task.promise;
        signal.throwIfAborted();
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建导出画布');
        if (options.annotations)
          drawMarkers(
            ctx,
            markers.filter((a) => a.page === number),
            scale,
          );
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, mime, options.format === 'png' ? undefined : options.quality),
        );
      } catch (error) {
        signal.throwIfAborted();
        if (attempt === 2 || options.dpi !== 'auto') throw error;
      } finally {
        signal.removeEventListener('abort', abort);
        canvas.width = canvas.height = 0;
      }
      if (!blob) {
        if (options.dpi !== 'auto')
          throw new Error(`无法按 ${dpi} DPI 生成图片，请降低清晰度后重试`);
        scale *= 0.75;
        capped = true;
      }
    }
    if (!blob) throw new Error('无法生成图片，请降低 DPI 后重试');
    signal.throwIfAborted();
    if (session.resourceErrors.size)
      throw new Error('字体资源不完整，已停止导出以避免缺字。请重新加载文档后重试。');
    total += blob.size;
    if (total > 128 * 1024 * 1024) throw new Error('本次图片超过 128 MB，请分批选择页面导出');
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    if (zip) zip.file(`${session.name}_p${String(number).padStart(3, '0')}.${ext}`, blob);
    else single = blob;
  }
  progress(95, zip ? '正在打包图片…' : '图片生成完成');
  const result = zip
    ? await zip.generateAsync({ type: 'blob', compression: 'STORE' }, () => signal.throwIfAborted())
    : single!;
  signal.throwIfAborted();
  const ext = zip
    ? 'zip'
    : result.type === 'image/png'
      ? 'png'
      : result.type === 'image/webp'
        ? 'webp'
        : 'jpg';
  return {
    blob: result,
    name: `${session.name}_${zip ? '图片' : 'p' + options.pages[0]}.${ext}`,
    capped,
  };
}
