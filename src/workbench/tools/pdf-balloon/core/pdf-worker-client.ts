import type { PdfWorkerRequest, PdfWorkerResult } from './pdf-format';

// Keep parsing, rewriting, and cancellation off the UI thread for both directions.
export function runPdfWorker(request: PdfWorkerRequest, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<PdfWorkerResult>((resolve, reject) => {
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    const end = () => {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      end();
      reject(new DOMException('已取消 PDF 处理', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<PdfWorkerResult & { error?: string }>) => {
      end();
      event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
    };
    worker.onerror = (event) => {
      end();
      reject(new Error(event.message || 'PDF 处理任务启动失败'));
    };
    const bytes = request.bytes.slice();
    worker.postMessage({ ...request, bytes }, [bytes.buffer]);
  });
}
