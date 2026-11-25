import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Toaster, toast } from "sonner";
import {
  ArrowUpDown,
  BellRing,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Download,
  Eye,
  FileSpreadsheet,
  Gauge,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { api, clearMediaCache } from "@/lib/api";
import { exportJsskExcel, uint8ArrayToBase64 } from "@/lib/excel";
import {
  buildInstrumentStatusMap,
  formatFileSize,
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
import { ExpiryAlertModal } from "@/components/ExpiryAlertModal";
import { ConfirmDialogHost, confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import {
  EASE_PRECISION,
  POPOVER_MOTION,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_ICON,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import {
  SlidingNumber,
  SpotlightSurface,
} from "@/components/ui/MotionPrimitives";
import { PrecisionSelect, SearchField } from "@/components/ui/FormControls";
import type {
  AppSettings,
  AuthStatus,
  CategoryTab,
  ExpiryFilter,
  Instrument,
  ResetAppResult,
  SortMode,
  StatusFilter,
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
  closeBehavior: "ask",
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
  githubRepo: "MuY-DG/instrument-ledger",
  updateProxyUrl: "https://gh-proxy.com/",
  companyLogoPath: "",
};

const THEME_KEY = "instrument_ledger_theme";
const ALERT_MUTED_DATE_KEY = "instrument_ledger_alert_muted_date";
const ALERT_LAST_SHOWN_DATE_KEY = "instrument_ledger_alert_last_shown_date";
const ALERT_LAST_SHOWN_TS_KEY = "instrument_ledger_alert_last_shown_ts";

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

function loadInitialTheme(): "light" | "dark" {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // ignore storage access issues
  }
  return "light";
}

function formatAdminSessionRemaining(expiresAt?: string | null): string {
  if (!expiresAt) return "本次有效";
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "已过期";
  const hours = diffMs / (60 * 60 * 1000);
  if (hours < 24) {
    return `剩 ${Math.max(1, Math.ceil(hours))} 小时`;
  }
  return `剩 ${Math.ceil(hours / 24)} 天`;
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

  // Theme (Precision Light / Obsidian Dark)
  const [theme, setTheme] = useState<"light" | "dark">(loadInitialTheme);

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<CategoryTab>("gauge");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [calTypeFilter, setCalTypeFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("seq");
  const [searchQuery, setSearchQuery] = useState("");

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");
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

  // Mount PrintLedgerView strictly on demand (eliminates hundreds of hidden DOM nodes)
  useEffect(() => {
    const onBeforePrint = () => setPrintMounted(true);
    const onAfterPrint = () => setPrintMounted(false);
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

  // Sync theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

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

  // Global keyboard shortcuts: Cmd/Ctrl + L (Lock), Cmd/Ctrl + K (Command Palette)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!auth.isInitialized || auth.isLocked) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        handleLock();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [auth.isInitialized, auth.isLocked, handleLock]);

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

  // Listen for updater download/install progress events globally
  useEffect(() => {
    const unlistenPromise = listen<UpdateDownloadProgress>(
      "update-download-progress",
      (event) => {
        setUpdateProgress(event.payload);
      }
    );
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

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
    () => buildInstrumentStatusMap(instruments, settings.warningThresholds),
    [instruments, settings.warningThresholds]
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

  const handleAppReset = useCallback((res: ResetAppResult) => {
    clearMediaCache();
    setSettingsModalOpen(false);
    setDrawerOpen(false);
    setEditingInstrument(null);
    setAlertModalOpen(false);
    setCommandOpen(false);
    setImportModalOpen(false);
    setReportInstrument(null);
    setLightboxState(null);
    setUpdatePopupOpen(false);
    setLoginModalOpen(false);
    setClosePromptOpen(false);
    setInstruments([]);
    setInstrumentsLoaded(false);
    setLogoDataUrl("");
    setAvatarDataUrl("");
    setSettings(DEFAULT_SETTINGS);
    setActiveTab("gauge");
    setStatusFilter("all");
    setExpiryFilter("all");
    setDeptFilter("all");
    setCalTypeFilter("all");
    setSearchQuery("");
    setSortMode("seq");
    writeStorage(ALERT_MUTED_DATE_KEY, "");
    writeStorage(ALERT_LAST_SHOWN_DATE_KEY, "");
    writeStorage(ALERT_LAST_SHOWN_TS_KEY, "");
    setMutedToday(false);
    startupAlertCheckedRef.current = false;
    startupUpdateCheckedRef.current = false;
    setAuth(res.auth);

    const fileName = res.backup.path.split(/[/\\]/).pop() || res.backup.path;
    toast.success(
      `已自动备份（${res.backup.instrumentCount} 台设备 · ${formatFileSize(res.backup.sizeBytes)}）并完成初始化`,
      {
        description: `备份文件：${fileName}`,
        duration: 9000,
        action: {
          label: "打开备份目录",
          onClick: () => {
            api.openFolderPath(res.backup.path).catch(() => {});
          },
        },
      }
    );
  }, []);

  const handleLogout = async () => {
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
        destructive: true,
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

  const handleExportExcel = async (onlyFiltered: boolean) => {
    setExportMenuOpen(false);
    const list = onlyFiltered ? filteredInstruments : instruments;
    if (list.length === 0) {
      notify("当前没有可导出的台账记录", "error");
      return;
    }

    try {
      const suffix = onlyFiltered ? "筛选结果" : "完整双台账";
      const dest = await save({
        title: "导出监视与测量管理台账 Excel",
        defaultPath: `${settings.docCode || "JSSK-MPR-170"}_${settings.docTitle || "仪器台账"}_${suffix}_${getTodayStr()}.xlsx`,
        filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
      });
      if (!dest) return;

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
      notify(`Excel 台账已导出（共 ${list.length} 条记录）`, "success");
    } catch (err) {
      notify(`导出 Excel 失败：${String(err)}`, "error");
    }
  };

  const handlePrint = useCallback(() => {
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
    setActiveTab("all");
    setDeptFilter("all");
    setCalTypeFilter("all");
    setSearchQuery("");
    handleSelectExpiryFilter(next);
    setSortMode("expiry");
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
      ? "仪器 / 量具台账"
      : activeTab === "fixture"
        ? "尺寸检具台账"
        : "全部设备台账";

  const statusMeta: Record<StatusFilter, { label: string; dot: string }> = {
    all: { label: "全部状态", dot: "bg-zinc-400" },
    valid: { label: "正常有效", dot: "bg-emerald-500" },
    warning: { label: "即将到期", dot: "bg-amber-500" },
    expired: { label: "已超期", dot: "bg-rose-500" },
    exempt: { label: "免校归档", dot: "bg-zinc-400" },
  };

  // Prevent flashing main UI before initial auth status loads (adaptive luminous light / obsidian dark)
  if (booting) {
    return (
      <div className="h-screen w-screen bg-[#f7f7f5] dark:bg-[#09090b] flex items-center justify-center">
        <div className="h-10 w-10 rounded-2xl bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] shadow-tactile flex items-center justify-center animate-pulse">
          <div className="h-2.5 w-2.5 rounded-full bg-indigo-500/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f7f7f5] dark:bg-[#09090b] text-zinc-950 dark:text-zinc-50 flex flex-col">
      {/* First-Launch Intro Animation & Gradual Account Setup */}
      <AnimatePresence>
        {!auth.isInitialized && (
          <OnboardingSetup
            defaultDocTitle={settings.docTitle}
            defaultDocCode={settings.docCode}
            onCompleted={(nextAuth) => {
              setAuth(nextAuth);
              refreshAll();
              toast.success(`欢迎使用，管理员「${nextAuth.username}」已就绪`);
            }}
          />
        )}
      </AnimatePresence>

      {/* Main Desktop Shell (Hidden during print) */}
      {auth.isInitialized && (
        <motion.div
          initial={{ opacity: 0, scale: 0.994 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32, ease: EASE_PRECISION }}
          className="flex-1 flex min-h-0 no-print"
        >
          {/* Left Desktop Navigation Sidebar */}
          <aside className="w-[248px] shrink-0 bg-[#f4f5f7] dark:bg-[#0d0d10] border-r border-zinc-200/85 dark:border-white/[0.07] flex flex-col select-none">
            {/* Brand Identity */}
            <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
              {logoDataUrl ? (
                <img
                  src={logoDataUrl}
                  alt="Logo"
                  className="h-8 max-w-[84px] object-contain rounded-lg border border-zinc-200 dark:border-white/10 bg-white px-1.5 py-0.5 shrink-0 shadow-hairline"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-tactile-primary shrink-0">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="8.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      opacity="0.35"
                    />
                    <path
                      d="M12 3.5A8.5 8.5 0 0 1 20.5 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M12 12L16.5 7.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate tracking-tight">
                  {settings.docTitle || "监视与测量管理台账"}
                </div>
                <div className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-500 truncate">
                  {settings.docCode} · Ver.{settings.docVersion}
                </div>
              </div>
            </div>

            {/* Command Palette Quick Trigger */}
            <div className="px-3 pb-3">
              <motion.button
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                transition={SPRING_SNAPPY}
                onClick={() => setCommandOpen(true)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] hover:bg-white/95 dark:hover:bg-white/[0.07] border border-zinc-200/95 hover:border-zinc-300 dark:border-white/[0.08] shadow-tactile flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  <span>快速检索...</span>
                </span>
                <kbd className="px-1.5 py-0.5 rounded-md bg-zinc-100/90 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] text-[10px] font-mono text-zinc-500 dark:text-zinc-400 shadow-[0_1px_0_rgba(15,23,42,0.05)]">
                  ⌘K
                </kbd>
              </motion.button>
            </div>

            {/* Scrollable Navigation Groups */}
            <div className="flex-1 overflow-y-auto px-3 space-y-5">
              {/* Group 1: Ledger Category */}
              <div>
                <div className="px-2.5 pb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  台账分类
                </div>
                <nav className="space-y-0.5">
                  {(
                    [
                      {
                        id: "gauge",
                        label: "仪器与量具",
                        count: tabCounts.gauge,
                        icon: Gauge,
                      },
                      {
                        id: "fixture",
                        label: "尺寸检具",
                        count: tabCounts.fixture,
                        icon: Wrench,
                      },
                      {
                        id: "all",
                        label: "全部设备",
                        count: tabCounts.all,
                        icon: Layers,
                      },
                    ] as const
                  ).map((item) => {
                    const active = activeTab === item.id;
                    const Icon = item.icon;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileTap={TAP_SCALE_SUBTLE}
                        transition={SPRING_SNAPPY}
                        onClick={() => {
                          setActiveTab(item.id);
                          setDeptFilter("all");
                        }}
                        className={cn(
                          "relative w-full px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors",
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
                          <span>{item.label}</span>
                        </span>
                        <SlidingNumber
                          value={item.count}
                          className={cn(
                            "relative z-10 font-mono text-[11px]",
                            active
                              ? "text-zinc-700 dark:text-zinc-200 font-semibold"
                              : "text-zinc-400 dark:text-zinc-500"
                          )}
                        />
                      </motion.button>
                    );
                  })}
                </nav>
              </div>

              {/* Group 2: Precision Status Smart Views (Spring layoutId Pill) */}
              <div>
                <div className="px-2.5 pb-1.5 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  <span>效期状态</span>
                  <button
                    type="button"
                    onClick={() => openSettingsTab("alerts")}
                    className="font-mono normal-case text-[10px] hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                    title="点击配置多级到期预警天数与颜色"
                  >
                    预警 ≤{maxWarningDays}d
                  </button>
                </div>
                <nav className="space-y-0.5">
                  {(
                    [
                      {
                        id: "all",
                        label: "全部状态",
                        count: stats.total,
                        dot: "bg-zinc-400 dark:bg-zinc-500",
                        alert: false,
                      },
                      {
                        id: "valid",
                        label: "正常有效",
                        count: stats.valid,
                        dot: "bg-emerald-500",
                        alert: false,
                      },
                      {
                        id: "warning",
                        label: "即将到期",
                        count: stats.warning,
                        dot: "bg-amber-500",
                        alert: stats.warning > 0,
                      },
                      {
                        id: "expired",
                        label: "已超期",
                        count: stats.expired,
                        dot: "bg-rose-500",
                        alert: stats.expired > 0,
                      },
                      {
                        id: "exempt",
                        label: "免校归档",
                        count: stats.exempt,
                        dot: "bg-zinc-300 dark:bg-zinc-600",
                        alert: false,
                      },
                    ] as const
                  ).map((st) => {
                    const active = statusFilter === st.id;
                    return (
                      <motion.button
                        key={st.id}
                        type="button"
                        whileTap={TAP_SCALE_SUBTLE}
                        transition={SPRING_SNAPPY}
                        onClick={() => handleSelectStatusFilter(st.id)}
                        className={cn(
                          "relative w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors",
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
                          <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                          <span>{st.label}</span>
                        </span>
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
                      </motion.button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Minimalist Compliance Overview Widget with Subtle Daylight Spotlight */}
            <div className="px-3 pb-3">
              <SpotlightSurface
                spotlightColor="rgba(79, 70, 229, 0.065)"
                radius={170}
                className="p-3 rounded-xl bg-white/90 dark:bg-white/[0.03] border border-zinc-200/85 dark:border-white/[0.07] shadow-tactile space-y-2.5"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    在控设备合规率
                  </span>
                  <SlidingNumber
                    value={stats.compliancePct}
                    suffix="%"
                    className="text-sm font-semibold font-mono text-zinc-900 dark:text-white"
                  />
                </div>

                {/* Hairline Multi-Segment Compliance Bar */}
                <div className="h-1.5 w-full rounded-full bg-zinc-200/80 dark:bg-white/[0.07] overflow-hidden flex gap-0.5">
                  {stats.controlled > 0 ? (
                    <>
                      {stats.valid > 0 && (
                        <motion.div
                          initial={false}
                          animate={{
                            width: `${(stats.valid / stats.controlled) * 100}%`,
                          }}
                          transition={{ duration: 0.5, ease: EASE_PRECISION }}
                          className="h-full bg-emerald-500 rounded-full"
                        />
                      )}
                      {stats.tierSegments.map((seg) =>
                        seg.count > 0 ? (
                          <motion.div
                            key={seg.id}
                            initial={false}
                            animate={{
                              width: `${(seg.count / stats.controlled) * 100}%`,
                            }}
                            transition={{ duration: 0.5, ease: EASE_PRECISION }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: seg.color }}
                          />
                        ) : null
                      )}
                      {stats.expired > 0 && (
                        <motion.div
                          initial={false}
                          animate={{
                            width: `${(stats.expired / stats.controlled) * 100}%`,
                          }}
                          transition={{ duration: 0.5, ease: EASE_PRECISION }}
                          className="h-full bg-rose-500 rounded-full"
                        />
                      )}
                    </>
                  ) : (
                    <div className="h-full w-full bg-zinc-300/60 dark:bg-zinc-700/50 rounded-full" />
                  )}
                </div>

                <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
                  <span>受控 {stats.controlled}</span>
                  <span>
                    {stats.expired > 0 ? `${stats.expired} 台待复校` : "效期状态良好"}
                  </span>
                </div>
              </SpotlightSurface>
            </div>

            {/* Sidebar Bottom Account & Utility Rail */}
            <div className="p-3 border-t border-zinc-200/80 dark:border-white/[0.07] space-y-2">
              {auth.isAdmin ? (
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
                  title="账号"
                  className="btn-tactile px-2.5 py-2 rounded-xl bg-white hover:bg-zinc-50/90 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] border border-zinc-200/85 dark:border-white/[0.08] shadow-tactile flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {avatarDataUrl ? (
                      <img
                        src={avatarDataUrl}
                        alt="头像"
                        className="h-7 w-7 rounded-full object-cover border border-zinc-200 dark:border-white/15 shrink-0"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-[11px] font-semibold uppercase shrink-0">
                        {auth.username.slice(0, 1) || "A"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {auth.username}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 min-w-0">
                        <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                          {settings.adminTitle || "系统管理员"} · {formatAdminSessionRemaining(auth.adminSessionExpiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE_ICON}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLogout();
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition"
                    title="退出登录"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </motion.button>
                </div>
              ) : (
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={() => setLoginModalOpen(true)}
                  className="btn-sheen w-full px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium inline-flex items-center justify-center gap-1.5 shadow-tactile-primary transition-colors"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>管理员登录</span>
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
                    title="点击查看并一键安装新版本"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                      </span>
                      <span className="text-[11.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
                        新版本{" "}
                        <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                          v{availableUpdate.latestVersion}
                        </span>
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-sky-600 dark:text-sky-400 shrink-0">
                      <span>{updatingApp ? "更新中" : "更新"}</span>
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Compact Utility Controls */}
              <div className="grid grid-cols-4 gap-1">
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE_ICON}
                  transition={SPRING_SNAPPY}
                  onClick={handleLock}
                  className="relative py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                  title={
                    auth.appLockEnabled
                      ? "立即锁定应用 (⌘L)"
                      : "开启并设置独立应用锁 (⌘L)"
                  }
                >
                  <Lock className="h-3.5 w-3.5" />
                  {auth.appLockEnabled && (
                    <span className="absolute top-1.5 right-3 h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE_ICON}
                  transition={SPRING_SNAPPY}
                  onClick={() => openSettingsTab(auth.isAdmin ? "general" : "window")}
                  className="py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                  title={auth.isAdmin ? "系统设置与安全配置" : "窗口托盘与软件设置"}
                >
                  <Settings className="h-3.5 w-3.5" />
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE_ICON}
                  transition={SPRING_SNAPPY}
                  onClick={() =>
                    availableUpdate?.hasUpdate
                      ? setUpdatePopupOpen((v) => !v)
                      : openSettingsTab("update")
                  }
                  className="relative py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors"
                  title={
                    availableUpdate?.hasUpdate
                      ? `发现新版本 v${availableUpdate.latestVersion}，点击查看`
                      : "检查软件更新"
                  }
                >
                  <CloudDownload className="h-3.5 w-3.5" />
                  {availableUpdate?.hasUpdate && (
                    <span className="absolute top-1 right-2.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-zinc-50 dark:ring-[#0c0c0f]" />
                    </span>
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE_ICON}
                  transition={SPRING_SNAPPY}
                  onClick={toggleTheme}
                  className="py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors overflow-hidden"
                  title={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={theme}
                      initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                      transition={{ duration: 0.18, ease: EASE_PRECISION }}
                      className="flex items-center justify-center"
                    >
                      {theme === "dark" ? (
                        <Sun className="h-3.5 w-3.5" />
                      ) : (
                        <Moon className="h-3.5 w-3.5" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
          </aside>

          {/* Main Workspace Canvas */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#09090b]">
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
                    只读模式
                  </span>
                )}
              </div>

              {/* Primary Action Toolbar */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Expiry Alert Center Trigger */}
                {(() => {
                  const hasAlerts = alertSummary.totalAlertCount > 0;
                  const alertColor =
                    alertSummary.highestSeverityColor || "#10b981";
                  const alertVisuals = getThresholdVisuals(alertColor);
                  return (
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      transition={SPRING_SNAPPY}
                      onClick={() => openAlertModal()}
                      style={hasAlerts ? alertVisuals.cssVars : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium shadow-tactile transition-colors",
                        hasAlerts
                          ? "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] hover:opacity-90"
                          : "border-zinc-200/95 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-zinc-700 dark:text-zinc-200"
                      )}
                      title="打开设备效期预警弹窗"
                    >
                      <span className="relative flex items-center justify-center">
                        <BellRing className="h-3.5 w-3.5" />
                        {hasAlerts && (
                          <span
                            className="animate-ping absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full opacity-75"
                            style={{ backgroundColor: alertColor }}
                          />
                        )}
                      </span>
                      <span>到期预警</span>
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
                })()}

                {auth.isAdmin && (
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => setImportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                    <span>导入</span>
                  </motion.button>
                )}

                {/* Export Menu */}
                <div className="relative">
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportMenuOpen((v) => !v);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-all",
                      exportMenuOpen
                        ? "border-zinc-400 dark:border-white/25 ring-[3px] ring-zinc-900/[0.06] dark:ring-white/[0.08]"
                        : "border-zinc-200/95 dark:border-white/[0.09]"
                    )}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>导出</span>
                    <motion.span
                      animate={{ rotate: exportMenuOpen ? 180 : 0 }}
                      transition={SPRING_SNAPPY}
                      className="flex items-center"
                    >
                      <ChevronDown className="h-3 w-3 text-zinc-400" />
                    </motion.span>
                  </motion.button>

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
                          onClick={() => handleExportExcel(false)}
                          className="w-full px-3 py-2 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] flex items-center justify-between gap-2 transition-colors"
                        >
                          <span className="inline-flex items-center gap-2 font-medium">
                            <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>导出全部 (.xlsx)</span>
                          </span>
                          <InfoTip content={`按 ${settings.docCode} 标准双台账格式导出`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportExcel(true)}
                          className="w-full px-3 py-2 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="font-medium">
                            导出当前视图 ({filteredInstruments.length})
                          </span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors"
                >
                  <Printer className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>打印</span>
                </motion.button>

                {auth.isAdmin && (
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={openCreateDrawer}
                    className="btn-sheen inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium shadow-tactile-primary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>新增设备</span>
                  </motion.button>
                )}
              </div>
            </header>

            {/* Sleek Filter & Sort Strip */}
            <div className="border-b border-zinc-200/75 dark:border-white/[0.06] bg-[#fafaf9] dark:bg-white/[0.015] shrink-0">
              <div className="px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  {/* Inline Search */}
                  <SearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="过滤名称、编号、规格、位置..."
                    icon={<Search className="h-3.5 w-3.5" />}
                    className="flex-1 max-w-xs min-w-[200px]"
                  />

                  {/* Custom Animated Department Select */}
                  <PrecisionSelect
                    value={deptFilter}
                    onChange={setDeptFilter}
                    options={[
                      { value: "all", label: "全部部门" },
                      ...departmentOptions.map((d) => ({ value: d, label: d })),
                      { value: "__empty__", label: "未填部门" },
                    ]}
                    className="min-w-[116px]"
                  />

                  {/* Custom Animated Sort Select */}
                  <PrecisionSelect
                    value={sortMode}
                    onChange={(v) => setSortMode(v as SortMode)}
                    icon={<ArrowUpDown className="h-3 w-3" />}
                    options={[
                      { value: "seq", label: "默认序号" },
                      { value: "expiry", label: "到期日优先" },
                      { value: "name", label: "名称排序" },
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
                        重置筛选
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* Segmented Calibration Method Control */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06]">
                  {(
                    [
                      { id: "all", label: "全部方式" },
                      { id: "external", label: "外校" },
                      { id: "internal", label: "内校" },
                      { id: "exempt", label: "免校" },
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
                    <span>到期筛选</span>
                  </span>

                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => handleSelectExpiryFilter("all")}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
                      expiryFilter === "all"
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-tactile-primary"
                        : "bg-white dark:bg-white/[0.03] border-zinc-200/95 dark:border-white/[0.08] shadow-tactile text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-white/[0.15]"
                    )}
                  >
                    <span>全部</span>
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
                        style={{
                          ...visuals.cssVars,
                          borderColor: active ? visuals.hex : undefined,
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
                          active
                            ? "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] shadow-tactile"
                            : "bg-white dark:bg-white/[0.03] border-zinc-200/95 dark:border-white/[0.08] shadow-tactile text-zinc-600 dark:text-zinc-300 hover:bg-[var(--tier-bg)] dark:hover:bg-[var(--tier-bg-dark)]"
                        )}
                        title={`筛选未来 ${tier.days} 天内到期的设备（${tier.label}）`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: visuals.hex,
                            boxShadow: active ? visuals.glow : undefined,
                          }}
                        />
                        <span>{tier.days}天内</span>
                        <SlidingNumber
                          value={count}
                          className={cn(
                            "font-mono text-[10.5px]",
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
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
                      expiryFilter === "expired"
                        ? "bg-rose-500/[0.12] dark:bg-rose-500/[0.18] text-rose-700 dark:text-rose-300 border-rose-500 shadow-tactile"
                        : "bg-white dark:bg-white/[0.03] border-zinc-200/95 dark:border-white/[0.08] shadow-tactile text-zinc-600 dark:text-zinc-300 hover:bg-rose-500/[0.07] hover:border-rose-300 dark:hover:border-rose-500/40"
                    )}
                    title="筛选已超过下次检验日期的设备"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>已超期</span>
                    <SlidingNumber
                      value={expiryFilterCounts.expired}
                      className={cn(
                        "font-mono text-[10.5px]",
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
                  title="预警设置"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>预警设置</span>
                </motion.button>
              </div>
            </div>

            {/* Virtualized Precision Data Table Area */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                <div className="h-5 w-5 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-white animate-spin" />
                <span>加载中...</span>
              </div>
            ) : instruments.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-sm space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center mx-auto text-zinc-500 dark:text-zinc-400">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    暂无设备记录
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
                          <span>导入 Excel</span>
                        </button>
                        <button
                          type="button"
                          onClick={openCreateDrawer}
                          className="btn-sheen btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 shadow-tactile-primary text-white dark:text-zinc-950 text-xs font-medium"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>新增设备</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLoginModalOpen(true)}
                        className="btn-sheen btn-tactile inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 shadow-tactile-primary text-white dark:text-zinc-950 text-xs font-medium"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        <span>登录</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : deferredFilteredInstruments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  无匹配记录
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="btn-tactile px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.06]"
                >
                  重置筛选
                </button>
              </div>
            ) : (
              <VirtualInstrumentTable
                items={deferredFilteredInstruments}
                statusById={statusById}
                activeTab={activeTab}
                isAdmin={auth.isAdmin}
                activeInstrumentId={
                  drawerOpen ? (editingInstrument?.id ?? null) : null
                }
                resetScrollKey={`${activeTab}|${statusFilter}|${expiryFilter}|${deptFilter}|${calTypeFilter}|${sortMode}`}
                onView={openViewDrawer}
                onEdit={openEditDrawer}
                onDelete={handleDelete}
                onOpenReport={handleOpenReportModal}
                onOpenPhoto={handleOpenPhotoLightbox}
              />
            )}

            {/* Minimalist Desktop Status Bar */}
            <footer className="h-8 px-6 border-t border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-[#0c0c0f] flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0 select-none">
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <span>
                  共 {filteredInstruments.length} / {categoryScoped.length} 项
                </span>
                <InfoTip
                  placement="top"
                  content="下次校验日期自动按「上次校验 + 周期(月) - 1天」计算"
                />
              </div>
              <div className="hidden md:flex items-center gap-3">
                <span>⌘K 检索</span>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span>⌘L 锁屏</span>
              </div>
            </footer>
          </div>
        </motion.div>
      )}

      {/* Dedicated Landscape A4 Print View (Mounted strictly when printing) */}
      {printMounted && (
        <PrintLedgerView
          instruments={filteredInstruments}
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
        theme={theme}
        onClose={() => setCommandOpen(false)}
        onSelectInstrument={(inst) => openViewDrawer(inst)}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          setDeptFilter("all");
        }}
        onFilterStatus={(st) => handleSelectStatusFilter(st)}
        onFilterExpiry={(f) => handleSelectExpiryFilter(f)}
        onOpenAlerts={() => openAlertModal()}
        onCreateInstrument={openCreateDrawer}
        onOpenImport={() => setImportModalOpen(true)}
        onExportAll={() => handleExportExcel(false)}
        onPrint={handlePrint}
        onLock={handleLock}
        onOpenSettings={openSettingsTab}
        onToggleTheme={toggleTheme}
        onLoginOrLogout={() => {
          if (auth.isAdmin) handleLogout();
          else setLoginModalOpen(true);
        }}
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
        settings={settings}
        availableUpdate={availableUpdate}
        updatingApp={updatingApp}
        updateProgress={updateProgress}
        onUpdateDetected={(res) => {
          setAvailableUpdate(res.hasUpdate ? res : null);
        }}
        onTriggerInstallUpdate={handleInstallUpdate}
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
        onDataRestored={() => refreshAll()}
        onAppReset={handleAppReset}
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
        open={updatePopupOpen && !settingsModalOpen && !(auth.isInitialized && auth.isLocked)}
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

      <ImportModal
        openModal={importModalOpen}
        existingCount={instruments.length}
        onClose={() => setImportModalOpen(false)}
        onImported={() => refreshAll()}
        onNotify={notify}
      />

      {/* Full-Screen Adaptive Light & Dark App Lock Overlay */}
      <AppLockOverlay
        locked={auth.isInitialized && auth.isLocked}
        username={auth.username}
        docTitle={settings.docTitle}
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
  );
}
