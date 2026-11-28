import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Toaster, toast } from "sonner";
import {
  ArrowUpDown,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Download,
  Eye,
  FileSpreadsheet,
  Gauge,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Plus,
  Printer,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { api, clearMediaCache } from "@/lib/api";
import { exportJsskExcel, uint8ArrayToBase64 } from "@/lib/excel";
import {
  buildInstrumentStatusMap,
  getTodayStr,
  summarizeExpiryAlerts,
} from "@/lib/status";
import {
  DEFAULT_WARNING_THRESHOLDS,
  getMaxWarningDays,
  getThresholdVisuals,
  sortThresholdsDesc,
} from "@/lib/thresholdColors";
import { cn } from "@/lib/utils";
import { OnboardingSetup } from "@/components/OnboardingSetup";
import { VirtualInstrumentTable } from "@/components/VirtualInstrumentTable";
import { BatchActionBar } from "@/components/BatchActionBar";
import { BatchEditModal } from "@/components/BatchEditModal";
import {
  DEFAULT_PAGE_SIZE,
  TablePagination,
  parseStoredPageSize,
  type PageSizeOption,
} from "@/components/TablePagination";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ReportModal } from "@/components/ReportModal";
import { InstrumentDrawer } from "@/components/InstrumentDrawer";
import {
  AdminLoginModal,
  AppLockOverlay,
  AppLockSetupModal,
  CloseActionPromptModal,
} from "@/components/AuthLockModals";
import { SettingsModal, type SettingsTab } from "@/components/SettingsModal";
import { ImportModal } from "@/components/ImportModal";
import { PrintLedgerView } from "@/components/PrintLedgerView";
import { CommandPalette } from "@/components/CommandPalette";
import { UpdateBannerToast } from "@/components/UpdateBannerToast";
import { SyncBannerToast, SyncConflictModal } from "@/components/SyncOverlay";
import { ExpiryAlertModal } from "@/components/ExpiryAlertModal";
import { ConfirmDialogHost, confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import {
  EASE_PRECISION,
  POPOVER_MOTION,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_ICON,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import { SlidingNumber } from "@/components/ui/MotionPrimitives";
import { PrecisionSelect, SearchField } from "@/components/ui/FormControls";
import { ComplianceMeterCard } from "@/components/ComplianceMeterCard";
import {
  MorphTooltip,
  MorphTooltipProvider,
} from "@/components/ui/MorphTooltip";
import {
  AnimatedBellIcon,
  KeycapBadge,
  useActionStatus,
} from "@/components/ui/InteractiveControls";
import {
  LIGHT_TONE_MESH_IDS,
  isGrainMeshId,
  loadAccountBg,
  saveAccountBg,
  type AccountBgId,
} from "@/lib/accountBackgrounds";
import { SilkFlowCanvas } from "@/components/ui/SilkFlowCanvas";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getNextThemePreference,
  getSystemTheme,
  isTauriEnvironment,
  resolveEffectiveTheme,
  runThemeTransition,
  syncNativeWindowTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePreference,
} from "@/lib/themeTransition";
import {
  ThemeStatusCapsule,
  ThemeSwitcherButton,
} from "@/components/ui/ThemeSwitcherButton";
import { WindowTitleBar } from "@/components/ui/WindowTitleBar";
import {
  I18nProvider,
  getStoredUiLanguage,
  resolveLocale,
  saveStoredUiLanguage,
} from "@/lib/i18n";
import {
  applyUiZoom,
  clampUiScale,
  getStoredUiScalePref,
  resolveEffectiveUiScale,
  saveStoredUiScalePref,
} from "@/lib/uiScale";
import { parseSidebarNavConfig } from "@/lib/sidebarConfig";
import { WorkbenchShell } from "@/workbench/WorkbenchShell";
import { WORKBENCH_TOOLS } from "@/workbench/registry";
import { wipeAllWorkbenchBrowserState } from "@/workbench/tools/pdf-balloon/core/drafts";
import type { WorkbenchIncomingFile } from "@/workbench/types";
import type {
  AppSettings,
  AppearancePreferencesInput,
  AuthStatus,
  CategoryTab,
  ExpiryFilter,
  Instrument,
  ResetAppResult,
  SortMode,
  StatusFilter,
  SyncActionResult,
  SyncConfigView,
  SyncProgressEvent,
  SyncStatusResult,
  UiLanguage,
  UiScaleMode,
  UpdateCheckResult,
  UpdateDownloadProgress,
} from "@/types";

const DEFAULT_SETTINGS: AppSettings = {
  adminUsername: "",
  adminTitle: "系统管理员",
  adminAvatarPath: "",
  warningDays: 60,
  warningThresholds: DEFAULT_WARNING_THRESHOLDS,
  alertPopupEnabled: true,
  alertPopupFrequency: "every_open",
  alertPopupIntervalHours: 4,
  autoLockMinutes: 0,
  closeBehavior: "minimize_to_tray",
  showTrayIcon: true,
  uiLanguage: "system",
  uiScaleMode: "auto",
  uiScale: 1.0,
  appIconId: "default",
  customAppIcons: [],
  compactToolbar: true,
  showImportButton: false,
  sidebarNavConfig: "",
  keepAdminSession: true,
  adminSessionDays: 7,
  appLockEnabled: false,
  appLockPinLength: 0,
  lockOnHide: false,
  lockOnStartup: false,
  docCode: "JSSK-MPR-170",
  docVersion: "A",
  docTitle: "监视与测量管理台账",
  docSubtitle:
    "The management record and plan of monitoring and measuring equipment",
  weeklyNotice: "定期核查监视与测量设备校准有效期，确保量值溯源准确可靠",
  githubRepo: "",
  updateProxyUrl: "",
  companyLogoPath: "",
  workbenchCacheLimitMb: 1024,
  backupIncludePhotos: true,
  backupIncludeReports: true,
  backupIncludeSettings: true,
  backupIncludeWorkbench: false,
};

const PAGE_SIZE_KEY = "instrument_ledger_page_size";
const SIDEBAR_COLLAPSED_KEY = "instrument_ledger_sidebar_collapsed";
const ALERT_MUTED_DATE_KEY = "instrument_ledger_alert_muted_date";
const ALERT_LAST_SHOWN_DATE_KEY = "instrument_ledger_alert_last_shown_date";
const ALERT_LAST_SHOWN_TS_KEY = "instrument_ledger_alert_last_shown_ts";
const SESSION_ROUTE_KEY = "instrument_ledger_session_route_v1";

interface PersistedSessionRoute {
  workspace: "ledger" | "workbench";
  toolId: string | null;
  mountedTools: string[];
  immersive: boolean;
}

function loadInitialSessionRoute(): PersistedSessionRoute {
  const fallback: PersistedSessionRoute = {
    workspace: "ledger",
    toolId: null,
    mountedTools: [],
    immersive: false,
  };
  try {
    const raw = window.sessionStorage.getItem(SESSION_ROUTE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedSessionRoute>;
    const readyIds = new Set(
      WORKBENCH_TOOLS.filter((t) => t.status === "ready").map((t) => t.id)
    );
    const mountedTools = Array.isArray(parsed.mountedTools)
      ? Array.from(
          new Set(
            parsed.mountedTools.filter(
              (id): id is string => typeof id === "string" && readyIds.has(id)
            )
          )
        )
      : [];
    const toolId =
      typeof parsed.toolId === "string" && readyIds.has(parsed.toolId)
        ? parsed.toolId
        : null;
    if (toolId && !mountedTools.includes(toolId)) {
      mountedTools.push(toolId);
    }
    const workspace = parsed.workspace === "workbench" ? "workbench" : "ledger";
    const immersive =
      workspace === "workbench" && Boolean(toolId) && Boolean(parsed.immersive);
    return { workspace, toolId, mountedTools, immersive };
  } catch {
    return fallback;
  }
}

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore storage access issues
  }
}

function loadInitialThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light" || saved === "system") {
      return saved;
    }
  } catch {
    // ignore storage access issues
  }
  return "system";
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrumentsLoaded, setInstrumentsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [auth, setAuth] = useState<AuthStatus>({
    isInitialized: true,
    isAdmin: false,
    username: "",
    isLocked: false,
    appLockEnabled: false,
    appLockPinLength: 0,
    adminSessionExpiresAt: null,
  });
  const authRef = useRef(auth);
  authRef.current = auth;

  // Theme (Default: Follow System -> Light -> Dark) & Collapsible Sidebar
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    loadInitialThemePreference
  );
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(getSystemTheme);
  const [themeCapsuleVisible, setThemeCapsuleVisible] = useState(false);
  const themeCapsuleDelayRef = useRef<number | null>(null);
  const themeCapsuleHideRef = useRef<number | null>(null);
  const theme: ThemeMode = resolveEffectiveTheme(themePreference, systemTheme);
  const themeRef = useRef<ThemeMode>(theme);
  themeRef.current = theme;
  const themePreferenceRef = useRef<ThemePreference>(themePreference);
  themePreferenceRef.current = themePreference;
  const systemThemeRef = useRef<ThemeMode>(systemTheme);
  systemThemeRef.current = systemTheme;
  const themeToggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const [accountBg, setAccountBg] = useState<AccountBgId>(loadAccountBg);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => readStorage(SIDEBAR_COLLAPSED_KEY) === "1"
  );

  // Language & Adaptive UI Scale (restored immediately from localStorage, then synced with SQLite)
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(getStoredUiLanguage);
  const [uiScaleMode, setUiScaleMode] = useState<UiScaleMode>(
    () => getStoredUiScalePref().mode
  );
  const [uiScaleManual, setUiScaleManual] = useState<number>(
    () => getStoredUiScalePref().scale
  );
  const [effectiveUiZoom, setEffectiveUiZoom] = useState<number>(() => {
    const stored = getStoredUiScalePref();
    return resolveEffectiveUiScale(stored.mode, stored.scale);
  });

  const locale = resolveLocale(uiLanguage);
  const isEn = locale === "en";
  const t = useCallback(
    (zh: string, en: string) => (locale === "en" ? en : zh),
    [locale]
  );

  // Sync & apply native WebView zoom immediately and on window resize when in Auto mode
  useEffect(() => {
    const syncZoom = () => {
      const target = resolveEffectiveUiScale(uiScaleMode, uiScaleManual);
      setEffectiveUiZoom(target);
      void applyUiZoom(target);
    };
    saveStoredUiScalePref({ mode: uiScaleMode, scale: uiScaleManual });
    syncZoom();
    if (uiScaleMode !== "auto") return;
    const onResize = () => syncZoom();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [uiScaleMode, uiScaleManual]);

  const handleAccountBgChange = useCallback((next: AccountBgId) => {
    setAccountBg(next);
    saveAccountBg(next);
  }, []);
  const [bellHovered, setBellHovered] = useState(false);
  const {
    status: exportStatus,
    setStatus: setExportStatus,
    setTransientSuccess: setExportSuccess,
  } = useActionStatus(1600);

  const toggleSidebar = useCallback(() => {
    setWorkbenchImmersive((imm) => {
      if (imm) return false;
      setSidebarCollapsed((prev) => {
        const next = !prev;
        writeStorage(SIDEBAR_COLLAPSED_KEY, next ? "1" : "");
        return next;
      });
      return false;
    });
  }, []);

  // Navigation & Filters (restore in-session route across reloads so user stays in place)
  const [initialRoute] = useState<PersistedSessionRoute>(loadInitialSessionRoute);
  const [activeWorkspace, setActiveWorkspace] = useState<"ledger" | "workbench">(
    initialRoute.workspace
  );
  const [activeWorkbenchToolId, setActiveWorkbenchToolId] = useState<string | null>(
    initialRoute.toolId
  );
  const [mountedWorkbenchTools, setMountedWorkbenchTools] = useState<string[]>(
    initialRoute.mountedTools
  );
  const [workbenchImmersive, setWorkbenchImmersive] = useState(
    initialRoute.immersive
  );
  const [workbenchIncomingFiles, setWorkbenchIncomingFiles] = useState<
    Record<string, WorkbenchIncomingFile | null>
  >({});

  useEffect(() => {
    try {
      const payload: PersistedSessionRoute = {
        workspace: activeWorkspace,
        toolId: activeWorkbenchToolId,
        mountedTools: mountedWorkbenchTools,
        immersive: workbenchImmersive,
      };
      window.sessionStorage.setItem(SESSION_ROUTE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage access issues
    }
  }, [
    activeWorkspace,
    activeWorkbenchToolId,
    mountedWorkbenchTools,
    workbenchImmersive,
  ]);

  const [activeTab, setActiveTab] = useState<CategoryTab>("gauge");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [calTypeFilter, setCalTypeFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("seq");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState<PageSizeOption>(() =>
    parseStoredPageSize(readStorage(PAGE_SIZE_KEY))
  );
  const [currentPage, setCurrentPage] = useState(1);

  // Modals / Drawers / Overlays
  const [commandOpen, setCommandOpen] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [mutedToday, setMutedToday] = useState<boolean>(
    () => readStorage(ALERT_MUTED_DATE_KEY) === getTodayStr()
  );
  const startupAlertCheckedRef = useRef(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "view">("view");
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);

  const [lightboxState, setLightboxState] = useState<{
    photoPath: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const [reportInstrument, setReportInstrument] = useState<Instrument | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("appearance");
  const [onboardingPreviewOpen, setOnboardingPreviewOpen] = useState(false);
  const [appLockSetupState, setAppLockSetupState] = useState<{
    open: boolean;
    mode: "enable" | "change";
    lockAfterSave: boolean;
  }>({ open: false, mode: "enable", lockAfterSave: false });
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [windowFocusNonce, setWindowFocusNonce] = useState(0);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [printMounted, setPrintMounted] = useState(false);
  const [printOverrideItems, setPrintOverrideItems] = useState<Instrument[] | null>(
    null
  );

  // Multi-row selection & batch operations state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const lastSelectedIdRef = useRef<number | null>(null);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);

  // Mount PrintLedgerView strictly on demand (eliminates hundreds of hidden DOM nodes)
  useEffect(() => {
    const onBeforePrint = () => setPrintMounted(true);
    const onAfterPrint = () => {
      setPrintMounted(false);
      setPrintOverrideItems(null);
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  // Silent startup & in-app auto-updater state
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);
  const [updatePopupOpen, setUpdatePopupOpen] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const startupUpdateCheckedRef = useRef(false);

  // S3-compatible cloud sync state (manual button + startup check)
  const [syncConfig, setSyncConfig] = useState<SyncConfigView | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressEvent | null>(null);
  const [syncBannerOpen, setSyncBannerOpen] = useState(false);
  const [syncConflictOpen, setSyncConflictOpen] = useState(false);
  const startupSyncCheckedRef = useRef(false);

  // Sync resolved theme to <html> synchronously before browser paint / View Transition capture
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const flashThemeCapsule = useCallback((delayMs = 0) => {
    if (themeCapsuleDelayRef.current !== null) {
      window.clearTimeout(themeCapsuleDelayRef.current);
      themeCapsuleDelayRef.current = null;
    }
    if (themeCapsuleHideRef.current !== null) {
      window.clearTimeout(themeCapsuleHideRef.current);
      themeCapsuleHideRef.current = null;
    }

    const reveal = () => {
      setThemeCapsuleVisible(true);
      themeCapsuleHideRef.current = window.setTimeout(() => {
        setThemeCapsuleVisible(false);
        themeCapsuleHideRef.current = null;
      }, 1750);
    };

    if (delayMs > 0) {
      themeCapsuleDelayRef.current = window.setTimeout(() => {
        themeCapsuleDelayRef.current = null;
        reveal();
      }, delayMs);
    } else {
      reveal();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (themeCapsuleDelayRef.current !== null) {
        window.clearTimeout(themeCapsuleDelayRef.current);
      }
      if (themeCapsuleHideRef.current !== null) {
        window.clearTimeout(themeCapsuleHideRef.current);
      }
    };
  }, []);

  // Persist preference & sync native OS window appearance
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // ignore
    }
    syncNativeWindowTheme(themePreference);
  }, [themePreference]);

  // Ensure initial OS theme is synced accurately in Tauri when starting in "system" mode
  useEffect(() => {
    if (!isTauriEnvironment() || themePreferenceRef.current !== "system") return;
    const win = getCurrentWindow();
    win
      .setTheme(null)
      .then(() => win.theme())
      .then((osTheme) => {
        if (
          themePreferenceRef.current === "system" &&
          (osTheme === "dark" || osTheme === "light")
        ) {
          systemThemeRef.current = osTheme;
          setSystemTheme(osTheme);
        }
      })
      .catch(() => {});
  }, []);

  // Watch live OS appearance changes when in "system" (follow system) mode
  useEffect(() => {
    const applyLiveSystemTheme = (nextSys: ThemeMode) => {
      if (themePreferenceRef.current !== "system") return;
      if (systemThemeRef.current === nextSys && themeRef.current === nextSys) {
        return;
      }
      const willSweep = themeRef.current !== nextSys;
      systemThemeRef.current = nextSys;
      runThemeTransition({
        currentTheme: themeRef.current,
        nextTheme: nextSys,
        applyTheme: () => {
          themeRef.current = nextSys;
          setSystemTheme(nextSys);
        },
        triggerEl: themeToggleBtnRef.current,
      });
      flashThemeCapsule(willSweep ? 85 : 0);
    };

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMediaChange = (ev: MediaQueryListEvent) => {
      applyLiveSystemTheme(ev.matches ? "dark" : "light");
    };
    mq?.addEventListener?.("change", onMediaChange);

    let unlistenTauriTheme: (() => void) | null = null;
    if (isTauriEnvironment()) {
      getCurrentWindow()
        .onThemeChanged(({ payload }) => {
          if (payload === "dark" || payload === "light") {
            applyLiveSystemTheme(payload);
          }
        })
        .then((fn) => {
          unlistenTauriTheme = fn;
        })
        .catch(() => {});
    }

    return () => {
      mq?.removeEventListener?.("change", onMediaChange);
      unlistenTauriTheme?.();
    };
  }, [flashThemeCapsule]);

  const handleSelectThemePreference = useCallback(
    (nextPref: ThemePreference, triggerEl?: HTMLElement | null) => {
      const originEl = triggerEl ?? themeToggleBtnRef.current;

      if (nextPref === "system" && isTauriEnvironment()) {
        // Clear any explicit NSWindow appearance override first so OS theme is read accurately
        const win = getCurrentWindow();
        win
          .setTheme(null)
          .then(() => win.theme())
          .then((osTheme) => {
            const realSys: ThemeMode =
              osTheme === "dark" || osTheme === "light"
                ? osTheme
                : getSystemTheme();
            const willSweep = themeRef.current !== realSys;
            systemThemeRef.current = realSys;
            themePreferenceRef.current = "system";
            runThemeTransition({
              currentTheme: themeRef.current,
              nextTheme: realSys,
              applyTheme: () => {
                themeRef.current = realSys;
                setSystemTheme(realSys);
                setThemePreference("system");
              },
              triggerEl: originEl,
            });
            flashThemeCapsule(willSweep ? 85 : 0);
          })
          .catch(() => {
            const fallbackSys = getSystemTheme();
            const willSweep = themeRef.current !== fallbackSys;
            systemThemeRef.current = fallbackSys;
            themePreferenceRef.current = "system";
            runThemeTransition({
              currentTheme: themeRef.current,
              nextTheme: fallbackSys,
              applyTheme: () => {
                themeRef.current = fallbackSys;
                setSystemTheme(fallbackSys);
                setThemePreference("system");
              },
              triggerEl: originEl,
            });
            flashThemeCapsule(willSweep ? 85 : 0);
          });
        return;
      }

      const nextResolved: ThemeMode =
        nextPref === "system" ? getSystemTheme() : nextPref;
      const willSweep = themeRef.current !== nextResolved;
      if (nextPref === "system") {
        systemThemeRef.current = nextResolved;
      }
      themePreferenceRef.current = nextPref;

      runThemeTransition({
        currentTheme: themeRef.current,
        nextTheme: nextResolved,
        applyTheme: () => {
          themeRef.current = nextResolved;
          if (nextPref === "system") {
            setSystemTheme(nextResolved);
          }
          setThemePreference(nextPref);
        },
        triggerEl: originEl,
      });
      flashThemeCapsule(willSweep ? 85 : 0);
    },
    [flashThemeCapsule]
  );

  const handleCycleTheme = useCallback(
    (triggerEl?: HTMLElement | null) => {
      const nextPref = getNextThemePreference(themePreferenceRef.current);
      handleSelectThemePreference(nextPref, triggerEl);
    },
    [handleSelectThemePreference]
  );

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    if (type === "error") {
      toast.error(message);
    } else {
      toast.success(message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [authSt, cfg] = await Promise.all([
        api.getAuthStatus(),
        api.getSettings(),
      ]);
      setAuth(authSt);
      setSettings(cfg);
      setUiLanguage(cfg.uiLanguage || "system");
      saveStoredUiLanguage(cfg.uiLanguage || "system");
      setUiScaleMode(cfg.uiScaleMode || "auto");
      setUiScaleManual(clampUiScale(cfg.uiScale || 1.0));
      saveStoredUiScalePref({
        mode: cfg.uiScaleMode || "auto",
        scale: clampUiScale(cfg.uiScale || 1.0),
      });
      if (cfg.companyLogoPath) {
        api
          .getStoredImageDataUrl(cfg.companyLogoPath)
          .then(setLogoDataUrl)
          .catch(() => setLogoDataUrl(""));
      } else {
        setLogoDataUrl("");
      }
      if (cfg.adminAvatarPath) {
        api
          .getStoredImageDataUrl(cfg.adminAvatarPath)
          .then(setAvatarDataUrl)
          .catch(() => setAvatarDataUrl(""));
      } else {
        setAvatarDataUrl("");
      }
      if (authSt.isInitialized && !authSt.isLocked) {
        const list = await api.listInstruments();
        setInstruments(list);
        setInstrumentsLoaded(true);
        api
          .getSyncConfig()
          .then(setSyncConfig)
          .catch(() => {});
      }
    } catch (err) {
      notify(`加载数据失败：${String(err)}`, "error");
    } finally {
      setLoading(false);
      setBooting(false);
    }
  }, [notify]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Reload logo when companyLogoPath changes
  useEffect(() => {
    if (settings.companyLogoPath) {
      api
        .getStoredImageDataUrl(settings.companyLogoPath)
        .then(setLogoDataUrl)
        .catch(() => setLogoDataUrl(""));
    } else {
      setLogoDataUrl("");
    }
  }, [settings.companyLogoPath]);

  // Reload avatar when adminAvatarPath changes
  useEffect(() => {
    if (settings.adminAvatarPath) {
      api
        .getStoredImageDataUrl(settings.adminAvatarPath)
        .then(setAvatarDataUrl)
        .catch(() => setAvatarDataUrl(""));
    } else {
      setAvatarDataUrl("");
    }
  }, [settings.adminAvatarPath]);

  const handleLock = useCallback(async () => {
    const current = authRef.current;
    if (!current.isInitialized || current.isLocked) return;
    if (!current.appLockEnabled) {
      if (current.isAdmin) {
        setAppLockSetupState({ open: true, mode: "enable", lockAfterSave: true });
      } else {
        notify("请先登录管理员账号以开启并设置应用锁 PIN 码", "error");
        setLoginModalOpen(true);
      }
      return;
    }
    try {
      const st = await api.lockApp();
      setAuth(st);
    } catch (err) {
      notify(String(err), "error");
    }
  }, [notify]);

  // Close onboarding preview automatically if app locks
  useEffect(() => {
    if (auth.isLocked) {
      setOnboardingPreviewOpen(false);
    }
  }, [auth.isLocked]);

  // Global keyboard shortcuts: Cmd/Ctrl + L (Lock), Cmd/Ctrl + K (Search), Cmd/Ctrl + B (Sidebar), Cmd/Ctrl + +/-/0 (Zoom)
  const applyAppearancePatch = useCallback(
    async (patch: AppearancePreferencesInput) => {
      if (patch.uiLanguage !== undefined) {
        setUiLanguage(patch.uiLanguage);
        saveStoredUiLanguage(patch.uiLanguage);
      }
      if (patch.uiScaleMode !== undefined) {
        setUiScaleMode(patch.uiScaleMode);
      }
      if (patch.uiScale !== undefined) {
        setUiScaleManual(clampUiScale(patch.uiScale));
      }
      try {
        const updated = await api.updateAppearancePreferences(patch);
        setSettings(updated);
        return updated;
      } catch (err) {
        notify(String(err), "error");
        return null;
      }
    },
    [notify]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!auth.isInitialized || auth.isLocked || onboardingPreviewOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        handleLock();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const nextScale = clampUiScale(effectiveUiZoom + 0.05);
        void applyAppearancePatch({ uiScaleMode: "manual", uiScale: nextScale });
      } else if ((e.metaKey || e.ctrlKey) && e.key === "-") {
        e.preventDefault();
        const nextScale = clampUiScale(effectiveUiZoom - 0.05);
        void applyAppearancePatch({ uiScaleMode: "manual", uiScale: nextScale });
      } else if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        void applyAppearancePatch({ uiScaleMode: "auto" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    auth.isInitialized,
    auth.isLocked,
    onboardingPreviewOpen,
    handleLock,
    toggleSidebar,
    effectiveUiZoom,
    applyAppearancePatch,
  ]);

  // Independent auto-lock idle timer whenever App Lock is enabled
  useEffect(() => {
    if (
      !auth.isInitialized ||
      !auth.appLockEnabled ||
      auth.isLocked ||
      settings.autoLockMinutes <= 0
    ) {
      return;
    }
    let timer: number | undefined;
    const ms = settings.autoLockMinutes * 60 * 1000;

    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        api.lockApp().then(setAuth).catch(() => {});
      }, ms);
    };

    const events = ["mousemove", "keydown", "mousedown", "wheel", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [auth.isInitialized, auth.appLockEnabled, auth.isLocked, settings.autoLockMinutes]);

  // Listen for native backend tray / window lifecycle events
  useEffect(() => {
    const unlisteners = [
      listen<AuthStatus>("auth-status-changed", (event) => {
        setAuth(event.payload);
        if (!event.payload.isLocked) {
          api.getSettings().then(setSettings).catch(() => {});
        }
      }),
      listen("close-requested-prompt", () => {
        setClosePromptOpen(true);
      }),
      listen("open-app-lock-setup", () => {
        const current = authRef.current;
        if (!current.isInitialized || current.isLocked) return;
        if (current.isAdmin) {
          setAppLockSetupState({ open: true, mode: "enable", lockAfterSave: true });
        } else {
          notify("请先登录管理员账号以开启并设置应用锁 PIN 码", "error");
          setLoginModalOpen(true);
        }
      }),
      listen("window-shown", () => {
        setWindowFocusNonce((n) => n + 1);
        api.getAuthStatus().then(setAuth).catch(() => {});
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, [notify]);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = () => setExportMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [exportMenuOpen]);

  // Listen for updater & cloud sync progress events globally
  useEffect(() => {
    const unlisteners = [
      listen<UpdateDownloadProgress>("update-download-progress", (event) => {
        setUpdateProgress(event.payload);
      }),
      listen<SyncProgressEvent>("sync-progress", (event) => {
        setSyncProgress(event.payload);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  // Silent startup S3 sync check once after startup finishes
  useEffect(() => {
    if (
      startupSyncCheckedRef.current ||
      booting ||
      !auth.isInitialized ||
      auth.isLocked
    ) {
      return;
    }
    startupSyncCheckedRef.current = true;
    const timer = window.setTimeout(async () => {
      try {
        const cfg = await api.getSyncConfig();
        setSyncConfig(cfg);
        if (!cfg.enabled || !cfg.configured || !cfg.checkOnStartup) {
          return;
        }
        const status = await api.checkSyncStatus();
        setSyncStatus(status);
        if (
          status.state === "remote_ahead" ||
          status.state === "conflict" ||
          Boolean(status.passphraseError)
        ) {
          setSyncBannerOpen(true);
        }
      } catch {
        // Silently ignore offline/network errors on startup
      }
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [booting, auth.isInitialized, auth.isLocked]);

  const finalizeSyncSuccess = useCallback(
    async (res: SyncActionResult) => {
      setSyncBannerOpen(false);
      setSyncConflictOpen(false);
      if (res.direction === "pull") {
        clearMediaCache();
        await refreshAll();
      }
      try {
        const [cfg, st] = await Promise.all([
          api.getSyncConfig(),
          api.checkSyncStatus(),
        ]);
        setSyncConfig(cfg);
        setSyncStatus(st);
      } catch {
        // ignore follow-up status refresh error
      }
      if (res.safetyBackupPath) {
        const bakPath = res.safetyBackupPath;
        toast.success(res.message, {
          duration: 6500,
          action: {
            label: "打开备份目录",
            onClick: () => {
              api.openFolderPath(bakPath).catch(() => {});
            },
          },
        });
      } else {
        toast.success(res.message);
      }
    },
    [refreshAll]
  );

  const handleSyncFailure = useCallback(
    async (err: unknown) => {
      const msg = String(err);
      if (msg.includes("CONFLICT:")) {
        try {
          const st = await api.checkSyncStatus();
          setSyncStatus(st);
        } catch {
          // ignore
        }
        setSyncBannerOpen(false);
        setSyncConflictOpen(true);
        return;
      }
      notify(`同步失败：${msg}`, "error");
    },
    [notify]
  );

  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncProgress({
      phase: "checking",
      message: "正在检查云端状态...",
      current: 0,
      total: 1,
      percent: 5,
    });
    try {
      const res = await api.syncNow();
      await finalizeSyncSuccess(res);
    } catch (err) {
      await handleSyncFailure(err);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [syncing, finalizeSyncSuccess, handleSyncFailure]);

  const handleSyncPush = useCallback(
    async (force = false) => {
      if (syncing) return;
      setSyncing(true);
      setSyncProgress({
        phase: "preparing",
        message: "正在打包本地台账快照...",
        current: 0,
        total: 1,
        percent: 5,
      });
      try {
        const res = await api.syncPush(force);
        await finalizeSyncSuccess(res);
      } catch (err) {
        await handleSyncFailure(err);
      } finally {
        setSyncing(false);
        setSyncProgress(null);
      }
    },
    [syncing, finalizeSyncSuccess, handleSyncFailure]
  );

  const handleSyncPull = useCallback(
    async (force = false) => {
      if (syncing) return;
      setSyncing(true);
      setSyncProgress({
        phase: "checking",
        message: "正在读取云端台账...",
        current: 0,
        total: 1,
        percent: 5,
      });
      try {
        const res = await api.syncPull(force);
        await finalizeSyncSuccess(res);
      } catch (err) {
        await handleSyncFailure(err);
      } finally {
        setSyncing(false);
        setSyncProgress(null);
      }
    },
    [syncing, finalizeSyncSuccess, handleSyncFailure]
  );

  // Silent background update check once after startup finishes
  useEffect(() => {
    if (
      startupUpdateCheckedRef.current ||
      booting ||
      !auth.isInitialized ||
      auth.isLocked
    ) {
      return;
    }
    startupUpdateCheckedRef.current = true;
    const timer = window.setTimeout(() => {
      api
        .checkForUpdates()
        .then((res) => {
          if (res.hasUpdate) {
            setAvailableUpdate(res);
            setUpdatePopupOpen(true);
          }
        })
        .catch(() => {
          // Silently ignore network/offline errors on startup
        });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [booting, auth.isInitialized, auth.isLocked]);

  const handleInstallUpdate = useCallback(
    async (repoOverride?: string, proxyOverride?: string) => {
      if (updatingApp) return;
      setUpdatingApp(true);
      setUpdateProgress({
        downloaded: 0,
        total: 0,
        percent: 0,
        phase: "downloading",
        message: "正在连接更新源...",
      });
      try {
        await api.downloadAndLaunchUpdate(
          repoOverride ?? settings.githubRepo,
          proxyOverride ?? settings.updateProxyUrl
        );
      } catch (err) {
        setUpdatingApp(false);
        setUpdateProgress(null);
        notify(`更新失败：${String(err)}`, "error");
      }
    },
    [updatingApp, settings.githubRepo, settings.updateProxyUrl, notify]
  );

  // Precompute status and search haystack ONCE per instrument load/threshold change
  const statusById = useMemo(
    () => buildInstrumentStatusMap(instruments, settings.warningThresholds, locale),
    [instruments, settings.warningThresholds, locale]
  );

  const searchIndexById = useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      map.set(
        inst.id,
        `${inst.name}\0${inst.serialNo}\0${inst.modelSpec}\0${inst.location}\0${inst.department}\0${inst.remark}\0${inst.supplier}\0${inst.calAgency}\0${inst.contactPerson}`.toLowerCase()
      );
    }
    return map;
  }, [instruments]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Category scoped counts & lists
  const tabCounts = useMemo(() => {
    let gauge = 0;
    let fixture = 0;
    for (const i of instruments) {
      if (i.category === "fixture") fixture++;
      else gauge++;
    }
    return { gauge, fixture, all: instruments.length };
  }, [instruments]);

  const categoryScoped = useMemo(() => {
    if (activeTab === "all") return instruments;
    return instruments.filter((i) => i.category === activeTab);
  }, [instruments, activeTab]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    categoryScoped.forEach((i) => {
      if (i.department.trim()) set.add(i.department.trim());
    });
    return Array.from(set).sort();
  }, [categoryScoped]);

  // Multi-tier warning thresholds & global expiry alert summary
  const descThresholds = useMemo(
    () => sortThresholdsDesc(settings.warningThresholds),
    [settings.warningThresholds]
  );

  const maxWarningDays = useMemo(
    () => getMaxWarningDays(settings.warningThresholds, settings.warningDays),
    [settings.warningThresholds, settings.warningDays]
  );

  const alertSummary = useMemo(
    () =>
      summarizeExpiryAlerts(
        instruments,
        settings.warningThresholds,
        statusById
      ),
    [instruments, settings.warningThresholds, statusById]
  );

  // Reset numeric expiryFilter if that custom threshold was deleted
  useEffect(() => {
    if (
      typeof expiryFilter === "number" &&
      !descThresholds.some((t) => t.days === expiryFilter)
    ) {
      setExpiryFilter("all");
    }
  }, [expiryFilter, descThresholds]);

  const recordAlertPopupShown = useCallback(() => {
    writeStorage(ALERT_LAST_SHOWN_DATE_KEY, getTodayStr());
    writeStorage(ALERT_LAST_SHOWN_TS_KEY, String(Date.now()));
  }, []);

  const openAlertModal = useCallback(() => {
    setAlertModalOpen(true);
    recordAlertPopupShown();
  }, [recordAlertPopupShown]);

  const handleToggleMuteToday = useCallback((muted: boolean) => {
    setMutedToday(muted);
    writeStorage(ALERT_MUTED_DATE_KEY, muted ? getTodayStr() : "");
  }, []);

  // Auto-open expiry alert popup on startup based on user rules
  useEffect(() => {
    if (
      startupAlertCheckedRef.current ||
      booting ||
      loading ||
      !instrumentsLoaded ||
      !auth.isInitialized ||
      auth.isLocked
    ) {
      return;
    }
    startupAlertCheckedRef.current = true;

    if (!settings.alertPopupEnabled || alertSummary.totalAlertCount === 0) {
      return;
    }

    const today = getTodayStr();
    if (readStorage(ALERT_MUTED_DATE_KEY) === today) {
      return;
    }

    const freq = settings.alertPopupFrequency || "every_open";
    const lastDate = readStorage(ALERT_LAST_SHOWN_DATE_KEY);
    const lastTs = Number(readStorage(ALERT_LAST_SHOWN_TS_KEY) || "0");

    if (freq === "daily" && lastDate === today) {
      return;
    }
    if (freq === "interval") {
      const intervalMs =
        Math.max(1, settings.alertPopupIntervalHours || 4) * 3600 * 1000;
      if (lastDate === today && lastTs > 0 && Date.now() - lastTs < intervalMs) {
        return;
      }
    }

    const timer = window.setTimeout(() => {
      setAlertModalOpen(true);
      recordAlertPopupShown();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    booting,
    loading,
    instrumentsLoaded,
    auth.isInitialized,
    auth.isLocked,
    settings.alertPopupEnabled,
    settings.alertPopupFrequency,
    settings.alertPopupIntervalHours,
    alertSummary.totalAlertCount,
    recordAlertPopupShown,
  ]);

  // Periodic interval reminder when app remains open
  useEffect(() => {
    if (
      booting ||
      !auth.isInitialized ||
      auth.isLocked ||
      !settings.alertPopupEnabled ||
      settings.alertPopupFrequency !== "interval"
    ) {
      return;
    }

    const intervalMs =
      Math.max(1, settings.alertPopupIntervalHours || 4) * 3600 * 1000;

    const timer = window.setInterval(() => {
      if (
        alertSummary.totalAlertCount === 0 ||
        alertModalOpen ||
        settingsModalOpen ||
        drawerOpen
      ) {
        return;
      }
      const today = getTodayStr();
      const isMuted = readStorage(ALERT_MUTED_DATE_KEY) === today;
      setMutedToday(isMuted);
      if (isMuted) return;

      const lastDate = readStorage(ALERT_LAST_SHOWN_DATE_KEY);
      const lastTs = Number(readStorage(ALERT_LAST_SHOWN_TS_KEY) || "0");
      if (lastDate !== today || Date.now() - lastTs >= intervalMs) {
        setAlertModalOpen(true);
        recordAlertPopupShown();
      }
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, [
    booting,
    auth.isInitialized,
    auth.isLocked,
    settings.alertPopupEnabled,
    settings.alertPopupFrequency,
    settings.alertPopupIntervalHours,
    alertSummary.totalAlertCount,
    alertModalOpen,
    settingsModalOpen,
    drawerOpen,
    recordAlertPopupShown,
  ]);

  // Calibration status distribution for sidebar navigation & compliance health bar
  const stats = useMemo(() => {
    let valid = 0;
    let warning = 0;
    let expired = 0;
    let exempt = 0;
    const tierCountMap = new Map<string, number>();
    for (const t of descThresholds) {
      tierCountMap.set(t.id, 0);
    }

    for (const inst of categoryScoped) {
      const info = statusById.get(inst.id);
      if (!info || info.status === "exempt") exempt++;
      else if (info.status === "valid") valid++;
      else if (info.status === "warning") {
        warning++;
        if (info.matchedThreshold) {
          tierCountMap.set(
            info.matchedThreshold.id,
            (tierCountMap.get(info.matchedThreshold.id) || 0) + 1
          );
        }
      } else if (info.status === "expired") expired++;
    }

    const controlled = valid + warning + expired;
    const compliancePct =
      controlled > 0 ? Math.round(((valid + warning) / controlled) * 100) : 100;

    const tierSegments = descThresholds.map((t) => ({
      id: t.id,
      label: t.label,
      days: t.days,
      color: t.color,
      count: tierCountMap.get(t.id) || 0,
    }));

    return {
      total: categoryScoped.length,
      valid,
      warning,
      expired,
      exempt,
      controlled,
      compliancePct,
      tierSegments,
    };
  }, [categoryScoped, statusById, descThresholds]);

  // Cumulative counts for list expiry filter pills (0 <= daysRemaining <= threshold.days)
  const expiryFilterCounts = useMemo(() => {
    let expired = 0;
    const byDays: Record<number, number> = {};
    for (const t of descThresholds) {
      byDays[t.days] = 0;
    }
    for (const inst of categoryScoped) {
      const st = statusById.get(inst.id);
      if (!st || st.daysRemaining === null) continue;
      if (st.daysRemaining < 0) {
        expired++;
      } else {
        for (const t of descThresholds) {
          if (st.daysRemaining <= t.days) {
            byDays[t.days] += 1;
          }
        }
      }
    }
    return { expired, byDays };
  }, [categoryScoped, statusById, descThresholds]);

  // Filtered and sorted rows (O(1) precomputed status & search haystack lookup)
  const filteredInstruments = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const list = categoryScoped.filter((inst) => {
      const st = statusById.get(inst.id);
      const status = st?.status ?? "exempt";
      const daysRemaining = st?.daysRemaining ?? null;

      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (expiryFilter === "expired") {
        if (status !== "expired") return false;
      } else if (typeof expiryFilter === "number") {
        if (
          daysRemaining === null ||
          daysRemaining < 0 ||
          daysRemaining > expiryFilter
        ) {
          return false;
        }
      }

      if (deptFilter !== "all") {
        if (deptFilter === "__empty__" && inst.department.trim() !== "") return false;
        if (deptFilter !== "__empty__" && inst.department.trim() !== deptFilter)
          return false;
      }

      if (calTypeFilter !== "all" && inst.calibrationType !== calTypeFilter) {
        return false;
      }

      if (q) {
        const hay = searchIndexById.get(inst.id) || "";
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    if (sortMode === "expiry") {
      return [...list].sort((a, b) => {
        const da = statusById.get(a.id)?.daysRemaining ?? Number.MAX_SAFE_INTEGER;
        const db = statusById.get(b.id)?.daysRemaining ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
    }
    if (sortMode === "name") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    return list;
  }, [
    categoryScoped,
    statusById,
    searchIndexById,
    statusFilter,
    expiryFilter,
    deptFilter,
    calTypeFilter,
    deferredSearchQuery,
    sortMode,
  ]);

  const deferredFilteredInstruments = useDeferredValue(filteredInstruments);

  // Reset to page 1 when category, filter, sort, or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeTab,
    statusFilter,
    expiryFilter,
    deptFilter,
    calTypeFilter,
    sortMode,
    deferredSearchQuery,
  ]);

  const isShowAll = pageSize === "all";
  const totalFilteredCount = deferredFilteredInstruments.length;
  const totalPages = isShowAll
    ? 1
    : Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = isShowAll ? 1 : Math.min(currentPage, totalPages);
  const pageStartIndex = isShowAll ? 0 : (safePage - 1) * pageSize;

  useEffect(() => {
    if (!isShowAll && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [isShowAll, currentPage, totalPages]);

  const pagedInstruments = useMemo(() => {
    if (isShowAll) return deferredFilteredInstruments;
    return deferredFilteredInstruments.slice(
      pageStartIndex,
      pageStartIndex + pageSize
    );
  }, [deferredFilteredInstruments, isShowAll, pageStartIndex, pageSize]);

  // Keep selected IDs strictly scoped to currently visible filtered records (prevents accidental edits/deletes on hidden items)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validSet = new Set(filteredInstruments.map((i) => i.id));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (validSet.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filteredInstruments]);

  const selectedInstruments = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return filteredInstruments.filter((i) => selectedIds.has(i.id));
  }, [filteredInstruments, selectedIds]);

  const allVisibleSelected = useMemo(() => {
    if (pagedInstruments.length === 0 || selectedIds.size === 0) return false;
    for (let i = 0; i < pagedInstruments.length; i++) {
      if (!selectedIds.has(pagedInstruments[i].id)) return false;
    }
    return true;
  }, [pagedInstruments, selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  const handleToggleSelect = useCallback(
    (id: number, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const anchorId = lastSelectedIdRef.current;
        if (shiftKey && anchorId !== null && anchorId !== id) {
          const list = deferredFilteredInstruments;
          const startIdx = list.findIndex((item) => item.id === anchorId);
          const endIdx = list.findIndex((item) => item.id === id);
          if (startIdx !== -1 && endIdx !== -1) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            const shouldSelect = !prev.has(id);
            for (let i = lo; i <= hi; i++) {
              if (shouldSelect) next.add(list[i].id);
              else next.delete(list[i].id);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastSelectedIdRef.current = id;
    },
    [deferredFilteredInstruments]
  );

  const handleToggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (pagedInstruments.length === 0) return prev;
      let allChecked = true;
      for (let i = 0; i < pagedInstruments.length; i++) {
        if (!prev.has(pagedInstruments[i].id)) {
          allChecked = false;
          break;
        }
      }
      const next = new Set(prev);
      if (allChecked) {
        for (let i = 0; i < pagedInstruments.length; i++) {
          next.delete(pagedInstruments[i].id);
        }
      } else {
        for (let i = 0; i < pagedInstruments.length; i++) {
          next.add(pagedInstruments[i].id);
        }
      }
      return next;
    });
    lastSelectedIdRef.current = null;
  }, [pagedInstruments]);

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredInstruments.map((i) => i.id)));
    lastSelectedIdRef.current = null;
  }, [filteredInstruments]);

  // Esc clears active table selection when no overlay/modal is open
  useEffect(() => {
    if (
      activeWorkspace !== "ledger" ||
      selectedIds.size === 0 ||
      batchEditOpen ||
      drawerOpen ||
      commandOpen ||
      settingsModalOpen ||
      alertModalOpen ||
      importModalOpen ||
      loginModalOpen ||
      Boolean(lightboxState) ||
      Boolean(reportInstrument) ||
      appLockSetupState.open ||
      closePromptOpen ||
      onboardingPreviewOpen ||
      syncConflictOpen ||
      auth.isLocked
    ) {
      return;
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [
    selectedIds.size,
    batchEditOpen,
    drawerOpen,
    commandOpen,
    settingsModalOpen,
    alertModalOpen,
    importModalOpen,
    loginModalOpen,
    lightboxState,
    reportInstrument,
    appLockSetupState.open,
    closePromptOpen,
    onboardingPreviewOpen,
    syncConflictOpen,
    auth.isLocked,
    activeWorkspace,
    clearSelection,
  ]);

  // "全部" mode activates the refactored virtual engine (> 50 rows);
  // numeric pages (30/50/100) render natively with zero flash, while 200/page
  // automatically engages virtualization if > 120 rows are present.
  const virtualizeThreshold = isShowAll ? 50 : 120;

  const handlePageSizeChange = useCallback(
    (nextSize: PageSizeOption) => {
      if (pageSize !== "all" && nextSize !== "all") {
        const anchorIndex = (safePage - 1) * pageSize;
        setCurrentPage(Math.floor(anchorIndex / nextSize) + 1);
      } else {
        setCurrentPage(1);
      }
      writeStorage(PAGE_SIZE_KEY, String(nextSize));
      setPageSize(nextSize);
    },
    [pageSize, safePage]
  );

  const handleAppReset = useCallback((res: ResetAppResult) => {
    clearMediaCache();
    void wipeAllWorkbenchBrowserState();
    void import("@/workbench/tools/pdf-balloon/core/pdf")
      .then((m) => m.clearPdfResourceCache())
      .catch(() => {});
    setSettingsModalOpen(false);
    setOnboardingPreviewOpen(false);
    setDrawerOpen(false);
    setEditingInstrument(null);
    setAlertModalOpen(false);
    setCommandOpen(false);
    setImportModalOpen(false);
    setBatchEditOpen(false);
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
    setReportInstrument(null);
    setLightboxState(null);
    setUpdatePopupOpen(false);
    setSyncConfig(null);
    setSyncStatus(null);
    setSyncBannerOpen(false);
    setSyncConflictOpen(false);
    setLoginModalOpen(false);
    setClosePromptOpen(false);
    setInstruments([]);
    setInstrumentsLoaded(false);
    setLogoDataUrl("");
    setAvatarDataUrl("");
    setSettings(DEFAULT_SETTINGS);
    setActiveWorkspace("ledger");
    setActiveWorkbenchToolId(null);
    setMountedWorkbenchTools([]);
    setWorkbenchImmersive(false);
    setWorkbenchIncomingFiles({});
    setActiveTab("gauge");
    setStatusFilter("all");
    setExpiryFilter("all");
    setDeptFilter("all");
    setCalTypeFilter("all");
    setSearchQuery("");
    setSortMode("seq");
    setPageSize(DEFAULT_PAGE_SIZE);
    setCurrentPage(1);
    writeStorage(PAGE_SIZE_KEY, "");
    writeStorage(ALERT_MUTED_DATE_KEY, "");
    writeStorage(ALERT_LAST_SHOWN_DATE_KEY, "");
    writeStorage(ALERT_LAST_SHOWN_TS_KEY, "");
    try {
      window.sessionStorage.removeItem(SESSION_ROUTE_KEY);
    } catch {
      // ignore
    }
    setMutedToday(false);
    startupAlertCheckedRef.current = false;
    startupUpdateCheckedRef.current = false;
    startupSyncCheckedRef.current = false;
    setAuth(res.auth);

    if (res.backup) {
      const backupPath = res.backup.path;
      toast.success(
        `已自动备份 ${res.backup.instrumentCount} 台设备并完成初始化`,
        {
          duration: 7000,
          action: {
            label: "打开目录",
            onClick: () => {
              api.openFolderPath(backupPath).catch(() => {});
            },
          },
        }
      );
    } else {
      toast.success("已完成初始化");
    }
  }, []);

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: "退出管理员登录",
      description: "退出后将切换为只读浏览视图，新增、编辑设备或修改系统设置需重新登录。",
      confirmText: "退出登录",
      cancelText: "取消",
    });
    if (!ok) return;
    try {
      const st = await api.adminLogout();
      setAuth(st);
      notify("已退出管理员模式，当前为只读浏览视图", "success");
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const handleDisableAppLock = async () => {
    try {
      const st = await api.disableAppLock();
      setAuth(st);
      const updated = await api.getSettings();
      setSettings(updated);
      notify("已关闭独立应用锁", "success");
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const handleDelete = useCallback(
    async (inst: Instrument) => {
      const ok = await confirmDialog({
        title: "删除设备",
        description: `确定删除「${inst.name}」${inst.serialNo ? `（${inst.serialNo}）` : ""}？将同时清理位置照片及 ${inst.reportCount} 份报告，不可恢复。`,
        confirmText: "按住删除",
        destructive: true,
        holdToConfirm: true,
      });
      if (!ok) return;
      try {
        await api.deleteInstrument(inst.id);
        setInstruments((prev) => prev.filter((i) => i.id !== inst.id));
        notify("设备记录已删除", "success");
      } catch (err) {
        notify(String(err), "error");
      }
    },
    [notify]
  );

  const handleExportExcel = async (
    scope: "all" | "filtered" | "selected"
  ) => {
    setExportMenuOpen(false);
    const list =
      scope === "selected"
        ? selectedInstruments
        : scope === "filtered"
          ? filteredInstruments
          : instruments;
    if (list.length === 0) {
      notify("当前没有可导出的台账记录", "error");
      return;
    }

    const isBatch = scope === "selected";
    try {
      const suffix =
        scope === "selected"
          ? `已选${list.length}项`
          : scope === "filtered"
            ? "筛选结果"
            : "完整双台账";
      const dest = await save({
        title: "导出监视与测量管理台账 Excel",
        defaultPath: `${settings.docCode || "JSSK-MPR-170"}_${settings.docTitle || "仪器台账"}_${suffix}_${getTodayStr()}.xlsx`,
        filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
      });
      if (!dest) return;

      if (isBatch) setBatchExporting(true);
      else setExportStatus("loading");

      let logoPayload: { mime: string; base64: string } | null = null;
      if (settings.companyLogoPath) {
        try {
          const p = await api.readStoredFileBase64(settings.companyLogoPath);
          logoPayload = { mime: p.mime, base64: p.base64 };
        } catch {
          logoPayload = null;
        }
      }

      const bytes = await exportJsskExcel(list, settings, logoPayload);
      const b64 = uint8ArrayToBase64(bytes);
      await api.writeExternalFileBase64(dest, b64);
      if (!isBatch) setExportSuccess();
      notify(`Excel 台账已导出（共 ${list.length} 条记录）`, "success");
    } catch (err) {
      if (!isBatch) setExportStatus("idle");
      notify(`导出 Excel 失败：${String(err)}`, "error");
    } finally {
      if (isBatch) setBatchExporting(false);
    }
  };

  const handleBatchDelete = useCallback(async () => {
    if (batchDeleting || selectedInstruments.length === 0) return;
    const count = selectedInstruments.length;
    const totalReports = selectedInstruments.reduce(
      (sum, inst) => sum + inst.reportCount,
      0
    );
    const ok = await confirmDialog({
      title: `批量删除 ${count} 台设备`,
      description: `确定永久删除已选中的 ${count} 台设备记录？${
        totalReports > 0
          ? `将同时清理关联的位置照片及 ${totalReports} 份校验报告，`
          : "将同时清理关联的位置照片，"
      }此操作不可恢复。`,
      confirmText: "按住批量删除",
      destructive: true,
      holdToConfirm: true,
    });
    if (!ok) return;

    const ids = selectedInstruments.map((i) => i.id);
    const idSet = new Set(ids);
    setBatchDeleting(true);
    try {
      const res = await api.batchDeleteInstruments(ids);
      setInstruments((prev) => prev.filter((i) => !idSet.has(i.id)));
      clearSelection();
      if (editingInstrument && idSet.has(editingInstrument.id)) {
        setDrawerOpen(false);
        setEditingInstrument(null);
      }
      notify(`已批量删除 ${res.affectedCount} 台设备记录`, "success");
    } catch (err) {
      notify(`批量删除失败：${String(err)}`, "error");
    } finally {
      setBatchDeleting(false);
    }
  }, [batchDeleting, selectedInstruments, clearSelection, editingInstrument, notify]);

  const handlePrint = useCallback((itemsOverride?: Instrument[]) => {
    setPrintOverrideItems(itemsOverride ?? null);
    setPrintMounted(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  const openCreateDrawer = useCallback(() => {
    setEditingInstrument(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }, []);

  const openEditDrawer = useCallback((inst: Instrument) => {
    setEditingInstrument(inst);
    setDrawerMode("edit");
    setDrawerOpen(true);
  }, []);

  const openViewDrawer = useCallback((inst: Instrument) => {
    setEditingInstrument(inst);
    setDrawerMode("view");
    setDrawerOpen(true);
  }, []);

  const handleOpenPhotoLightbox = useCallback((inst: Instrument) => {
    setLightboxState({
      photoPath: inst.photoPath,
      title: `${inst.name} ${inst.serialNo ? `(${inst.serialNo})` : ""}`,
      subtitle: inst.location || "未登记存放位置",
    });
  }, []);

  const handleOpenReportModal = useCallback((inst: Instrument) => {
    setReportInstrument(inst);
  }, []);

  const openSettingsTab = (tab: SettingsTab) => {
    setSettingsInitialTab(tab);
    setSettingsModalOpen(true);
  };

  const handleSelectStatusFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    if (next === "expired") {
      setExpiryFilter("expired");
    } else {
      setExpiryFilter("all");
    }
  };

  const handleSelectExpiryFilter = (next: ExpiryFilter) => {
    setExpiryFilter(next);
    if (next === "expired") {
      setStatusFilter("expired");
    } else if (typeof next === "number") {
      setStatusFilter("all");
    } else if (statusFilter === "expired") {
      setStatusFilter("all");
    }
  };

  const handleApplyFilterFromAlertModal = (next: ExpiryFilter) => {
    setActiveWorkspace("ledger");
    setWorkbenchImmersive(false);
    setActiveTab("all");
    setDeptFilter("all");
    setCalTypeFilter("all");
    setSearchQuery("");
    handleSelectExpiryFilter(next);
    setSortMode("expiry");
  };

  // QI/QC Workbench navigation handlers
  const openWorkbenchHub = useCallback(() => {
    setActiveWorkspace("workbench");
    setActiveWorkbenchToolId(null);
    setWorkbenchImmersive(false);
  }, []);

  const launchWorkbenchTool = useCallback(
    (toolId: string, incomingFile?: File) => {
      setActiveWorkspace("workbench");
      setMountedWorkbenchTools((prev) =>
        prev.includes(toolId) ? prev : [...prev, toolId]
      );
      setActiveWorkbenchToolId(toolId);
      if (incomingFile) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setWorkbenchIncomingFiles((prev) => ({
          ...prev,
          [toolId]: { id, file: incomingFile },
        }));
      }
    },
    []
  );

  const closeWorkbenchTool = useCallback((toolId: string) => {
    setMountedWorkbenchTools((prev) => prev.filter((id) => id !== toolId));
    setActiveWorkbenchToolId((current) => {
      if (current === toolId) {
        setWorkbenchImmersive(false);
        return null;
      }
      return current;
    });
  }, []);

  const consumeWorkbenchIncomingFile = useCallback((toolId: string, fileId: string) => {
    setWorkbenchIncomingFiles((prev) =>
      prev[toolId]?.id === fileId ? { ...prev, [toolId]: null } : prev
    );
  }, []);

  const hostOverlayOpen =
    commandOpen ||
    settingsModalOpen ||
    alertModalOpen ||
    importModalOpen ||
    loginModalOpen ||
    drawerOpen ||
    batchEditOpen ||
    Boolean(lightboxState) ||
    Boolean(reportInstrument) ||
    appLockSetupState.open ||
    closePromptOpen ||
    onboardingPreviewOpen ||
    syncConflictOpen ||
    auth.isLocked;

  // Dynamic Sidebar Navigation config (visibility & custom drag order)
  const sidebarNavConfig = useMemo(
    () => parseSidebarNavConfig(settings.sidebarNavConfig),
    [settings.sidebarNavConfig]
  );

  // Direct Ledger .xlsx Drag-and-Drop Import (Tauri native + HTML5 fallback)
  const ledgerDropRef = useRef<HTMLDivElement | null>(null);
  const [ledgerDraggingExcel, setLedgerDraggingExcel] = useState(false);
  const [droppedImportFile, setDroppedImportFile] = useState<{
    path?: string;
    file?: File;
  } | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const tRef = useRef(t);
  tRef.current = t;

  const ledgerDropActive =
    auth.isInitialized &&
    auth.isAdmin &&
    activeWorkspace === "ledger" &&
    !hostOverlayOpen;

  useEffect(() => {
    if (!ledgerDropActive) {
      setLedgerDraggingExcel(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const hitTest = (pos: { x: number; y: number }): boolean => {
      const el = ledgerDropRef.current;
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
        pos.x >= rect.left &&
        pos.x <= rect.right &&
        pos.y >= rect.top &&
        pos.y <= rect.bottom
      );
    };

    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setLedgerDraggingExcel(hitTest(payload.position));
          } else if (payload.type === "leave") {
            setLedgerDraggingExcel(false);
          } else if (payload.type === "drop") {
            const inside = hitTest(payload.position);
            setLedgerDraggingExcel(false);
            if (!inside || payload.paths.length === 0) return;
            const xlsxPath = payload.paths.find((p) =>
              p.toLowerCase().endsWith(".xlsx")
            );
            if (!xlsxPath) {
              notifyRef.current(
                tRef.current(
                  "请拖入 .xlsx 格式的 Excel 台账文件",
                  "Please drop an .xlsx Excel file"
                ),
                "error"
              );
              return;
            }
            setDroppedImportFile({ path: xlsxPath });
            setImportModalOpen(true);
          }
        })
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Ignore in pure browser mode; HTML5 handlers provide fallback
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [ledgerDropActive]);

  const handleLedgerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!ledgerDropActive) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!ledgerDraggingExcel) setLedgerDraggingExcel(true);
  };

  const handleLedgerDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!ledgerDropActive) return;
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setLedgerDraggingExcel(false);
  };

  const handleLedgerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!ledgerDropActive) return;
    e.preventDefault();
    setLedgerDraggingExcel(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const xlsxFile = files.find((f) => f.name.toLowerCase().endsWith(".xlsx"));
    if (!xlsxFile) {
      notify(
        t("请拖入 .xlsx 格式的 Excel 台账文件", "Please drop an .xlsx Excel file"),
        "error"
      );
      return;
    }
    setDroppedImportFile({ file: xlsxFile });
    setImportModalOpen(true);
  };

  // Top-left Titlebar Cloud Sync summary & action
  const syncReady = Boolean(syncConfig?.configured && syncConfig?.enabled);
  const syncHasPassphraseError = Boolean(syncStatus?.passphraseError);
  const syncTooltip = syncing
    ? t("正在与 S3 云端同步...", "Syncing with S3 cloud...")
    : !syncReady
      ? t("配置 S3 兼容云端同步", "Configure S3 Cloud Sync")
      : syncStatus?.passphraseError ||
        syncStatus?.summary ||
        t("点击立即与 S3 云端同步", "Click to sync with S3 cloud");
  const handleTitleBarSyncClick = () => {
    if (!syncReady || syncHasPassphraseError) {
      openSettingsTab("sync");
    } else if (syncStatus?.state === "conflict") {
      setSyncConflictOpen(true);
    } else {
      handleSyncNow();
    }
  };

  const resetAllFilters = () => {
    setStatusFilter("all");
    setExpiryFilter("all");
    setDeptFilter("all");
    setCalTypeFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters =
    statusFilter !== "all" ||
    expiryFilter !== "all" ||
    deptFilter !== "all" ||
    calTypeFilter !== "all" ||
    searchQuery.trim() !== "";

  const activeHeading =
    activeTab === "gauge"
      ? t("仪器 / 量具台账", "Gauges & Instruments")
      : activeTab === "fixture"
        ? t("尺寸检具台账", "Fixtures & Jigs")
        : t("全部设备台账", "All Equipment");

  const statusMeta: Record<StatusFilter, { label: string; dot: string }> = {
    all: { label: t("全部状态", "All Status"), dot: "bg-zinc-400" },
    valid: { label: t("正常有效", "Valid"), dot: "bg-emerald-500" },
    warning: { label: t("即将到期", "Due Soon"), dot: "bg-amber-500" },
    expired: { label: t("已超期", "Expired"), dot: "bg-rose-500" },
    exempt: { label: t("免校归档", "Exempt"), dot: "bg-zinc-400" },
  };

  // Prevent flashing main UI before initial auth status loads (adaptive luminous light / obsidian dark)
  if (booting) {
    return (
      <I18nProvider language={uiLanguage}>
        <div className="h-screen w-screen bg-[#f4f5f7] dark:bg-[#121318] flex flex-col">
          <WindowTitleBar hideActions uiZoom={effectiveUiZoom} />
          <div className="flex-1 flex items-center justify-center">
            <div className="h-10 w-10 rounded-2xl bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] shadow-tactile flex items-center justify-center animate-pulse">
              <div className="h-2.5 w-2.5 rounded-full bg-indigo-500/80" />
            </div>
          </div>
        </div>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={uiLanguage}>
    <MorphTooltipProvider>
    <div className="h-screen w-screen overflow-hidden bg-[#f4f5f7] dark:bg-[#121318] text-zinc-950 dark:text-zinc-50 flex flex-col">
      {/* Seamless Unified Top Chrome Bar (No Title, No Dividing Border, Sidebar Toggle + Search + Cloud Sync Icons) */}
      <WindowTitleBar
        minimalDragOnly={!auth.isInitialized}
        hideActions={auth.isLocked || onboardingPreviewOpen}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onOpenSearch={() => setCommandOpen(true)}
        showSync={auth.isAdmin}
        syncing={syncing}
        syncReady={syncReady}
        syncState={syncStatus?.state ?? null}
        syncHasPassphraseError={syncHasPassphraseError}
        syncTooltip={syncTooltip}
        onSyncClick={handleTitleBarSyncClick}
        uiZoom={effectiveUiZoom}
      />

      {/* First-Launch Intro Animation & Gradual Account Setup (or Settings Preview) */}
      <AnimatePresence>
        {!auth.isInitialized ? (
          <OnboardingSetup
            key="onboarding-setup"
            defaultDocTitle={settings.docTitle}
            defaultDocCode={settings.docCode}
            onCompleted={(nextAuth) => {
              setAccountBg(loadAccountBg());
              setAuth(nextAuth);
              refreshAll();
              toast.success(
                isEn
                  ? `Welcome! Admin "${nextAuth.username}" is ready`
                  : `欢迎使用，管理员「${nextAuth.username}」已就绪`
              );
            }}
          />
        ) : onboardingPreviewOpen && !auth.isLocked ? (
          <OnboardingSetup
            key="onboarding-preview"
            previewMode
            previewUsername={auth.username || settings.adminUsername}
            defaultDocTitle={settings.docTitle}
            defaultDocCode={settings.docCode}
            onCompleted={() => setOnboardingPreviewOpen(false)}
            onExitPreview={() => setOnboardingPreviewOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      {/* Main Desktop Shell (Hidden during print) */}
      {auth.isInitialized && (
        <motion.div
          initial={{ opacity: 0, scale: 0.994 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32, ease: EASE_PRECISION }}
          className="flex-1 flex min-h-0 no-print"
        >
          {/* Left Seamless Collapsible Desktop Navigation Sidebar */}
          <div
            className={cn(
              "relative shrink-0 h-full z-20",
              activeWorkspace === "workbench" && workbenchImmersive ? "hidden" : "flex"
            )}
          >
          <motion.aside
            initial={false}
            animate={{ width: sidebarCollapsed ? 60 : 236 }}
            transition={SPRING_SMOOTH}
            className="h-full bg-transparent flex flex-col select-none overflow-hidden"
          >
            {/* Scrollable Navigation Groups (Dynamic Visibility & Custom Drag Order) */}
            <div
              className={cn(
                "flex-1 overflow-y-auto overflow-x-hidden pt-1 space-y-5",
                sidebarCollapsed ? "px-2 scrollbar-none" : "px-2.5"
              )}
            >
              {(() => {
                const visibleGroups = sidebarNavConfig.groups
                  .filter((group) => group.visible)
                  .map((group) => ({
                    ...group,
                    visibleItems: group.items.filter((item) => item.visible),
                  }))
                  .filter((group) => group.visibleItems.length > 0);

                const categoryItemsMap = {
                  gauge: {
                    id: "gauge" as const,
                    label: t("仪器与量具", "Gauges"),
                    count: tabCounts.gauge,
                    icon: Gauge,
                  },
                  fixture: {
                    id: "fixture" as const,
                    label: t("尺寸检具", "Fixtures"),
                    count: tabCounts.fixture,
                    icon: Wrench,
                  },
                  all: {
                    id: "all" as const,
                    label: t("全部设备", "All Equipment"),
                    count: tabCounts.all,
                    icon: Layers,
                  },
                };

                const statusItemsMap = {
                  all: {
                    id: "all" as const,
                    label: t("全部状态", "All Status"),
                    count: stats.total,
                    dot: "bg-zinc-400 dark:bg-zinc-500",
                    alert: false,
                  },
                  valid: {
                    id: "valid" as const,
                    label: t("正常有效", "Valid"),
                    count: stats.valid,
                    dot: "bg-emerald-500",
                    alert: false,
                  },
                  warning: {
                    id: "warning" as const,
                    label: t("即将到期", "Due Soon"),
                    count: stats.warning,
                    dot: "bg-amber-500",
                    alert: stats.warning > 0,
                  },
                  expired: {
                    id: "expired" as const,
                    label: t("已超期", "Expired"),
                    count: stats.expired,
                    dot: "bg-rose-500",
                    alert: stats.expired > 0,
                  },
                  exempt: {
                    id: "exempt" as const,
                    label: t("免校归档", "Exempt"),
                    count: stats.exempt,
                    dot: "bg-zinc-300 dark:bg-zinc-600",
                    alert: false,
                  },
                };

                const readyToolsById = new Map(
                  WORKBENCH_TOOLS.filter((tool) => tool.status === "ready").map(
                    (tool) => [tool.id, tool]
                  )
                );

                return visibleGroups.map((group, groupIndex) => {
                  if (group.id === "categories") {
                    return (
                      <div key="group-categories">
                        {sidebarCollapsed ? (
                          groupIndex > 0 && (
                            <div className="mx-auto mb-2 h-px w-6 bg-zinc-200/90 dark:bg-white/[0.08]" />
                          )
                        ) : (
                          <div className="px-2.5 pb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                            {t("台账分类", "Categories")}
                          </div>
                        )}
                        <nav className={cn("space-y-0.5", sidebarCollapsed && "flex flex-col items-center")}>
                          {group.visibleItems.map((entry) => {
                            const item =
                              categoryItemsMap[
                                entry.id as keyof typeof categoryItemsMap
                              ];
                            if (!item) return null;
                            const active =
                              activeWorkspace === "ledger" && activeTab === item.id;
                            const Icon = item.icon;
                            const btn = (
                              <motion.button
                                key={item.id}
                                type="button"
                                whileTap={TAP_SCALE_SUBTLE}
                                transition={SPRING_SNAPPY}
                                onClick={() => {
                                  setActiveWorkspace("ledger");
                                  setWorkbenchImmersive(false);
                                  setActiveTab(item.id);
                                  setDeptFilter("all");
                                }}
                                aria-label={item.label}
                                className={cn(
                                  "relative rounded-lg text-xs font-medium flex items-center transition-colors",
                                  sidebarCollapsed
                                    ? "h-9 w-9 justify-center"
                                    : "w-full px-2.5 py-2 justify-between",
                                  active
                                    ? "text-zinc-950 dark:text-white"
                                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-white/[0.04]"
                                )}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="sidebar-cat-pill"
                                    transition={SPRING_SNAPPY}
                                    className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.08] border border-zinc-200/85 dark:border-white/[0.08] shadow-tactile"
                                  />
                                )}
                                <span className="relative z-10 inline-flex items-center gap-2">
                                  <Icon
                                    className={cn(
                                      "h-3.5 w-3.5 transition-colors",
                                      active
                                        ? "text-zinc-900 dark:text-white"
                                        : "text-zinc-400 dark:text-zinc-500"
                                    )}
                                  />
                                  {!sidebarCollapsed && <span>{item.label}</span>}
                                </span>
                                {!sidebarCollapsed && (
                                  <SlidingNumber
                                    value={item.count}
                                    className={cn(
                                      "relative z-10 font-mono text-[11px]",
                                      active
                                        ? "text-zinc-700 dark:text-zinc-200 font-semibold"
                                        : "text-zinc-400 dark:text-zinc-500"
                                    )}
                                  />
                                )}
                              </motion.button>
                            );

                            return sidebarCollapsed ? (
                              <MorphTooltip
                                key={item.id}
                                placement="right"
                                content={`${item.label} · ${item.count}`}
                              >
                                {btn}
                              </MorphTooltip>
                            ) : (
                              btn
                            );
                          })}
                        </nav>
                      </div>
                    );
                  }

                  if (group.id === "status") {
                    return (
                      <div key="group-status">
                        {sidebarCollapsed ? (
                          groupIndex > 0 && (
                            <div className="mx-auto mb-2 h-px w-6 bg-zinc-200/90 dark:bg-white/[0.08]" />
                          )
                        ) : (
                          <div className="px-2.5 pb-1.5 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                            <span>{t("效期状态", "Calibration Status")}</span>
                            <button
                              type="button"
                              onClick={() => openSettingsTab("alerts")}
                              className="font-mono normal-case text-[10px] hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                              title={t("点击配置多级到期预警天数与颜色", "Configure expiry warning thresholds")}
                            >
                              {t(`预警 ≤${maxWarningDays}d`, `Warn ≤${maxWarningDays}d`)}
                            </button>
                          </div>
                        )}
                        <nav className={cn("space-y-0.5", sidebarCollapsed && "flex flex-col items-center")}>
                          {group.visibleItems.map((entry) => {
                            const st =
                              statusItemsMap[
                                entry.id as keyof typeof statusItemsMap
                              ];
                            if (!st) return null;
                            const active =
                              activeWorkspace === "ledger" && statusFilter === st.id;
                            const btn = (
                              <motion.button
                                key={st.id}
                                type="button"
                                whileTap={TAP_SCALE_SUBTLE}
                                transition={SPRING_SNAPPY}
                                onClick={() => {
                                  setActiveWorkspace("ledger");
                                  setWorkbenchImmersive(false);
                                  handleSelectStatusFilter(st.id);
                                }}
                                aria-label={`${st.label} (${st.count})`}
                                className={cn(
                                  "relative rounded-lg text-xs flex items-center transition-colors",
                                  sidebarCollapsed
                                    ? "h-8 w-10 justify-center"
                                    : "w-full px-2.5 py-1.5 justify-between",
                                  active
                                    ? "text-zinc-950 dark:text-white font-medium"
                                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/45 dark:hover:bg-white/[0.04]"
                                )}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="sidebar-status-pill"
                                    transition={SPRING_SNAPPY}
                                    className="absolute inset-0 rounded-lg bg-white/95 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/[0.08] shadow-hairline"
                                  />
                                )}
                                <span className="relative z-10 inline-flex items-center gap-2.5">
                                  <span
                                    className={cn(
                                      "rounded-full",
                                      sidebarCollapsed ? "h-2 w-2" : "h-1.5 w-1.5",
                                      st.dot
                                    )}
                                  />
                                  {!sidebarCollapsed && <span>{st.label}</span>}
                                </span>
                                {!sidebarCollapsed ? (
                                  <span
                                    className={cn(
                                      "relative z-10 font-mono tabular-nums text-[11px]",
                                      st.id === "expired" && st.count > 0
                                        ? "px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold"
                                        : st.id === "warning" && st.count > 0
                                          ? "px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                                          : "text-zinc-400 dark:text-zinc-500"
                                    )}
                                  >
                                    <SlidingNumber value={st.count} />
                                  </span>
                                ) : st.alert ? (
                                  <span
                                    className={cn(
                                      "relative z-10 ml-1 text-[9.5px] font-mono tabular-nums font-semibold",
                                      st.id === "expired"
                                        ? "text-rose-600 dark:text-rose-400"
                                        : "text-amber-600 dark:text-amber-300"
                                    )}
                                  >
                                    {st.count > 99 ? "99+" : st.count}
                                  </span>
                                ) : null}
                              </motion.button>
                            );

                            return sidebarCollapsed ? (
                              <MorphTooltip
                                key={st.id}
                                placement="right"
                                content={`${st.label} · ${st.count} 台`}
                              >
                                {btn}
                              </MorphTooltip>
                            ) : (
                              btn
                            );
                          })}
                        </nav>
                      </div>
                    );
                  }

                  // Group: QI/QC Quality Workbench Tools
                  return (
                    <div key="group-workbench">
                      {sidebarCollapsed ? (
                        groupIndex > 0 && (
                          <div className="mx-auto mb-2 h-px w-6 bg-zinc-200/90 dark:bg-white/[0.08]" />
                        )
                      ) : (
                        <div className="px-2.5 pb-1.5 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          <span>{t("QI / QC 工具台", "QI / QC Workbench")}</span>
                          {mountedWorkbenchTools.length > 0 && (
                            <span className="font-mono normal-case text-[10px] text-emerald-600 dark:text-emerald-400">
                              {t(
                                `${mountedWorkbenchTools.length} 运行中`,
                                `${mountedWorkbenchTools.length} active`
                              )}
                            </span>
                          )}
                        </div>
                      )}
                      <nav className={cn("space-y-0.5", sidebarCollapsed && "flex flex-col items-center")}>
                        {group.visibleItems.map((entry) => {
                          if (entry.id === "hub") {
                            const hubActive =
                              activeWorkspace === "workbench" &&
                              activeWorkbenchToolId === null;
                            const hubBtn = (
                              <motion.button
                                key="workbench-hub"
                                type="button"
                                whileTap={TAP_SCALE_SUBTLE}
                                transition={SPRING_SNAPPY}
                                onClick={openWorkbenchHub}
                                aria-label="QI/QC 工具台"
                                className={cn(
                                  "relative rounded-lg text-xs font-medium flex items-center transition-colors",
                                  sidebarCollapsed
                                    ? "h-9 w-9 justify-center"
                                    : "w-full px-2.5 py-2 justify-between",
                                  hubActive
                                    ? "text-zinc-950 dark:text-white"
                                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-white/[0.04]"
                                )}
                              >
                                {hubActive && (
                                  <motion.span
                                    layoutId="sidebar-workbench-pill"
                                    transition={SPRING_SNAPPY}
                                    className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.08] border border-zinc-200/85 dark:border-white/[0.08] shadow-tactile"
                                  />
                                )}
                                <span className="relative z-10 inline-flex items-center gap-2">
                                  <LayoutGrid
                                    className={cn(
                                      "h-3.5 w-3.5 transition-colors",
                                      hubActive
                                        ? "text-indigo-600 dark:text-indigo-400"
                                        : "text-zinc-400 dark:text-zinc-500"
                                    )}
                                  />
                                  {!sidebarCollapsed && (
                                    <span>{t("工具台总览", "Workbench Hub")}</span>
                                  )}
                                </span>
                                {!sidebarCollapsed && (
                                  <span className="relative z-10 font-mono text-[10.5px] text-zinc-400 dark:text-zinc-500">
                                    {readyToolsById.size}
                                  </span>
                                )}
                              </motion.button>
                            );

                            return sidebarCollapsed ? (
                              <MorphTooltip
                                key="workbench-hub-tip"
                                placement="right"
                                content="QI / QC 工具台总览"
                              >
                                {hubBtn}
                              </MorphTooltip>
                            ) : (
                              hubBtn
                            );
                          }

                          const tool = readyToolsById.get(entry.id);
                          if (!tool) return null;
                          const active =
                            activeWorkspace === "workbench" &&
                            activeWorkbenchToolId === tool.id;
                          const running = mountedWorkbenchTools.includes(tool.id);
                          const Icon = tool.icon;
                          const btn = (
                            <motion.button
                              key={tool.id}
                              type="button"
                              whileTap={TAP_SCALE_SUBTLE}
                              transition={SPRING_SNAPPY}
                              onClick={() => launchWorkbenchTool(tool.id)}
                              aria-label={tool.shortName}
                              className={cn(
                                "relative rounded-lg text-xs font-medium flex items-center transition-colors",
                                sidebarCollapsed
                                  ? "h-9 w-9 justify-center"
                                  : "w-full px-2.5 py-2 justify-between",
                                active
                                  ? "text-zinc-950 dark:text-white"
                                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-white/[0.04]"
                              )}
                            >
                              {active && (
                                <motion.span
                                  layoutId="sidebar-workbench-pill"
                                  transition={SPRING_SNAPPY}
                                  className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.08] border border-zinc-200/85 dark:border-white/[0.08] shadow-tactile"
                                />
                              )}
                              <span className="relative z-10 inline-flex items-center gap-2 min-w-0">
                                <Icon
                                  className="h-3.5 w-3.5 shrink-0 transition-colors"
                                  style={{ color: active ? tool.accent : undefined }}
                                />
                                {!sidebarCollapsed && (
                                  <span className="truncate">{tool.shortName}</span>
                                )}
                              </span>
                              {running && (
                                <span
                                  className={cn(
                                    "relative z-10 rounded-full bg-emerald-500 shrink-0",
                                    sidebarCollapsed
                                      ? "absolute top-1.5 right-1.5 h-1.5 w-1.5"
                                      : "h-1.5 w-1.5"
                                  )}
                                  title="工具运行中"
                                />
                              )}
                            </motion.button>
                          );

                          return sidebarCollapsed ? (
                            <MorphTooltip
                              key={tool.id}
                              placement="right"
                              content={`${tool.name}${running ? " · 运行中" : ""}`}
                            >
                              {btn}
                            </MorphTooltip>
                          ) : (
                            btn
                          );
                        })}
                      </nav>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Interactive Expandable Compliance Meter (Storage Meter style) */}
            <ComplianceMeterCard
              collapsed={sidebarCollapsed}
              controlled={stats.controlled}
              compliancePct={stats.compliancePct}
              valid={stats.valid}
              expired={stats.expired}
              tierSegments={stats.tierSegments}
              onFilterStatus={handleSelectStatusFilter}
              onFilterExpiry={handleSelectExpiryFilter}
            />

            {/* Sidebar Bottom Account & Utility Rail */}
            <div
              className={cn(
                "border-t border-zinc-200/80 dark:border-white/[0.07] space-y-2",
                sidebarCollapsed ? "p-2 flex flex-col items-center" : "p-3"
              )}
            >
              {sidebarCollapsed ? (
                <>
                  {auth.isAdmin ? (
                    <MorphTooltip
                      placement="right"
                      content={auth.username}
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={() => openSettingsTab("account")}
                        className={cn(
                          "relative h-9 w-9 rounded-full border shadow-tactile flex items-center justify-center overflow-hidden",
                          !avatarDataUrl && isGrainMeshId(accountBg)
                            ? "border-black/10 dark:border-white/15"
                            : "bg-white dark:bg-white/[0.05] border-zinc-200/85 dark:border-white/[0.08]"
                        )}
                      >
                        {!avatarDataUrl && isGrainMeshId(accountBg) && (
                          <SilkFlowCanvas
                            paletteId={accountBg}
                            paused={auth.isLocked || onboardingPreviewOpen}
                          />
                        )}
                        {avatarDataUrl ? (
                          <img
                            src={avatarDataUrl}
                            alt="头像"
                            className="relative z-10 h-full w-full object-cover"
                          />
                        ) : (
                          <span
                            className={cn(
                              "relative z-10 text-xs font-semibold uppercase",
                              isGrainMeshId(accountBg)
                                ? LIGHT_TONE_MESH_IDS.has(accountBg)
                                  ? "text-zinc-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.45)]"
                                  : "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                                : "text-emerald-700 dark:text-emerald-400"
                            )}
                          >
                            {auth.username.slice(0, 1) || "A"}
                          </span>
                        )}
                      </motion.button>
                    </MorphTooltip>
                  ) : (
                    <MorphTooltip placement="right" content="管理员登录">
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={() => setLoginModalOpen(true)}
                        className="h-9 w-9 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 flex items-center justify-center shadow-tactile-primary transition-colors"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                      </motion.button>
                    </MorphTooltip>
                  )}

                  <div className="flex flex-col items-center gap-1 w-full">
                    <MorphTooltip
                      placement="right"
                      content={
                        auth.appLockEnabled
                          ? "立即锁定应用 (⌘L)"
                          : "开启并设置独立应用锁 (⌘L)"
                      }
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={handleLock}
                        className="relative h-8 w-9 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        {auth.appLockEnabled && (
                          <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                        )}
                      </motion.button>
                    </MorphTooltip>

                    <MorphTooltip
                      placement="right"
                      content={t("设置", "Settings")}
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={() => openSettingsTab("appearance")}
                        className="h-8 w-9 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </motion.button>
                    </MorphTooltip>

                    <MorphTooltip
                      placement="right"
                      content={
                        availableUpdate?.hasUpdate
                          ? t(
                              `发现新版本 v${availableUpdate.latestVersion}，点击查看`,
                              `New version v${availableUpdate.latestVersion} available`
                            )
                          : t("检查软件更新", "Check for Updates")
                      }
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={() =>
                          availableUpdate?.hasUpdate
                            ? setUpdatePopupOpen((v) => !v)
                            : openSettingsTab("update")
                        }
                        className="relative h-8 w-9 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                      >
                        <CloudDownload className="h-3.5 w-3.5" />
                        {availableUpdate?.hasUpdate && (
                          <span className="absolute top-1 right-1.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-zinc-50 dark:ring-[#0c0c0f]" />
                          </span>
                        )}
                      </motion.button>
                    </MorphTooltip>

                    <ThemeSwitcherButton
                      preference={themePreference}
                      collapsed={true}
                      buttonRef={themeToggleBtnRef}
                      onCycleTheme={handleCycleTheme}
                    />
                  </div>
                </>
              ) : (
                <>
                  {auth.isAdmin ? (() => {
                    const useSilk = isGrainMeshId(accountBg);
                    const isLightSilk = useSilk && LIGHT_TONE_MESH_IDS.has(accountBg);
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openSettingsTab("account")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openSettingsTab("account");
                          }
                        }}
                        title="账号与背景设置"
                        className={cn(
                          "btn-tactile group relative overflow-hidden px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer",
                          useSilk
                            ? isLightSilk
                              ? "border-black/[0.08] dark:border-white/20 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.45)]"
                              : "border-black/10 dark:border-white/15 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.28)]"
                            : "bg-white hover:bg-zinc-50/90 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] border-zinc-200/85 dark:border-white/[0.08] shadow-tactile"
                        )}
                      >
                        {/* Flowing post-Netflix liquid-silk background matching onboarding */}
                        {useSilk && (
                          <>
                            <SilkFlowCanvas
                              paletteId={accountBg}
                              paused={auth.isLocked || onboardingPreviewOpen}
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "pointer-events-none absolute inset-0 transition-opacity duration-200",
                                isLightSilk
                                  ? "bg-gradient-to-r from-white/25 via-white/10 to-white/22 group-hover:opacity-80"
                                  : "bg-gradient-to-r from-black/24 via-black/12 to-black/22 group-hover:opacity-80"
                              )}
                            />
                          </>
                        )}
                        <div className="relative z-10 flex items-center gap-2 min-w-0">
                          {avatarDataUrl ? (
                            <img
                              src={avatarDataUrl}
                              alt="头像"
                              className="h-7 w-7 rounded-full object-cover border border-white/80 dark:border-white/25 shadow-sm shrink-0"
                            />
                          ) : (
                            <div
                              className={cn(
                                "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold uppercase shrink-0",
                                useSilk
                                  ? isLightSilk
                                    ? "bg-white/60 backdrop-blur-md text-zinc-900 ring-1 ring-white/80 shadow-sm"
                                    : "bg-white/20 backdrop-blur-md text-white ring-1 ring-white/45 shadow-sm [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                              )}
                            >
                              {auth.username.slice(0, 1) || "A"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div
                              className={cn(
                                "text-xs font-medium truncate",
                                useSilk
                                  ? isLightSilk
                                    ? "text-zinc-950 font-semibold [text-shadow:0_1px_1px_rgba(255,255,255,0.45)]"
                                    : "text-white font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]"
                                  : "text-zinc-900 dark:text-zinc-100"
                              )}
                            >
                              {auth.username}
                            </div>
                          </div>
                        </div>
                        <MorphTooltip content="退出登录" placement="top">
                          <motion.button
                            type="button"
                            whileTap={TAP_SCALE_ICON}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLogout();
                            }}
                            className={cn(
                              "relative z-10 p-1.5 rounded-lg transition",
                              useSilk
                                ? isLightSilk
                                  ? "text-zinc-800/80 hover:text-zinc-950 hover:bg-black/[0.08]"
                                  : "text-white/85 hover:text-white hover:bg-black/20"
                                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/[0.1]"
                            )}
                            aria-label="退出登录"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                          </motion.button>
                        </MorphTooltip>
                      </div>
                    );
                  })() : (
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      transition={SPRING_SNAPPY}
                      onClick={() => setLoginModalOpen(true)}
                      className="btn-sheen w-full px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium inline-flex items-center justify-center gap-1.5 shadow-tactile-primary transition-colors"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      <span>{t("管理员登录", "Admin Sign In")}</span>
                    </motion.button>
                  )}

                  {/* Compact Sidebar Update Banner when New Version is Available */}
                  <AnimatePresence>
                    {availableUpdate?.hasUpdate && (
                      <motion.button
                        key="sidebar-update-banner"
                        type="button"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        whileTap={TAP_SCALE_SUBTLE}
                        onClick={() => setUpdatePopupOpen(true)}
                        className="w-full px-2.5 py-2 rounded-xl bg-white hover:bg-zinc-50 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] border border-zinc-200/90 dark:border-white/[0.1] shadow-tactile flex items-center justify-between gap-2 text-left transition"
                        title={t("点击查看并一键安装新版本", "View and install update")}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                          </span>
                          <span className="text-[11.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
                            {t("新版本 ", "Update ")}
                            <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                              v{availableUpdate.latestVersion}
                            </span>
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                          <span>{updatingApp ? t("更新中", "Updating") : t("更新", "Install")}</span>
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Compact Utility Controls with Shared Morphing Tooltip */}
                  <div className="grid grid-cols-4 gap-1">
                    <MorphTooltip
                      placement="top"
                      className="w-full"
                      content={
                        auth.appLockEnabled
                          ? t("立即锁定应用 (⌘L)", "Lock App Now (⌘L)")
                          : t("开启并设置独立应用锁 (⌘L)", "Set Up App Lock (⌘L)")
                      }
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={handleLock}
                        aria-label={t("锁定应用", "Lock App")}
                        className="relative w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        {auth.appLockEnabled && (
                          <span className="absolute top-1.5 right-3 h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                        )}
                      </motion.button>
                    </MorphTooltip>

                    <MorphTooltip
                      placement="top"
                      className="w-full"
                      content={t("设置", "Settings")}
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={() => openSettingsTab("appearance")}
                        aria-label={t("设置", "Settings")}
                        className="w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </motion.button>
                    </MorphTooltip>

                    <MorphTooltip
                      placement="top"
                      className="w-full"
                      content={
                        availableUpdate?.hasUpdate
                          ? t(
                              `发现新版本 v${availableUpdate.latestVersion}，点击查看`,
                              `New version v${availableUpdate.latestVersion} available`
                            )
                          : t("检查软件更新", "Check for Updates")
                      }
                    >
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE_ICON}
                        transition={SPRING_SNAPPY}
                        onClick={() =>
                          availableUpdate?.hasUpdate
                            ? setUpdatePopupOpen((v) => !v)
                            : openSettingsTab("update")
                        }
                        aria-label={t("检查更新", "Check for Updates")}
                        className="relative w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                      >
                        <CloudDownload className="h-3.5 w-3.5" />
                        {availableUpdate?.hasUpdate && (
                          <span className="absolute top-1 right-2.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-[#f4f5f7] dark:ring-[#121318]" />
                          </span>
                        )}
                      </motion.button>
                    </MorphTooltip>

                    <ThemeSwitcherButton
                      preference={themePreference}
                      collapsed={false}
                      buttonRef={themeToggleBtnRef}
                      onCycleTheme={handleCycleTheme}
                    />
                  </div>
                </>
              )}
            </div>
          </motion.aside>
          </div>

          {/* Inset Rounded Content Surface (Matches Antigravity / Motty / Codex floating card canvas) */}
          <div
            className={cn(
              "flex-1 flex min-w-0 min-h-0 pr-2 pb-2",
              activeWorkspace === "workbench" && workbenchImmersive ? "pl-2" : "pl-0"
            )}
          >
          <div className="relative flex-1 flex min-w-0 min-h-0 rounded-xl overflow-hidden bg-white dark:bg-[#09090b] border border-zinc-200/85 dark:border-white/[0.08] shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.45)]">
          {/* Main Workspace Canvas (Ledger, supports direct .xlsx drag-and-drop import for admins) */}
          <div
            ref={ledgerDropRef}
            onDragOver={handleLedgerDragOver}
            onDragLeave={handleLedgerDragLeave}
            onDrop={handleLedgerDrop}
            className={cn(
              "relative flex-1 flex-col min-w-0 bg-white dark:bg-[#09090b]",
              activeWorkspace === "ledger" ? "flex" : "hidden"
            )}
          >
            {/* Direct .xlsx Drag-and-Drop Overlay */}
            <AnimatePresence>
              {ledgerDraggingExcel && (
                <motion.div
                  key="ledger-drop-overlay"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.16 }}
                  className="pointer-events-none absolute inset-3 z-40 rounded-xl border-2 border-dashed border-emerald-500/75 bg-white/90 dark:bg-[#09090b]/90 backdrop-blur-md flex flex-col items-center justify-center gap-2.5 shadow-modal-light dark:shadow-elevated"
                >
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {t("松开即可导入 Excel 台账 (.xlsx)", "Drop .xlsx File to Import")}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("自动识别量具与检具工作表并预览核对", "Automatically parses Gauges & Fixtures sheets for preview")}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Minimalist Workspace Header */}
            <header className="h-14 px-6 border-b border-zinc-200/80 dark:border-white/[0.07] flex items-center justify-between gap-4 shrink-0 bg-white/90 dark:bg-[#09090b]">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-white truncate">
                  {activeHeading}
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-zinc-100/95 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.06] text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-300">
                  <SlidingNumber value={filteredInstruments.length} />
                </span>

                <AnimatePresence>
                  {statusFilter !== "all" && (
                    <motion.button
                      key="status-chip"
                      type="button"
                      initial={{ opacity: 0, scale: 0.88, x: -4 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.88, x: -4 }}
                      whileTap={TAP_SCALE}
                      transition={SPRING_SNAPPY}
                      onClick={() => handleSelectStatusFilter("all")}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-[11px] text-zinc-700 dark:text-zinc-200 transition-colors"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          statusMeta[statusFilter].dot
                        )}
                      />
                      <span>{statusMeta[statusFilter].label}</span>
                      <X className="h-3 w-3 text-zinc-400" />
                    </motion.button>
                  )}

                  {typeof expiryFilter === "number" &&
                    (() => {
                      const matched = descThresholds.find(
                        (t) => t.days === expiryFilter
                      );
                      const visuals = getThresholdVisuals(
                        matched?.color || "#f59e0b"
                      );
                      return (
                        <motion.button
                          key="expiry-chip"
                          type="button"
                          initial={{ opacity: 0, scale: 0.88, x: -4 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.88, x: -4 }}
                          whileTap={TAP_SCALE}
                          transition={SPRING_SNAPPY}
                          onClick={() => handleSelectExpiryFilter("all")}
                          style={visuals.cssVars}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] transition-colors"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: visuals.hex }}
                          />
                          <span>≤{expiryFilter}天到期</span>
                          <X className="h-3 w-3 opacity-70" />
                        </motion.button>
                      );
                    })()}
                </AnimatePresence>

                {!auth.isAdmin && (
                  <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200/80 dark:border-white/[0.08] text-[10.5px] text-zinc-400">
                    <Eye className="h-3 w-3" />
                    {t("只读模式", "Read-only")}
                  </span>
                )}
              </div>

              {/* Primary Action Toolbar (Decluttered Compact Icon Mode / Full Label Mode) */}
              {(() => {
                const compactToolbar = settings.compactToolbar !== false;
                const showImportButton = Boolean(settings.showImportButton);
                const hasAlerts = alertSummary.totalAlertCount > 0;
                const alertColor =
                  alertSummary.highestSeverityColor || "#10b981";
                const alertVisuals = getThresholdVisuals(alertColor);

                const alertButton = (
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onMouseEnter={() => setBellHovered(true)}
                    onMouseLeave={() => setBellHovered(false)}
                    onClick={() => openAlertModal()}
                    style={hasAlerts ? alertVisuals.cssVars : undefined}
                    aria-label={t("到期预警", "Expiry Alerts")}
                    className={cn(
                      "inline-flex items-center justify-center rounded-lg border text-xs font-medium shadow-tactile transition-colors cursor-pointer",
                      compactToolbar
                        ? hasAlerts
                          ? "h-8 px-2 gap-1.5"
                          : "h-8 w-8"
                        : "gap-1.5 px-2.5 py-1.5",
                      hasAlerts
                        ? "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] hover:opacity-90"
                        : "border-zinc-200/95 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-zinc-700 dark:text-zinc-200"
                    )}
                  >
                    <span className="relative flex items-center justify-center">
                      <AnimatedBellIcon
                        hasAlerts={hasAlerts}
                        alertCount={alertSummary.totalAlertCount}
                        hovered={bellHovered}
                      />
                      {hasAlerts && (
                        <span
                          className="animate-ping absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full opacity-75"
                          style={{ backgroundColor: alertColor }}
                        />
                      )}
                    </span>
                    {!compactToolbar && <span>{t("到期预警", "Alerts")}</span>}
                    {hasAlerts && (
                      <span
                        className="px-1.5 py-0.2 rounded-full text-[10.5px] font-mono tabular-nums font-semibold text-white"
                        style={{ backgroundColor: alertColor }}
                      >
                        <SlidingNumber value={alertSummary.totalAlertCount} />
                      </span>
                    )}
                  </motion.button>
                );

                const importButton = (
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => setImportModalOpen(true)}
                    aria-label={t("导入 Excel", "Import Excel")}
                    className={cn(
                      "inline-flex items-center justify-center rounded-lg border border-zinc-200/95 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors cursor-pointer",
                      compactToolbar ? "h-8 w-8" : "gap-1.5 px-2.5 py-1.5"
                    )}
                  >
                    <Upload className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                    {!compactToolbar && <span>{t("导入", "Import")}</span>}
                  </motion.button>
                );

                const exportTriggerBtn = (
                  <motion.button
                    type="button"
                    disabled={exportStatus === "loading"}
                    whileTap={exportStatus === "loading" ? undefined : TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportMenuOpen((v) => !v);
                    }}
                    aria-label={t("导出 Excel", "Export Excel")}
                    className={cn(
                      "inline-flex items-center justify-center rounded-lg border shadow-tactile text-xs font-medium transition-all cursor-pointer",
                      compactToolbar ? "h-8 px-2 gap-1" : "gap-1.5 px-2.5 py-1.5",
                      exportStatus === "success"
                        ? "bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : exportMenuOpen
                          ? "bg-white dark:bg-white/[0.03] border-zinc-400 dark:border-white/25 ring-[3px] ring-zinc-900/[0.06] dark:ring-white/[0.08] text-zinc-700 dark:text-zinc-200"
                          : "bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] border-zinc-200/95 dark:border-white/[0.09] text-zinc-700 dark:text-zinc-200"
                    )}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {exportStatus === "loading" ? (
                        <motion.span
                          key="exp-load"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.14 }}
                          className="inline-flex items-center gap-1.5"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                          {!compactToolbar && (
                            <span>{t("导出中...", "Exporting...")}</span>
                          )}
                        </motion.span>
                      ) : exportStatus === "success" ? (
                        <motion.span
                          key="exp-ok"
                          initial={{ opacity: 0, scale: 0.75 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={SPRING_SNAPPY}
                          className="inline-flex items-center gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                          {!compactToolbar && <span>{t("已导出", "Exported")}</span>}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="exp-idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="inline-flex items-center gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
                          {!compactToolbar && <span>{t("导出", "Export")}</span>}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <motion.span
                      animate={{ rotate: exportMenuOpen ? 180 : 0 }}
                      transition={SPRING_SNAPPY}
                      className="flex items-center"
                    >
                      <ChevronDown className="h-3 w-3 text-zinc-400" />
                    </motion.span>
                  </motion.button>
                );

                const printButton = (
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => handlePrint()}
                    aria-label={t("打印台账", "Print Ledger")}
                    className={cn(
                      "inline-flex items-center justify-center rounded-lg border border-zinc-200/95 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors cursor-pointer",
                      compactToolbar ? "h-8 w-8" : "gap-1.5 px-2.5 py-1.5"
                    )}
                  >
                    <Printer className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                    {!compactToolbar && <span>{t("打印", "Print")}</span>}
                  </motion.button>
                );

                const addButton = (
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={openCreateDrawer}
                    aria-label={t("新增设备", "Add Item")}
                    className={cn(
                      "btn-sheen inline-flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium shadow-tactile-primary transition-colors cursor-pointer",
                      compactToolbar ? "h-8 w-8" : "gap-1.5 px-3 py-1.5"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {!compactToolbar && <span>{t("新增设备", "Add Item")}</span>}
                  </motion.button>
                );

                return (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {compactToolbar ? (
                      <MorphTooltip
                        placement="bottom"
                        content={
                          hasAlerts
                            ? t(
                                `到期预警 · ${alertSummary.totalAlertCount} 台需关注`,
                                `Expiry Alerts · ${alertSummary.totalAlertCount} items`
                              )
                            : t("到期预警", "Expiry Alerts")
                        }
                      >
                        {alertButton}
                      </MorphTooltip>
                    ) : (
                      alertButton
                    )}

                    {auth.isAdmin &&
                      showImportButton &&
                      (compactToolbar ? (
                        <MorphTooltip
                          placement="bottom"
                          content={t("导入 Excel (.xlsx)", "Import Excel (.xlsx)")}
                        >
                          {importButton}
                        </MorphTooltip>
                      ) : (
                        importButton
                      ))}

                    {/* Export Menu with Download Icon & Loading -> Success Micro-Morph */}
                    <div className="relative">
                      {compactToolbar ? (
                        <MorphTooltip
                          placement="bottom"
                          content={
                            exportStatus === "loading"
                              ? t("正在导出...", "Exporting...")
                              : exportStatus === "success"
                                ? t("导出完成", "Exported")
                                : t("导出 Excel", "Export Excel")
                          }
                        >
                          {exportTriggerBtn}
                        </MorphTooltip>
                      ) : (
                        exportTriggerBtn
                      )}

                      <AnimatePresence>
                        {exportMenuOpen && (
                          <motion.div
                            {...POPOVER_MOTION}
                            style={{ transformOrigin: "top right" }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white dark:bg-[#141418] border border-zinc-200/90 dark:border-white/[0.1] shadow-modal-light dark:shadow-popover p-1 z-40"
                          >
                            <button
                              type="button"
                              onClick={() => handleExportExcel("all")}
                              className="w-full px-3 py-2 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] flex items-center justify-between gap-2 transition-colors"
                            >
                              <span className="inline-flex items-center gap-2 font-medium">
                                <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{t("导出全部 (.xlsx)", "Export All (.xlsx)")}</span>
                              </span>
                              <InfoTip
                                content={t(
                                  `按 ${settings.docCode} 标准双台账格式导出`,
                                  `Export using ${settings.docCode} standard dual-sheet template`
                                )}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportExcel("filtered")}
                              className="w-full px-3 py-2 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                            >
                              <Download className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              <span className="font-medium">
                                {t(
                                  `导出当前视图 (${filteredInstruments.length})`,
                                  `Export Current View (${filteredInstruments.length})`
                                )}
                              </span>
                            </button>
                            {selectedInstruments.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleExportExcel("selected")}
                                className="w-full px-3 py-2 rounded-lg text-left text-xs text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-2 transition-colors"
                              >
                                <Download className="h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium">
                                  {t(
                                    `导出已选设备 (${selectedInstruments.length})`,
                                    `Export Selected (${selectedInstruments.length})`
                                  )}
                                </span>
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {compactToolbar ? (
                      <MorphTooltip
                        placement="bottom"
                        content={t("打印台账", "Print Ledger")}
                      >
                        {printButton}
                      </MorphTooltip>
                    ) : (
                      printButton
                    )}

                    {auth.isAdmin &&
                      (compactToolbar ? (
                        <MorphTooltip
                          placement="bottom"
                          content={t("新增设备", "Add Item")}
                        >
                          {addButton}
                        </MorphTooltip>
                      ) : (
                        addButton
                      ))}
                  </div>
                );
              })()}
            </header>

            {/* Sleek Filter & Sort Strip */}
            <div className="border-b border-zinc-200/75 dark:border-white/[0.06] bg-[#fafaf9] dark:bg-white/[0.015] shrink-0">
              <div className="px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  {/* Inline Search */}
                  <SearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t("过滤名称、编号、规格、位置...", "Filter by name, serial, spec, location...")}
                    icon={<Search className="h-3.5 w-3.5" />}
                    className="flex-1 max-w-xs min-w-[200px]"
                  />

                  {/* Custom Animated Department Select */}
                  <PrecisionSelect
                    value={deptFilter}
                    onChange={setDeptFilter}
                    options={[
                      { value: "all", label: t("全部部门", "All Depts") },
                      ...departmentOptions.map((d) => ({ value: d, label: d })),
                      { value: "__empty__", label: t("未填部门", "Unassigned") },
                    ]}
                    className="min-w-[116px]"
                  />

                  {/* Custom Animated Sort Select */}
                  <PrecisionSelect
                    value={sortMode}
                    onChange={(v) => setSortMode(v as SortMode)}
                    icon={<ArrowUpDown className="h-3 w-3" />}
                    options={[
                      { value: "seq", label: t("默认序号", "Default Order") },
                      { value: "expiry", label: t("到期日优先", "Due Soonest") },
                      { value: "name", label: t("名称排序", "By Name") },
                    ]}
                    className="min-w-[116px]"
                  />

                  <AnimatePresence>
                    {hasActiveFilters && (
                      <motion.button
                        key="reset-filters-btn"
                        type="button"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileTap={TAP_SCALE}
                        transition={SPRING_SNAPPY}
                        onClick={resetAllFilters}
                        className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        {t("重置筛选", "Reset Filters")}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* Segmented Calibration Method Control */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06]">
                  {(
                    [
                      { id: "all", label: t("全部方式", "All") },
                      { id: "external", label: t("外校", "External") },
                      { id: "internal", label: t("内校", "Internal") },
                      { id: "exempt", label: t("免校", "Exempt") },
                    ] as const
                  ).map((item) => {
                    const active = calTypeFilter === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileTap={TAP_SCALE_SUBTLE}
                        onClick={() => setCalTypeFilter(item.id)}
                        className={cn(
                          "relative px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors",
                          active
                            ? "text-zinc-900 dark:text-white"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="cal-type-pill"
                            transition={SPRING_SNAPPY}
                            className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.11] shadow-tactile"
                          />
                        )}
                        <span className="relative z-10">{item.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Dedicated Expiry Countdown Filter Strip (60d / 30d / 15d / Custom + Expired) */}
              <div className="px-6 py-2 border-t border-zinc-200/65 dark:border-white/[0.05] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mr-1 select-none">
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span>{t("到期筛选", "Due Window")}</span>
                  </span>

                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => handleSelectExpiryFilter("all")}
                    className={cn(
                      "relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
                      expiryFilter === "all"
                        ? "text-white dark:text-zinc-950 border-transparent"
                        : "bg-white dark:bg-white/[0.03] border-zinc-200/95 dark:border-white/[0.08] shadow-tactile text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-white/[0.15]"
                    )}
                  >
                    {expiryFilter === "all" && (
                      <motion.span
                        layoutId="expiry-filter-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full bg-zinc-900 dark:bg-white shadow-tactile-primary"
                      />
                    )}
                    <span className="relative z-10">{t("全部", "All")}</span>
                  </motion.button>

                  {descThresholds.map((tier) => {
                    const visuals = getThresholdVisuals(tier.color);
                    const active = expiryFilter === tier.days;
                    const count = expiryFilterCounts.byDays[tier.days] ?? 0;
                    return (
                      <motion.button
                        key={tier.id}
                        type="button"
                        whileTap={TAP_SCALE}
                        transition={SPRING_SNAPPY}
                        onClick={() =>
                          handleSelectExpiryFilter(active ? "all" : tier.days)
                        }
                        style={visuals.cssVars}
                        className={cn(
                          "relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
                          active
                            ? "border-transparent text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]"
                            : "bg-white dark:bg-white/[0.03] border-zinc-200/95 dark:border-white/[0.08] shadow-tactile text-zinc-600 dark:text-zinc-300 hover:bg-[var(--tier-bg)] dark:hover:bg-[var(--tier-bg-dark)]"
                        )}
                        title={`筛选未来 ${tier.days} 天内到期的设备（${tier.label}）`}
                      >
                        {active && (
                          <motion.span
                            layoutId="expiry-filter-pill"
                            transition={SPRING_SNAPPY}
                            style={{ borderColor: visuals.hex }}
                            className="absolute inset-0 rounded-full border bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] shadow-tactile"
                          />
                        )}
                        <span
                          className="relative z-10 h-1.5 w-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: visuals.hex,
                            boxShadow: active ? visuals.glow : undefined,
                          }}
                        />
                        <span className="relative z-10">{t(`${tier.days}天内`, `≤${tier.days}d`)}</span>
                        <SlidingNumber
                          value={count}
                          className={cn(
                            "relative z-10 font-mono text-[10.5px]",
                            active
                              ? "font-semibold"
                              : count > 0
                                ? "text-zinc-500 dark:text-zinc-400"
                                : "text-zinc-300 dark:text-zinc-600"
                          )}
                        />
                      </motion.button>
                    );
                  })}

                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() =>
                      handleSelectExpiryFilter(
                        expiryFilter === "expired" ? "all" : "expired"
                      )
                    }
                    className={cn(
                      "relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
                      expiryFilter === "expired"
                        ? "border-transparent text-rose-700 dark:text-rose-300"
                        : "bg-white dark:bg-white/[0.03] border-zinc-200/95 dark:border-white/[0.08] shadow-tactile text-zinc-600 dark:text-zinc-300 hover:bg-rose-500/[0.07] hover:border-rose-300 dark:hover:border-rose-500/40"
                    )}
                    title="筛选已超过下次检验日期的设备"
                  >
                    {expiryFilter === "expired" && (
                      <motion.span
                        layoutId="expiry-filter-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-full border border-rose-500 bg-rose-500/[0.12] dark:bg-rose-500/[0.18] shadow-tactile"
                      />
                    )}
                    <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="relative z-10">{t("已超期", "Expired")}</span>
                    <SlidingNumber
                      value={expiryFilterCounts.expired}
                      className={cn(
                        "relative z-10 font-mono text-[10.5px]",
                        expiryFilterCounts.expired > 0
                          ? "text-rose-600 dark:text-rose-400 font-semibold"
                          : "text-zinc-300 dark:text-zinc-600"
                      )}
                    />
                  </motion.button>
                </div>

                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  onClick={() => openSettingsTab("alerts")}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] transition-colors shrink-0"
                  title={t("预警设置", "Alert Settings")}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>{t("预警设置", "Alert Rules")}</span>
                </motion.button>
              </div>
            </div>

            {/* Virtualized Precision Data Table Area */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                <div className="h-5 w-5 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-white animate-spin" />
                <span>{t("加载中...", "Loading...")}</span>
              </div>
            ) : instruments.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-sm space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center mx-auto text-zinc-500 dark:text-zinc-400">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {t("暂无设备记录", "No Equipment Records Yet")}
                  </h3>
                  <div className="flex items-center justify-center gap-2.5 pt-1">
                    {auth.isAdmin ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setImportModalOpen(true)}
                          className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] shadow-tactile text-zinc-800 dark:text-zinc-100 text-xs font-medium"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>{t("导入 Excel", "Import Excel")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={openCreateDrawer}
                          className="btn-sheen btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 shadow-tactile-primary text-white dark:text-zinc-950 text-xs font-medium"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{t("新增设备", "Add Item")}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLoginModalOpen(true)}
                        className="btn-sheen btn-tactile inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 shadow-tactile-primary text-white dark:text-zinc-950 text-xs font-medium"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        <span>{t("登录", "Sign In")}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : deferredFilteredInstruments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("无匹配记录", "No matching records")}
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="btn-tactile px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.06]"
                >
                  {t("重置筛选", "Reset Filters")}
                </button>
              </div>
            ) : (
              <VirtualInstrumentTable
                items={pagedInstruments}
                statusById={statusById}
                activeTab={activeTab}
                isAdmin={auth.isAdmin}
                activeInstrumentId={
                  drawerOpen ? (editingInstrument?.id ?? null) : null
                }
                selectedIds={selectedIds}
                selectAllLabel={
                  isShowAll
                    ? t("全选当前列表", "Select all listed")
                    : t("全选当前页", "Select all on page")
                }
                rowOffset={pageStartIndex}
                virtualize={isShowAll || pagedInstruments.length > 120}
                virtualizeThreshold={virtualizeThreshold}
                resetScrollKey={`${activeTab}|${statusFilter}|${expiryFilter}|${deptFilter}|${calTypeFilter}|${sortMode}|${pageSize}|${safePage}`}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAllVisible={handleToggleSelectAllVisible}
                onView={openViewDrawer}
                onEdit={openEditDrawer}
                onDelete={handleDelete}
                onOpenReport={handleOpenReportModal}
                onOpenPhoto={handleOpenPhotoLightbox}
              />
            )}

            {/* Floating Batch Action Dock when one or more rows are selected */}
            <BatchActionBar
              selectedCount={selectedInstruments.length}
              totalFilteredCount={filteredInstruments.length}
              allVisibleSelected={allVisibleSelected}
              isAdmin={auth.isAdmin}
              exporting={batchExporting}
              deleting={batchDeleting}
              onSelectAllFiltered={handleSelectAllFiltered}
              onClearSelection={clearSelection}
              onBatchEdit={() => setBatchEditOpen(true)}
              onBatchExport={() => handleExportExcel("selected")}
              onBatchPrint={() => handlePrint(selectedInstruments)}
              onBatchDelete={handleBatchDelete}
            />

            {/* Minimalist Desktop Status Bar & Pagination */}
            <footer className="h-11 px-6 border-t border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/75 dark:bg-[#0c0c0f] flex items-center justify-between gap-4 text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="hidden md:flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1">
                    <KeycapBadge onClick={() => setCommandOpen(true)}>⌘K</KeycapBadge>
                    <span>{t("检索", "Search")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <KeycapBadge onClick={handleLock}>⌘L</KeycapBadge>
                    <span>{t("锁屏", "Lock")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <KeycapBadge onClick={toggleSidebar}>⌘B</KeycapBadge>
                    <span>{t("侧栏", "Sidebar")}</span>
                  </span>
                </div>
                <InfoTip
                  placement="top"
                  content={t(
                    "下次校验日期自动按「上次校验 + 周期(月) - 1天」计算",
                    "Next calibration date is calculated as: Last Cal Date + Cycle (months) − 1 day"
                  )}
                />
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <TablePagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={totalFilteredCount}
                  categoryTotal={categoryScoped.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            </footer>
          </div>

          {/* QI / QC Quality Workbench Shell (Keep-Alive Lazy Micro-Module Runtime) */}
          <WorkbenchShell
            visible={activeWorkspace === "workbench"}
            activeToolId={activeWorkbenchToolId}
            mountedToolIds={mountedWorkbenchTools}
            hostOverlayOpen={hostOverlayOpen}
            theme={theme}
            immersive={workbenchImmersive}
            cacheLimitMb={settings.workbenchCacheLimitMb || 1024}
            onCacheLimitChanged={(nextMb) =>
              setSettings((prev) => ({ ...prev, workbenchCacheLimitMb: nextMb }))
            }
            onCacheCleared={() => {
              setMountedWorkbenchTools((prev) => prev.filter((id) => id !== "pdf-balloon"));
              setActiveWorkbenchToolId((cur) => (cur === "pdf-balloon" ? null : cur));
              setWorkbenchImmersive(false);
              void import("@/workbench/tools/pdf-balloon/core/pdf")
                .then((m) => m.clearPdfResourceCache())
                .catch(() => {});
            }}
            onToggleImmersive={() => setWorkbenchImmersive((v) => !v)}
            onLaunchTool={(toolId) => launchWorkbenchTool(toolId)}
            onBackToHub={openWorkbenchHub}
            onCloseTool={closeWorkbenchTool}
            onNotify={notify}
            incomingFiles={workbenchIncomingFiles}
            onConsumeIncomingFile={consumeWorkbenchIncomingFile}
          />
          </div>
          </div>
        </motion.div>
      )}

      {/* Dedicated Landscape A4 Print View (Mounted strictly when printing) */}
      {printMounted && (
        <PrintLedgerView
          instruments={printOverrideItems ?? filteredInstruments}
          settings={settings}
          activeCategory={activeTab}
          logoDataUrl={logoDataUrl}
        />
      )}

      {/* Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        open={commandOpen}
        instruments={instruments}
        warningThresholds={settings.warningThresholds}
        isAdmin={auth.isAdmin}
        themePreference={themePreference}
        onClose={() => setCommandOpen(false)}
        onSelectInstrument={(inst) => {
          setActiveWorkspace("ledger");
          setWorkbenchImmersive(false);
          openViewDrawer(inst);
        }}
        onNavigateTab={(tab) => {
          setActiveWorkspace("ledger");
          setWorkbenchImmersive(false);
          setActiveTab(tab);
          setDeptFilter("all");
        }}
        onFilterStatus={(st) => {
          setActiveWorkspace("ledger");
          setWorkbenchImmersive(false);
          handleSelectStatusFilter(st);
        }}
        onFilterExpiry={(f) => {
          setActiveWorkspace("ledger");
          setWorkbenchImmersive(false);
          handleSelectExpiryFilter(f);
        }}
        onOpenAlerts={() => openAlertModal()}
        onCreateInstrument={openCreateDrawer}
        onOpenImport={() => setImportModalOpen(true)}
        onExportAll={() => handleExportExcel("all")}
        onPrint={() => handlePrint()}
        onLock={handleLock}
        onOpenSettings={openSettingsTab}
        syncConfigured={Boolean(syncConfig?.configured && syncConfig?.enabled)}
        onSyncNow={handleSyncNow}
        onSelectThemePreference={(pref) => handleSelectThemePreference(pref)}
        onLoginOrLogout={() => {
          if (auth.isAdmin) handleLogout();
          else setLoginModalOpen(true);
        }}
        onOpenWorkbenchHub={openWorkbenchHub}
        onLaunchWorkbenchTool={(toolId) => launchWorkbenchTool(toolId)}
      />

      {/* Expiry Alert Popup Modal (Alerts Info Only) */}
      <ExpiryAlertModal
        open={alertModalOpen && !(auth.isInitialized && auth.isLocked)}
        instruments={instruments}
        settings={settings}
        precomputedSummary={alertSummary}
        mutedToday={mutedToday}
        onToggleMuteToday={handleToggleMuteToday}
        onClose={() => setAlertModalOpen(false)}
        onSelectInstrument={(inst) => openViewDrawer(inst)}
        onApplyFilterInList={handleApplyFilterFromAlertModal}
      />

      {/* Modals & Drawers */}
      <InstrumentDrawer
        openDrawer={drawerOpen}
        mode={drawerMode}
        initialCategory={activeTab === "fixture" ? "fixture" : "gauge"}
        instrument={editingInstrument}
        allInstruments={instruments}
        warningThresholds={settings.warningThresholds}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => refreshAll()}
        onNotify={notify}
      />

      <ImageLightbox
        photoPath={lightboxState?.photoPath ?? null}
        title={lightboxState?.title}
        subtitle={lightboxState?.subtitle}
        onClose={() => setLightboxState(null)}
      />

      <ReportModal
        instrument={reportInstrument}
        isAdmin={auth.isAdmin}
        onClose={() => setReportInstrument(null)}
        onChanged={() => refreshAll()}
        onNotify={notify}
        onOpenInPdfWorkbench={(file) => launchWorkbenchTool("pdf-balloon", file)}
      />

      <AdminLoginModal
        open={loginModalOpen}
        defaultUsername={auth.username}
        defaultKeepSession={settings.keepAdminSession}
        defaultSessionDays={settings.adminSessionDays}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={(st, keepSession, sessionDays) => {
          setAuth(st);
          setSettings((prev) => ({
            ...prev,
            keepAdminSession: keepSession,
            adminSessionDays: sessionDays,
          }));
          notify(
            keepSession
              ? `登录成功，${sessionDays} 天内保持登录`
              : "登录成功（仅本次有效）",
            "success"
          );
        }}
      />

      <SettingsModal
        openModal={settingsModalOpen}
        initialTab={settingsInitialTab}
        isAdmin={auth.isAdmin}
        adminSessionExpiresAt={auth.adminSessionExpiresAt}
        accountBg={accountBg}
        onAccountBgChange={handleAccountBgChange}
        themePreference={themePreference}
        onSelectThemePreference={handleSelectThemePreference}
        onAppearanceChange={applyAppearancePatch}
        settings={settings}
        instrumentCount={instruments.length}
        availableUpdate={availableUpdate}
        updatingApp={updatingApp}
        updateProgress={updateProgress}
        onUpdateDetected={(res) => {
          setAvailableUpdate(res.hasUpdate ? res : null);
        }}
        onTriggerInstallUpdate={handleInstallUpdate}
        syncConfig={syncConfig}
        syncStatus={syncStatus}
        syncing={syncing}
        syncProgress={syncProgress}
        onSyncConfigSaved={(next) => {
          setSyncConfig(next);
          if (!next.enabled || !next.configured) {
            setSyncStatus(null);
            setSyncBannerOpen(false);
          }
        }}
        onSyncStatusUpdated={(next) => {
          setSyncStatus(next);
        }}
        onSyncNow={handleSyncNow}
        onSyncManualPush={() => handleSyncPush(false)}
        onSyncManualPull={() => handleSyncPull(false)}
        onOpenSyncConflict={() => setSyncConflictOpen(true)}
        onClose={() => setSettingsModalOpen(false)}
        onSettingsChanged={(next) => {
          setSettings(next);
          setAuth((prev) => ({
            ...prev,
            username: next.adminUsername || prev.username,
            appLockEnabled: next.appLockEnabled,
            appLockPinLength: next.appLockPinLength,
          }));
        }}
        onDataRestored={() => {
          setMountedWorkbenchTools((prev) => prev.filter((id) => id !== "pdf-balloon"));
          setActiveWorkbenchToolId((cur) => (cur === "pdf-balloon" ? null : cur));
          setWorkbenchImmersive(false);
          refreshAll();
        }}
        onAppReset={handleAppReset}
        previewingOnboarding={onboardingPreviewOpen}
        onPreviewOnboarding={() => setOnboardingPreviewOpen(true)}
        onNotify={notify}
        onRequestLogin={() => setLoginModalOpen(true)}
        onOpenAppLockSetup={(mode) =>
          setAppLockSetupState({ open: true, mode, lockAfterSave: false })
        }
        onLockNow={handleLock}
        onDisableAppLock={handleDisableAppLock}
      />

      <AppLockSetupModal
        open={appLockSetupState.open}
        mode={appLockSetupState.mode}
        lockAfterSave={appLockSetupState.lockAfterSave}
        initialPinLength={settings.appLockPinLength || 4}
        initialAutoLockMinutes={settings.autoLockMinutes}
        initialLockOnHide={settings.lockOnHide}
        initialLockOnStartup={settings.lockOnStartup}
        onClose={() =>
          setAppLockSetupState((prev) => ({ ...prev, open: false }))
        }
        onConfigured={(st, lockedNow) => {
          setAuth(st);
          api.getSettings().then(setSettings).catch(() => {});
          if (appLockSetupState.mode === "change") {
            notify("应用锁 PIN 码已更新", "success");
          } else if (lockedNow) {
            notify("已开启独立应用锁并锁定当前画面", "success");
          } else {
            notify("独立应用锁已开启，可随时按 ⌘/Ctrl + L 快捷锁定", "success");
          }
        }}
      />

      <CloseActionPromptModal
        open={closePromptOpen}
        onCancel={() => setClosePromptOpen(false)}
        onConfirm={async (action, remember) => {
          setClosePromptOpen(false);
          try {
            await api.performCloseAction(action, remember);
            if (remember) {
              api.getSettings().then(setSettings).catch(() => {});
            }
          } catch (err) {
            notify(String(err), "error");
          }
        }}
      />

      {/* Right-to-Left Sliding Auto-Update Notification Popup */}
      <UpdateBannerToast
        open={updatePopupOpen && !settingsModalOpen && !onboardingPreviewOpen && !(auth.isInitialized && auth.isLocked)}
        update={availableUpdate}
        updating={updatingApp}
        progress={updateProgress}
        onUpdateNow={() => handleInstallUpdate()}
        onDismiss={() => setUpdatePopupOpen(false)}
        onOpenSettings={() => {
          setUpdatePopupOpen(false);
          openSettingsTab("update");
        }}
      />

      {/* Right-to-Left Startup S3 Sync Notification Banner */}
      <SyncBannerToast
        open={
          syncBannerOpen &&
          !settingsModalOpen &&
          !syncConflictOpen &&
          !onboardingPreviewOpen &&
          !(auth.isInitialized && auth.isLocked)
        }
        status={syncStatus}
        syncing={syncing}
        progress={syncProgress}
        offsetForUpdateBanner={
          updatePopupOpen && Boolean(availableUpdate?.hasUpdate)
        }
        onPullNow={() => handleSyncPull(false)}
        onOpenConflict={() => {
          setSyncBannerOpen(false);
          setSyncConflictOpen(true);
        }}
        onOpenSettings={() => {
          setSyncBannerOpen(false);
          openSettingsTab("sync");
        }}
        onDismiss={() => setSyncBannerOpen(false)}
      />

      {/* Explicit Sync Conflict Resolution Modal */}
      <SyncConflictModal
        open={syncConflictOpen}
        status={syncStatus}
        syncing={syncing}
        progress={syncProgress}
        onClose={() => setSyncConflictOpen(false)}
        onResolvePull={() => handleSyncPull(true)}
        onResolvePush={() => handleSyncPush(true)}
      />

      <ImportModal
        openModal={importModalOpen}
        existingCount={instruments.length}
        initialDropPath={droppedImportFile?.path ?? null}
        initialDropFile={droppedImportFile?.file ?? null}
        onClose={() => {
          setImportModalOpen(false);
          setDroppedImportFile(null);
        }}
        onImported={() => refreshAll()}
        onNotify={notify}
      />

      {/* Batch Edit Modal (Admin only) */}
      <BatchEditModal
        open={batchEditOpen && auth.isAdmin}
        selectedInstruments={selectedInstruments}
        allInstruments={instruments}
        onClose={() => setBatchEditOpen(false)}
        onUpdated={(affectedCount) => {
          clearSelection();
          refreshAll();
          notify(`已批量更新 ${affectedCount} 台设备记录`, "success");
        }}
        onNotify={notify}
      />

      {/* Full-Screen Adaptive Light & Dark App Lock Overlay */}
      <AppLockOverlay
        locked={auth.isInitialized && auth.isLocked}
        username={auth.username}
        pinLength={auth.appLockPinLength}
        focusNonce={windowFocusNonce}
        onUnlocked={(st, resetApplied) => {
          setAuth(st);
          refreshAll();
          if (resetApplied) {
            notify(
              st.appLockEnabled
                ? "已通过管理员验证解锁并更新应用锁 PIN 码"
                : "已通过管理员验证解锁并关闭应用锁",
              "success"
            );
          }
        }}
      />

      {/* Global In-App Confirm Dialog */}
      <ConfirmDialogHost />

      {/* Bottom-Center Floating Theme Status Capsule (主题：跟随系统 / 亮色 / 暗色) */}
      <ThemeStatusCapsule
        visible={themeCapsuleVisible}
        preference={themePreference}
      />

      {/* Sonner Stacked Toast Notifications (above Onboarding z-[120]) */}
      <Toaster
        theme={theme}
        position="bottom-right"
        style={{ zIndex: 220 }}
        toastOptions={{
          classNames: {
            toast:
              "rounded-xl border border-zinc-200/90 dark:border-white/[0.1] bg-white/95 dark:bg-[#141418]/95 backdrop-blur-xl shadow-modal-light dark:shadow-elevated text-xs",
          },
        }}
      />
    </div>
    </MorphTooltipProvider>
    </I18nProvider>
  );
}
