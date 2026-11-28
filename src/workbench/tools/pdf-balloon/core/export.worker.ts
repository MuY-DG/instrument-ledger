/// <reference lib="webworker" />
import { readEditablePdf, writePdf } from './editable-pdf';
import type { PdfWorkerRequest } from './pdf-format';

self.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  try {
    const request = event.data;
    const result = request.action === 'import'
      ? await readEditablePdf(request.bytes)
      : { bytes: await writePdf(request.bytes, request.markers, request.options) };
    self.postMessage(result, { transfer: [result.bytes.buffer] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({
      error: /encrypt/i.test(message)
        ? '此 PDF 受加密保护。可导出图片，或先在原 PDF 工具中解除保护后再保存标注。'
        : message,
    });
  }
};
