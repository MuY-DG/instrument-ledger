import {
  getDocument,
  GlobalWorkerOptions,
  version,
  PasswordResponses,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import rendererUrl from 'pdfjs-dist/legacy/build/pdf.renderer.min.mjs?url';
import type { PdfSession, PageInfo, Marker } from '../types';
import { createId } from './id';
import { EDITABLE_PDF_KEY } from './pdf-format';
import { runPdfWorker } from './pdf-worker-client';

export function configurePdfJsWorkers() {
  GlobalWorkerOptions.workerSrc = workerUrl;
  (GlobalWorkerOptions as typeof GlobalWorkerOptions & { rendererSrc?: string }).rendererSrc =
    rendererUrl;
}

configurePdfJsWorkers();

export const PDF_VERSION = version;

export function getPdfAssetBase() {
  return new URL(
    `${import.meta.env.BASE_URL}${__PDF_RESOURCE_PATH__}/`,
    window.location.href,
  ).href;
}

const assetBase = getPdfAssetBase();

/* ============================================================================
 * Bounded In-Memory LRU Cache for PDF.js Static Resources (cmaps/fonts/wasm)
 * Accelerates repeated opens & switches of Chinese GBK/CJK engineering drawings.
 * Always returns `.slice()` because PDF.js transfers buffers to its Web Worker.
 * ========================================================================== */

const MAX_RESOURCE_CACHE_BYTES = 16 * 1024 * 1024; // 16 MiB
const MAX_RESOURCE_CACHE_ENTRIES = 128;
const resourceCache = new Map<string, Uint8Array>();
let resourceCacheBytes = 0;

function getCachedResource(key: string): Uint8Array | null {
  const hit = resourceCache.get(key);
  if (!hit) return null;
  // Refresh LRU recency
  resourceCache.delete(key);
  resourceCache.set(key, hit);
  return hit.slice();
}

function putCachedResource(key: string, data: Uint8Array): void {
  if (data.byteLength === 0 || data.byteLength > MAX_RESOURCE_CACHE_BYTES / 2) return;
  const existing = resourceCache.get(key);
  if (existing) {
    resourceCacheBytes -= existing.byteLength;
    resourceCache.delete(key);
  }
  while (
    resourceCache.size >= MAX_RESOURCE_CACHE_ENTRIES ||
    resourceCacheBytes + data.byteLength > MAX_RESOURCE_CACHE_BYTES
  ) {
    const oldestKey = resourceCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestVal = resourceCache.get(oldestKey);
    if (oldestVal) resourceCacheBytes -= oldestVal.byteLength;
    resourceCache.delete(oldestKey);
  }
  const copy = data.slice();
  resourceCache.set(key, copy);
  resourceCacheBytes += copy.byteLength;
}

export function clearPdfResourceCache(): void {
  resourceCache.clear();
  resourceCacheBytes = 0;
}

export function getPdfResourceCacheStats(): { entries: number; bytes: number; maxBytes: number } {
  return {
    entries: resourceCache.size,
    bytes: resourceCacheBytes,
    maxBytes: MAX_RESOURCE_CACHE_BYTES,
  };
}

export interface LoadOptions {
  bytes?: Uint8Array;
  signal: AbortSignal;
  compatibility?: boolean;
  password?: string;
  refreshResources?: boolean;
  onProgress: (percent: number) => void;
  onResourceError: (message: string) => void;
  requestPassword: (incorrect: boolean) => Promise<string | null>;
}

export async function openPdf(file: File, options: LoadOptions): Promise<PdfSession> {
  const { signal } = options;
  const bytes = options.bytes ?? new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const resourceErrors = new Set<string>();
  let loaded = false;

  if (options.refreshResources) {
    clearPdfResourceCache();
  }

  // PDF.js may recover from a failed font request with an incomplete canvas.
  // Record it explicitly instead of treating that canvas as a successful load.
  class LocalBinaryDataFactory {
    urls: Record<string, string>;
    constructor(urls: Record<string, string>) {
      this.urls = urls;
    }
    async fetch({ kind, filename }: { kind: string; filename: string }) {
      const cacheKey = `${kind}/${filename}`;
      if (!options.refreshResources) {
        const cached = getCachedResource(cacheKey);
        if (cached) return cached;
      }

      const url = this.urls[kind] + filename;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(url, {
            signal: loaded ? undefined : signal,
            cache: attempt || options.refreshResources ? 'reload' : 'default',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          const type = response.headers.get('content-type') || '';
          if (!buffer.byteLength || type.includes('text/html')) throw new Error('资源内容无效');
          const result = new Uint8Array(buffer);
          putCachedResource(cacheKey, result);
          return result;
        } catch (error) {
          if (!loaded) signal.throwIfAborted();
          lastError = error;
        }
      }
      const message = `无法读取应用自带的配套文件：${filename}。已自动重试，可选择“重新加载资源”再次尝试；持续失败时请修复应用资源包。`;
      resourceErrors.add(message);
      options.onResourceError(message);
      throw lastError;
    }
  }

  let password = options.password;
  const task = getDocument({
    data: bytes.slice(),
    cMapUrl: assetBase + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assetBase + 'standard_fonts/',
    wasmUrl: assetBase + 'wasm/',
    iccUrl: assetBase + 'iccs/',
    BinaryDataFactory: LocalBinaryDataFactory,
    useWorkerFetch: false,
    disableFontFace: !!options.compatibility,
    useSystemFonts: true,
    isImageDecoderSupported: !options.compatibility,
    disableWorkerRendering: !!options.compatibility,
    canvasMaxAreaInBytes: 32 * 1024 * 1024,
    password,
  });

  const abort = () => {
    void task.destroy().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });

  task.onPassword = async (update: (password: string) => void, reason: number) => {
    const answer = await options.requestPassword(reason === PasswordResponses.INCORRECT_PASSWORD);
    if (signal.aborted) return;
    if (answer === null) {
      abort();
      return;
    }
    password = answer;
    update(answer);
  };

  try {
    const doc = await task.promise;
    const { info } = await doc.getMetadata();
    const custom = (info as { Custom?: Map<string, unknown> }).Custom;
    if (custom?.has(EDITABLE_PDF_KEY)) {
      const recovered = await runPdfWorker({ action: 'import', bytes }, signal);
      signal.throwIfAborted();
      await task.destroy();
      const clean = await openPdf(
        new File([recovered.bytes], file.name, { type: 'application/pdf' }),
        { ...options, bytes: recovered.bytes },
      );
      try {
        const importedMarkers: Marker[] = [];
        for (const a of recovered.markers ?? []) {
          signal.throwIfAborted();
          const viewport = (await clean.doc.getPage(a.page)).getViewport({ scale: 1 });
          const [x, y] = viewport.convertToViewportPoint(a.pdfX, a.pdfY);
          const ratio = Math.hypot(viewport.transform[0], viewport.transform[1]) / a.pdfScale;
          importedMarkers.push({
            id: a.id,
            page: a.page,
            number: a.number,
            borderColor: a.borderColor,
            fillColor: a.fillColor,
            textColor: a.textColor,
            x,
            y,
            size: a.size * ratio,
            textSize: a.textSize * ratio,
            borderWidth: a.borderWidth * ratio,
          });
        }
        return { ...clean, importedMarkers, importedNextNumber: recovered.nextNumber };
      } catch (error) {
        await clean.doc.loadingTask.destroy();
        throw error;
      }
    }

    const pages: PageInfo[] = [];
    for (let first = 1; first <= doc.numPages; first += 6) {
      signal.throwIfAborted();
      const batch = await Promise.all(
        Array.from({ length: Math.min(6, doc.numPages - first + 1) }, async (_, j) => {
          const page = await doc.getPage(first + j),
            viewport = page.getViewport({ scale: 1 });
          return {
            number: first + j,
            width: viewport.width,
            height: viewport.height,
            rotation: viewport.rotation,
          };
        }),
      );
      pages.push(...batch);
      options.onProgress(Math.round((pages.length / doc.numPages) * 100));
    }

    signal.throwIfAborted();
    loaded = true;
    return {
      id: createId(),
      doc,
      bytes,
      pages,
      name: file.name.replace(/\.pdf$/i, ''),
      compatibility: !!options.compatibility,
      resourceErrors,
      password,
    };
  } catch (error) {
    await task.destroy().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
