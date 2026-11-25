import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
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
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { exportJsskExcel, uint8ArrayToBase64 } from "@/lib/excel";
import {
  calTypeLabel,
  getInstrumentStatus,
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
import { StatusBadge } from "@/components/StatusBadge";
import { LocationThumb } from "@/components/LocationThumb";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ReportModal } from "@/components/ReportModal";
import { InstrumentDrawer } from "@/components/InstrumentDrawer";
import { AdminLoginModal, AppLockOverlay } from "@/components/AuthLockModals";
import { SettingsModal } from "@/components/SettingsModal";
import { ImportModal } from "@/components/ImportModal";
import { PrintLedgerView } from "@/components/PrintLedgerView";
import { CommandPalette } from "@/components/CommandPalette";
import { UpdateBannerToast } from "@/components/UpdateBannerToast";
import { ExpiryAlertModal } from "@/components/ExpiryAlertModal";
import type {
  AppSettings,
  AuthStatus,
  CategoryTab,
  ExpiryFilter,
  Instrument,
  SortMode,
  StatusFilter,
  UpdateCheckResult,
  UpdateDownloadProgress,
} from "@/types";

const DEFAULT_SETTINGS: AppSettings = {
  adminUsername: "",
  warningDays: 60,
  warningThresholds: DEFAULT_WARNING_THRESHOLDS,
  alertPopupEnabled: true,
  alertPopupFrequency: "every_open",
  alertPopupIntervalHours: 4,
  autoLockMinutes: 0,
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

export default function App() {
  const [booting, setBooting] = useState(true);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrumentsLoaded, setInstrumentsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [auth, setAuth] = useState<AuthStatus>({
    isInitialized: true,
    isAdmin: false,
    username: "",
    isLocked: false,
  });

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "general" | "alerts" | "security" | "backup" | "update"
  >("general");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

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

  // Global keyboard shortcuts: Cmd/Ctrl + L (Lock), Cmd/Ctrl + K (Command Palette)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!auth.isInitialized || auth.isLocked) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        api.lockApp().then(setAuth).catch((err) => notify(String(err), "error"));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [auth.isInitialized, auth.isLocked, notify]);

  // Optional auto-lock idle timer when admin is logged in
  useEffect(() => {
    if (
      !auth.isInitialized ||
      !auth.isAdmin ||
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
  }, [auth.isInitialized, auth.isAdmin, auth.isLocked, settings.autoLockMinutes]);

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
    () => summarizeExpiryAlerts(instruments, settings.warningThresholds),
    [instruments, settings.warningThresholds]
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
      const info = getInstrumentStatus(inst, settings.warningThresholds);
      if (info.status === "valid") valid++;
      else if (info.status === "warning") {
        warning++;
        if (info.matchedThreshold) {
          tierCountMap.set(
            info.matchedThreshold.id,
            (tierCountMap.get(info.matchedThreshold.id) || 0) + 1
          );
        }
      } else if (info.status === "expired") expired++;
      else exempt++;
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
  }, [categoryScoped, settings.warningThresholds, descThresholds]);

  // Cumulative counts for list expiry filter pills (0 <= daysRemaining <= threshold.days)
  const expiryFilterCounts = useMemo(() => {
    let expired = 0;
    const byDays: Record<number, number> = {};
    for (const t of descThresholds) {
      byDays[t.days] = 0;
    }
    for (const inst of categoryScoped) {
      const st = getInstrumentStatus(inst, settings.warningThresholds);
      if (st.daysRemaining === null) continue;
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
  }, [categoryScoped, settings.warningThresholds, descThresholds]);

  // Filtered and sorted rows
  const filteredInstruments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = categoryScoped.filter((inst) => {
      const st = getInstrumentStatus(inst, settings.warningThresholds);

      if (statusFilter !== "all" && st.status !== statusFilter) return false;

      if (expiryFilter === "expired") {
        if (st.status !== "expired") return false;
      } else if (typeof expiryFilter === "number") {
        if (
          st.daysRemaining === null ||
          st.daysRemaining < 0 ||
          st.daysRemaining > expiryFilter
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
        const hay = [
          inst.name,
          inst.serialNo,
          inst.modelSpec,
          inst.location,
          inst.department,
          inst.remark,
          inst.supplier,
          inst.calAgency,
          inst.contactPerson,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    if (sortMode === "expiry") {
      return [...list].sort((a, b) => {
        const sa = getInstrumentStatus(a, settings.warningThresholds);
        const sb = getInstrumentStatus(b, settings.warningThresholds);
        const da = sa.daysRemaining ?? Number.MAX_SAFE_INTEGER;
        const db = sb.daysRemaining ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
    }
    if (sortMode === "name") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    return list;
  }, [
    categoryScoped,
    statusFilter,
    expiryFilter,
    deptFilter,
    calTypeFilter,
    searchQuery,
    sortMode,
    settings.warningThresholds,
  ]);

  const handleLogout = async () => {
    try {
      const st = await api.adminLogout();
      setAuth(st);
      notify("已退出管理员模式，当前为只读浏览视图", "success");
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const handleLock = async () => {
    try {
      const st = await api.lockApp();
      setAuth(st);
    } catch (err) {
      notify(String(err), "error");
    }
  };

  const handleDelete = async (inst: Instrument) => {
    const ok = window.confirm(
      `确定删除「${inst.name}」（编号：${inst.serialNo || "无"}）吗？\n删除后将同时清理其位置照片及 ${inst.reportCount} 份校验报告附件，不可恢复。`
    );
    if (!ok) return;
    try {
      await api.deleteInstrument(inst.id);
      setInstruments((prev) => prev.filter((i) => i.id !== inst.id));
      notify("设备记录已删除", "success");
    } catch (err) {
      notify(String(err), "error");
    }
  };

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

  const handlePrint = () => window.print();

  const openCreateDrawer = () => {
    setEditingInstrument(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  };

  const openEditDrawer = (inst: Instrument) => {
    setEditingInstrument(inst);
    setDrawerMode("edit");
    setDrawerOpen(true);
  };

  const openViewDrawer = (inst: Instrument) => {
    setEditingInstrument(inst);
    setDrawerMode("view");
    setDrawerOpen(true);
  };

  const openSettingsTab = (
    tab: "general" | "alerts" | "security" | "backup" | "update"
  ) => {
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

  // Prevent flashing main UI before initial auth status loads
  if (booting) {
    return (
      <div className="h-screen w-screen bg-[#09090b] flex items-center justify-center" />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fafafa] dark:bg-[#09090b] text-zinc-950 dark:text-zinc-50 flex flex-col">
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="flex-1 flex min-h-0 no-print"
        >
          {/* Left Desktop Navigation Sidebar */}
          <aside className="w-[248px] shrink-0 bg-[#f5f6f8] dark:bg-[#0d0d10] border-r border-zinc-200/80 dark:border-white/[0.07] flex flex-col select-none">
            {/* Brand Identity */}
            <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
              {logoDataUrl ? (
                <img
                  src={logoDataUrl}
                  alt="Logo"
                  className="h-8 max-w-[84px] object-contain rounded-lg border border-zinc-200 dark:border-white/10 bg-white px-1.5 py-0.5 shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-hairline shrink-0">
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
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.07] border border-zinc-200/90 dark:border-white/[0.08] shadow-hairline flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500 transition"
              >
                <span className="inline-flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  <span>快速检索...</span>
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                  ⌘K
                </kbd>
              </button>
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
                      <button
                        key={item.id}
                        type="button"
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
                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                            className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/[0.08] shadow-hairline"
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center gap-2">
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              active
                                ? "text-zinc-900 dark:text-white"
                                : "text-zinc-400 dark:text-zinc-500"
                            )}
                          />
                          <span>{item.label}</span>
                        </span>
                        <span
                          className={cn(
                            "relative z-10 font-mono tabular-nums text-[11px]",
                            active
                              ? "text-zinc-700 dark:text-zinc-200 font-semibold"
                              : "text-zinc-400 dark:text-zinc-500"
                          )}
                        >
                          {item.count}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Group 2: Precision Status Smart Views (Zero Emojis!) */}
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
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleSelectStatusFilter(st.id)}
                        className={cn(
                          "relative w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors",
                          active
                            ? "text-zinc-950 dark:text-white font-medium bg-zinc-200/75 dark:bg-white/[0.08]"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/45 dark:hover:bg-white/[0.04]"
                        )}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                          <span>{st.label}</span>
                        </span>
                        <span
                          className={cn(
                            "font-mono tabular-nums text-[11px]",
                            st.id === "expired" && st.count > 0
                              ? "px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold"
                              : st.id === "warning" && st.count > 0
                                ? "px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                                : "text-zinc-400 dark:text-zinc-500"
                          )}
                        >
                          {st.count}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Minimalist Compliance Overview Widget */}
            <div className="px-3 pb-3">
              <div className="p-3 rounded-xl bg-white/80 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.07] space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    在控设备合规率
                  </span>
                  <span className="text-sm font-semibold font-mono tabular-nums text-zinc-900 dark:text-white">
                    {stats.compliancePct}%
                  </span>
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
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
              </div>
            </div>

            {/* Sidebar Bottom Account & Utility Rail */}
            <div className="p-3 border-t border-zinc-200/80 dark:border-white/[0.07] space-y-2">
              {auth.isAdmin ? (
                <div className="px-2.5 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-[11px] font-semibold uppercase shrink-0">
                      {auth.username.slice(0, 1) || "A"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {auth.username}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        <span>管理员已解锁</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition"
                    title="退出管理员模式"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium inline-flex items-center justify-center gap-1.5 shadow-hairline transition"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>管理员登录</span>
                </button>
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
                    onClick={() => setUpdatePopupOpen(true)}
                    className="w-full px-2.5 py-2 rounded-xl bg-white hover:bg-zinc-50 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] border border-zinc-200/90 dark:border-white/[0.1] shadow-hairline flex items-center justify-between gap-2 text-left transition"
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
                <button
                  type="button"
                  onClick={handleLock}
                  className="py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] flex items-center justify-center transition"
                  title="全屏锁屏 (⌘L)"
                >
                  <Lock className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsTab(auth.isAdmin ? "general" : "update")}
                  className="py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] flex items-center justify-center transition"
                  title={auth.isAdmin ? "系统设置与备份" : "版本信息"}
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    availableUpdate?.hasUpdate
                      ? setUpdatePopupOpen((v) => !v)
                      : openSettingsTab("update")
                  }
                  className="relative py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] flex items-center justify-center transition"
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
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] flex items-center justify-center transition"
                  title={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
                >
                  {theme === "dark" ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </aside>

          {/* Main Workspace Canvas */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#09090b]">
            {/* Minimalist Workspace Header */}
            <header className="h-14 px-6 border-b border-zinc-200/80 dark:border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-white truncate">
                  {activeHeading}
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-[11px] font-mono tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                  {filteredInstruments.length}
                </span>

                {statusFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => handleSelectStatusFilter("all")}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-[11px] text-zinc-700 dark:text-zinc-200 transition"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        statusMeta[statusFilter].dot
                      )}
                    />
                    <span>{statusMeta[statusFilter].label}</span>
                    <X className="h-3 w-3 text-zinc-400" />
                  </button>
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
                      <button
                        type="button"
                        onClick={() => handleSelectExpiryFilter("all")}
                        style={visuals.cssVars}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] transition"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: visuals.hex }}
                        />
                        <span>≤{expiryFilter}天到期</span>
                        <X className="h-3 w-3 opacity-70" />
                      </button>
                    );
                  })()}

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
                    <button
                      type="button"
                      onClick={() => openAlertModal()}
                      style={hasAlerts ? alertVisuals.cssVars : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition",
                        hasAlerts
                          ? "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] hover:opacity-90"
                          : "border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-zinc-700 dark:text-zinc-200"
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
                          {alertSummary.totalAlertCount}
                        </span>
                      )}
                    </button>
                  );
                })()}

                {auth.isAdmin && (
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-zinc-700 dark:text-zinc-200 text-xs font-medium transition"
                  >
                    <Upload className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                    <span>导入</span>
                  </button>
                )}

                {/* Export Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportMenuOpen((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-zinc-700 dark:text-zinc-200 text-xs font-medium transition"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>导出</span>
                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                  </button>

                  <AnimatePresence>
                    {exportMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.14 }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-[#141418] border border-zinc-200/90 dark:border-white/[0.1] shadow-popover py-1.5 z-40"
                      >
                        <button
                          type="button"
                          onClick={() => handleExportExcel(false)}
                          className="w-full px-3.5 py-2 text-left text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div>
                            <div className="font-medium">导出完整双台账 (.xlsx)</div>
                            <div className="text-[10.5px] text-zinc-400 mt-0.5">
                              按 {settings.docCode} 标准格式导出
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportExcel(true)}
                          className="w-full px-3.5 py-2 text-left text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition"
                        >
                          <Download className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <div>
                            <div className="font-medium">
                              仅导出当前视图 ({filteredInstruments.length} 条)
                            </div>
                            <div className="text-[10.5px] text-zinc-400 mt-0.5">
                              适合导出待检、超期或部门清单
                            </div>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-zinc-700 dark:text-zinc-200 text-xs font-medium transition"
                >
                  <Printer className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>打印</span>
                </button>

                {auth.isAdmin && (
                  <button
                    type="button"
                    onClick={openCreateDrawer}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium shadow-hairline transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>新增设备</span>
                  </button>
                )}
              </div>
            </header>

            {/* Sleek Filter & Sort Strip */}
            <div className="border-b border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.015] shrink-0">
              <div className="px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  {/* Inline Search */}
                  <div className="relative flex-1 max-w-xs min-w-[200px]">
                    <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="过滤名称、编号、规格、位置..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Department Filter */}
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#121216] text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition"
                  >
                    <option value="all">全部部门</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value="__empty__">未填部门</option>
                  </select>

                  {/* Sort Selector */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#121216] text-xs text-zinc-600 dark:text-zinc-300">
                    <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as SortMode)}
                      className="bg-transparent focus:outline-none text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      <option value="seq">默认序号</option>
                      <option value="expiry">到期日优先</option>
                      <option value="name">名称排序</option>
                    </select>
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] transition"
                    >
                      重置筛选
                    </button>
                  )}
                </div>

                {/* Segmented Calibration Method Control */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/60 dark:bg-white/[0.05] border border-zinc-200/70 dark:border-white/[0.06]">
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
                      <button
                        key={item.id}
                        type="button"
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
                            transition={{ type: "spring", stiffness: 450, damping: 34 }}
                            className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.11] shadow-hairline"
                          />
                        )}
                        <span className="relative z-10">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dedicated Expiry Countdown Filter Strip (60d / 30d / 15d / Custom + Expired) */}
              <div className="px-6 py-2 border-t border-zinc-200/60 dark:border-white/[0.05] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mr-1 select-none">
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span>到期筛选</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleSelectExpiryFilter("all")}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition",
                      expiryFilter === "all"
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-hairline"
                        : "bg-white dark:bg-white/[0.03] border-zinc-200/90 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-white/[0.15]"
                    )}
                  >
                    <span>全部</span>
                  </button>

                  {descThresholds.map((tier) => {
                    const visuals = getThresholdVisuals(tier.color);
                    const active = expiryFilter === tier.days;
                    const count = expiryFilterCounts.byDays[tier.days] ?? 0;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() =>
                          handleSelectExpiryFilter(active ? "all" : tier.days)
                        }
                        style={{
                          ...visuals.cssVars,
                          borderColor: active ? visuals.hex : undefined,
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition",
                          active
                            ? "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] shadow-hairline"
                            : "bg-white dark:bg-white/[0.03] border-zinc-200/90 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:bg-[var(--tier-bg)] dark:hover:bg-[var(--tier-bg-dark)]"
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
                        <span
                          className={cn(
                            "font-mono tabular-nums text-[10.5px]",
                            active
                              ? "font-semibold"
                              : count > 0
                                ? "text-zinc-500 dark:text-zinc-400"
                                : "text-zinc-300 dark:text-zinc-600"
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      handleSelectExpiryFilter(
                        expiryFilter === "expired" ? "all" : "expired"
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition",
                      expiryFilter === "expired"
                        ? "bg-rose-500/[0.12] dark:bg-rose-500/[0.18] text-rose-700 dark:text-rose-300 border-rose-500 shadow-hairline"
                        : "bg-white dark:bg-white/[0.03] border-zinc-200/90 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:bg-rose-500/[0.07] hover:border-rose-300 dark:hover:border-rose-500/40"
                    )}
                    title="筛选已超过下次检验日期的设备"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>已超期</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums text-[10.5px]",
                        expiryFilterCounts.expired > 0
                          ? "text-rose-600 dark:text-rose-400 font-semibold"
                          : "text-zinc-300 dark:text-zinc-600"
                      )}
                    >
                      {expiryFilterCounts.expired}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openSettingsTab("alerts")}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-white/[0.06] transition shrink-0"
                  title="前往设置中自定义预警天数阈值、颜色与弹窗提示规则"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>阈值与配色设置</span>
                </button>
              </div>
            </div>

            {/* Precision Data Table Area */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                  <div className="h-5 w-5 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-white animate-spin" />
                  <span>正在加载本地 SQLite 台账...</span>
                </div>
              ) : instruments.length === 0 ? (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center max-w-sm space-y-4">
                    <div className="h-12 w-12 rounded-2xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center mx-auto text-zinc-500 dark:text-zinc-400">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                        台账库尚无设备记录
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {auth.isAdmin
                          ? `可直接导入标准《${settings.docCode}》双 Sheet Excel 台账，或手动录入第一台监视与测量设备。`
                          : "请先在左下角登录管理员账号，即可导入现有 Excel 台账或新增设备记录。"}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2.5 pt-1">
                      {auth.isAdmin ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setImportModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-zinc-800 dark:text-zinc-100 text-xs font-medium transition"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>导入 Excel</span>
                          </button>
                          <button
                            type="button"
                            onClick={openCreateDrawer}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium transition"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>新增设备</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLoginModalOpen(true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium transition"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          <span>管理员登录</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : filteredInstruments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    当前筛选条件下没有匹配的设备记录
                  </p>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition"
                  >
                    清除全部筛选条件
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-md">
                    <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                      <th className="py-2.5 pl-6 pr-2 w-12 font-mono">#</th>
                      <th className="py-2.5 px-3 min-w-[200px]">设备与使用部门</th>
                      <th className="py-2.5 px-3 min-w-[165px]">编号 / 型号规格</th>
                      <th className="py-2.5 px-3 min-w-[175px]">存放位置</th>
                      <th className="py-2.5 px-3 min-w-[130px]">上次校验 / 周期</th>
                      <th className="py-2.5 px-3 min-w-[112px]">下次校验</th>
                      <th className="py-2.5 px-3 min-w-[118px]">效期状态</th>
                      <th className="py-2.5 px-3 min-w-[125px]">校验报告</th>
                      <th className="py-2.5 pl-3 pr-6 text-right w-28">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05] text-sm">
                    {filteredInstruments.map((inst, idx) => {
                      const statusInfo = getInstrumentStatus(
                        inst,
                        settings.warningThresholds
                      );
                      const tierVisuals =
                        statusInfo.status === "warning" &&
                        statusInfo.matchedThreshold
                          ? getThresholdVisuals(statusInfo.matchedThreshold.color)
                          : null;
                      const rowStyle: React.CSSProperties | undefined =
                        statusInfo.status === "expired"
                          ? { boxShadow: "inset 2.5px 0 0 0 rgb(244, 63, 94)" }
                          : tierVisuals
                            ? {
                                ...tierVisuals.cssVars,
                                boxShadow: tierVisuals.rowAccentShadow,
                              }
                            : undefined;
                      return (
                        <tr
                          key={inst.id}
                          onClick={() => openViewDrawer(inst)}
                          style={rowStyle}
                          className="group cursor-pointer transition-colors hover:bg-zinc-50/90 dark:hover:bg-white/[0.025]"
                        >
                          <td className="py-3 pl-6 pr-2 font-mono tabular-nums text-[11.5px] text-zinc-400 dark:text-zinc-600">
                            {String(idx + 1).padStart(2, "0")}
                          </td>

                          {/* Name & Department */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-zinc-900 dark:text-zinc-100 text-[13px] tracking-tight">
                                {inst.name}
                              </span>
                              {activeTab === "all" && (
                                <span className="px-1.5 py-0.2 rounded border border-zinc-200/80 dark:border-white/[0.09] text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                                  {inst.category === "fixture" ? "检具" : "量具"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              {inst.department && (
                                <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">
                                  {inst.department}
                                </span>
                              )}
                              {inst.remark && (
                                <span
                                  className="truncate max-w-[180px] text-zinc-400 dark:text-zinc-500"
                                  title={inst.remark}
                                >
                                  {inst.remark}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Serial No & Spec */}
                          <td className="py-3 px-3">
                            <div className="font-mono tabular-nums text-xs font-medium text-zinc-800 dark:text-zinc-200">
                              {inst.serialNo || "—"}
                            </div>
                            <div
                              className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate max-w-[185px]"
                              title={inst.modelSpec}
                            >
                              {inst.modelSpec || "—"}
                            </div>
                          </td>

                          {/* Location + Photo Thumbnail */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <LocationThumb
                                photoPath={inst.photoPath}
                                alt={`${inst.name} 位置图`}
                                onClick={() =>
                                  setLightboxState({
                                    photoPath: inst.photoPath,
                                    title: `${inst.name} ${inst.serialNo ? `(${inst.serialNo})` : ""}`,
                                    subtitle: inst.location || "未登记存放位置",
                                  })
                                }
                              />
                              <div className="min-w-0">
                                <div
                                  className="text-xs text-zinc-700 dark:text-zinc-200 truncate max-w-[150px]"
                                  title={inst.location}
                                >
                                  {inst.location || (
                                    <span className="text-zinc-300 dark:text-zinc-600">
                                      未登记
                                    </span>
                                  )}
                                </div>
                                {inst.calAgency && (
                                  <div
                                    className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate max-w-[150px] mt-0.5"
                                    title={inst.calAgency}
                                  >
                                    {inst.calAgency}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Last Cal Date + Method + Cycle */}
                          <td className="py-3 px-3">
                            <div className="font-mono tabular-nums text-xs text-zinc-700 dark:text-zinc-300">
                              {inst.lastCalDate || "—"}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-zinc-500 dark:text-zinc-400">
                              <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 font-medium">
                                {calTypeLabel(inst.calibrationType)}
                              </span>
                              {inst.calCycleMonths > 0 && !inst.exemptCalibration && (
                                <span className="font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
                                  {inst.calCycleMonths}月
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Next Cal Date */}
                          <td className="py-3 px-3 font-mono tabular-nums text-xs whitespace-nowrap">
                            {inst.exemptCalibration ? (
                              <span className="text-zinc-400 dark:text-zinc-600">—</span>
                            ) : (
                              <span
                                className={cn(
                                  "font-medium",
                                  statusInfo.status === "expired"
                                    ? "text-rose-600 dark:text-rose-400"
                                    : statusInfo.status === "warning" && tierVisuals
                                      ? "text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]"
                                      : "text-zinc-800 dark:text-zinc-200"
                                )}
                              >
                                {inst.nextCalDate || "—"}
                              </span>
                            )}
                          </td>

                          {/* Precision Status Badge */}
                          <td className="py-3 px-3">
                            <StatusBadge info={statusInfo} />
                          </td>

                          {/* Report Attachments */}
                          <td
                            className="py-3 px-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {inst.reportCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => setReportInstrument(inst)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/90 hover:bg-zinc-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.11] text-zinc-700 dark:text-zinc-200 border border-zinc-200/70 dark:border-white/[0.08] text-[11.5px] font-medium transition max-w-[148px]"
                                title={`点击预览最新报告：${inst.latestReportName || ""}`}
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
                                <span className="truncate font-mono tabular-nums">
                                  报告 · {inst.reportCount}
                                </span>
                              </button>
                            ) : auth.isAdmin ? (
                              <button
                                type="button"
                                onClick={() => setReportInstrument(inst)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[11.5px] transition"
                              >
                                <Plus className="h-3 w-3" />
                                <span>上传</span>
                              </button>
                            ) : (
                              <span className="text-[11.5px] text-zinc-300 dark:text-zinc-700">
                                —
                              </span>
                            )}
                          </td>

                          {/* Row Actions */}
                          <td
                            className="py-3 pl-3 pr-6 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => openViewDrawer(inst)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition"
                                title="查看完整档案"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {auth.isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditDrawer(inst)}
                                    className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition"
                                    title="编辑记录"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(inst)}
                                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition"
                                    title="删除记录"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Minimalist Desktop Status Bar */}
            <footer className="h-8 px-6 border-t border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-[#0c0c0f] flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0 select-none">
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span>
                  显示 {filteredInstruments.length} / {categoryScoped.length} 项
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span>计算规则：上次校验 + 周期(月) - 1天</span>
              </div>
              <div className="hidden md:flex items-center gap-3">
                <span>⌘K 检索</span>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span>⌘L 锁屏</span>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <span>SQLite 本地持久化</span>
              </div>
            </footer>
          </div>
        </motion.div>
      )}

      {/* Dedicated Landscape A4 Print View */}
      <PrintLedgerView
        instruments={filteredInstruments}
        settings={settings}
        activeCategory={activeTab}
        logoDataUrl={logoDataUrl}
      />

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
        onClose={() => setLoginModalOpen(false)}
        onSuccess={(st) => {
          setAuth(st);
          notify("管理员登录成功，已解锁全部管理操作", "success");
        }}
      />

      <SettingsModal
        openModal={settingsModalOpen}
        initialTab={settingsInitialTab}
        isAdmin={auth.isAdmin}
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
          }));
        }}
        onDataRestored={() => refreshAll()}
        onNotify={notify}
        onRequestLogin={() => setLoginModalOpen(true)}
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

      {/* Full-Screen Frosted Blur App Lock Overlay */}
      <AppLockOverlay
        locked={auth.isInitialized && auth.isLocked}
        username={auth.username}
        docTitle={settings.docTitle}
        onUnlocked={(st) => {
          setAuth(st);
          refreshAll();
        }}
      />

      {/* Sonner Stacked Toast Notifications */}
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              "rounded-xl border border-zinc-200/80 dark:border-white/[0.1] shadow-elevated text-xs",
          },
        }}
      />
    </div>
  );
}
