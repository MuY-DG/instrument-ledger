import { api, type NativePdfDraftMeta } from '@/lib/api';
import { isTauriEnvironment } from '@/lib/themeTransition';
import type { WorkbenchCachePruneResult, WorkbenchCacheStats } from '@/types';
import type { DocumentView, Marker, PdfSession } from '../types';
import { DEFAULT_STYLE } from '../types';
import { fingerprint } from './file-identity';

export const DEFAULT_CACHE_LIMIT_MB = 1024; // 1 GB
const IDB_MIGRATION_FLAG = 'folio:native-storage-migrated:v1';

export interface Source {
  id: string;
  bytes: Uint8Array;
  name: string;
}

export interface Draft {
  sourceId: string;
  markers: Marker[];
  savedAt: number;
  view?: DocumentView;
  nextNumber?: number;
  compatibility?: boolean;
  revision: number;
}

export interface WorkspaceState {
  activeId?: string;
  screen: 'home' | 'document';
}

export interface StoredDraft {
  source: Source;
  draft: Draft;
}

export interface DraftSummary {
  id: string;
  name: string;
  updatedAt: number;
  markerCount: number;
  pageCount: number;
  byteLength: number;
}

export type DraftCursor = [number, string];

export interface DraftPage {
  items: DraftSummary[];
  cursor?: DraftCursor;
  total: number;
}

export interface SaveSourceOutcome {
  evictedCount: number;
  freedBytes: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function normalizeBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function normalizeMarker(value: unknown): Marker | null {
  if (!isRecord(value)) return null;
  const { id, page, x, y, number } = value;
  if (
    typeof id !== 'string' ||
    !id ||
    !Number.isSafeInteger(page) ||
    (page as number) < 1 ||
    !isNumber(x) ||
    !isNumber(y) ||
    !Number.isSafeInteger(number) ||
    (number as number) < 0
  )
    return null;
  const borderColor =
    typeof value.borderColor === 'string' || value.borderColor === null
      ? value.borderColor
      : DEFAULT_STYLE.borderColor;
  const fillColor =
    typeof value.fillColor === 'string' || value.fillColor === null
      ? value.fillColor
      : DEFAULT_STYLE.fillColor;
  return {
    id,
    page: page as number,
    x,
    y,
    number: number as number,
    size: isNumber(value.size) && value.size > 0 ? value.size : DEFAULT_STYLE.size,
    textSize:
      isNumber(value.textSize) && value.textSize > 0 ? value.textSize : DEFAULT_STYLE.textSize,
    borderWidth:
      isNumber(value.borderWidth) && value.borderWidth >= 0
        ? value.borderWidth
        : DEFAULT_STYLE.borderWidth,
    borderColor,
    fillColor,
    textColor: typeof value.textColor === 'string' ? value.textColor : DEFAULT_STYLE.textColor,
  };
}

function normalizeView(value: unknown): DocumentView | undefined {
  if (!isRecord(value)) return undefined;
  const { page, scale, zoomMode, x, y } = value;
  if (
    !Number.isSafeInteger(page) ||
    (page as number) < 1 ||
    !isNumber(scale) ||
    scale <= 0 ||
    (zoomMode !== 'fit' && zoomMode !== 'custom')
  )
    return undefined;
  return {
    page: page as number,
    scale,
    zoomMode,
    ...(isNumber(x) ? { x } : {}),
    ...(isNumber(y) ? { y } : {}),
  };
}

function normalizeSource(value: unknown): Source | null {
  if (!isRecord(value)) return null;
  const { id, name } = value;
  const bytes = normalizeBytes(value.bytes);
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !name || !bytes?.byteLength)
    return null;
  return { id, name, bytes };
}

function normalizeDraft(value: unknown, sourceId: string): Draft | null {
  if (!isRecord(value) || value.sourceId !== sourceId || !Array.isArray(value.markers))
    return null;
  const markers = value.markers.map(normalizeMarker);
  if (markers.some((marker) => marker === null)) return null;
  return {
    sourceId,
    markers: markers as Marker[],
    savedAt: isNumber(value.savedAt) && value.savedAt > 0 ? value.savedAt : Date.now(),
    view: normalizeView(value.view),
    nextNumber:
      Number.isSafeInteger(value.nextNumber) && (value.nextNumber as number) >= 0
        ? (value.nextNumber as number)
        : undefined,
    compatibility: typeof value.compatibility === 'boolean' ? value.compatibility : undefined,
    revision:
      Number.isSafeInteger(value.revision) && (value.revision as number) >= 0
        ? (value.revision as number)
        : 0,
  };
}

