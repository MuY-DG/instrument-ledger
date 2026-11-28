import type { PDFPageProxy } from 'pdfjs-dist';
import type { ImageBudget } from './image-budget';
import { imagePlan } from './image-plan';
import type { EncoderReply, EncoderRequest } from './image-encoder.worker';

export async function renderStripes(
  page: PDFPageProxy,
  scale: number,
  format: 'png' | 'jpg',
  quality: number,
  dpi: number,
  budget: ImageBudget,
  maxBytes: number,
  signal: AbortSignal,
  draw: (ctx: CanvasRenderingContext2D) => void,
  progress: (fraction: number) => void,
) {
  signal.throwIfAborted();
  const viewport = page.getViewport({ scale });
  const plan = imagePlan(viewport, 1, format, budget);
  const worker = new Worker(new URL('./image-encoder.worker.ts', import.meta.url), { type: 'module' });
  let pending: { resolve: (value: EncoderReply) => void; reject: (error: Error) => void } | null = null;
  let failure: Error | null = null;
  const abort = () => {
    worker.terminate();
    pending?.reject(new DOMException('已取消导出', 'AbortError'));
    pending = null;
  };
  signal.addEventListener('abort', abort, { once: true });
  worker.onmessage = (event: MessageEvent<EncoderReply>) => {
    const current = pending;
    pending = null;
    if (event.data.error) current?.reject(new Error(event.data.error));
    else current?.resolve(event.data);
  };
  worker.onerror = (event) => {
    failure = new Error(event.message || '图片编码任务启动失败');
    pending?.reject(failure);
    pending = null;
  };
  worker.onmessageerror = () => {
    failure = new Error('图片编码数据传输失败');
    pending?.reject(failure);
    pending = null;
  };
  const request = (message: EncoderRequest, transfers: Transferable[] = []) => {
    signal.throwIfAborted();
    if (failure) throw failure;
    return new Promise<EncoderReply>((resolve, reject) => {
      pending = { resolve, reject };
      worker.postMessage(message, transfers);
    });
  };
  try {
    await request({ kind: 'start', width: plan.width, height: plan.height, format, quality, dpi, maxBytes });
    for (let y = 0; y < plan.height; y += plan.rows) {
      signal.throwIfAborted();
      const rows = Math.min(plan.rows, plan.height - y);
      const stripe = new Uint8Array(plan.width * rows * 4);
      for (let x = 0; x < plan.width; x += plan.tileWidth) {
        signal.throwIfAborted();
        const width = Math.min(plan.tileWidth, plan.width - x);
        // Render a 2px gutter and crop it away, preserving antialiasing at seams.
        const left = Math.max(0, x - 2), top = Math.max(0, y - 2);
        const right = Math.min(plan.width, x + width + 2), bottom = Math.min(plan.height, y + rows + 2);
        const canvas = document.createElement('canvas');
        let task: ReturnType<typeof page.render> | undefined;
        const cancel = () => task?.cancel();
        try {
          canvas.width = right - left;
          canvas.height = bottom - top;
          task = page.render({ canvas, viewport, transform: [1, 0, 0, 1, -left, -top], background: '#ffffff' });
          signal.addEventListener('abort', cancel, { once: true });
          await task.promise;
          signal.throwIfAborted();
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('无法创建分块画布');
          ctx.save();
          ctx.translate(-left, -top);
          draw(ctx);
          ctx.restore();
          const data = ctx.getImageData(x - left, y - top, width, rows).data;
          for (let row = 0; row < rows; row++)
            stripe.set(data.subarray(row * width * 4, (row + 1) * width * 4), (row * plan.width + x) * 4);
        } finally {
          signal.removeEventListener('abort', cancel);
          canvas.width = canvas.height = 0;
        }
        progress((y + rows * Math.min(1, (x + width) / plan.width)) / plan.height);
      }
      // Transfer, then await the encoder ACK before allocating the next stripe.
      await request({ kind: 'rows', width: plan.width, height: rows, data: stripe }, [stripe.buffer]);
    }
    const result = await request({ kind: 'finish' });
    signal.throwIfAborted();
    if (!result.blob) throw new Error('未收到分块编码结果');
    return result.blob;
  } finally {
    signal.removeEventListener('abort', abort);
    worker.terminate();
  }
}
