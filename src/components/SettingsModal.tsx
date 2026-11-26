import React, { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  AlertTriangle,
  AppWindow,
  Archive,
  ArrowRight,
  BellRing,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Lock,
  MonitorDown,
  Palette,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api, clearMediaCache } from "@/lib/api";
import {
  ACCOUNT_BG_PRESETS,
  QUICK_SHOWCASE_IDS,
  isGrainMeshId,
  type AccountBgId,
} from "@/lib/accountBackgrounds";
import { formatFileSize, getTodayStr } from "@/lib/status";
import { cn } from "@/lib/utils";
import { isMacPlatform } from "@/components/AuthLockModals";
import { confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import { MarkdownNotes } from "@/components/MarkdownNotes";
import { ThresholdSettingsEditor } from "@/components/ThresholdSettingsEditor";
import {
  EASE_PRECISION,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import { Collapsible, ModalShell } from "@/components/ui/MotionPrimitives";
import { PrecisionSelect, PrecisionSwitch } from "@/components/ui/FormControls";
import {
  ActionStatusButton,
  HoldConfirmButton,
  useActionStatus,
} from "@/components/ui/InteractiveControls";
import type {
  AppSettings,
  CloseBehavior,
  DataDirInfo,
  ResetAppResult,
  UpdateCheckResult,
  UpdateDownloadProgress,
} from "@/types";

export type SettingsTab =
  | "account"
  | "general"
  | "window"
  | "alerts"
  | "applock"
  | "backup"
  | "update";

interface SettingsModalProps {
  openModal: boolean;
  initialTab?: SettingsTab;
  isAdmin: boolean;
  adminSessionExpiresAt?: string | null;
  accountBg: AccountBgId;
  onAccountBgChange: (next: AccountBgId) => void;
  settings: AppSettings;
  instrumentCount?: number;
  availableUpdate?: UpdateCheckResult | null;
  updatingApp?: boolean;
  updateProgress?: UpdateDownloadProgress | null;
  onUpdateDetected?: (res: UpdateCheckResult) => void;
  onTriggerInstallUpdate?: (repoOverride?: string, proxyOverride?: string) => Promise<void>;
  onClose: () => void;
  onSettingsChanged: (next: AppSettings) => void;
  onDataRestored: () => void;
  onAppReset?: (res: ResetAppResult) => void;
  previewingOnboarding?: boolean;
  onPreviewOnboarding?: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
  onRequestLogin?: () => void;
  onOpenAppLockSetup?: (mode: "enable" | "change") => void;
  onLockNow?: () => void;
  onDisableAppLock?: () => Promise<void>;
}

const INPUT_CLS =
  "precision-field w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-[#fafafa] hover:bg-white focus:bg-white dark:bg-white/[0.03] dark:focus:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500";

const DEFAULT_GITHUB_REPO = "MuY-DG/instrument-ledger";
const DEFAULT_UPDATE_PROXY_URL = "https://gh-proxy.com/";

function normalizeOptionalRepoInput(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.toLowerCase() === DEFAULT_GITHUB_REPO.toLowerCase() ? "" : raw;
}

function normalizeOptionalProxyInput(raw: string): string {
  const norm = raw.trim().replace(/\/+$/, "").toLowerCase();
  const defNorm = DEFAULT_UPDATE_PROXY_URL.replace(/\/+$/, "").toLowerCase();
  return norm === defNorm ? "" : raw;
}

function formatPublishDate(raw: string): string {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  openModal,
  initialTab = "account",
  isAdmin,
  accountBg,
  onAccountBgChange,
  settings,
  instrumentCount = 0,
  availableUpdate = null,
  updatingApp = false,
  updateProgress = null,
  onUpdateDetected,
  onTriggerInstallUpdate,
  onClose,
  onSettingsChanged,
  onDataRestored,
  onAppReset,
  previewingOnboarding = false,
  onPreviewOnboarding,
  onNotify,
  onRequestLogin,
  onOpenAppLockSetup,
  onLockNow,
  onDisableAppLock,
}) => {
  const mac = isMacPlatform();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [savingWindowPref, setSavingWindowPref] = useState(false);
  const [savingSecurityPref, setSavingSecurityPref] = useState(false);
  const [disablingLock, setDisablingLock] = useState(false);

  // General form
  const [autoLockMinutes, setAutoLockMinutes] = useState(settings.autoLockMinutes);
  const [docCode, setDocCode] = useState(settings.docCode);
  const [docVersion, setDocVersion] = useState(settings.docVersion);
  const [docTitle, setDocTitle] = useState(settings.docTitle);
  const [docSubtitle, setDocSubtitle] = useState(settings.docSubtitle);
  const [weeklyNotice, setWeeklyNotice] = useState(settings.weeklyNotice);
  const [githubRepo, setGithubRepo] = useState(() =>
    normalizeOptionalRepoInput(settings.githubRepo)
  );
  const [updateProxyUrl, setUpdateProxyUrl] = useState(() =>
    normalizeOptionalProxyInput(settings.updateProxyUrl)
  );
  const [logoPreview, setLogoPreview] = useState("");
  const [savingGeneral, setSavingGeneral] = useState(false);
  const {
    status: generalSaveStatus,
    setStatus: setGeneralSaveStatus,
    setTransientSuccess: setGeneralSaveSuccess,
  } = useActionStatus(1400);
  const {
    status: backupStatus,
    setStatus: setBackupStatus,
    setTransientSuccess: setBackupSuccess,
  } = useActionStatus(1500);
  const {
    status: checkUpdateStatus,
    setStatus: setCheckUpdateStatus,
    setTransientSuccess: setCheckUpdateSuccess,
  } = useActionStatus(1500);

  // Account showcase & edit state
  const [avatarPreview, setAvatarPreview] = useState("");
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileUsername, setProfileUsername] = useState(settings.adminUsername);
  const [profileTitle, setProfileTitle] = useState(settings.adminTitle || "系统管理员");
  const [savingProfile, setSavingProfile] = useState(false);

  const [editingPassword, setEditingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Backup / storage info & Factory Reset
  const [dirInfo, setDirInfo] = useState<DataDirInfo | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [defaultDownloadsDir, setDefaultDownloadsDir] = useState("");
  const [resetBackupDir, setResetBackupDir] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resettingApp, setResettingApp] = useState(false);
  const resetPwdRef = useRef<HTMLInputElement | null>(null);
  const hasData = dirInfo
    ? dirInfo.instrumentCount > 0 || dirInfo.reportCount > 0
    : instrumentCount > 0;

  // Updater state
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(availableUpdate);
  const [updateError, setUpdateError] = useState("");
  const [showSourceConfig, setShowSourceConfig] = useState(!availableUpdate?.hasUpdate);

  const wasOpenRef = useRef(false);

  // Initialize active tab and transient modal state ONLY when the modal opens
  useEffect(() => {
    if (!openModal) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setTab(
        isAdmin ||
          initialTab === "window" ||
          initialTab === "alerts" ||
          initialTab === "update"
          ? initialTab
          : "window"
      );
      setEditingProfile(false);
      setShowBgPicker(false);
      setEditingPassword(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setUpdateError("");
      setResetDialogOpen(false);
      setResetPassword("");
      setResetError("");
      setDirInfo(null);
      if (availableUpdate) {
        setUpdateResult(availableUpdate);
        setShowSourceConfig(!availableUpdate.hasUpdate);
      } else {
        setShowSourceConfig(true);
      }
      api.getDataDirInfo().then(setDirInfo).catch(() => {});
      api
        .getDefaultDownloadsDir()
        .then((dlDir) => {
          setDefaultDownloadsDir(dlDir);
          setResetBackupDir((prev) => prev || dlDir);
        })
        .catch(() => {});
    }
  }, [openModal, initialTab, isAdmin, availableUpdate]);

  // If admin session expires while open on an admin-only tab, leave that tab safely
  useEffect(() => {
    if (!openModal || isAdmin) return;
    if (
      tab === "account" ||
      tab === "general" ||
      tab === "applock" ||
      tab === "backup"
    ) {
      setTab("window");
    }
  }, [openModal, isAdmin, tab]);

  // Sync persisted settings into form inputs without resetting active tab
  useEffect(() => {
    if (!openModal) return;
    setAutoLockMinutes(settings.autoLockMinutes);
    setDocCode(settings.docCode);
    setDocVersion(settings.docVersion);
    setDocTitle(settings.docTitle);
    setDocSubtitle(settings.docSubtitle);
    setWeeklyNotice(settings.weeklyNotice);
    setGithubRepo(normalizeOptionalRepoInput(settings.githubRepo));
    setUpdateProxyUrl(normalizeOptionalProxyInput(settings.updateProxyUrl));
    setProfileUsername(settings.adminUsername);
    setProfileTitle(settings.adminTitle || "系统管理员");
    if (settings.companyLogoPath) {
      api
        .getStoredImageDataUrl(settings.companyLogoPath)
        .then(setLogoPreview)
        .catch(() => setLogoPreview(""));
    } else {
      setLogoPreview("");
    }
    if (settings.adminAvatarPath) {
      api
        .getStoredImageDataUrl(settings.adminAvatarPath)
        .then(setAvatarPreview)
        .catch(() => setAvatarPreview(""));
    } else {
      setAvatarPreview("");
    }
  }, [openModal, settings]);

  // Keep update result synced if a background update arrives while modal is open
  useEffect(() => {
    if (!openModal || !availableUpdate) return;
    setUpdateResult(availableUpdate);
  }, [openModal, availableUpdate]);

  const handleSaveGeneral = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingGeneral(true);
    setGeneralSaveStatus("loading");
    try {
      const updated = await api.updateSettings({
        docCode,
        docVersion,
        docTitle,
        docSubtitle,
        weeklyNotice,
        githubRepo,
        updateProxyUrl,
      });
      onSettingsChanged(updated);
      setGeneralSaveSuccess();
      onNotify("系统配置已保存", "success");
    } catch (err) {
      setGeneralSaveStatus("idle");
      onNotify(String(err), "error");
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleUploadLogo = async () => {
    const picked = await open({
      multiple: false,
      title: "选择公司表头 Logo 图片",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof picked === "string" && picked) {
      try {
        const rel = await api.uploadCompanyLogo(picked);
        const updated = await api.getSettings();
        onSettingsChanged(updated);
        const url = await api.getStoredImageDataUrl(rel);
        setLogoPreview(url);
        onNotify("公司表头 Logo 已更新", "success");
      } catch (err) {
        onNotify(String(err), "error");
      }
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await api.removeCompanyLogo();
      const updated = await api.getSettings();
      onSettingsChanged(updated);
      setLogoPreview("");
      onNotify("已移除公司 Logo", "success");
    } catch (err) {
      onNotify(String(err), "error");
    }
  };

  const handleUploadAvatar = async () => {
    const picked = await open({
      multiple: false,
      title: "选择头像图片",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof picked === "string" && picked) {
      try {
        const rel = await api.uploadAdminAvatar(picked);
        const updated = await api.getSettings();
        onSettingsChanged(updated);
        const url = await api.getStoredImageDataUrl(rel);
        setAvatarPreview(url);
        onNotify("头像已更新", "success");
      } catch (err) {
        onNotify(String(err), "error");
      }
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await api.removeAdminAvatar();
      const updated = await api.getSettings();
      onSettingsChanged(updated);
      setAvatarPreview("");
      onNotify("已移除头像", "success");
    } catch (err) {
      onNotify(String(err), "error");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = profileUsername.trim();
    if (trimmedUser.length < 2 || trimmedUser.length > 32) {
      onNotify("用户名长度需在 2 到 32 个字符之间", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await api.updateSettings({
        adminUsername: trimmedUser,
        adminTitle: profileTitle.trim(),
      });
      onSettingsChanged(updated);
      setEditingProfile(false);
      onNotify("账号资料已保存", "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onNotify("两次输入的新密码不一致", "error");
      return;
    }
    if (newPassword.length < 6) {
      onNotify("新密码长度不能少于 6 位", "error");
      return;
    }
    setSavingPwd(true);
    try {
      await api.changeAdminPassword(oldPassword, newPassword);
      const updated = await api.getSettings();
      onSettingsChanged(updated);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setEditingPassword(false);
      onNotify("登录密码已更新", "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setSavingPwd(false);
    }
  };

  const handleBackup = async () => {
    if (!hasData) {
      onNotify("当前暂无台账数据，无需导出备份", "error");
      return;
    }
    const baseName = `仪器台账备份_${getTodayStr()}.zip`;
    const sep = defaultDownloadsDir.includes("\\") ? "\\" : "/";
    const defaultPath = defaultDownloadsDir
      ? `${defaultDownloadsDir.replace(/[/\\]+$/, "")}${sep}${baseName}`
      : baseName;
    const dest = await save({
      title: "保存本地完整备份包",
      defaultPath,
      filters: [{ name: "ZIP 备份包", extensions: ["zip"] }],
    });
    if (!dest) return;
    setBackingUp(true);
    setBackupStatus("loading");
    try {
      const res = await api.createLocalBackup(dest);
      setBackupSuccess();
      onNotify(
        `备份成功！共打包 ${res.instrumentCount} 台设备、${res.reportCount} 份报告（${formatFileSize(res.sizeBytes)}）`,
        "success"
      );
    } catch (err) {
      setBackupStatus("idle");
      onNotify(String(err), "error");
    } finally {
      setBackingUp(false);
    }
  };

  const handleChooseResetBackupDir = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: resetBackupDir || defaultDownloadsDir || undefined,
      title: "选择初始化前强制备份的保存目录",
    });
    if (typeof picked === "string" && picked.trim()) {
      setResetBackupDir(picked.trim());
    }
  };

  const openResetConfirmDialog = () => {
    setResetPassword("");
    setShowResetPassword(false);
    setResetError("");
    setResetDialogOpen(true);
    window.setTimeout(() => resetPwdRef.current?.focus(), 100);
  };

  const handleConfirmResetApp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (resettingApp) return;
    if (!resetPassword) {
      setResetError("请输入当前管理员密码");
      return;
    }

    setResettingApp(true);
    setResetError("");
    try {
      const res = await api.resetAppWithBackup(
        resetPassword,
        hasData ? resetBackupDir || defaultDownloadsDir || undefined : undefined
      );
      clearMediaCache();
      setResetDialogOpen(false);
      setResetPassword("");
      onClose();
      onAppReset?.(res);
    } catch (err) {
      setResetError(String(err));
    } finally {
      setResettingApp(false);
    }
  };

  const handleRestore = async () => {
    const src = await open({
      multiple: false,
      title: "选择要还原的本地 ZIP 备份包",
      filters: [{ name: "ZIP 备份包", extensions: ["zip"] }],
    });
    if (typeof src !== "string" || !src) return;

    const confirmed = await confirmDialog({
      title: "还原备份",
      description: "将用备份包覆盖当前全部台账、位置照片与校验报告，确定继续？",
      confirmText: "按住还原",
      destructive: true,
      holdToConfirm: true,
    });
    if (!confirmed) return;

    setRestoring(true);
    try {
      const res = await api.restoreLocalBackup(src);
      clearMediaCache();
      onDataRestored();
      api.getDataDirInfo().then(setDirInfo).catch(() => {});
      onNotify(
        `还原成功！已恢复 ${res.instrumentCount} 条台账记录与 ${res.reportCount} 份校验报告`,
        "success"
      );
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setRestoring(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setCheckUpdateStatus("loading");
    setUpdateError("");
    setUpdateResult(null);
    try {
      const res = await api.checkForUpdates(githubRepo, updateProxyUrl);
      setUpdateResult(res);
      onUpdateDetected?.(res);
      setCheckUpdateSuccess();
      if (res.hasUpdate) {
        setShowSourceConfig(false);
      } else {
        onNotify(`当前已是最新版本 v${res.currentVersion}`, "success");
      }
    } catch (err) {
      setCheckUpdateStatus("idle");
      setUpdateError(String(err));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateResult?.hasUpdate) return;
    if (onTriggerInstallUpdate) {
      await onTriggerInstallUpdate(githubRepo, updateProxyUrl);
    } else {
      try {
        await api.downloadAndLaunchUpdate(githubRepo, updateProxyUrl);
      } catch (err) {
        onNotify(String(err), "error");
      }
    }
  };

  const handleUpdateCloseBehavior = async (next: CloseBehavior) => {
    if (savingWindowPref || settings.closeBehavior === next) return;
    setSavingWindowPref(true);
    try {
      const updated = await api.setCloseBehavior(next);
      onSettingsChanged(updated);
      const label =
        next === "minimize_to_tray"
          ? mac
            ? "最小化到顶部菜单栏"
            : "最小化到系统托盘"
          : next === "exit"
            ? "直接退出程序"
            : "每次关闭时询问";
      onNotify(`关闭按钮行为已设为「${label}」`, "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setSavingWindowPref(false);
    }
  };

  const handlePatchSecuritySetting = async (
    patch: {
      autoLockMinutes?: number;
      lockOnHide?: boolean;
      lockOnStartup?: boolean;
    },
    successMsg: string
  ) => {
    if (savingSecurityPref) return;
    setSavingSecurityPref(true);
    try {
      const updated = await api.updateSettings(patch);
      onSettingsChanged(updated);
      onNotify(successMsg, "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setSavingSecurityPref(false);
    }
  };

  const handleConfirmDisableAppLock = async () => {
    if (!onDisableAppLock || disablingLock) return;
    const ok = await confirmDialog({
      title: "关闭应用锁",
      description: "关闭后将清除当前 PIN 码，之后可随时重新开启。",
      confirmText: "按住关闭",
      destructive: true,
      holdToConfirm: true,
    });
    if (!ok) return;
    setDisablingLock(true);
    try {
      await onDisableAppLock();
    } finally {
      setDisablingLock(false);
    }
  };

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
  }> = [
    { id: "account", label: "账号", icon: <User className="h-3.5 w-3.5" />, adminOnly: true },
    { id: "general", label: "台账与表头", icon: <Settings className="h-3.5 w-3.5" />, adminOnly: true },
    { id: "window", label: "窗口与托盘", icon: <AppWindow className="h-3.5 w-3.5" /> },
    { id: "alerts", label: "到期预警", icon: <BellRing className="h-3.5 w-3.5" /> },
    { id: "applock", label: "应用锁", icon: <Lock className="h-3.5 w-3.5" />, adminOnly: true },
    { id: "backup", label: "备份与还原", icon: <HardDrive className="h-3.5 w-3.5" />, adminOnly: true },
    { id: "update", label: "检查更新", icon: <CloudDownload className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
    <ModalShell
      open={openModal}
      onClose={onClose}
      closeOnEsc={!resetDialogOpen && !previewingOnboarding}
      panelClassName="w-full max-w-3xl h-[78vh] flex flex-col"
    >
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/70 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <Settings className="h-4 w-4 text-zinc-700 dark:text-zinc-200" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                  设置
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex min-h-0">
              {/* Sidebar Tabs */}
              <div className="w-44 border-r border-zinc-200/80 dark:border-white/[0.07] bg-[#f6f6f8] dark:bg-[#0d0d10] p-3 space-y-1 shrink-0">
                {tabs
                  .filter((t) => !t.adminOnly || isAdmin)
                  .map((t) => {
                    const active = tab === t.id;
                    return (
                      <motion.button
                        key={t.id}
                        type="button"
                        whileTap={TAP_SCALE_SUBTLE}
                        transition={SPRING_SNAPPY}
                        onClick={() => setTab(t.id)}
                        className={cn(
                          "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                          active
                            ? "text-white dark:text-zinc-950"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-zinc-100"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-tab-pill"
                            transition={SPRING_SNAPPY}
                            className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white shadow-tactile-primary"
                          />
                        )}
                        <span className="relative z-10 flex items-center">
                          {t.icon}
                        </span>
                        <span className="relative z-10 flex-1 text-left">
                          {t.label}
                        </span>
                        {t.id === "update" &&
                          (availableUpdate?.hasUpdate ||
                            updateResult?.hasUpdate) && (
                            <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                          )}
                      </motion.button>
                    );
                  })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-[#121216]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: EASE_PRECISION }}
                  >
                {tab === "account" && isAdmin && (
                  <div className="space-y-4">
                    {/* Profile Showcase Hero Card with Switchable Grainy Mesh Cover Background */}
                    <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#141418] shadow-surface overflow-hidden">
                      {/* Switchable Cover Banner */}
                      <div className="relative h-36 overflow-hidden border-b border-zinc-200/70 dark:border-white/[0.07]">
                        <AnimatePresence mode="sync" initial={false}>
                          {isGrainMeshId(accountBg) ? (
                            <motion.div
                              key={`cover-${accountBg}`}
                              data-av={accountBg}
                              initial={{ opacity: 0, scale: 1.04 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.36, ease: EASE_PRECISION }}
                              className="absolute inset-0"
                            />
                          ) : (
                            <motion.div
                              key="cover-default"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3, ease: EASE_PRECISION }}
                              className="absolute inset-0 bg-gradient-to-br from-slate-100 via-indigo-50/90 to-sky-100/80 dark:from-[#161829] dark:via-[#11121a] dark:to-[#1b1730]"
                            >
                              <div className="absolute inset-0 bg-precision-grid-light dark:bg-precision-grid pointer-events-none" />
                              <div className="absolute -top-12 -left-10 h-40 w-40 rounded-full bg-indigo-400/20 dark:bg-indigo-500/20 blur-3xl pointer-events-none" />
                              <div className="absolute -bottom-14 right-8 h-44 w-44 rounded-full bg-sky-400/20 dark:bg-sky-500/15 blur-3xl pointer-events-none" />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Subtle bottom rim depth for avatar overlap & controls */}
                        {isGrainMeshId(accountBg) && (
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/22 via-transparent to-black/10" />
                        )}

                        {/* Subtle Precision Dial Watermark */}
                        <svg
                          viewBox="0 0 180 180"
                          className={cn(
                            "absolute -right-8 -top-8 h-44 w-44 pointer-events-none transition-colors duration-300",
                            isGrainMeshId(accountBg)
                              ? "text-white/[0.16]"
                              : "text-zinc-900/[0.05] dark:text-white/[0.06]"
                          )}
                          fill="none"
                        >
                          <circle cx="90" cy="90" r="76" stroke="currentColor" strokeWidth="1" />
                          <circle
                            cx="90"
                            cy="90"
                            r="56"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <circle cx="90" cy="90" r="34" stroke="currentColor" strokeWidth="1" />
                          <line x1="90" y1="14" x2="90" y2="34" stroke="currentColor" strokeWidth="1.5" />
                          <line x1="166" y1="90" x2="146" y2="90" stroke="currentColor" strokeWidth="1.5" />
                        </svg>

                        {/* Session Status Pill */}
                        <div className="absolute top-3.5 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/85 dark:bg-zinc-950/65 backdrop-blur-md border border-white/60 dark:border-white/[0.14] text-[11px] font-medium text-zinc-800 dark:text-zinc-100 shadow-hairline">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>在线</span>
                        </div>

                        {/* Quick Grainy-Orb Background Switcher Pill (bottom-right of cover) */}
                        <div className="absolute bottom-3 right-4 flex items-center gap-2">
                          <div className="inline-flex items-center gap-1.5 pl-1.5 pr-1.5 py-1 rounded-full bg-white/85 dark:bg-zinc-950/65 backdrop-blur-md border border-white/60 dark:border-white/[0.14] shadow-tactile">
                            <div className="flex items-center -space-x-1.5">
                              {QUICK_SHOWCASE_IDS.map((presetId) => {
                                const active = accountBg === presetId;
                                const meta = ACCOUNT_BG_PRESETS.find((p) => p.id === presetId);
                                return (
                                  <motion.button
                                    key={presetId}
                                    type="button"
                                    whileHover={{ scale: 1.18, zIndex: 20 }}
                                    whileTap={{ scale: 0.92 }}
                                    transition={SPRING_SNAPPY}
                                    onClick={() => onAccountBgChange(presetId)}
                                    title={meta ? `切换背景：${meta.name}` : "切换背景"}
                                    aria-label={meta ? `切换背景：${meta.name}` : "切换背景"}
                                    className={cn(
                                      "relative h-5 w-5 rounded-full p-[1.5px] bg-white dark:bg-zinc-900 shadow-sm focus:outline-none",
                                      active && "ring-2 ring-zinc-900 dark:ring-white z-10"
                                    )}
                                  >
                                    <span
                                      data-av={presetId}
                                      className="block h-full w-full rounded-full"
                                    />
                                  </motion.button>
                                );
                              })}
                            </div>

                            <motion.button
                              type="button"
                              whileTap={TAP_SCALE_SUBTLE}
                              transition={SPRING_SNAPPY}
                              onClick={() => setShowBgPicker((v) => !v)}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium transition-colors",
                                showBgPicker
                                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                                  : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900/[0.07] dark:hover:bg-white/[0.12]"
                              )}
                              title="展开全部 12 款磨砂噪点渐变背景"
                            >
                              <Palette className="h-3 w-3" />
                              <span>背景</span>
                            </motion.button>
                          </div>
                        </div>
                      </div>

                      {/* Avatar + Identity Bar */}
                      <div className="px-5 pb-5">
                        <div className="flex items-end justify-between gap-3 -mt-10">
                          {/* Avatar with Upload Overlay (falls back to matching grainy mesh orb) */}
                          <div className="relative group shrink-0">
                            <button
                              type="button"
                              onClick={handleUploadAvatar}
                              title="更换头像"
                              data-av={
                                !avatarPreview && isGrainMeshId(accountBg)
                                  ? accountBg
                                  : undefined
                              }
                              className="relative h-20 w-20 rounded-full ring-4 ring-white dark:ring-[#141418] shadow-elevated overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-700 dark:from-indigo-500 dark:to-sky-500 text-white flex items-center justify-center focus:outline-none"
                            >
                              {avatarPreview ? (
                                <img
                                  src={avatarPreview}
                                  alt="头像"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-2xl font-semibold uppercase tracking-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.28)]">
                                  {(settings.adminUsername || "A").slice(0, 1)}
                                </span>
                              )}
                              <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="h-5 w-5 text-white" />
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={handleUploadAvatar}
                              title="更换头像"
                              className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-zinc-900 hover:bg-zinc-700 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 ring-2 ring-white dark:ring-[#141418] flex items-center justify-center shadow-sm transition"
                            >
                              <Camera className="h-3 w-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            {!editingProfile && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileUsername(settings.adminUsername);
                                  setProfileTitle(settings.adminTitle || "系统管理员");
                                  setEditingProfile(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                <span>编辑资料</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Displayed Name & Admin Title Badge */}
                        <div className="mt-3.5 flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white tracking-tight">
                            {settings.adminUsername || "未设置"}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium">
                            <ShieldCheck className="h-3 w-3" />
                            <span>{settings.adminTitle || "系统管理员"}</span>
                          </span>
                        </div>

                        {/* Expandable 12-Palette Grainy Mesh Background Picker */}
                        <Collapsible open={showBgPicker}>
                          <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                <Palette className="h-3.5 w-3.5 text-indigo-500" />
                                <span>账号磨砂渐变背景</span>
                                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">
                                  ·{" "}
                                  {ACCOUNT_BG_PRESETS.find((p) => p.id === accountBg)?.name ||
                                    "默认"}
                                </span>
                              </div>
                              <motion.button
                                type="button"
                                whileTap={TAP_SCALE}
                                transition={SPRING_SNAPPY}
                                onClick={() => {
                                  const meshes = ACCOUNT_BG_PRESETS.filter(
                                    (p) => p.isGrainMesh && p.id !== accountBg
                                  );
                                  const pick =
                                    meshes[Math.floor(Math.random() * meshes.length)];
                                  if (pick) onAccountBgChange(pick.id);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-colors"
                              >
                                <Shuffle className="h-3 w-3" />
                                <span>随机一款</span>
                              </motion.button>
                            </div>

                            <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                              {ACCOUNT_BG_PRESETS.map((preset) => {
                                const active = accountBg === preset.id;
                                return (
                                  <motion.button
                                    key={preset.id}
                                    type="button"
                                    whileHover={{ y: -2, scale: 1.03 }}
                                    whileTap={{ scale: 0.95 }}
                                    transition={SPRING_SNAPPY}
                                    onClick={() => onAccountBgChange(preset.id)}
                                    className="group relative flex flex-col items-center gap-1.5 p-1.5 rounded-xl hover:bg-zinc-100/80 dark:hover:bg-white/[0.05] transition-colors focus:outline-none"
                                  >
                                    <div className="relative h-9 w-9 rounded-full p-[2px]">
                                      {active && (
                                        <motion.span
                                          layoutId="account-bg-active-ring"
                                          transition={SPRING_SNAPPY}
                                          className="absolute inset-0 rounded-full ring-2 ring-zinc-900 dark:ring-white"
                                        />
                                      )}
                                      {preset.isGrainMesh ? (
                                        <span
                                          data-av={preset.id}
                                          className="relative flex h-full w-full rounded-full items-center justify-center shadow-sm"
                                        >
                                          {active && (
                                            <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] stroke-[2.6]" />
                                          )}
                                        </span>
                                      ) : (
                                        <span className="relative flex h-full w-full rounded-full items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-sky-100 dark:from-[#161829] dark:to-[#1b1730] border border-zinc-200 dark:border-white/15 bg-precision-grid-light">
                                          {active && (
                                            <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-white stroke-[2.6]" />
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      className={cn(
                                        "text-[10px] leading-none truncate max-w-full",
                                        active
                                          ? "font-semibold text-zinc-950 dark:text-white"
                                          : "text-zinc-500 dark:text-zinc-400"
                                      )}
                                    >
                                      {preset.name}
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          </div>
                        </Collapsible>

                        {/* Expandable Profile Edit Form */}
                        <AnimatePresence initial={false}>
                          {editingProfile && (
                            <motion.form
                              key="profile-edit-form"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                              onSubmit={handleSaveProfile}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-3.5">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                      用户名
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      minLength={2}
                                      maxLength={32}
                                      value={profileUsername}
                                      onChange={(e) => setProfileUsername(e.target.value)}
                                      className={INPUT_CLS}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                      管理员称号
                                    </label>
                                    <input
                                      type="text"
                                      maxLength={24}
                                      placeholder="如：系统管理员"
                                      value={profileTitle}
                                      onChange={(e) => setProfileTitle(e.target.value)}
                                      className={INPUT_CLS}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleUploadAvatar}
                                      className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition"
                                    >
                                      <Camera className="h-3.5 w-3.5" />
                                      <span>{avatarPreview ? "更换头像" : "上传头像"}</span>
                                    </button>
                                    {avatarPreview && (
                                      <button
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:underline transition"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        <span>移除</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProfileUsername(settings.adminUsername);
                                        setProfileTitle(settings.adminTitle || "系统管理员");
                                        setEditingProfile(false);
                                      }}
                                      className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={savingProfile}
                                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                                    >
                                      <Save className="h-3.5 w-3.5" />
                                      <span>{savingProfile ? "保存中..." : "保存"}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.form>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Password Security Showcase & Edit Card */}
                    <div className="rounded-2xl border border-zinc-200/85 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02] overflow-hidden">
                      <div className="px-5 py-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-xl bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center text-indigo-500 shrink-0">
                            <KeyRound className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                              登录密码
                            </div>
                            <div className="text-xs font-mono tracking-widest text-zinc-400 dark:text-zinc-500 mt-0.5">
                              ••••••••
                            </div>
                          </div>
                        </div>

                        {!editingPassword && (
                          <button
                            type="button"
                            onClick={() => setEditingPassword(true)}
                            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition shrink-0"
                          >
                            修改密码
                          </button>
                        )}
                      </div>

                      <AnimatePresence initial={false}>
                        {editingPassword && (
                          <motion.form
                            key="password-edit-form"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            onSubmit={handleChangePassword}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5 pt-4 border-t border-zinc-200/80 dark:border-white/[0.07] bg-white dark:bg-[#141418] space-y-3.5">
                              <div>
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                  原密码
                                </label>
                                <input
                                  type="password"
                                  required
                                  value={oldPassword}
                                  onChange={(e) => setOldPassword(e.target.value)}
                                  className={INPUT_CLS}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    新密码
                                  </label>
                                  <input
                                    type="password"
                                    required
                                    minLength={6}
                                    placeholder="至少 6 位"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className={INPUT_CLS}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    确认密码
                                  </label>
                                  <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={INPUT_CLS}
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOldPassword("");
                                    setNewPassword("");
                                    setConfirmPassword("");
                                    setEditingPassword(false);
                                  }}
                                  className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition"
                                >
                                  取消
                                </button>
                                <button
                                  type="submit"
                                  disabled={savingPwd}
                                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  <span>{savingPwd ? "保存中..." : "保存"}</span>
                                </button>
                              </div>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {tab === "general" && isAdmin && (
                  <form onSubmit={handleSaveGeneral} className="space-y-4">
                    <div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        <span>表单编号 / 版本</span>
                        <InfoTip content="质量体系受控文件编号与修订版次，用于侧边栏、打印抬头及 Excel 导出表头与文件名。" />
                      </label>
                      <div className="grid grid-cols-[1fr_104px] gap-2">
                        <input
                          type="text"
                          value={docCode}
                          onChange={(e) => setDocCode(e.target.value)}
                          placeholder="例如：JSSK-MPR-170"
                          className={`${INPUT_CLS} font-mono`}
                        />
                        <input
                          type="text"
                          value={docVersion}
                          onChange={(e) => setDocVersion(e.target.value)}
                          placeholder="如：A"
                          className={`${INPUT_CLS} font-mono text-center`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        <span>台账标题</span>
                        <InfoTip content="用于界面显示、打印抬头及 Excel 导出表头。" />
                      </label>
                      <input
                        type="text"
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        className={INPUT_CLS}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        英文副标题
                      </label>
                      <input
                        type="text"
                        value={docSubtitle}
                        onChange={(e) => setDocSubtitle(e.target.value)}
                        className={INPUT_CLS}
                      />
                    </div>

                    <div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        <span>表头说明</span>
                        <InfoTip content="显示在打印抬头及 Excel 导出表头中的说明文案。" />
                      </label>
                      <input
                        type="text"
                        value={weeklyNotice}
                        onChange={(e) => setWeeklyNotice(e.target.value)}
                        className={INPUT_CLS}
                      />
                    </div>

                    {/* Company Logo */}
                    <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] space-y-2.5">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        <span>公司 Logo</span>
                        <InfoTip content="选填，用于侧边栏、Excel 导出及打印抬头。" />
                      </div>
                      <div className="flex items-center gap-3">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="公司 Logo"
                            className="h-11 max-w-[140px] object-contain bg-white border border-zinc-200 dark:border-white/10 rounded-lg p-1.5"
                          />
                        ) : (
                          <div className="h-11 w-28 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-white/[0.02] flex items-center justify-center text-zinc-400 text-xs gap-1">
                            <ImageIcon className="h-3.5 w-3.5" />
                            未设置
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleUploadLogo}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.05] border border-zinc-200 dark:border-white/[0.1] hover:bg-zinc-50 dark:hover:bg-white/[0.09] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                        >
                          {logoPreview ? "更换" : "上传"}
                        </button>
                        {logoPreview && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            移除
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <ActionStatusButton
                        type="submit"
                        size="sm"
                        status={generalSaveStatus}
                        disabled={savingGeneral}
                        idleLabel="保存"
                        loadingLabel="保存中..."
                        successLabel="已保存"
                        idleIcon={<Save className="h-3.5 w-3.5" />}
                      />
                    </div>
                  </form>
                )}

                {tab === "window" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                        关闭窗口时
                      </span>
                      <InfoTip
                        content={
                          mac
                            ? "后台运行时关闭主窗口不会结束进程，点击顶部菜单栏或 Dock 图标可随时重新打开。"
                            : "后台运行时关闭主窗口不会结束进程，单击右下角托盘图标可快速唤出，右键可锁定或退出。"
                        }
                      />
                    </div>

                    <div className="space-y-2.5">
                      {(
                        [
                          {
                            id: "minimize_to_tray" as CloseBehavior,
                            title: mac ? "最小化到菜单栏" : "最小化到系统托盘",
                            tip: mac
                              ? "隐藏主窗口并在后台保活，保留登录状态与定时提醒，点击顶部图标或 Dock 随时打开。"
                              : "隐藏主窗口并在右下角托盘保活，保留登录状态与定时提醒，单击托盘图标随时打开。",
                            icon: <MonitorDown className="h-4 w-4" />,
                          },
                          {
                            id: "exit" as CloseBehavior,
                            title: "直接退出",
                            tip: "",
                            icon: <Power className="h-4 w-4" />,
                          },
                          {
                            id: "ask" as CloseBehavior,
                            title: "每次询问",
                            tip: "",
                            icon: <AppWindow className="h-4 w-4" />,
                          },
                        ] as const
                      ).map((opt) => {
                        const active = settings.closeBehavior === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={savingWindowPref}
                            onClick={() => handleUpdateCloseBehavior(opt.id)}
                            className={cn(
                              "w-full text-left px-4 py-3.5 rounded-xl border transition flex items-center gap-3.5",
                              active
                                ? "border-zinc-900 dark:border-white/75 bg-zinc-50/90 dark:bg-white/[0.05] ring-1 ring-zinc-900/10 dark:ring-white/15"
                                : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.015] hover:bg-zinc-50/60 dark:hover:bg-white/[0.035]"
                            )}
                          >
                            <div
                              className={cn(
                                "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
                                active
                                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950"
                                  : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400"
                              )}
                            >
                              {opt.icon}
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                                {opt.title}
                              </span>
                              {opt.tip && <InfoTip content={opt.tip} />}
                            </div>
                            <div className="shrink-0">
                              <span
                                className={cn(
                                  "h-4 w-4 rounded-full border flex items-center justify-center",
                                  active
                                    ? "border-zinc-900 dark:border-white"
                                    : "border-zinc-300 dark:border-zinc-600"
                                )}
                              >
                                {active && (
                                  <span className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-white" />
                                )}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === "alerts" && (
                  <ThresholdSettingsEditor
                    settings={settings}
                    isAdmin={isAdmin}
                    onSettingsChanged={onSettingsChanged}
                    onNotify={onNotify}
                    onRequestLogin={
                      onRequestLogin
                        ? () => {
                            onClose();
                            onRequestLogin();
                          }
                        : undefined
                    }
                  />
                )}

                {tab === "applock" && isAdmin && (
                  <div className="space-y-4">
                    {/* Independent App Lock (4-6 Digit PIN) */}
                    <div className="p-4 rounded-xl border border-zinc-200/85 dark:border-white/[0.09] bg-white dark:bg-white/[0.02] space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Lock className="h-4 w-4 text-indigo-500" />
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            独立应用锁
                          </span>
                          <InfoTip content="独立于管理员密码，输完 4~6 位 PIN 码自动解锁；忘记时可通过管理员密码解除或重设。" />
                          {settings.appLockEnabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              已开启 · {settings.appLockPinLength} 位
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
                              未开启
                            </span>
                          )}
                        </div>

                        {!settings.appLockEnabled && (
                          <button
                            type="button"
                            onClick={() => onOpenAppLockSetup?.("enable")}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition shrink-0"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>开启</span>
                          </button>
                        )}
                      </div>

                      {settings.appLockEnabled && (
                        <>
                          {/* PIN Actions */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onOpenAppLockSetup?.("change")}
                              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-zinc-50/70 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                            >
                              修改 PIN
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onLockNow?.();
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold transition"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              <span>立即锁定</span>
                            </button>
                            <button
                              type="button"
                              disabled={disablingLock}
                              onClick={handleConfirmDisableAppLock}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition ml-auto"
                            >
                              {disablingLock ? "关闭中..." : "关闭"}
                            </button>
                          </div>

                          {/* Independent Trigger Timings */}
                          <div className="pt-3 border-t border-zinc-200/75 dark:border-white/[0.07] space-y-2.5">
                            <div className="text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-200">
                              触发时机
                            </div>

                            <div className="flex items-center justify-between gap-3 py-1">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                <span>手动锁定</span>
                                <InfoTip
                                  content={`支持侧边栏锁图标、快捷键 ⌘/Ctrl + L 或${mac ? "顶部菜单栏" : "托盘右键菜单"}`}
                                />
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
                                已启用
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 py-1">
                              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                无操作自动锁定
                              </span>
                              <PrecisionSelect
                                value={autoLockMinutes}
                                disabled={savingSecurityPref}
                                align="right"
                                className="min-w-[100px]"
                                onChange={(next) => {
                                  setAutoLockMinutes(next);
                                  handlePatchSecuritySetting(
                                    { autoLockMinutes: next },
                                    next > 0
                                      ? `已设置无操作 ${next} 分钟自动锁定`
                                      : "已关闭无操作自动锁定"
                                  );
                                }}
                                options={[
                                  { value: 0, label: "关闭" },
                                  { value: 5, label: "5 分钟" },
                                  { value: 10, label: "10 分钟" },
                                  { value: 15, label: "15 分钟" },
                                  { value: 30, label: "30 分钟" },
                                ]}
                              />
                            </div>

                            <div className="flex items-center justify-between gap-3 py-1 select-none">
                              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                隐藏到{mac ? "菜单栏" : "托盘"}时自动锁定
                              </span>
                              <PrecisionSwitch
                                checked={settings.lockOnHide}
                                disabled={savingSecurityPref}
                                size="sm"
                                ariaLabel="隐藏时自动锁定"
                                onChange={(checked) =>
                                  handlePatchSecuritySetting(
                                    { lockOnHide: checked },
                                    checked
                                      ? "已开启最小化到后台自动锁定"
                                      : "已关闭最小化到后台自动锁定"
                                  )
                                }
                              />
                            </div>

                            <div className="flex items-center justify-between gap-3 py-1 select-none">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                <span>启动程序时自动锁定</span>
                                <InfoTip content="锁屏状态下强制关闭时，下次重启会自动保持锁定。" />
                              </span>
                              <PrecisionSwitch
                                checked={settings.lockOnStartup}
                                disabled={savingSecurityPref}
                                size="sm"
                                ariaLabel="启动程序时自动锁定"
                                onChange={(checked) =>
                                  handlePatchSecuritySetting(
                                    { lockOnStartup: checked },
                                    checked
                                      ? "已开启启动程序时自动锁定"
                                      : "已关闭启动程序时自动锁定"
                                  )
                                }
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {tab === "backup" && isAdmin && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-zinc-200/75 dark:divide-white/[0.07]">
                      <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Archive className="h-4 w-4" />
                          </div>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            导出备份
                          </span>
                        </div>
                        <ActionStatusButton
                          size="sm"
                          status={backupStatus}
                          disabled={backingUp || !hasData}
                          idleLabel={hasData ? "导出" : "暂无数据"}
                          loadingLabel="备份中..."
                          successLabel="已导出"
                          idleIcon={hasData ? <Archive className="h-3.5 w-3.5" /> : undefined}
                          onClick={handleBackup}
                          className="shrink-0"
                        />
                      </div>

                      <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <RotateCcw className="h-4 w-4" />
                          </div>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            还原备份
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={handleRestore}
                          className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-50 shadow-tactile text-zinc-800 dark:text-zinc-100 text-xs font-semibold shrink-0"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>{restoring ? "还原中..." : "还原"}</span>
                        </button>
                      </div>

                      <div className="px-4 py-3.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0">
                            <FolderOpen className="h-4 w-4" />
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                              本地数据目录
                            </span>
                            {dirInfo && (
                              <InfoTip
                                content={`数据库 ${formatFileSize(dirInfo.dbSizeBytes)} · 附件 ${formatFileSize(dirInfo.attachmentsSizeBytes)}`}
                              />
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            api.openDataDir().catch((e) => onNotify(String(e), "error"))
                          }
                          className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-50 shadow-tactile text-zinc-800 dark:text-zinc-100 text-xs font-medium shrink-0"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span>打开目录</span>
                        </button>
                      </div>
                    </div>

                    {onPreviewOnboarding && (
                      <div className="px-4 py-3.5 rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                              启动引导动画
                            </span>
                            <InfoTip content="预览首次安装时的启动动画与引导界面，仅作效果演示，不会修改任何本地数据或账号配置。" />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onPreviewOnboarding}
                          className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] shadow-tactile text-zinc-800 dark:text-zinc-100 text-xs font-medium shrink-0"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>预览动画</span>
                        </button>
                      </div>
                    )}

                    <div className="px-4 py-3.5 rounded-xl border border-rose-200/85 dark:border-rose-500/20 bg-rose-50/35 dark:bg-rose-500/[0.03] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            初始化程序
                          </span>
                          <InfoTip content="清空本地数据并恢复至首次安装状态；若存在台账数据将先自动导出备份。" />
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE}
                        transition={SPRING_SNAPPY}
                        onClick={openResetConfirmDialog}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-tactile-primary transition-colors shrink-0"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>初始化</span>
                      </motion.button>
                    </div>
                  </div>
                )}

                {tab === "update" && (
                  <div className="space-y-4">
                    {/* Installed Version Hero Bar */}
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.09] shadow-hairline flex items-center justify-center text-zinc-700 dark:text-zinc-200 shrink-0">
                          <CloudDownload className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
                            当前版本
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-lg font-semibold font-mono tabular-nums text-zinc-950 dark:text-white leading-none">
                              v{dirInfo?.appVersion || "1.4.0"}
                            </span>
                            {updateResult?.hasUpdate ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                可更新至 v{updateResult.latestVersion}
                              </span>
                            ) : updateResult && !updateResult.hasUpdate ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                已是最新
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <ActionStatusButton
                        size="sm"
                        status={checkUpdateStatus}
                        disabled={checkingUpdate || updatingApp}
                        idleLabel="检查更新"
                        loadingLabel="检查中..."
                        successLabel="检查完成"
                        idleIcon={<RefreshCw className="h-3.5 w-3.5" />}
                        onClick={handleCheckUpdate}
                        className="shrink-0"
                      />
                    </div>

                    {/* Error Notice */}
                    {updateError && (
                      <div className="px-4 py-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5 leading-relaxed">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{updateError}</span>
                      </div>
                    )}

                    {/* Update Available / Up-to-date Result Card */}
                    {updateResult && updateResult.hasUpdate && (
                      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.1] bg-white dark:bg-[#16161a] shadow-surface overflow-hidden">
                        {/* Release Header */}
                        <div className="px-5 py-4 border-b border-zinc-200/75 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-white/[0.02] flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                                发现新版本
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.07] border border-zinc-200/80 dark:border-white/[0.08] font-mono text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums">
                                <span>v{updateResult.currentVersion}</span>
                                <ArrowRight className="h-3 w-3 text-zinc-400" />
                                <span className="font-semibold text-sky-700 dark:text-sky-300">
                                  v{updateResult.latestVersion}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
                              {formatPublishDate(updateResult.publishedAt) && (
                                <span className="font-mono tabular-nums">
                                  发布于 {formatPublishDate(updateResult.publishedAt)}
                                </span>
                              )}
                              {formatPublishDate(updateResult.publishedAt) &&
                                updateResult.assetName && (
                                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                                )}
                              {updateResult.assetName && (
                                <span className="font-mono truncate max-w-[300px]" title={updateResult.assetName}>
                                  {updateResult.assetName}
                                </span>
                              )}
                              {updateResult.resolvedSource && (
                                <>
                                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                                  <span className="font-mono text-zinc-400 dark:text-zinc-500">
                                    线路：{updateResult.resolvedSource}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {updateResult.htmlUrl && (
                            <button
                              type="button"
                              onClick={() => openUrl(updateResult.htmlUrl)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition shrink-0"
                            >
                              <span>查看 Release</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Rendered Markdown Release Notes */}
                        <div className="px-5 py-4 space-y-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                            <FileText className="h-3.5 w-3.5" />
                            <span>更新内容</span>
                          </div>
                          {updateResult.releaseNotes.trim() ? (
                            <div className="rounded-xl bg-zinc-50/75 dark:bg-white/[0.025] border border-zinc-200/70 dark:border-white/[0.06] px-4 py-3.5 max-h-60 overflow-y-auto">
                              <MarkdownNotes content={updateResult.releaseNotes} />
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 rounded-xl bg-zinc-50/75 dark:bg-white/[0.025] border border-zinc-200/70 dark:border-white/[0.06] px-4 py-3">
                              暂无更新说明
                            </p>
                          )}
                        </div>

                        {/* Download Progress & Action Footer */}
                        <div className="px-5 py-3.5 border-t border-zinc-200/75 dark:border-white/[0.07] bg-zinc-50/50 dark:bg-white/[0.015] space-y-3">
                          {updatingApp && updateProgress && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                                <span className="truncate font-sans text-zinc-700 dark:text-zinc-200 font-medium">
                                  {updateProgress.message || `正在下载 ${updateResult.assetName}...`}
                                </span>
                                <span className="shrink-0">
                                  {updateProgress.phase === "installing" ||
                                  updateProgress.phase === "restarting"
                                    ? "100%"
                                    : updateProgress.total > 0
                                      ? `${formatFileSize(updateProgress.downloaded)} / ${formatFileSize(updateProgress.total)} (${Math.round(updateProgress.percent)}%)`
                                      : updateProgress.downloaded > 0
                                        ? formatFileSize(updateProgress.downloaded)
                                        : "..."}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-zinc-200/90 dark:bg-white/10 overflow-hidden">
                                {updateProgress.total > 0 ||
                                updateProgress.phase === "installing" ||
                                updateProgress.phase === "restarting" ? (
                                  <div
                                    className="h-full rounded-full bg-sky-500 transition-all duration-150"
                                    style={{
                                      width: `${
                                        updateProgress.phase === "installing" ||
                                        updateProgress.phase === "restarting"
                                          ? 100
                                          : updateProgress.percent
                                      }%`,
                                    }}
                                  />
                                ) : (
                                  <div className="h-full w-1/3 bg-sky-500 rounded-full animate-pulse" />
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2">
                            <InfoTip content="更新过程自动校验 Ed25519 签名，并保留全部本地台账数据与附件。" />
                            <button
                              type="button"
                              disabled={updatingApp}
                              onClick={handleDownloadUpdate}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                            >
                              {updatingApp ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CloudDownload className="h-3.5 w-3.5" />
                              )}
                              <span>
                                {updateProgress?.phase === "restarting"
                                  ? "重启中..."
                                  : updateProgress?.phase === "installing"
                                    ? "安装中..."
                                    : updatingApp
                                      ? "下载中..."
                                      : "立即更新"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {updateResult && !updateResult.hasUpdate && (
                      <div className="px-4 py-3 rounded-xl bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] border border-emerald-500/20 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="text-xs text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 flex-wrap">
                            <span>
                              已是最新版本{" "}
                              <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                                v{updateResult.currentVersion}
                              </span>
                            </span>
                            {updateResult.resolvedSource && (
                              <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                                · {updateResult.resolvedSource}
                              </span>
                            )}
                          </div>
                        </div>
                        {updateResult.htmlUrl && (
                          <button
                            type="button"
                            onClick={() => openUrl(updateResult.htmlUrl)}
                            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition shrink-0"
                          >
                            <span>查看 Release</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Collapsible Admin Update Source Config */}
                    {isAdmin && (
                      <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.015] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowSourceConfig((prev) => !prev)}
                          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-50/80 dark:hover:bg-white/[0.03] transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 shrink-0">
                              更新源设置
                            </span>
                            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
                              {githubRepo.trim() || DEFAULT_GITHUB_REPO}
                              {!updateProxyUrl.trim()
                                ? " · 默认多节点加速"
                                : updateProxyUrl.trim().toLowerCase() === "direct" ||
                                    updateProxyUrl.trim() === "直连"
                                  ? " · 直连优先/自动兜底"
                                  : " · 自定义加速"}
                            </span>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
                              showSourceConfig ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        <Collapsible open={showSourceConfig}>
                          <div className="px-4 pb-4 pt-3 border-t border-zinc-200/70 dark:border-white/[0.07] space-y-3">
                            <div className="grid grid-cols-1 gap-3">
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                    <span>GitHub 仓库</span>
                                    <InfoTip content="选填，留空默认使用 MuY-DG/instrument-ledger；自定义格式为 用户名/仓库名。" />
                                  </label>
                                  {githubRepo.trim() !== "" && (
                                    <button
                                      type="button"
                                      onClick={() => setGithubRepo("")}
                                      className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                                    >
                                      恢复默认
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={githubRepo}
                                  onChange={(e) => setGithubRepo(e.target.value)}
                                  placeholder={DEFAULT_GITHUB_REPO}
                                  className={`${INPUT_CLS} font-mono text-xs`}
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                    <span>加速代理（检测与下载通用）</span>
                                    <InfoTip content="选填，留空默认启用内置多节点加速（优先 gh-proxy.com 等节点，异常时自动并发切换与回退 GitHub 直连）；支持逗号分隔多个自定义前缀，填写 direct 可切换为直连优先。" />
                                  </label>
                                  {updateProxyUrl.trim() !== "" && (
                                    <button
                                      type="button"
                                      onClick={() => setUpdateProxyUrl("")}
                                      className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                                    >
                                      恢复默认
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={updateProxyUrl}
                                  onChange={(e) => setUpdateProxyUrl(e.target.value)}
                                  placeholder="默认：内置 5 节点自动加速 + GitHub 直连（选填自定义前缀，多个用逗号分隔）"
                                  className={`${INPUT_CLS} ${updateProxyUrl ? "font-mono" : ""} text-xs`}
                                />
                                <p className="mt-1.5 text-[10.5px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                                  内置线路：
                                  <span className="font-mono">
                                    gh-proxy.com · ghfast.top · gh-proxy.org · cdn.gh-proxy.org · edgeone.gh-proxy.org · GitHub 直连
                                  </span>
                                  （全程 Ed25519 验签）
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <ActionStatusButton
                                size="sm"
                                variant="secondary"
                                status={generalSaveStatus}
                                disabled={savingGeneral}
                                idleLabel="保存"
                                loadingLabel="保存中..."
                                successLabel="已保存"
                                idleIcon={<Save className="h-3.5 w-3.5" />}
                                onClick={() => handleSaveGeneral()}
                              />
                            </div>
                          </div>
                        </Collapsible>
                      </div>
                    )}
                  </div>
                )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
    </ModalShell>

      {/* Sibling Password Confirmation Modal for App Reset */}
      <ModalShell
        open={resetDialogOpen}
        onClose={() => {
          if (!resettingApp) setResetDialogOpen(false);
        }}
        closeOnEsc={!resettingApp}
        zIndexClass="z-[80]"
        role="alertdialog"
        panelClassName="w-full max-w-md"
      >
        <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-rose-50/60 dark:bg-rose-500/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
              {hasData ? "备份并初始化" : "初始化程序"}
            </h3>
          </div>
          {!resettingApp && (
            <button
              type="button"
              onClick={() => setResetDialogOpen(false)}
              className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="p-6 space-y-4"
        >
          {hasData && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  备份目录
                </label>
                <div className="flex items-center gap-2.5">
                  {defaultDownloadsDir &&
                    resetBackupDir &&
                    resetBackupDir !== defaultDownloadsDir && (
                      <button
                        type="button"
                        disabled={resettingApp}
                        onClick={() => setResetBackupDir(defaultDownloadsDir)}
                        className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-50 transition"
                      >
                        恢复默认
                      </button>
                    )}
                  <button
                    type="button"
                    disabled={resettingApp}
                    onClick={handleChooseResetBackupDir}
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                  >
                    更改
                  </button>
                </div>
              </div>
              <div
                title={resetBackupDir || defaultDownloadsDir}
                className="px-3 py-2 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.03] text-xs font-mono text-zinc-600 dark:text-zinc-300 truncate"
              >
                {resetBackupDir || defaultDownloadsDir || "Downloads"}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              管理员密码
            </label>
            <div className="relative">
              <input
                ref={resetPwdRef}
                type={showResetPassword ? "text" : "password"}
                required
                disabled={resettingApp}
                value={resetPassword}
                onChange={(e) => {
                  setResetPassword(e.target.value);
                  setResetError("");
                }}
                placeholder="请输入管理员密码"
                className={`${INPUT_CLS} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowResetPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                tabIndex={-1}
              >
                {showResetPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {resetError && (
            <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3.5 py-2.5">
              {resetError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <motion.button
              type="button"
              disabled={resettingApp}
              whileTap={resettingApp ? undefined : TAP_SCALE}
              transition={SPRING_SNAPPY}
              onClick={() => setResetDialogOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
            >
              取消
            </motion.button>
            <HoldConfirmButton
              disabled={resettingApp || !resetPassword}
              loading={resettingApp}
              loadingLabel={hasData ? "正在备份并初始化..." : "正在初始化..."}
              idleLabel={hasData ? "按住备份并初始化" : "按住确认初始化"}
              holdingLabel="继续按住..."
              completedLabel="开始执行"
              holdDurationMs={1080}
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onConfirm={() => {
                void handleConfirmResetApp();
              }}
              className="py-2"
            />
          </div>
        </form>
      </ModalShell>
    </>
  );
};