export function draftContent(markers: Marker[], nextNumber?: number) {
  return JSON.stringify([
    nextNumber,
    markers.map((m) => [
      m.id,
      m.page,
      m.x,
      m.y,
      m.number,
      m.size,
      m.textSize,
      m.borderWidth,
      m.borderColor,
      m.fillColor,
      m.textColor,
    ]),
  ]);
}

function parseNativeMeta(meta: NativePdfDraftMeta): Draft {
  let rawMarkers: unknown = [];
  try {
    rawMarkers = JSON.parse(meta.markersJson);
  } catch {
    rawMarkers = [];
  }
  const markers = Array.isArray(rawMarkers)
    ? rawMarkers.map(normalizeMarker).filter((m): m is Marker => m !== null)
    : [];

  let view: DocumentView | undefined;
  if (meta.viewJson) {
    try {
      view = normalizeView(JSON.parse(meta.viewJson));
    } catch {
      view = undefined;
    }
  }

  return {
    sourceId: meta.id,
    markers,
    savedAt: meta.updatedAt > 0 ? meta.updatedAt : Date.now(),
    view,
    nextNumber: meta.nextNumber >= 0 ? meta.nextNumber : undefined,
    compatibility: meta.compatibility,
    revision: meta.revision,
  };
}

/* ============================================================================
 * IndexedDB Fallback Engine (used in pure browser dev / tests + legacy migration)
 * ========================================================================== */

const idbStores = ['workspace', 'sources', 'drafts', 'summaries', 'fingerprints'];
let database: Promise<IDBDatabase> | undefined;

function transaction<T>(
  connection: IDBDatabase,
  names: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const validNames = names.filter((n) => connection.objectStoreNames.contains(n));
    const tx = connection.transaction(validNames, mode);
    let value: T, failure: Error | undefined;
    const fail = (error: Error) => {
      failure = error;
      tx.abort();
    };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('无法访问本机草稿'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('本机草稿操作已取消'));
    try {
      run(
        tx,
        (result) => {
          value = result;
        },
        fail,
      );
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('folio-local-drafts', 3);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('请关闭其他旧版 Folio 窗口，再重新打开以升级本机草稿'));
    };
    request.onupgradeneeded = () => {
      const connection = request.result;
      for (const name of idbStores) {
        if (!connection.objectStoreNames.contains(name)) connection.createObjectStore(name);
      }
      // Clean up deprecated thumbnails object store if upgrading from v2
      if (connection.objectStoreNames.contains('thumbnails')) {
        connection.deleteObjectStore('thumbnails');
      }
      const tx = request.transaction!;
      const summaries = tx.objectStore('summaries');
      if (!summaries.indexNames.contains('recent')) {
        summaries.createIndex('recent', ['updatedAt', 'id']);
      }
      const fingerprints = tx.objectStore('fingerprints');
      if (!fingerprints.indexNames.contains('document')) {
        fingerprints.createIndex('document', 'id');
      }
      const workspace = tx.objectStore('workspace');
      const source = workspace.get('source'),
        draft = workspace.get('draft'),
        screen = workspace.get('screen');
      screen.onsuccess = () => {
        const original = normalizeSource(source.result);
        const previous = original ? normalizeDraft(draft.result, original.id) : null;
        if (!source.result && !draft.result) return;
        if (!original || !previous) {
          workspace.put('旧版草稿不完整或已损坏，请重新导入 PDF', 'migrationError');
          return;
        }
        tx.objectStore('sources').put(original, original.id);
        tx.objectStore('drafts').put(previous, original.id);
        summaries.put(
          {
            id: original.id,
            name: original.name,
            updatedAt: previous.savedAt,
            markerCount: previous.markers.length,
            pageCount: 0,
            byteLength: original.bytes.byteLength,
          } satisfies DraftSummary,
          original.id,
        );
        workspace.put(
          {
            activeId: original.id,
            screen: screen.result === 'home' ? 'home' : 'document',
          } satisfies WorkspaceState,
          'navigation',
        );
        workspace.put(original.id, 'legacyFingerprint');
        for (const key of ['source', 'draft', 'screen']) workspace.delete(key);
      };
    };
    request.onsuccess = async () => {
      const connection = request.result;
      if (blocked) {
        connection.close();
        return;
      }
      connection.onversionchange = () => {
        connection.close();
        database = undefined;
      };
      try {
        const legacy = await transaction<Source | undefined>(
          connection,
          ['workspace', 'sources'],
          'readonly',
          (tx, result) => {
            const key = tx.objectStore('workspace').get('legacyFingerprint');
            key.onsuccess = () => {
              if (!key.result) {
                result(undefined);
                return;
              }
              const source = tx.objectStore('sources').get(key.result);
              source.onsuccess = () => result(normalizeSource(source.result) ?? undefined);
            };
          },
        );
        if (legacy) {
          const hash = await fingerprint(legacy.bytes);
          await transaction<void>(connection, ['workspace', 'fingerprints'], 'readwrite', (tx) => {
            tx.objectStore('fingerprints').put({ id: legacy.id }, hash);
            tx.objectStore('workspace').delete('legacyFingerprint');
          });
        }
        resolve(connection);
      } catch (error) {
        connection.close();
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  }));
}

