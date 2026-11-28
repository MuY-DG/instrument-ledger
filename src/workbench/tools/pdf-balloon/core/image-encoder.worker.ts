/// <reference lib="webworker" />
import { JPEGStreamEncoder } from './codecs/jpeg-stream.js';
import { PNGStreamEncoder } from './codecs/png-stream';

export type EncoderRequest =
  | { kind: 'start'; width: number; height: number; format: 'png' | 'jpg'; quality: number; dpi: number; maxBytes: number }
  | { kind: 'rows'; width: number; height: number; data: Uint8Array<ArrayBuffer> }
  | { kind: 'finish' };
export interface EncoderReply { error?: string; blob?: Blob }

let encoder: JPEGStreamEncoder | PNGStreamEncoder | null = null;
let parts: Uint8Array<ArrayBuffer>[] = [], size = 0, maxBytes = 0, mime = '';
self.onmessage = (event: MessageEvent<EncoderRequest>) => {
  try {
    const message = event.data;
    if (message.kind === 'start') {
      if (encoder) throw new Error('编码器已启动');
      maxBytes = message.maxBytes;
      const emit = (bytes: Uint8Array<ArrayBuffer>) => {
        size += bytes.byteLength;
        if (size > maxBytes) throw new Error('本次图片超过 128 MB，请降低 DPI 或分批导出');
        parts.push(bytes);
      };
      mime = message.format === 'png' ? 'image/png' : 'image/jpeg';
      encoder = message.format === 'png'
        ? new PNGStreamEncoder(message.width, message.height, message.dpi, emit)
        : new JPEGStreamEncoder(message.quality * 100, message.width, message.height, message.dpi, emit);
    } else if (message.kind === 'rows') {
      if (!encoder) throw new Error('编码器未启动');
      encoder.writeRows(message);
    } else {
      if (!encoder) throw new Error('编码器未启动');
      encoder.finish();
      const blob = new Blob(parts, { type: mime });
      parts = [];
      encoder = null;
      self.postMessage({ blob } satisfies EncoderReply);
      return;
    }
    self.postMessage({} satisfies EncoderReply); // ACK: at most one stripe in flight.
  } catch (error) {
    parts = [];
    encoder = null;
    self.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies EncoderReply);
  }
};
