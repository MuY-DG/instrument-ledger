import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FileUp,
  FileText,
  ArrowUpRight,
  CirclePlus,
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ScanLine,
  ShieldCheck,
  CircleCheck,
  AlertTriangle,
  X,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Keyboard,
  RotateCw,
  Trash2,
  Maximize,
  Minimize,
  House,
  Search,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import pdfPackage from 'pdfjs-dist/package.json';
import { isTauriEnvironment } from '@/lib/themeTransition';
import type { WorkbenchToolProps } from '../../types';
import { pickPdfFileInTauri, readLocalFileAsWebFile } from '../../desktopBridge';
import type { DocumentView, Marker, MarkerStyle, PdfSession, Tool } from './types';
import type { ImageOptions } from './core/export';
import { DEFAULT_STYLE } from './types';
import { clamp, DEFAULT_PAGE_SPACING, MAX_PAGE_SPACING } from './core/geometry';
import {
  clearDrafts,
  draftContent,
  findDraft,
  getDraftCacheStats,
  readDraft,
  readWorkspace,
  saveMarkers,
  saveSource,
} from './core/drafts';
import type { StoredDraft } from './core/drafts';
import { formatFileSize } from '@/lib/status';
import type { WorkbenchCacheStats } from '@/types';
import { fingerprint } from './core/file-identity';
import { readTabWorkspace, rememberTabWorkspace } from './core/workspace-navigation';
import { RecentDocuments } from './components/RecentDocuments';
import { createId } from './core/id';
import { useHistory } from './hooks/useHistory';
import { resizeStyle } from './core/marker-size';
import { usePreferences } from './hooks/usePreferences';
import type { ExportPreferences } from './core/preferences';
import { Sidebar } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { Viewer } from './components/Viewer';
import type { ViewerHandle } from './components/Viewer';
import { ExportDialog } from './components/ExportDialog';
import { Dialog } from './components/Dialog';
import { ExportMenu } from './components/ExportMenu';
import { Filename } from './components/Filename';
import { NumberField } from './components/NumberField';
import { LoadingScreen } from './components/LoadingScreen';
import { Toast } from './components/Toast';
import type { Notification } from './components/Toast';
import './folio.css';

interface Job {
  label: string;
  progress: number;
  kind: 'open' | 'export';
}

function findLastMatching<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return items[i];
  }
  return undefined;
}