async function transact<T>(
  names: string[],
  mode: IDBTransactionMode,
  run: Parameters<typeof transaction<T>>[3],
) {
  return transaction(await db(), names, mode, run);
}

async function clearLegacyIndexedDbSilently(): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const conn = await db();
    await transaction<void>(conn, idbStores, 'readwrite', (tx) => {
      for (const name of idbStores) {
        if (tx.objectStoreNames.contains(name)) tx.objectStore(name).clear();
      }
    });
  } catch {
    // Ignore IDB errors when storage is unavailable
  }
}

let legacyMigrationPromise: Promise<void> | null = null;

/**
 * One-time transparent migration from legacy WebView IndexedDB into the native Tauri disk store.
 */
async function ensureLegacyMigrated(): Promise<void> {
  if (!isTauriEnvironment() || !idbAvailable()) return;
  try {
    if (window.localStorage.getItem(IDB_MIGRATION_FLAG) === '1') return;
  } catch {
    return;
  }
  if (legacyMigrationPromise) return legacyMigrationPromise;

  legacyMigrationPromise = (async () => {
    try {
      const summaries = await transact<DraftSummary[]>(['summaries'], 'readonly', (tx, result) => {
        const req = tx.objectStore('summaries').getAll();
        req.onsuccess = () => result((req.result as DraftSummary[]) ?? []);
      });
      for (const item of summaries) {
        const stored = await idbReadDraft(item.id);
        if (!stored) continue;
        await api.workbenchPdfSaveSourceRaw(
          {
            id: stored.source.id,
            name: stored.source.name,
            pageCount: item.pageCount || 0,
            markerCount: stored.draft.markers.length,
            markersJson: JSON.stringify(stored.draft.markers),
            viewJson: stored.draft.view ? JSON.stringify(stored.draft.view) : null,
            nextNumber: stored.draft.nextNumber ?? 1,
            compatibility: stored.draft.compatibility ?? false,
            updatedAt: stored.draft.savedAt || item.updatedAt || Date.now(),
          },
          stored.source.bytes,
        );
      }
      if (summaries.length > 0) {
        const oldNav = await idbReadWorkspace();
        if (oldNav.activeId) {
          await api.workbenchPdfWriteWorkspace(oldNav.activeId, oldNav.screen);
        }
        await clearLegacyIndexedDbSilently();
      }
      try {
        window.localStorage.setItem(IDB_MIGRATION_FLAG, '1');
      } catch {
        // ignore
      }
    } catch {
      // Do not block opening workbench if legacy IDB cannot be read
    }
  })();

  return legacyMigrationPromise;
}

function idbReadWorkspace() {
  return transact<WorkspaceState>(['workspace'], 'readonly', (tx, result, fail) => {
    const store = tx.objectStore('workspace');
    const navigation = store.get('navigation'),
      error = store.get('migrationError');
    error.onsuccess = () => {
      if (error.result) {
        fail(new Error(String(error.result)));
        return;
      }
      const value = navigation.result;
      result({
        activeId: typeof value?.activeId === 'string' ? value.activeId : undefined,
        screen: value?.screen === 'document' ? 'document' : 'home',
      });
    };
  });
}

function idbReadDraft(id: string) {
  return transact<StoredDraft | null>(['sources', 'drafts'], 'readonly', (tx, result, fail) => {
    const source = tx.objectStore('sources').get(id),
      draft = tx.objectStore('drafts').get(id);
    draft.onsuccess = () => {
      if (!source.result && !draft.result) {
        result(null);
        return;
      }
      const original = normalizeSource(source.result);
      const saved = original ? normalizeDraft(draft.result, id) : null;
      if (!original || original.id !== id || !saved) {
        fail(new Error('本机草稿不完整或已损坏，请重新导入 PDF'));
        return;
      }
      result({ source: original, draft: saved });
    };
  });
}

