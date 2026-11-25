import React, { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  AppWindow,
  Archive,
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  Edit3,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Lock,
  MonitorDown,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api, clearMediaCache } from "@/lib/api";
import { formatFileSize, getTodayStr } from "@/lib/status";
import { cn } from "@/lib/utils";
import { isMacPlatform } from "@/components/AuthLockModals";
import { confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import { MarkdownNotes } from "@/components/MarkdownNotes";
import { ThresholdSettingsEditor } from "@/components/ThresholdSettingsEditor";
import type {
  AppSettings,
  CloseBehavior,
  DataDirInfo,
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
  settings: AppSettings;
  availableUpdate?: UpdateCheckResult | null;
  updatingApp?: boolean;
  updateProgress?: UpdateDownloadProgress | null;
  onUpdateDetected?: (res: UpdateCheckResult) => void;
  onTriggerInstallUpdate?: (repoOverride?: string, proxyOverride?: string) => Promise<void>;
  onClose: () => void;
  onSettingsChanged: (next: AppSettings) => void;
  onDataRestored: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
  onRequestLogin?: () => void;
  onOpenAppLockSetup?: (mode: "enable" | "change") => void;
  onLockNow?: () => void;
  onDisableAppLock?: () => Promise<void>;
}

const INPUT_CLS =
  "w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition";

function formatPublishDate(raw: string): string {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function formatSessionBadge(expiresAt?: string | null): string {
  if (!expiresAt) return "本次有效";
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "已过期";
  const hours = diffMs / (60 * 60 * 1000);
  if (hours < 24) return `剩 ${Math.max(1, Math.ceil(hours))} 小时`;
  return `剩 ${Math.ceil(hours / 24)} 天`;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  openModal,
  initialTab = "account",
  isAdmin,
  adminSessionExpiresAt = null,
  settings,
  availableUpdate = null,
  updatingApp = false,
  updateProgress = null,
  onUpdateDetected,
  onTriggerInstallUpdate,
  onClose,
  onSettingsChanged,
  onDataRestored,
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
  const [githubRepo, setGithubRepo] = useState(settings.githubRepo);
  const [updateProxyUrl, setUpdateProxyUrl] = useState(settings.updateProxyUrl);
  const [logoPreview, setLogoPreview] = useState("");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Account showcase & edit state
  const [avatarPreview, setAvatarPreview] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileUsername, setProfileUsername] = useState(settings.adminUsername);
  const [profileTitle, setProfileTitle] = useState(settings.adminTitle || "系统管理员");
  const [savingProfile, setSavingProfile] = useState(false);

  const [editingPassword, setEditingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Backup / storage info
  const [dirInfo, setDirInfo] = useState<DataDirInfo | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

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
      setEditingPassword(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setUpdateError("");
      if (availableUpdate) {
        setUpdateResult(availableUpdate);
        setShowSourceConfig(!availableUpdate.hasUpdate);
      } else {
        setShowSourceConfig(true);
      }
      api.getDataDirInfo().then(setDirInfo).catch(() => {});
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
    setGithubRepo(settings.githubRepo);
    setUpdateProxyUrl(settings.updateProxyUrl);
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
      onNotify("系统配置已保存", "success");
    } catch (err) {
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
    const dest = await save({
      title: "保存本地完整备份包",
      defaultPath: `仪器台账备份_${getTodayStr()}.zip`,
      filters: [{ name: "ZIP 备份包", extensions: ["zip"] }],
    });
    if (!dest) return;
    setBackingUp(true);
    try {
      const res = await api.createLocalBackup(dest);
      onNotify(
        `备份成功！共打包 ${res.instrumentCount} 台设备、${res.reportCount} 份报告（${formatFileSize(res.sizeBytes)}）`,
        "success"
      );
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setBackingUp(false);
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
      destructive: true,
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
    setUpdateError("");
    setUpdateResult(null);
    try {
      const res = await api.checkForUpdates(githubRepo, updateProxyUrl);
      setUpdateResult(res);
      onUpdateDetected?.(res);
      if (res.hasUpdate) {
        setShowSourceConfig(false);
      } else {
        onNotify(`当前已是最新版本 v${res.currentVersion}`, "success");
      }
    } catch (err) {
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
      destructive: true,
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
    <AnimatePresence>
      {openModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-zinc-950/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-3xl h-[78vh] bg-white dark:bg-[#111114] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
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
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex min-h-0">
              {/* Sidebar Tabs */}
              <div className="w-44 border-r border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/50 dark:bg-[#0d0d10] p-3 space-y-1 shrink-0">
                {tabs
                  .filter((t) => !t.adminOnly || isAdmin)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                        tab === t.id
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-hairline"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      {t.icon}
                      <span className="flex-1 text-left">{t.label}</span>
                      {t.id === "update" && (availableUpdate?.hasUpdate || updateResult?.hasUpdate) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                      )}
                    </button>
                  ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {tab === "account" && isAdmin && (
                  <div className="space-y-4">
                    {/* Profile Showcase Hero Card with Cover Background */}
                    <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#141418] shadow-surface overflow-hidden">
                      {/* Architectural Cover Banner */}
                      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-slate-100 via-indigo-50/90 to-sky-100/80 dark:from-[#161829] dark:via-[#11121a] dark:to-[#1b1730] border-b border-zinc-200/70 dark:border-white/[0.07]">
                        <div className="absolute inset-0 bg-precision-grid-light dark:bg-precision-grid pointer-events-none" />
                        <div className="absolute -top-12 -left-10 h-40 w-40 rounded-full bg-indigo-400/20 dark:bg-indigo-500/20 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-14 right-8 h-44 w-44 rounded-full bg-sky-400/20 dark:bg-sky-500/15 blur-3xl pointer-events-none" />

                        {/* Subtle Precision Dial Watermark */}
                        <svg
                          viewBox="0 0 180 180"
                          className="absolute -right-8 -top-8 h-44 w-44 text-zinc-900/[0.05] dark:text-white/[0.06] pointer-events-none"
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
                        <div className="absolute top-3.5 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 dark:bg-white/[0.08] backdrop-blur-md border border-zinc-200/80 dark:border-white/[0.1] text-[11px] font-medium text-zinc-700 dark:text-zinc-200 shadow-hairline">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>在线 · {formatSessionBadge(adminSessionExpiresAt)}</span>
                        </div>
                      </div>

                      {/* Avatar + Identity Bar */}
                      <div className="px-5 pb-5">
                        <div className="flex items-end justify-between gap-3 -mt-10">
                          {/* Avatar with Upload Overlay */}
                          <div className="relative group shrink-0">
                            <button
                              type="button"
                              onClick={handleUploadAvatar}
                              title="更换头像"
                              className="relative h-20 w-20 rounded-full ring-4 ring-white dark:ring-[#141418] shadow-elevated overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-700 dark:from-indigo-500 dark:to-sky-500 text-white flex items-center justify-center focus:outline-none"
                            >
                              {avatarPreview ? (
                                <img
                                  src={avatarPreview}
                                  alt="头像"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-2xl font-semibold uppercase tracking-tight">
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
                      <button
                        type="submit"
                        disabled={savingGeneral}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{savingGeneral ? "保存中..." : "保存"}</span>
                      </button>
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
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/20 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300">
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
                              <select
                                value={autoLockMinutes}
                                disabled={savingSecurityPref}
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  setAutoLockMinutes(next);
                                  handlePatchSecuritySetting(
                                    { autoLockMinutes: next },
                                    next > 0
                                      ? `已设置无操作 ${next} 分钟自动锁定`
                                      : "已关闭无操作自动锁定"
                                  );
                                }}
                                className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#141418] text-zinc-800 dark:text-zinc-200 focus:outline-none"
                              >
                                <option value={0}>关闭</option>
                                <option value={5}>5 分钟</option>
                                <option value={10}>10 分钟</option>
                                <option value={15}>15 分钟</option>
                                <option value={30}>30 分钟</option>
                              </select>
                            </div>

                            <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                隐藏到{mac ? "菜单栏" : "托盘"}时自动锁定
                              </span>
                              <input
                                type="checkbox"
                                checked={settings.lockOnHide}
                                disabled={savingSecurityPref}
                                onChange={(e) =>
                                  handlePatchSecuritySetting(
                                    { lockOnHide: e.target.checked },
                                    e.target.checked
                                      ? "已开启最小化到后台自动锁定"
                                      : "已关闭最小化到后台自动锁定"
                                  )
                                }
                                className="h-4 w-4 accent-zinc-900 dark:accent-white"
                              />
                            </label>

                            <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                <span>启动程序时自动锁定</span>
                                <InfoTip content="锁屏状态下强制关闭时，下次重启会自动保持锁定。" />
                              </span>
                              <input
                                type="checkbox"
                                checked={settings.lockOnStartup}
                                disabled={savingSecurityPref}
                                onChange={(e) =>
                                  handlePatchSecuritySetting(
                                    { lockOnStartup: e.target.checked },
                                    e.target.checked
                                      ? "已开启启动程序时自动锁定"
                                      : "已关闭启动程序时自动锁定"
                                  )
                                }
                                className="h-4 w-4 accent-zinc-900 dark:accent-white"
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {tab === "backup" && isAdmin && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          本地数据目录
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            api.openDataDir().catch((e) => onNotify(String(e), "error"))
                          }
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          打开目录
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 break-all bg-white dark:bg-[#0d0d10] px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-white/[0.07]">
                        {dirInfo?.dataDir || "加载中..."}
                      </div>
                      <div className="flex gap-6 text-xs text-zinc-600 dark:text-zinc-400 pt-1 font-mono tabular-nums">
                        <span>
                          数据库：
                          <strong className="text-zinc-900 dark:text-zinc-100">
                            {formatFileSize(dirInfo?.dbSizeBytes || 0)}
                          </strong>
                        </span>
                        <span>
                          附件：
                          <strong className="text-zinc-900 dark:text-zinc-100">
                            {formatFileSize(dirInfo?.attachmentsSizeBytes || 0)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-white/[0.02] flex flex-col justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Archive className="h-4 w-4" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                              导出备份
                            </h4>
                            <InfoTip content="将数据库、位置照片及校验报告打包为单个 .zip 文件，便于归档与迁移。" />
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={backingUp}
                          onClick={handleBackup}
                          className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold transition"
                        >
                          {backingUp ? "备份中..." : "导出"}
                        </button>
                      </div>

                      <div className="p-4 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-white/[0.02] flex flex-col justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <RotateCcw className="h-4 w-4" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                              还原备份
                            </h4>
                            <InfoTip content="导入之前导出的 .zip 备份包恢复全部记录与附件（将覆盖当前数据）。" />
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={handleRestore}
                          className="w-full py-2 rounded-lg border border-zinc-300 dark:border-white/[0.14] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-50 text-zinc-800 dark:text-zinc-100 text-xs font-semibold transition"
                        >
                          {restoring ? "还原中..." : "还原"}
                        </button>
                      </div>
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
                              v{dirInfo?.appVersion || "1.2.1"}
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
                      <button
                        type="button"
                        disabled={checkingUpdate || updatingApp}
                        onClick={handleCheckUpdate}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition shrink-0"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${checkingUpdate ? "animate-spin" : ""}`}
                        />
                        <span>{checkingUpdate ? "检查中..." : "检查更新"}</span>
                      </button>
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
                          <div className="text-xs text-zinc-700 dark:text-zinc-200">
                            已是最新版本{" "}
                            <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                              v{updateResult.currentVersion}
                            </span>
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
                              {githubRepo || "未配置仓库"}
                              {updateProxyUrl.trim() ? " · 代理" : " · 直连"}
                            </span>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
                              showSourceConfig ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {showSourceConfig && (
                          <div className="px-4 pb-4 pt-3 border-t border-zinc-200/70 dark:border-white/[0.07] space-y-3">
                            <div className="grid grid-cols-1 gap-3">
                              <div>
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                  <span>GitHub 仓库</span>
                                  <InfoTip content="格式：用户名/仓库名，如 MuY-DG/instrument-ledger" />
                                </label>
                                <input
                                  type="text"
                                  value={githubRepo}
                                  onChange={(e) => setGithubRepo(e.target.value)}
                                  placeholder="用户名/仓库名"
                                  className={`${INPUT_CLS} font-mono text-xs`}
                                />
                              </div>
                              <div>
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                  <span>加速代理</span>
                                  <InfoTip content="选填，默认 https://gh-proxy.com/，留空则直连 GitHub；代理不可用时自动回退直连。" />
                                </label>
                                <input
                                  type="text"
                                  value={updateProxyUrl}
                                  onChange={(e) => setUpdateProxyUrl(e.target.value)}
                                  placeholder="留空则直连 GitHub"
                                  className={`${INPUT_CLS} font-mono text-xs`}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleSaveGeneral()}
                                className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.12] hover:bg-zinc-50 dark:hover:bg-white/[0.06] text-zinc-800 dark:text-zinc-200 text-xs font-medium transition"
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