export function FolioWorkbench({
  active,
  hostOverlayOpen,
  theme,
  immersive,
  onToggleImmersive,
  incomingFile,
  onConsumeIncomingFile,
}: WorkbenchToolProps) {
  const [preferences, setPreferences] = usePreferences();
  const [session, setSession] = useState<PdfSession | null>(null),
    [selected, setSelected] = useState(new Set<string>());
  const history = useHistory(preferences.markerStyle),
    { items: markers, defaults, commit, commitSnapshot, replace, undo, redo } = history;
  const [nextNumber, setNextNumber] = useState(1),
    [linked, setLinked] = useState(preferences.linked);
  const [inspectorPlacement, setInspectorPlacement] = useState(preferences.inspectorPlacement);
  const [sidebarTab, setSidebarTab] = useState(preferences.sidebarTab);
  const [zoomMode, setZoomMode] = useState(preferences.zoomMode);
  const [initialView, setInitialView] = useState<DocumentView>();

  // Annotation is temporary; keep the underlying navigation tool across entry/exit.
  const [navigationTool, setNavigationTool] = useState<Exclude<Tool, 'marker'>>('select');
  const [addingMarker, setAddingMarker] = useState(false);
  const tool: Tool = addingMarker ? 'marker' : navigationTool;
  const setTool = useCallback((next: Tool) => {
    if (next !== 'marker') setNavigationTool(next);
    setAddingMarker(next === 'marker');
  }, []);
  const exitMarkerMode = useCallback(() => {
    setAddingMarker(false);
    setSelected(new Set());
  }, []);

  const [scale, setScale] = useState(preferences.zoomScale),
    [currentPage, setCurrentPage] = useState(1),
    [wheelZoom, setWheelZoom] = useState(preferences.wheelZoom),
    [wheelResize, setWheelResize] = useState(preferences.wheelResize),
    [resizeHovered, setResizeHovered] = useState(false),
    [sidebarOpen, setSidebarOpen] = useState(preferences.sidebarOpen);

  useLayoutEffect(() => {
    setPreferences((p) => ({
      ...p,
      sidebarOpen,
      sidebarTab,
      inspectorPlacement,
      wheelZoom,
      wheelResize,
      linked,
      zoomMode,
      zoomScale: scale,
      markerStyle: defaults,
    }));
  }, [
    sidebarOpen,
    sidebarTab,
    inspectorPlacement,
    wheelZoom,
    wheelResize,
    linked,
    zoomMode,
    scale,
    defaults,
    setPreferences,
  ]);

  const changeExportPreferences = useCallback(
    (value: Partial<ExportPreferences>) =>
      setPreferences((p) => ({ ...p, imageExport: { ...p.imageExport, ...value } })),
    [setPreferences],
  );

  const [job, setJob] = useState<Job | null>(null),
    [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationId = useRef(0);
  const [resourceErrors, setResourceErrors] = useState<string[]>([]),
    [settings, setSettings] = useState(false),
    [exportDialog, setExportDialog] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'general' | 'shortcuts' | 'resources'>('general');
  const [recentPickerOpen, setRecentPickerOpen] = useState(false);
  const [confirmClearDrafts, setConfirmClearDrafts] = useState(false),
    [clearingDrafts, setClearingDrafts] = useState(false),
    [clearDraftError, setClearDraftError] = useState('');
  const [editing, setEditing] = useState<string | null>(null),
    [editValue, setEditValue] = useState('');
  const [password, setPassword] = useState<{
      incorrect: boolean;
      resolve: (value: string | null) => void;
    } | null>(null),
    [passwordValue, setPasswordValue] = useState('');
  const [lastDraftId, setLastDraftId] = useState<string>(),
    [libraryRevision, setLibraryRevision] = useState(0),
    [cacheStats, setCacheStats] = useState<WorkbenchCacheStats | null>(null),
    [saveState, setSaveState] = useState<'saved' | 'saving' | 'unavailable'>('saved'),
    [draggingFile, setDraggingFile] = useState(false);
  const [initializing, setInitializing] = useState(true),
    [closingDocument, setClosingDocument] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null),
    navShellRef = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    viewer = useRef<ViewerHandle>(null),
    controller = useRef<AbortController | null>(null),
    exportController = useRef<AbortController | null>(null),
    dragDepth = useRef(0);

  const draftWrites = useRef<Promise<unknown>>(Promise.resolve()),
    sourceReady = useRef<string | null>(null),
    sourceFailed = useRef(false),
    sessionTarget = useRef<string | null>(null),
    alive = useRef(true);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const selectedMarkers = useMemo(
    () => markers.filter((a) => selected.has(a.id)),
    [markers, selected],
  );
  const activeStyle = selectedMarkers.at(-1) ?? defaults;
  const [pendingPaint, setPendingPaint] = useState<string | null>(null);
  const loadingDocument = initializing || job?.kind === 'open' || pendingPaint !== null;
  const busy = initializing || closingDocument || !!job || pendingPaint !== null;

  // React 18 compatible `inert` sync for collapsed sidebar shell
  useEffect(() => {
    const el = navShellRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !sidebarOpen;
  }, [sidebarOpen, session]);

  const firstPaint = useCallback(
    (id: string) => setPendingPaint((current) => (current === id ? null : current)),
    [],
  );

  const notify = useCallback((text: string, error = false) => {
    const notification = { id: ++notificationId.current, text, error };
    setNotifications((current) =>
      [...current.filter((item) => item.text !== text), notification].slice(-3),
    );
  }, []);

  const dismissNotification = useCallback((id: number) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const reportSaveFailure = useCallback(
    (error: unknown) => {
      if (!alive.current) return;
      setSaveState('unavailable');
      notify(
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? '本机存储空间不足，请先导出当前 PDF，并在首页删除不需要的草稿。'
          : `草稿保存失败：${error instanceof Error ? error.message : String(error)}。请先导出 PDF。`,
        true,
      );
    },
    [notify],
  );

  useEffect(() => {
    const existing = new Set(markers.map((a) => a.id));
    setSelected((previous) => {
      const remaining = new Set([...previous].filter((id) => existing.has(id)));
      return remaining.size === previous.size ? previous : remaining;
    });
  }, [markers]);

  useEffect(() => {
    alive.current = true;
    void readWorkspace()
      .then(async (persisted) => {
        if (!alive.current) return;
        const value = readTabWorkspace() ?? persisted;
        setLastDraftId(value.activeId);
        if (value.activeId && value.screen === 'document') {
          const saved = await readDraft(value.activeId);
          if (saved && alive.current) await restoreDraft(saved);
          else rememberTabWorkspace({ screen: 'home' });
        }
      })
      .catch((error) => {
        if (!alive.current) return;
        setSaveState('unavailable');
        notify(
          `无法读取本机草稿：${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      })
      .finally(() => {
        if (alive.current) setInitializing(false);
      });
    return () => {
      alive.current = false;
      controller.current?.abort();
      exportController.current?.abort();
    };
  }, []);

  useEffect(
    () => () => {
      if (session) setTimeout(() => void session.doc.loadingTask.destroy().catch(() => {}), 0);
    },
    [session],
  );

  const viewState = useRef<{ id: string; view: DocumentView } | null>(null);
  const nextNumberRef = useRef(nextNumber);
  nextNumberRef.current = nextNumber;
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftRequest = useRef(0);

  const scheduleDraft = useCallback(() => {
    clearTimeout(draftTimer.current);
    const current = sessionRef.current;
    if (!current || sourceReady.current !== current.id) return;
    const request = ++draftRequest.current;
    setSaveState('saving');
    draftTimer.current = setTimeout(() => {
      const s = sessionRef.current;
      if (!s || sourceReady.current !== s.id) return;
      const view = viewState.current?.id === s.id ? viewState.current.view : undefined;
      const items = history.current.current.items,
        next = nextNumberRef.current;
      draftWrites.current = draftWrites.current
        .catch(() => {})
        .then(() => saveMarkers(s, items, view, next))
        .then(() => {
          if (
            alive.current &&
            sessionRef.current?.id === s.id &&
            !sourceFailed.current &&
            request === draftRequest.current
          )
            setSaveState('saved');
        })
        .catch(reportSaveFailure);
    }, 500);
  }, [history.current, reportSaveFailure]);

  const changeView = useCallback(
    (id: string, view: DocumentView) => {
      if (sessionRef.current?.id !== id) return;
      viewState.current = { id, view };
      scheduleDraft();
    },
    [scheduleDraft],
  );

  useEffect(() => {
    scheduleDraft();
    return () => clearTimeout(draftTimer.current);
  }, [session, markers, nextNumber, scheduleDraft]);

  // Flush small marker metadata immediately when switching away from this tool or hiding window
  // (guarantees zero data loss before Keep-Alive idle auto-hibernation).
  const flushMetadataNow = useCallback(() => {
    const s = sessionRef.current;
    if (s && sourceReady.current === s.id) {
      clearTimeout(draftTimer.current);
      const items = history.current.current.items,
        view = viewState.current?.id === s.id ? viewState.current.view : undefined,
        next = nextNumberRef.current;
      draftWrites.current = draftWrites.current
        .catch(() => {})
        .then(() => saveMarkers(s, items, view, next))
        .catch(reportSaveFailure);
    }
  }, [history.current, reportSaveFailure]);

  const wasActiveRef = useRef(active);
  useEffect(() => {
    if (wasActiveRef.current && !active) {
      flushMetadataNow();
    }
    wasActiveRef.current = active;
  }, [active, flushMetadataNow]);

  useEffect(() => {
    document.addEventListener('visibilitychange', flushMetadataNow);
    window.addEventListener('pagehide', flushMetadataNow);
    return () => {
      document.removeEventListener('visibilitychange', flushMetadataNow);
      window.removeEventListener('pagehide', flushMetadataNow);
    };
  }, [flushMetadataNow]);

  // Refresh cache usage stats when opening Folio Settings
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    void getDraftCacheStats()
      .then((stats) => {
        if (!cancelled) setCacheStats(stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings, libraryRevision]);

  async function openFile(
    file: File,
    retained?: Marker[],
    compatibility = false,
    suppliedPassword?: string,
    reloadReason?: 'compatibility' | 'resources',
    restored?: { view?: DocumentView; nextNumber?: number },
    stored?: StoredDraft,
  ) {
    if (exportController.current) return;
    if (!/\.pdf$/i.test(file.name)) {
      notify('请选择 PDF 文件', true);
      return;
    }
    controller.current?.abort();
    setPendingPaint(null);
    setNotifications([]);
    const next = new AbortController();
    controller.current = next;
    setJob({ label: '正在读取 PDF…', progress: 0, kind: 'open' });
    try {
      await flushCurrentDraft();
      next.signal.throwIfAborted();
      let sourceBytes = stored?.source.bytes;
      let draftId = stored?.source.id ?? (reloadReason ? sessionRef.current?.draftId : undefined);
      if (!stored && !reloadReason) {
        sourceBytes = new Uint8Array(await file.arrayBuffer());
        draftId = await fingerprint(sourceBytes, next.signal);
        try {
          stored = (await findDraft(draftId)) ?? undefined;
        } catch (error) {
          if (!(error instanceof DOMException && /Security|InvalidState/.test(error.name)))
            throw error;
        }
        next.signal.throwIfAborted();
        if (stored) {
          draftId = stored.source.id;
          sourceBytes = stored.source.bytes;
          retained = stored.draft.markers;
          compatibility = stored.draft.compatibility ?? false;
          restored = stored.draft;
          file = new File([], `${stored.source.name}.pdf`, { type: 'application/pdf' });
        }
      }
      const revision =
        stored?.draft.revision ?? (reloadReason ? sessionRef.current?.draftRevision : 0);
      const { openPdf } = await import('./core/pdf');
      next.signal.throwIfAborted();
      const loaded = await openPdf(file, {
        signal: next.signal,
        bytes: sourceBytes,
        compatibility,
        password: suppliedPassword,
        refreshResources: reloadReason === 'resources',
        onProgress: (value) => {
          if (!next.signal.aborted)
            setJob({ label: '正在准备文档页面…', progress: value, kind: 'open' });
        },
        onResourceError: (message) => {
          if (controller.current === next && !next.signal.aborted)
            setResourceErrors((list) => [...new Set([...list, message])]);
        },
        requestPassword: (incorrect) =>
          new Promise((resolve) => {
            if (next.signal.aborted) {
              resolve(null);
              return;
            }
            setPasswordValue('');
            setPassword({ incorrect, resolve });
            next.signal.addEventListener(
              'abort',
              () => {
                resolve(null);
                setPassword(null);
              },
              { once: true },
            );
          }),
      });
      if (next.signal.aborted) {
        await loaded.doc.loadingTask.destroy();
        return;
      }
      const restoredMarkers = retained ?? loaded.importedMarkers ?? [];
      const savedNextNumber = restored?.nextNumber ?? loaded.importedNextNumber;
      loaded.draftId = draftId;
      loaded.draftRevision = revision;
      loaded.draftBaseline = stored
        ? draftContent(stored.draft.markers, stored.draft.nextNumber)
        : reloadReason
          ? sessionRef.current?.draftBaseline
          : undefined;
      setResourceErrors([...loaded.resourceErrors]);
      replace(restoredMarkers);
      setSelected(new Set());
      setCurrentPage(1);
      setTool('select');
      const initialNextNumber = reloadReason
        ? nextNumberRef.current
        : typeof savedNextNumber === 'number' && Number.isSafeInteger(savedNextNumber)
          ? clamp(savedNextNumber, 0, 999999)
          : restoredMarkers.length
            ? Math.max(...restoredMarkers.map((a) => a.number)) + 1
            : 1;
      setNextNumber(initialNextNumber);
      const restoreView = restored?.view ?? (reloadReason ? viewState.current?.view : undefined);
      setInitialView(restoreView);
      viewState.current = null;
      if (restoreView) {
        setZoomMode(restoreView.zoomMode);
        setScale(clamp(restoreView.scale, 0.1, 32));
      } else if (!stored && !reloadReason) {
        setZoomMode('fit');
      }
      sourceReady.current = null;
      sourceFailed.current = false;
      sessionTarget.current = loaded.id;
      setSaveState('saving');
      draftWrites.current = draftWrites.current
        .catch(() => {})
        .then(() =>
          saveSource(loaded, restoredMarkers, {
            view: restoreView,
            nextNumber: initialNextNumber,
            existing: !!stored || !!reloadReason,
          }),
        )
        .then((outcome) => {
          if (!alive.current || sessionTarget.current !== loaded.id) return;
          sourceReady.current = loaded.id;
          sourceFailed.current = false;
          setLastDraftId(loaded.draftId);
          rememberTabWorkspace({ screen: 'document', activeId: loaded.draftId });
          setSaveState('saved');
          if (outcome && outcome.evictedCount > 0) {
            notify(
              `本地缓存超出上限，已按 LRU 自动清理 ${outcome.evictedCount} 份较早草稿（释放 ${formatFileSize(outcome.freedBytes)}）`,
            );
          }
          scheduleDraft();
        })
        .catch((error) => {
          if (!alive.current || sessionTarget.current !== loaded.id) return;
          sourceReady.current = null;
          sourceFailed.current = true;
          reportSaveFailure(error);
        });
      setPendingPaint(loaded.id);
      setSession(loaded);
      notify(
        reloadReason === 'resources'
          ? '已重新加载图纸，标注已保留'
          : compatibility
            ? '已切换为兼容渲染，标注已保留'
            : loaded.importedMarkers
              ? `已打开 ${loaded.pages.length} 页文档，恢复 ${restoredMarkers.length} 个可编辑序号`
              : `已打开 ${loaded.pages.length} 页文档`,
      );
      return loaded;
    } catch (e) {
      if (!next.signal.aborted)
        notify(`打开失败：${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      if (controller.current === next) {
        setJob(null);
        setPassword(null);
      }
    }
  }

  function restoreDraft(value: StoredDraft) {
    return openFile(
      new File([], `${value.source.name}.pdf`, { type: 'application/pdf' }),
      value.draft.markers,
      value.draft.compatibility ?? false,
      undefined,
      undefined,
      value.draft,
      value,
    );
  }

  async function openSavedDraft(id: string) {
    if (busy) return;
    controller.current?.abort();
    const reading = new AbortController();
    controller.current = reading;
    setJob({ label: '正在读取本机草稿…', progress: 0, kind: 'open' });
    try {
      const saved = await readDraft(id);
      if (reading.signal.aborted) return;
      if (!saved) throw new Error('这份草稿已被删除');
      await restoreDraft(saved);
    } catch (error) {
      if (reading.signal.aborted) return;
      notify(`无法恢复草稿：${error instanceof Error ? error.message : String(error)}`, true);
      setLibraryRevision((value) => value + 1);
    } finally {
      if (controller.current === reading) setJob(null);
    }
  }

  function requestOpenFile(file: File) {
    if (initializing || closingDocument || exportController.current) return;
    void openFile(file);
  }

  const triggerPickPdf = useCallback(async () => {
    if (initializing || closingDocument || exportController.current) return;
    if (isTauriEnvironment()) {
      try {
        const picked = await pickPdfFileInTauri();
        if (picked) {
          void openFile(picked);
        }
      } catch (err) {
        notify(`读取文件失败：${err instanceof Error ? err.message : String(err)}`, true);
      }
      return;
    }
    input.current?.click();
  }, [initializing, closingDocument, notify]);

  // Consume incoming PDF routed from another module (e.g. Calibration Report preview)
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;
  const lastConsumedIncomingIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!incomingFile || initializing) return;
    if (lastConsumedIncomingIdRef.current === incomingFile.id) return;
    lastConsumedIncomingIdRef.current = incomingFile.id;
    onConsumeIncomingFile?.(incomingFile.id);
    void openFileRef.current(incomingFile.file);
  }, [incomingFile, initializing, onConsumeIncomingFile]);

  // Native Tauri v2 OS file drag-and-drop bridge
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!active || hostOverlayOpen || !isTauriEnvironment()) {
      setDraggingFile(false);
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const hitInside = (pos: { x: number; y: number }): boolean => {
      const el = rootRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const lx = pos.x / dpr;
      const ly = pos.y / dpr;
      const inLogical =
        lx >= rect.left && lx <= rect.right && ly >= rect.top && ly <= rect.bottom;
      if (inLogical) return true;
      return (
        pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom
      );
    };

    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setDraggingFile(hitInside(payload.position));
          } else if (payload.type === 'leave') {
            setDraggingFile(false);
          } else if (payload.type === 'drop') {
            const inside = hitInside(payload.position);
            setDraggingFile(false);
            if (!inside || payload.paths.length === 0) return;
            if (busyRef.current || document.querySelector('.folio-workbench [role="dialog"]')) {
              return;
            }
            const targetPath =
              payload.paths.find((p) => /\.pdf$/i.test(p)) ?? payload.paths[0];
            if (!/\.pdf$/i.test(targetPath)) {
              notify('请选择 PDF 文件', true);
              return;
            }
            void readLocalFileAsWebFile(targetPath, 'application/pdf')
              .then((file) => openFileRef.current(file))
              .catch((err) => {
                notify(`读取拖入文件失败：${err instanceof Error ? err.message : String(err)}`, true);
              });
          }
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [active, hostOverlayOpen, notify]);

  async function flushCurrentDraft(screen?: 'home') {
    const current = sessionRef.current;
    if (!current) return;
    clearTimeout(draftTimer.current);
    await draftWrites.current.catch(() => {});
    if (sourceReady.current !== current.id)
      throw new Error('当前文档尚未成功保存，请先导出 PDF，再重试');
    clearTimeout(draftTimer.current);
    const items = history.current.current.items,
      view = viewState.current?.id === current.id ? viewState.current.view : undefined,
      next = nextNumberRef.current;
    draftWrites.current = draftWrites.current
      .catch(() => {})
      .then(() => saveMarkers(current, items, view, next, screen));
    await draftWrites.current;
  }

  async function returnHome() {
    const current = sessionRef.current;
    if (!current || busy) return;
    setClosingDocument(true);
    try {
      await flushCurrentDraft('home');
      sourceReady.current = null;
      clearTimeout(draftTimer.current);
      setLastDraftId(current.draftId);
      rememberTabWorkspace({ screen: 'home', activeId: current.draftId });
      sessionRef.current = null;
      sessionTarget.current = null;
      viewState.current = null;
      setSession(null);
      replace([]);
      setSelected(new Set());
      setCurrentPage(1);
      setNextNumber(1);
      setInitialView(undefined);
      setTool('select');
      setResourceErrors([]);
      setSaveState('saved');
      setLibraryRevision((value) => value + 1);
      notify('已返回首页，所有文档的本机草稿已保留');
    } catch (error) {
      setSaveState('unavailable');
      notify(
        `暂时无法保留草稿，请先导出 PDF：${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      setClosingDocument(false);
    }
  }

  const addMarker = useCallback(
    (page: number, x: number, y: number) => {
      const id = createId();
      commit((items) => [...items, { ...defaults, id, page, x, y, number: nextNumber }]);
      setSelected(new Set([id]));
      setNextNumber((n) => n + 1);
    },
    [commit, defaults, nextNumber],
  );

  const deleteMarkers = useCallback(
    (ids: Set<string>) => {
      if (!ids.size) return;
      commit((items) => items.filter((a) => !ids.has(a.id)));
      setSelected(new Set());
      notify(`已删除 ${ids.size} 个标注，可撤销恢复`);
    },
    [commit, notify],
  );

  function changeStyle(value: Partial<MarkerStyle>) {
    const apply = (style: MarkerStyle): MarkerStyle => ({
      ...style,
      ...value,
      ...(linked && value.size !== undefined
        ? { textSize: clamp((style.textSize * value.size) / style.size, 2, 80) }
        : {}),
    });
    const equal = (a: MarkerStyle, b: MarkerStyle) =>
      (Object.keys(DEFAULT_STYLE) as (keyof MarkerStyle)[]).every((key) => a[key] === b[key]);
    commitSnapshot((state) => {
      const nextDefaults = apply(state.defaults);
      const next = state.items.map((a) => {
        if (!selected.has(a.id)) return a;
        const style = apply(a);
        return equal(style, a) ? a : { ...a, ...style };
      });
      return {
        defaults: equal(state.defaults, nextDefaults) ? state.defaults : nextDefaults,
        items: next.every((a, i) => a === state.items[i]) ? state.items : next,
      };
    });
  }

  const resizeContext = useRef<{
    token: object;
    selected: Set<string>;
    linked: boolean;
    group: object;
  } | null>(null);
  const keyboardResize = useRef<{ code: string; token: object } | null>(null);

  function resizeMarkers(delta: number, token: object) {
    if (
      !selected.size ||
      busy ||
      !session ||
      hostOverlayOpen ||
      document.querySelector('.folio-workbench [role="dialog"]')
    )
      return;
    let context = resizeContext.current;
    if (
      !context ||
      context.token !== token ||
      context.selected !== selected ||
      context.linked !== linked
    ) {
      context = { token, selected, linked, group: {} };
      resizeContext.current = context;
    }
    commitSnapshot((state, baseline) => {
      const original = new Map(baseline.items.map((a) => [a.id, a]));
      const items = state.items.map((a) =>
        selected.has(a.id) ? resizeStyle(a, original.get(a.id) ?? a, delta, linked) : a,
      );
      if (items.every((a, i) => a === state.items[i])) return state;
      const activeMarker = findLastMatching(items, (a) => selected.has(a.id));
      if (!activeMarker) return state;
      return {
        items,
        defaults: {
          ...state.defaults,
          size: activeMarker.size,
          textSize: linked ? activeMarker.textSize : state.defaults.textSize,
        },
      };
    }, context.group);
  }

  const editMarker = useCallback(
    (id: string) => {
      const a = history.current.current.items.find((a) => a.id === id);
      if (a) {
        setEditing(id);
        setEditValue(String(a.number));
      }
    },
    [history.current],
  );

  function confirmNumber() {
    const value = Number(editValue);
    if (!Number.isSafeInteger(value) || value < 0 || value > 999999) {
      notify('请输入 0 至 999999 之间的整数', true);
      return;
    }
    commit((items) => items.map((a) => (a.id === editing ? { ...a, number: value } : a)));
    setEditing(null);
    notify(`序号已修改为 ${value}`);
  }

  async function runExport(options?: ImageOptions) {
    const current = session;
    if (!current || job || exportController.current) return false;
    if (current.resourceErrors.size && options) {
      notify('字体资源不完整，请重新加载文档后再导出图片', true);
      return false;
    }
    const next = new AbortController();
    exportController.current = next;
    setExportDialog(false);
    setJob({
      label: options ? '正在准备图片…' : '正在生成带标注的 PDF…',
      progress: 0,
      kind: 'export',
    });
    try {
      const { download, exportPdf, exportImages } = await import('./core/export');
      if (options) {
        const result = await exportImages(
          current,
          markers,
          options,
          next.signal,
          (value, label) => setJob({ progress: value, label, kind: 'export' }),
        );
        const saved = await download(result.blob, result.name);
        if (saved.status === 'cancelled') return false;
        notify(
          result.capped
            ? '导出完成。部分大页面已降低分辨率以控制内存。'
            : `已导出 ${options.pages.length} 页图片`,
        );
      } else {
        const editable = preferences.editablePdf;
        const blob = await exportPdf(current, markers, next.signal, { editable, nextNumber });
        next.signal.throwIfAborted();
        const saved = await download(blob, `${current.name}_已标记.pdf`);
        if (saved.status === 'cancelled') return false;
        notify(
          editable
            ? 'PDF 已保存，再次导入可继续编辑序号'
            : '普通 PDF 已导出，序号已固定在页面中',
        );
      }
      return true;
    } catch (e) {
      if (!next.signal.aborted)
        notify(`导出失败：${e instanceof Error ? e.message : String(e)}`, true);
      return false;
    } finally {
      exportController.current = null;
      setJob(null);
    }
  }

  const actions = useRef({
    active,
    hostOverlayOpen,
    session,
    job,
    busy,
    selected,
    markers,
    undo,
    redo,
    runExport,
    deleteMarkers,
    resizeMarkers,
    triggerPickPdf,
  });
  actions.current = {
    active,
    hostOverlayOpen,
    session,
    job,
    busy,
    selected,
    markers,
    undo,
    redo,
    runExport,
    deleteMarkers,
    resizeMarkers,
    triggerPickPdf,
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!actions.current.active || actions.current.hostOverlayOpen) return;
      const target = e.target as HTMLElement;
      const command = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (e.isComposing) return;
      // File commands also work while a property field has focus (macOS / Windows).
      if (command && (k === 's' || k === 'o')) {
        e.preventDefault();
        if (
          actions.current.busy ||
          document.querySelector('.folio-workbench [role="dialog"]')
        )
          return;
        if (k === 'o') {
          void actions.current.triggerPickPdf();
          return;
        }
        if (actions.current.session) {
          target.blur();
          requestAnimationFrame(() => void actions.current.runExport());
        }
        return;
      }
      if (
        /INPUT|SELECT|TEXTAREA/.test(target.tagName) ||
        target.isContentEditable ||
        target.closest('[role="dialog"]') ||
        document.querySelector('.folio-workbench [role="dialog"]')
      )
        return;
      const { session, busy, selected, markers, undo, redo, deleteMarkers } = actions.current;
      if (!session || busy) return;
      if (command && k === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (command && k === 'y') {
        e.preventDefault();
        redo();
      } else if (command && k === 'a') {
        e.preventDefault();
        setSelected(new Set(markers.map((a) => a.id)));
      } else if (command && k === '0') {
        e.preventDefault();
        viewer.current?.fit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitMarkerMode();
        viewer.current?.focus();
      } else if (!command && ['n', 'v', 'h'].includes(k)) {
        e.preventDefault();
        setTool(k === 'n' ? 'marker' : k === 'v' ? 'select' : 'hand');
        viewer.current?.focus();
      } else if (!command && !e.altKey && k === 'w') {
        e.preventDefault();
        setWheelZoom((value) => !value);
      } else if (
        !command &&
        !e.altKey &&
        !e.shiftKey &&
        selected.size &&
        (e.code === 'BracketLeft' || e.code === 'BracketRight')
      ) {
        e.preventDefault();
        if (!e.repeat || keyboardResize.current?.code !== e.code)
          keyboardResize.current = { code: e.code, token: {} };
        actions.current.resizeMarkers(
          e.code === 'BracketRight' ? 1 : -1,
          keyboardResize.current!.token,
        );
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteMarkers(selected);
      } else if (e.key.startsWith('Arrow') && selected.size) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        commit((items) =>
          items.map((a) =>
            selected.has(a.id)
              ? {
                  ...a,
                  x: clamp(
                    a.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0),
                    0,
                    session.pages[a.page - 1].width,
                  ),
                  y: clamp(
                    a.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0),
                    0,
                    session.pages[a.page - 1].height,
                  ),
                }
              : a,
          ),
        );
      }
    };
    const endResize = () => {
      keyboardResize.current = null;
    };
    document.addEventListener('keydown', key);
    document.addEventListener('keyup', endResize);
    window.addEventListener('blur', endResize);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('keyup', endResize);
      window.removeEventListener('blur', endResize);
    };
  }, [commit, setTool, exitMarkerMode]);

  function cancelJob() {
    controller.current?.abort();
    setPendingPaint(null);
    exportController.current?.abort();
    if (password) {
      password.resolve(null);
      setPassword(null);
    }
    notify('已取消操作');
  }

  function changeCompatibility() {
    if (!session || job) return;
    const original = new File([session.bytes.slice().buffer], `${session.name}.pdf`, {
      type: 'application/pdf',
    });
    setSettings(false);
    void openFile(original, markers, !session.compatibility, session.password, 'compatibility');
  }

  function retryResources() {
    if (!session || busy) return;
    setSettings(false);
    const original = new File([session.bytes.slice().buffer], `${session.name}.pdf`, {
      type: 'application/pdf',
    });
    void openFile(original, markers, session.compatibility, session.password, 'resources');
  }

  async function clearLocalDrafts() {
    if (busy || clearingDrafts) return;
    setClearingDrafts(true);
    setClearDraftError('');
    const wasReady = sourceReady.current,
      wasTarget = sessionTarget.current;
    try {
      clearTimeout(draftTimer.current);
      sourceReady.current = null;
      await draftWrites.current.catch(() => {});
      await clearDrafts();
      controller.current?.abort();
      exportController.current?.abort();
      sourceFailed.current = false;
      sessionTarget.current = null;
      viewState.current = null;
      setLastDraftId(undefined);
      rememberTabWorkspace({ screen: 'home' });
      setLibraryRevision((value) => value + 1);
      setSaveState('saved');
      setSession(null);
      replace([]);
      setSelected(new Set());
      setCurrentPage(1);
      setTool('select');
      setResourceErrors([]);
      setNextNumber(1);
      setInitialView(undefined);
      setJob(null);
      setPendingPaint(null);
      setConfirmClearDrafts(false);
      setSettings(false);
      notify('本机草稿已清除');
    } catch (error) {
      sourceReady.current = wasReady;
      sessionTarget.current = wasTarget;
      setClearDraftError(
        `清除失败：${error instanceof Error ? error.message : String(error)}。请重试。`,
      );
    } finally {
      setClearingDrafts(false);
    }
  }

  const inspector = (
    <Inspector
      simplifiedPalette={preferences.simplifiedPalette}
      onSimplifiedPaletteChange={(simplifiedPalette) =>
        setPreferences((current) => ({ ...current, simplifiedPalette }))
      }
      placement={inspectorPlacement}
      onPlacementChange={(placement) => {
        setInspectorPlacement(placement);
      }}
      style={activeStyle}
      selected={selectedMarkers}
      next={nextNumber}
      linked={linked}
      onLinked={setLinked}
      onNext={setNextNumber}
      onChange={changeStyle}
      onNumber={(number) =>
        commit((items) => items.map((a) => (selected.has(a.id) ? { ...a, number } : a)))
      }
      onReset={() => {
        commitSnapshot((state) => ({
          defaults: DEFAULT_STYLE,
          items: selected.size
            ? state.items.map((a) => (selected.has(a.id) ? { ...a, ...DEFAULT_STYLE } : a))
            : state.items,
        }));
      }}
      disabled={!session || busy}
    />
  );

  const saveStatus =
    saveState === 'saving'
      ? '正在保存本机草稿'
      : saveState === 'unavailable'
        ? '自动保存不可用，请及时导出 PDF'
        : '已自动保存至本机草稿';

  return (
    <div
      ref={rootRef}
      data-folio-theme={theme}
      className={`folio-workbench app ${!session ? 'has-home' : ''} ${sidebarOpen ? '' : 'sidebar-collapsed'} inspector-open ${inspectorPlacement === 'toolbar' ? 'properties-toolbar' : ''} ${preferences.showToolWindowNames ? 'show-tool-window-names' : 'hide-tool-window-names'}`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
          dragDepth.current++;
          setDraggingFile(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current--;
        if (dragDepth.current <= 0) setDraggingFile(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDraggingFile(false);
        if (
          !busy &&
          !hostOverlayOpen &&
          !document.querySelector('.folio-workbench [role="dialog"]') &&
          e.dataTransfer.files[0]
        )
          requestOpenFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        aria-label="选择 PDF 文件"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) requestOpenFile(file);
        }}
      />
      <nav className="command-bar" aria-label="标注工具" hidden={!session}>
        <div className="command-left">
          <button
            className="icon-btn sidebar-toggle"
            title={sidebarOpen ? '收起页面导航' : '展开页面导航'}
            aria-label="切换页面导航"
            aria-expanded={sidebarOpen}
            aria-controls="folio-page-navigation"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          <div className="tool-group">
            {(
              [
                ['select', MousePointer2, '选择', 'V'],
                ['marker', CirclePlus, '添加序号', 'N'],
                ['hand', Hand, '平移', 'H'],
              ] as const
            ).map(([key, Icon, text, shortcut]) => (
              <button
                key={key}
                className={tool === key ? 'active' : ''}
                data-state={key}
                aria-pressed={tool === key}
                aria-label={text}
                onClick={() => setTool(key)}
                disabled={!session || busy}
                title={`${text} (${shortcut})`}
              >
                <Icon size={16} />
                <span className="tool-window-name">{text}</span>
                <kbd>{shortcut}</kbd>
              </button>
            ))}
          </div>
          <span className="toolbar-divider" />
          <button
            className="icon-btn"
            aria-label="撤销"
            title="撤销 Ctrl / ⌘ Z"
            disabled={!history.past.length || busy}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-btn"
            aria-label="重做"
            title="重做 Ctrl / ⌘ Shift Z"
            disabled={!history.future.length || busy}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <span className="selection-summary">
            {selected.size
              ? `已选 ${selected.size} 个`
              : session
                ? '选择、标注，或拖动图纸'
                : '准备好开始一份新图纸'}
          </span>
        </div>
        <div className="command-right">
          <button
            className="icon-btn"
            aria-label="返回图纸首页"
            title="返回图纸首页，保留本机草稿"
            disabled={busy}
            onClick={() => void returnHome()}
          >
            <House size={17} />
          </button>
          <button
            className="workspace-recent-search"
            aria-label="搜索最近工作"
            aria-haspopup="dialog"
            aria-expanded={recentPickerOpen}
            aria-keyshortcuts="Meta+P Control+P"
            title="搜索与切换最近工作（⌘ / Ctrl P）"
            disabled={busy}
            onClick={() => setRecentPickerOpen(true)}
          >
            <Search size={15} />
            <span>搜索最近工作</span>
            <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ P' : 'Ctrl P'}</kbd>
          </button>
          <button
            className="icon-btn fullscreen-toggle"
            aria-label={immersive ? '退出沉浸画布' : '沉浸画布'}
            title={immersive ? '退出沉浸画布' : '沉浸画布（隐藏主导航栏）'}
            aria-pressed={immersive}
            onClick={onToggleImmersive}
          >
            {immersive ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
          <ExportMenu
            disabled={!session || busy}
            onPdf={() => void runExport()}
            editablePdf={preferences.editablePdf}
            onEditablePdfChange={(editablePdf) => setPreferences((p) => ({ ...p, editablePdf }))}
            onImages={() => setExportDialog(true)}
          />
          <button
            className="icon-btn"
            aria-label="工作台设置"
            title="工作台设置"
            onClick={() => {
              setSettingsPage('general');
              setSettings(true);
            }}
          >
            <Settings size={17} />
          </button>
        </div>
        <span
          className={`draft-state workspace-save-state ${saveState === 'unavailable' ? 'has-warning' : ''}`}
          role="status"
          aria-label={saveStatus}
          title={saveStatus}
        >
          {saveState === 'saving' ? (
            <span className="spinner small" />
          ) : saveState === 'unavailable' ? (
            <AlertTriangle size={12} />
          ) : (
            <span className="status-dot" />
          )}
          <span className="save-state-label">{saveStatus}</span>
        </span>
        {inspectorPlacement === 'toolbar' && inspector}
      </nav>
      <main className="workbench">
        {!initializing && (
          <RecentDocuments
            active={active}
            hostOverlayOpen={hostOverlayOpen}
            home={!session}
            pickerOpen={recentPickerOpen}
            onPickerOpenChange={setRecentPickerOpen}
            protectedId={session?.draftId}
            activeId={lastDraftId}
            revision={libraryRevision}
            busy={busy}
            onOpen={(id) => void openSavedDraft(id)}
            onDeleted={(id) => {
              notify('草稿已删除，原始 PDF 文件不受影响');
              if (id === lastDraftId) {
                setLastDraftId(undefined);
                rememberTabWorkspace({ screen: 'home' });
              }
            }}
          />
        )}
        {session && (
          <div
            ref={navShellRef}
            id="folio-page-navigation"
            className="page-navigation-shell"
            aria-hidden={!sidebarOpen}
          >
            <Sidebar
              open={sidebarOpen}
              session={session}
              markers={markers}
              selected={selected}
              onSelect={setSelected}
              tab={sidebarTab}
              onTab={setSidebarTab}
              currentPage={currentPage}
              onJump={(page) => viewer.current?.jump(page)}
            />
          </div>
        )}
        <section className="document-workspace" aria-label="PDF 画布">
          {!loadingDocument && (
            <div className="toast-region" aria-label="操作通知">
              {notifications.map((notification) => (
                <Toast
                  key={notification.id}
                  notification={notification}
                  onDismiss={dismissNotification}
                />
              ))}
            </div>
          )}
          {session ? (
            <Viewer
              ref={viewer}
              active={active}
              hostOverlayOpen={hostOverlayOpen}
              disabled={busy}
              session={session}
              markers={markers}
              selected={selected}
              tool={tool}
              style={defaults}
              nextNumber={nextNumber}
              scale={scale}
              wheelZoom={wheelZoom}
              wheelResize={wheelResize}
              onResize={resizeMarkers}
              onResizeHover={setResizeHovered}
              onScale={setScale}
              onPage={setCurrentPage}
              onSelect={setSelected}
              onAdd={addMarker}
              onExitMarkerMode={exitMarkerMode}
              onCommit={commit}
              onDelete={deleteMarkers}
              onEdit={editMarker}
              onFirstPaint={firstPaint}
              zoomMode={zoomMode}
              pageSpacing={preferences.pageSpacing}
              onZoomMode={setZoomMode}
              initialView={initialView}
              onViewChange={changeView}
            />
          ) : (
            <div className="empty-workspace">
              <div className="empty-eyebrow">
                <span />
                QI / QC ENGINEERING DRAWING
              </div>
              <div className="paper-illustration" aria-hidden="true">
                <div className="illus-paper back" />
                <div className="illus-paper front">
                  <span className="illus-heading" />
                  <div className="illus-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="illus-part">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="illus-dimension" />
                  <span className="illus-marker one">1</span>
                  <span className="illus-marker two">2</span>
                  <span className="illus-block" />
                </div>
                <div className="illus-check">
                  <CircleCheck size={18} />
                </div>
              </div>
              <h1>图纸标注，清晰有序。</h1>
              <p>
                打开工程图纸 PDF，快速添加尺寸气泡序号。
                <br />
                多页浏览、精细调整，支持矢量 PDF 与高清分块导出。
              </p>
              <button
                className="primary-button empty-open"
                onClick={() => void triggerPickPdf()}
                disabled={busy}
              >
                <FileUp size={17} />
                选择 PDF 文件
                <ArrowUpRight size={16} />
              </button>
              <span className="empty-drop">也可以将 PDF 图纸直接拖放到这里</span>
              <div className="empty-features">
                <span>
                  <ShieldCheck size={14} />
                  本机离线处理
                </span>
                <span>
                  <CirclePlus size={14} />
                  矢量气泡标注
                </span>
                <span>
                  <FileText size={14} />
                  支持二次编辑
                </span>
              </div>
            </div>
          )}
          {session && (
            <div className="canvas-controls">
              <div className="page-control">
                <button
                  className="icon-btn"
                  aria-label="上一页"
                  disabled={currentPage <= 1}
                  onClick={() => viewer.current?.jump(currentPage - 1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <label>
                  <input
                    aria-label="当前页码"
                    type="number"
                    min="1"
                    max={session.pages.length}
                    value={currentPage}
                    onChange={(e) => {
                      if (
                        e.target.valueAsNumber >= 1 &&
                        e.target.valueAsNumber <= session.pages.length
                      )
                        viewer.current?.jump(e.target.valueAsNumber);
                    }}
                  />
                  <span>/ {session.pages.length}</span>
                </label>
                <button
                  className="icon-btn"
                  aria-label="下一页"
                  disabled={currentPage >= session.pages.length}
                  onClick={() => viewer.current?.jump(currentPage + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <span className="toolbar-divider" />
              <button
                className="icon-btn"
                aria-label="缩小"
                onClick={() => viewer.current?.zoom(1 / 1.2)}
              >
                <Minus size={16} />
              </button>
              <select
                aria-label="缩放比例"
                value={Math.round(scale * 100)}
                onChange={(e) => viewer.current?.setZoom(Number(e.target.value) / 100)}
              >
                {[
                  ...new Set([
                    10,
                    25,
                    50,
                    75,
                    100,
                    150,
                    200,
                    300,
                    400,
                    600,
                    800,
                    1600,
                    3200,
                    Math.round(scale * 100),
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
              </select>
              <button
                className="icon-btn"
                aria-label="放大"
                onClick={() => viewer.current?.zoom(1.2)}
              >
                <Plus size={16} />
              </button>
              <span className="toolbar-divider" />
              <button
                className="fit-button"
                onClick={() => viewer.current?.fit()}
                title="适应宽度 Ctrl / ⌘ 0"
              >
                <ScanLine size={15} />
                <span>适应宽度</span>
              </button>
            </div>
          )}
          {resourceErrors.length > 0 && (
            <div className="resource-warning" role="alert">
              <AlertTriangle size={16} />
              <span>字体或解码资源未完整加载，当前页面可能缺失内容。</span>
              <button onClick={retryResources} disabled={busy}>
                <RotateCw size={12} />
                重新加载资源
              </button>
              <button
                onClick={() => {
                  setSettingsPage('resources');
                  setSettings(true);
                }}
              >
                详情
              </button>
            </div>
          )}
          {job?.kind === 'export' && (
            <div className="job-banner" role="status">
              <span className="spinner" />
              <div>
                <strong>{job.label}</strong>
                <div className="progress-track">
                  <span style={{ width: `${Math.max(3, job.progress)}%` }} />
                </div>
              </div>
              <button className="icon-btn" aria-label="取消当前操作" onClick={cancelJob}>
                <X size={16} />
              </button>
            </div>
          )}
        </section>
        {session && inspectorPlacement === 'sidebar' && inspector}
      </main>
      {session && (
        <footer className="status-bar">
          <div className="status-left">
            <button
              className="footer-open"
              onClick={() => void triggerPickPdf()}
              disabled={busy}
              title="打开 PDF（⌘ / Ctrl O）"
            >
              <FileUp size={13} />
              <span>打开 PDF</span>
            </button>
            <span className="status-separator" />
            <div className="document-name">
              <Filename value={session ? `${session.name}.pdf` : '未打开文档'} />
            </div>
          </div>
          <div className="status-right">
            {session && (
              <span className="document-page-count">
                第 {currentPage} / {session.pages.length} 页
              </span>
            )}
            <span className="status-marker-count">{markers.length} 个标注</span>
            <span className="status-separator" />
            <button
              onClick={() => setWheelZoom((v) => !v)}
              title={
                resizeHovered
                  ? '鼠标移开序号后恢复文档滚轮行为；W 切换文档滚轮模式'
                  : '切换滚轮行为（W）'
              }
              aria-keyshortcuts="W"
            >
              {resizeHovered && session && wheelResize
                ? `滚轮调整圆圈 · 字号联动${linked ? '已开启' : '已关闭'}`
                : `滚轮${wheelZoom ? '缩放' : '翻页'}`}
              <kbd className="wheel-key">W</kbd>
              <ChevronDown size={11} />
            </button>
            <span className="status-separator" />
            <button
              className="footer-settings"
              title="快捷键与设置"
              aria-label="快捷键与设置"
              onClick={() => {
                setSettingsPage('shortcuts');
                setSettings(true);
              }}
            >
              <Keyboard size={13} />
              <span>快捷键与设置</span>
            </button>
            <span className="status-separator" />
            <span className="desktop-offline-badge" title="所有 PDF 解析、中文字体映射和导出引擎均已内置于本机">
              <CheckCircle2 size={12} />
              <span>离线引擎就绪</span>
            </span>
          </div>
        </footer>
      )}
      {loadingDocument && (
        <LoadingScreen
          label={
            job?.kind === 'open'
              ? job.label
              : initializing
                ? '正在恢复工作台…'
                : '正在绘制页面'
          }
          progress={job?.kind === 'open' ? job.progress : undefined}
          onCancel={job?.kind === 'open' || pendingPaint ? cancelJob : undefined}
        />
      )}
      {!session && !initializing && (
        <div className="home-local">
          <HardDrive size={13} aria-hidden="true" />
          内置离线 PDF.js {pdfPackage.version} · 文件仅存本机
        </div>
      )}
      {exportDialog && session && (
        <ExportDialog
          markers={markers}
          session={session}
          currentPage={currentPage}
          onClose={() => setExportDialog(false)}
          initialPreferences={preferences.imageExport}
          onPreferencesChange={changeExportPreferences}
          onExport={(options) => void runExport(options)}
        />
      )}
      {editing && (
        <Dialog title="编辑序号" onClose={() => setEditing(null)}>
          <label className="dialog-label" htmlFor="edit-number">
            序号
          </label>
          <input
            id="edit-number"
            type="number"
            min="0"
            max="999999"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmNumber();
            }}
          />
          <div className="dialog-actions">
            <button onClick={() => setEditing(null)}>取消</button>
            <button className="primary-button" onClick={confirmNumber}>
              保存修改
            </button>
          </div>
        </Dialog>
      )}
      {password && (
        <Dialog
          title={password.incorrect ? '密码不正确，请重试' : '此 PDF 需要密码'}
          onClose={() => {
            password.resolve(null);
            setPassword(null);
          }}
        >
          <p className="dialog-description">输入文档的打开密码。密码不会保存到本机草稿。</p>
          <input
            type="password"
            aria-label="PDF 打开密码"
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                password.resolve(passwordValue);
                setPassword(null);
              }
            }}
          />
          <div className="dialog-actions">
            <button
              onClick={() => {
                password.resolve(null);
                setPassword(null);
              }}
            >
              取消
            </button>
            <button
              className="primary-button"
              onClick={() => {
                password.resolve(passwordValue);
                setPassword(null);
              }}
            >
              打开文档
            </button>
          </div>
        </Dialog>
      )}
      {settings && (
        <Dialog
          title={confirmClearDrafts ? '清除本机草稿？' : '工作台设置'}
          className={confirmClearDrafts ? 'clear-draft-dialog' : 'workbench-settings'}
          initialFocus={confirmClearDrafts ? '[data-dialog-cancel]' : undefined}
          descriptionId={confirmClearDrafts ? 'clear-draft-description' : undefined}
          closeDisabled={clearingDrafts}
          onClose={() => {
            if (clearingDrafts) return;
            if (confirmClearDrafts) setConfirmClearDrafts(false);
            else setSettings(false);
          }}
        >
          {confirmClearDrafts ? (
            <>
              <div className="clear-draft-summary">
                <span className="clear-draft-icon">
                  <Trash2 size={23} />
                </span>
                <div>
                  <strong>删除本机保存的全部图纸草稿与标注</strong>
                  <p id="clear-draft-description">
                    全部本机草稿都会删除，当前文档也会关闭，且无法撤销。请先导出需要保留的内容。
                  </p>
                </div>
              </div>
              <div className="clear-draft-note">
                <AlertTriangle size={15} />
                <span>如需以后继续编辑，请开启“允许二次编辑”后保存 PDF。</span>
              </div>
              {clearDraftError && (
                <p className="clear-draft-error" role="alert">
                  {clearDraftError}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  data-dialog-cancel
                  disabled={clearingDrafts}
                  onClick={() => setConfirmClearDrafts(false)}
                >
                  保留草稿
                </button>
                <button
                  className="danger-button"
                  disabled={busy || clearingDrafts}
                  onClick={() => void clearLocalDrafts()}
                >
                  {clearingDrafts ? '正在清除…' : '确认清除'}
                </button>
              </div>
            </>
          ) : (
            <div className="settings-layout">
              <aside className="settings-sidebar">
                <div className="settings-sidebar-heading">工作台设置</div>
                <nav className="settings-nav" aria-label="设置分类">
                  {(
                    [
                      ['general', '通用设置'],
                      ['shortcuts', '快捷键'],
                      ['resources', '隐私与资源'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      aria-current={settingsPage === id ? 'page' : undefined}
                      onClick={() => setSettingsPage(id)}
                    >
                      {label}
                      {id === 'resources' && resourceErrors.length > 0 && (
                        <span className="settings-nav-warning" aria-label="资源加载异常">
                          <AlertTriangle size={13} />
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
                <div className="settings-sidebar-footer">
                  <span>
                    <ShieldCheck size={14} />
                    文档仅在本机处理
                  </span>
                  <small>Folio 2.0 · PDF.js {pdfPackage.version}</small>
                </div>
              </aside>
              <div className="settings-content" key={settingsPage}>
                <header className="settings-page-heading">
                  <h3>
                    {settingsPage === 'general'
                      ? '通用设置'
                      : settingsPage === 'shortcuts'
                        ? '快捷键'
                        : '隐私与资源'}
                  </h3>
                  <p>
                    {settingsPage === 'general'
                      ? '调整操作习惯，管理工作台与本机数据。'
                      : settingsPage === 'shortcuts'
                        ? '让标注、导航和导出更顺手。'
                        : '了解文档的保存方式，管理本机配套资源。'}
                  </p>
                </header>
                {settingsPage === 'general' && (
                  <>
                    <section className="settings-group" aria-labelledby="settings-interaction">
                      <h4 id="settings-interaction">操作与显示</h4>
                      <div className="settings-card">
                        <button
                          className={`settings-row settings-toggle ${preferences.showToolWindowNames ? 'active' : ''}`}
                          role="switch"
                          aria-label="显示工具窗口名称"
                          aria-checked={preferences.showToolWindowNames}
                          onClick={() =>
                            setPreferences((p) => ({
                              ...p,
                              showToolWindowNames: !p.showToolWindowNames,
                            }))
                          }
                        >
                          <span className="settings-row-copy">
                            <strong>显示工具窗口名称</strong>
                            <small>开启后显示图标与名称，关闭时仅显示图标</small>
                          </span>
                          <span className="toggle-switch" aria-hidden="true" />
                        </button>
                        <button
                          className={`settings-row settings-toggle ${wheelResize ? 'active' : ''}`}
                          role="switch"
                          aria-checked={wheelResize}
                          onClick={() => setWheelResize((value) => !value)}
                        >
                          <span className="settings-row-copy">
                            <strong>悬停选中序号时，滚轮调整大小</strong>
                            <small>鼠标移开后恢复文档滚轮行为；Ctrl＋滚轮始终缩放</small>
                          </span>
                          <span className="toggle-switch" aria-hidden="true" />
                        </button>
                        <button
                          className={`settings-row settings-toggle ${session?.compatibility ? 'active' : ''}`}
                          disabled={!session || busy}
                          aria-pressed={session?.compatibility ?? false}
                          onClick={changeCompatibility}
                        >
                          <span className="settings-row-copy">
                            <strong>{session?.compatibility ? '兼容模式已开启' : '启用兼容模式'}</strong>
                            <small>
                              {!session
                                ? '打开 PDF 后可用，适用于字体或显示异常'
                                : '显示异常时尝试；保留标注重新加载，速度可能降低'}
                            </small>
                          </span>
                          <span className="toggle-switch" aria-hidden="true" />
                        </button>
                      </div>
                    </section>
                    <section className="settings-group" aria-labelledby="settings-spacing">
                      <h4 id="settings-spacing">画布留白与页面间距</h4>
                      <div className="settings-card">
                        {(
                          [
                            ['paddingX', '左右留白', '纸张左右两侧各预留的距离'],
                            ['paddingY', '上下留白', '文档顶部与底部各预留的距离'],
                            ['gap', '页面间距', '相邻两页之间的距离'],
                          ] as const
                        ).map(([key, label, hint]) => (
                          <div className="settings-row settings-spacing-row" key={key}>
                            <label className="settings-row-copy" htmlFor={`page-spacing-${key}`}>
                              <strong>{label}</strong>
                              <small>{hint}，设为 0 可取消</small>
                            </label>
                            <div className="settings-spacing-controls">
                              <input
                                type="range"
                                aria-label={`${label}滑条`}
                                min={0}
                                max={MAX_PAGE_SPACING}
                                step={1}
                                value={preferences.pageSpacing[key]}
                                onChange={(event) => {
                                  const value = Number(event.currentTarget.value);
                                  setPreferences((p) => ({
                                    ...p,
                                    pageSpacing: { ...p.pageSpacing, [key]: value },
                                  }));
                                }}
                              />
                              <NumberField
                                id={`page-spacing-${key}`}
                                label={label}
                                value={preferences.pageSpacing[key]}
                                min={0}
                                max={MAX_PAGE_SPACING}
                                unit="px"
                                onChange={(value) =>
                                  setPreferences((p) => ({
                                    ...p,
                                    pageSpacing: { ...p.pageSpacing, [key]: value },
                                  }))
                                }
                              />
                            </div>
                          </div>
                        ))}
                        <div className="settings-row">
                          <span className="settings-row-copy">
                            <small>
                              调整后立即生效并自动记住；左右留白在“适应宽度”时生效，缩小时纸张仍会居中。
                            </small>
                          </span>
                          <button
                            className="settings-text-button"
                            onClick={() =>
                              setPreferences((p) => ({
                                ...p,
                                pageSpacing: { ...DEFAULT_PAGE_SPACING },
                              }))
                            }
                          >
                            恢复默认间距
                          </button>
                        </div>
                      </div>
                    </section>
                    <section className="settings-group" aria-labelledby="settings-local">
                      <h4 id="settings-local">工作台与数据</h4>
                      <div className="settings-card">
                        <div className="settings-row">
                          <span className="settings-row-copy">
                            <strong>自动记住工作台</strong>
                            <small>布局、操作习惯、标注样式与导出选项自动保存</small>
                          </span>
                          <button
                            className="settings-text-button"
                            onClick={() => {
                              setSidebarOpen(false);
                              setSidebarTab('pages');
                              setInspectorPlacement('toolbar');
                              setPreferences((p) => ({
                                ...p,
                                showToolWindowNames: false,
                                pageSpacing: { ...DEFAULT_PAGE_SPACING },
                              }));
                              setWheelZoom(false);
                              setZoomMode('fit');
                              viewer.current?.fit();
                              setSettings(false);
                            }}
                          >
                            恢复默认布局
                          </button>
                        </div>
                        <div className="settings-row">
                          <span className="settings-row-copy">
                            <strong>本机草稿缓存</strong>
                            <small>
                              {cacheStats
                                ? `已保存 ${cacheStats.draftCount} 份图纸 · 占用 ${formatFileSize(cacheStats.totalBytes)} / ${formatFileSize(cacheStats.limitBytes)}（超限自动清理最久未用）`
                                : '每份 PDF 按内容去重落盘保存，超限自动按 LRU 清理，可在主软件设置调整上限'}
                            </small>
                          </span>
                          <button
                            className="settings-text-button settings-danger-action"
                            disabled={busy}
                            onClick={() => {
                              setClearDraftError('');
                              setConfirmClearDrafts(true);
                            }}
                          >
                            清除本机草稿
                          </button>
                        </div>
                      </div>
                    </section>
                  </>
                )}
                {settingsPage === 'shortcuts' && (
                  <section className="settings-group" aria-label="工作台快捷键">
                    <h4>操作快捷键</h4>
                    <div className="shortcut-grid">
                      <span>
                        最近工作<kbd>⌘ / Ctrl P</kbd>
                      </span>
                      <span>
                        选择工具<kbd>V</kbd>
                      </span>
                      <span>
                        添加序号<kbd>N</kbd>
                      </span>
                      <span>
                        退出添加，恢复原工具<kbd>Esc / 右键</kbd>
                      </span>
                      <span>
                        平移工具<kbd>H</kbd>
                      </span>
                      <span>
                        临时平移<kbd>Space</kbd>
                      </span>
                      <span>
                        撤销<kbd>⌘ / Ctrl Z</kbd>
                      </span>
                      <span>
                        重做<kbd>⌘ / Ctrl ⇧ Z</kbd>
                      </span>
                      <span>
                        多选 / 框选<kbd>Shift</kbd>
                      </span>
                      <span>
                        编辑序号<kbd>双击 / Enter</kbd>
                      </span>
                      <span>
                        方向微调<kbd>↑ ↓ ← →</kbd>
                      </span>
                      <span>
                        保存 PDF<kbd>⌘ / Ctrl S</kbd>
                      </span>
                      <span>
                        滚轮翻页 / 缩放<kbd>W</kbd>
                      </span>
                      <span>
                        缩小 / 放大选中序号<kbd>[ / ]</kbd>
                      </span>
                      <span>
                        缩放文档<kbd>Ctrl + 滚轮</kbd>
                      </span>
                    </div>
                  </section>
                )}
                {settingsPage === 'resources' && (
                  <section className="settings-group" aria-label="隐私与资源说明">
                    <h4>本机处理与离线资源</h4>
                    <div className="settings-help">
                      <p>
                        PDF 仅在桌面应用本机内存中解析、标注与导出，绝不上传至任何远程服务器。如需跨电脑继续编辑，请在导出菜单开启“允许二次编辑”后保存 PDF。
                      </p>
                      <p>
                        中文字体映射（CMaps）、标准字体、ICC 与图像解码器均随桌面程序内置，无需联网或额外安装系统字体。原 PDF 未嵌入的专用字体仍可能存在替代差异。
                      </p>
                      <p>
                        资源加载失败会自动重试，也可手动重新加载。软件版本更新由桌面端内置自动更新统一管理。
                      </p>
                      <button
                        className="reload-resources"
                        onClick={retryResources}
                        disabled={!session || busy}
                      >
                        <RotateCw size={14} />
                        重新加载资源与图纸
                      </button>
                    </div>
                    {resourceErrors.length > 0 && (
                      <div className="diagnostic-errors" role="alert">
                        {resourceErrors.map((error) => (
                          <p key={error}>{error}</p>
                        ))}
                        <p>重新加载后若仍失败，请检查应用资源包是否完整。重试会保留已有标注。</p>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          )}
        </Dialog>
      )}
      {draggingFile && (
        <div className="file-drop-overlay">
          <div>
            <FileUp size={40} />
            <strong>{busy ? '请等待当前操作完成' : '松开以打开 PDF'}</strong>
            <span>文档仅在本机处理</span>
          </div>
        </div>
      )}
    </div>
  );
}