async function idbEnforceCacheLimit(
  limitBytes: number,
  protectedId?: string,
): Promise<WorkbenchCachePruneResult> {
  const summaries = await transact<DraftSummary[]>(['summaries'], 'readonly', (tx, result) => {
    const req = tx.objectStore('summaries').getAll();
    req.onsuccess = () => result((req.result as DraftSummary[]) ?? []);
  });
  summaries.sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
  let totalBytes = summaries.reduce((acc, s) => acc + Math.max(0, s.byteLength || 0), 0);
  let draftCount = summaries.length;
  let evictedCount = 0;
  let freedBytes = 0;

  for (const item of summaries) {
    if (totalBytes <= limitBytes) break;
    if (protectedId && item.id === protectedId) continue;
    await idbDeleteDraft(item.id);
    const sz = Math.max(0, item.byteLength || 0);
    totalBytes = Math.max(0, totalBytes - sz);
    freedBytes += sz;
    draftCount = Math.max(0, draftCount - 1);
    evictedCount++;
  }
  return { evictedCount, freedBytes, totalBytes, draftCount, limitBytes };
}

function idbDeleteDraft(id: string) {
  return transact<void>(idbStores, 'readwrite', (tx) => {
    for (const name of ['sources', 'drafts', 'summaries']) tx.objectStore(name).delete(id);
    const aliases = tx
      .objectStore('fingerprints')
      .index('document')
      .openKeyCursor(IDBKeyRange.only(id));
    aliases.onsuccess = () => {
      const cursor = aliases.result;
      if (cursor) {
        tx.objectStore('fingerprints').delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    const navigation = tx.objectStore('workspace').get('navigation');
    navigation.onsuccess = () => {
      if (navigation.result?.activeId === id)
        tx.objectStore('workspace').put({ screen: 'home' } satisfies WorkspaceState, 'navigation');
    };
  });
}

/* ============================================================================
 * Public Dual-Engine Draft API (Tauri Native Disk Store -> IndexedDB Fallback)
 * ========================================================================== */

export async function readWorkspace(): Promise<WorkspaceState> {
  if (isTauriEnvironment()) {
    await ensureLegacyMigrated();
    const state = await api.workbenchPdfReadWorkspace();
    return {
      activeId: state.activeId ?? undefined,
      screen: state.screen === 'document' ? 'document' : 'home',
    };
  }
  return idbReadWorkspace();
}

export async function readDraft(id: string): Promise<StoredDraft | null> {
  if (isTauriEnvironment()) {
    await ensureLegacyMigrated();
    const meta = await api.workbenchPdfReadDraftMeta(id);
    if (!meta) return null;
    const bytes = await api.workbenchPdfReadSourceRaw(id);
    return {
      source: { id: meta.id, name: meta.name, bytes },
      draft: parseNativeMeta(meta),
    };
  }
  return idbReadDraft(id);
}

export async function findDraft(hash: string): Promise<StoredDraft | null> {
  if (isTauriEnvironment()) {
    // Native store uses SHA-256 content fingerprint directly as primary key
    return readDraft(hash);
  }
  const id = await transact<string | undefined>(['fingerprints'], 'readonly', (tx, result) => {
    const request = tx.objectStore('fingerprints').get(hash);
    request.onsuccess = () => result(request.result?.id);
  });
  return id ? idbReadDraft(id) : null;
}

export async function listDrafts(
  cursor?: DraftCursor,
  limit = 12,
  query = '',
): Promise<DraftPage> {
  if (isTauriEnvironment()) {
    await ensureLegacyMigrated();
    const res = await api.workbenchPdfListDrafts({
      cursorUpdatedAt: cursor ? cursor[0] : null,
      cursorId: cursor ? cursor[1] : null,
      limit,
      query,
    });
    return {
      items: res.items,
      cursor:
        res.cursorUpdatedAt !== null && res.cursorId !== null
          ? [res.cursorUpdatedAt, res.cursorId]
          : undefined,
      total: res.total,
    };
  }

  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return transact<DraftPage>(['summaries'], 'readonly', (tx, result) => {
    const store = tx.objectStore('summaries');
    const count = store.count();
    const page: DraftPage = { items: [], total: 0 };
    count.onsuccess = () => {
      page.total = count.result;
    };
    const request = store
      .index('recent')
      .openCursor(cursor ? IDBKeyRange.upperBound(cursor, true) : undefined, 'prev');
    request.onsuccess = () => {
      const item = request.result;
      if (!item) {
        result(page);
        return;
      }
      const summary = item.value as DraftSummary;
      const name = `${summary.name}.pdf`.normalize('NFKC').toLocaleLowerCase();
      if (!terms.every((term) => name.includes(term))) {
        item.continue();
        return;
      }
      if (page.items.length >= limit) {
        const last = page.items.at(-1)!;
        page.cursor = [last.updatedAt, last.id];
        result(page);
        return;
      }
      page.items.push(summary);
      item.continue();
    };
  });
}

function makeDraft(
  session: PdfSession,
  markers: Marker[],
  view?: DocumentView,
  nextNumber?: number,
): Draft {
  return {
    sourceId: session.draftId!,
    markers,
    savedAt: Date.now(),
    view,
    nextNumber,
    compatibility: session.compatibility,
    revision: (session.draftRevision ?? 0) + 1,
  };
}

const changedElsewhere = () =>
  new Error('这份草稿已在其他窗口更新或被删除，请先导出当前工作，再重新打开草稿');

function canUpdate(session: PdfSession, previous: Draft | undefined) {
  return (
    !!previous &&
    (previous.revision === session.draftRevision ||
      draftContent(previous.markers, previous.nextNumber) === session.draftBaseline)
  );
}

function guarded(fail: (error: Error) => void, run: () => void) {
  return () => {
    try {
      run();
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

export async function saveSource(
  session: PdfSession,
  markers: Marker[],
  state: { view?: DocumentView; nextNumber?: number; existing?: boolean } = {},
): Promise<SaveSourceOutcome> {
  const id = session.draftId;
  if (!id) throw new Error('缺少文档标识');

  if (isTauriEnvironment()) {
    await ensureLegacyMigrated();
    const res = await api.workbenchPdfSaveSourceRaw(
      {
        id,
        name: session.name,
        pageCount: session.pages.length,
        markerCount: markers.length,
        markersJson: JSON.stringify(markers),
        viewJson: state.view ? JSON.stringify(state.view) : null,
        nextNumber: state.nextNumber ?? 1,
        compatibility: session.compatibility,
        updatedAt: Date.now(),
      },
      // Avoid transferring multi-MB PDF bytes across IPC when source is already cached on disk
      state.existing ? null : session.bytes,
    );
    session.draftRevision = res.revision;
    session.draftBaseline = draftContent(markers, state.nextNumber);
    return { evictedCount: res.evictedCount, freedBytes: res.freedBytes };
  }

  const saved = makeDraft(session, markers, state.view, state.nextNumber);
  await transact<void>(
    ['sources', 'drafts', 'summaries', 'workspace', 'fingerprints'],
    'readwrite',
    (tx, _result, fail) => {
      const sources = tx.objectStore('sources'),
        drafts = tx.objectStore('drafts');
      const source = sources.getKey(id),
        draft = drafts.get(id);
      draft.onsuccess = guarded(fail, () => {
        if (state.existing ? !source.result || !canUpdate(session, draft.result) : !!source.result) {
          fail(changedElsewhere());
          return;
        }
        saved.revision = (draft.result?.revision ?? 0) + 1;
        if (!source.result)
          sources.put({ id, bytes: session.bytes, name: session.name } satisfies Source, id);
        drafts.put(saved, id);
        tx.objectStore('fingerprints').put({ id }, id);
        tx.objectStore('summaries').put(
          {
            id,
            name: session.name,
            updatedAt: saved.savedAt,
            markerCount: markers.length,
            pageCount: session.pages.length,
            byteLength: session.bytes.byteLength,
          } satisfies DraftSummary,
          id,
        );
        tx.objectStore('workspace').put(
          { screen: 'document', activeId: id } satisfies WorkspaceState,
          'navigation',
        );
      });
    },
  );
  session.draftRevision = saved.revision;
  session.draftBaseline = draftContent(markers, state.nextNumber);
  const pruned = await idbEnforceCacheLimit(DEFAULT_CACHE_LIMIT_MB * 1024 * 1024, id);
  return { evictedCount: pruned.evictedCount, freedBytes: pruned.freedBytes };
}

export async function saveMarkers(
  session: PdfSession,
  markers: Marker[],
  view?: DocumentView,
  nextNumber?: number,
  screen?: 'home',
): Promise<void> {
  const id = session.draftId;
  if (!id) throw new Error('缺少文档标识');

  if (isTauriEnvironment()) {
    const rev = await api.workbenchPdfSaveMarkers({
      id,
      markerCount: markers.length,
      markersJson: JSON.stringify(markers),
      viewJson: view ? JSON.stringify(view) : null,
      nextNumber: nextNumber ?? 1,
      compatibility: session.compatibility,
      updatedAt: Date.now(),
      screen: screen ?? null,
    });
    session.draftRevision = rev;
    session.draftBaseline = draftContent(markers, nextNumber);
    return;
  }

  const saved = makeDraft(session, markers, view, nextNumber);
  await transact<void>(['drafts', 'summaries', 'workspace'], 'readwrite', (tx, _result, fail) => {
    const drafts = tx.objectStore('drafts'),
      summaries = tx.objectStore('summaries');
    const draft = drafts.get(id),
      summary = summaries.get(id);
    summary.onsuccess = guarded(fail, () => {
      if (!summary.result || !canUpdate(session, draft.result)) {
        fail(changedElsewhere());
        return;
      }
      saved.revision = draft.result.revision + 1;
      drafts.put(saved, id);
      summaries.put(
        { ...summary.result, markerCount: markers.length, updatedAt: saved.savedAt },
        id,
      );
      if (screen)
        tx.objectStore('workspace').put(
          { screen, activeId: id } satisfies WorkspaceState,
          'navigation',
        );
    });
  });
  session.draftRevision = saved.revision;
  session.draftBaseline = draftContent(markers, nextNumber);
}

export async function deleteDraft(id: string): Promise<void> {
  if (isTauriEnvironment()) {
    await api.workbenchPdfDeleteDraft(id);
    return;
  }
  await idbDeleteDraft(id);
}

export async function clearDrafts(): Promise<WorkbenchCachePruneResult> {
  if (isTauriEnvironment()) {
    await clearLegacyIndexedDbSilently();
    return api.workbenchPdfClearAll();
  }
  const before = await getDraftCacheStats();
  await transact<void>(idbStores, 'readwrite', (tx) => {
    for (const name of idbStores) tx.objectStore(name).clear();
  });
  return {
    evictedCount: before.draftCount,
    freedBytes: before.totalBytes,
    totalBytes: 0,
    draftCount: 0,
    limitBytes: before.limitBytes,
  };
}

export async function getDraftCacheStats(): Promise<WorkbenchCacheStats> {
  if (isTauriEnvironment()) {
    await ensureLegacyMigrated();
    return api.workbenchPdfCacheStats();
  }
  const limitMb = DEFAULT_CACHE_LIMIT_MB;
  const limitBytes = limitMb * 1024 * 1024;
  if (!idbAvailable()) {
    return { totalBytes: 0, draftCount: 0, limitBytes, limitMb };
  }
  const summaries = await transact<DraftSummary[]>(['summaries'], 'readonly', (tx, result) => {
    const req = tx.objectStore('summaries').getAll();
    req.onsuccess = () => result((req.result as DraftSummary[]) ?? []);
  });
  const totalBytes = summaries.reduce((acc, s) => acc + Math.max(0, s.byteLength || 0), 0);
  return {
    totalBytes,
    draftCount: summaries.length,
    limitBytes,
    limitMb,
  };
}

export async function pruneDraftCache(
  limitMb?: number,
  protectedId?: string,
): Promise<WorkbenchCachePruneResult> {
  if (isTauriEnvironment()) {
    return api.workbenchPdfPruneCache(limitMb ?? null, protectedId ?? null);
  }
  const targetMb = limitMb ?? DEFAULT_CACHE_LIMIT_MB;
  return idbEnforceCacheLimit(targetMb * 1024 * 1024, protectedId);
}

/**
 * Cleans all browser-side workbench preferences, tab navigation state, and legacy IndexedDB
 * (invoked during app factory reset so no stale workbench state lingers).
 */
export async function wipeAllWorkbenchBrowserState(): Promise<void> {
  await clearLegacyIndexedDbSilently();
  try {
    const lsKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('folio:') || k.startsWith('workbench:'))) lsKeys.push(k);
    }
    lsKeys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
  try {
    const ssKeys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith('folio:')) ssKeys.push(k);
    }
    ssKeys.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}
