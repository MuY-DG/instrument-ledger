export async function fingerprint(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    signal?.throwIfAborted();
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./file-identity.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(signal?.reason ?? new DOMException('已取消', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<string>) => { finish(); resolve(event.data); };
    worker.onerror = () => { finish(); reject(new Error('无法识别 PDF 文件，请重试')); };
    const copy = bytes.slice();
    worker.postMessage(copy, [copy.buffer]);
  });
}
