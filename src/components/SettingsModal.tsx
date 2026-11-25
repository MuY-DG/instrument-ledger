import React, { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  AppWindow,
  Archive,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
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
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { api, clearMediaCache } from "@/lib/api";
import { formatFileSize, getTodayStr } from "@/lib/status";
import { cn } from "@/lib/utils";
import { isMacPlatform } from "@/components/AuthLockModals";
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
  | "general"
  | "window"
  | "alerts"
  | "security"
  | "backup"
  | "update";

interface SettingsModalProps {
  openModal: boolean;
  initialTab?: SettingsTab;
  isAdmin: boolean;
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  openModal,
  initialTab = "general",
  isAdmin,
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

  // Security password form
  const [newUsername, setNewUsername] = useState(settings.adminUsername);
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

  useEffect(() => {
    if (!openModal) return;
    setTab(
      isAdmin ||
        initialTab === "window" ||
        initialTab === "alerts" ||
        initialTab === "update"
        ? initialTab
        : "window"
    );
    setAutoLockMinutes(settings.autoLockMinutes);
    setDocCode(settings.docCode);
    setDocVersion(settings.docVersion);
    setDocTitle(settings.docTitle);
    setDocSubtitle(settings.docSubtitle);
    setWeeklyNotice(settings.weeklyNotice);
    setGithubRepo(settings.githubRepo);
    setUpdateProxyUrl(settings.updateProxyUrl);
    setNewUsername(settings.adminUsername);
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
    if (settings.companyLogoPath) {
      api
        .getStoredImageDataUrl(settings.companyLogoPath)
        .then(setLogoPreview)
        .catch(() => setLogoPreview(""));
    } else {
      setLogoPreview("");
    }
  }, [openModal, initialTab, isAdmin, settings, availableUpdate]);

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
      await api.changeAdminPassword(oldPassword, newPassword, newUsername);
      const updated = await api.getSettings();
      onSettingsChanged(updated);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onNotify("管理员账号密码已更新", "success");
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

    const confirmed = window.confirm(
      "警告：从备份还原将用备份包中的数据完全覆盖当前台账、位置照片与校验报告！确定继续吗？"
    );
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
      keepAdminSession?: boolean;
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
    const ok = window.confirm(
      "确定关闭独立应用锁吗？关闭后将清除当前锁屏 PIN 码，之后可随时重新开启并设置新 PIN 码。"
    );
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
    { id: "general", label: "台账与表头", icon: <Settings className="h-3.5 w-3.5" />, adminOnly: true },
    { id: "window", label: "窗口与托盘", icon: <AppWindow className="h-3.5 w-3.5" /> },
    { id: "alerts", label: "到期预警设置", icon: <BellRing className="h-3.5 w-3.5" /> },
    { id: "security", label: "账号与锁屏", icon: <Shield className="h-3.5 w-3.5" />, adminOnly: true },
    { id: "backup", label: "本地备份还原", icon: <HardDrive className="h-3.5 w-3.5" />, adminOnly: true },
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
                {tab === "general" && isAdmin && (
                  <form onSubmit={handleSaveGeneral} className="space-y-5">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        表单编号 / 版本
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
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                        质量体系受控文件编号与修订版次，用于侧边栏副标题、打印抬头及 Excel 导出表头与默认文件名
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        台账主标题（用于界面、打印及 Excel 导出）
                      </label>
                      <input
                        type="text"
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        className={INPUT_CLS}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
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
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        导出 / 打印表头说明文案
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
                      <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        公司表头 Logo（选填，用于侧边栏、Excel 导出及打印抬头）
                      </div>
                      <div className="flex items-center gap-4">
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
                          {logoPreview ? "更换 Logo" : "上传 Logo"}
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
                        <span>{savingGeneral ? "保存中..." : "保存配置"}</span>
                      </button>
                    </div>
                  </form>
                )}

                {tab === "window" && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] space-y-1.5">
                      <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                        点击窗口关闭按钮时
                      </div>
                      <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {mac
                          ? "应用在 macOS 屏幕顶部菜单栏提供常驻图标。选择后台运行时，关闭主窗口不会结束进程，点击顶部菜单栏图标或 Dock 图标可随时重新打开。"
                          : "应用在 Windows 任务栏右下角系统托盘提供常驻图标。选择后台运行时，关闭主窗口不会结束进程，单击托盘图标即可快速唤出，右键菜单可锁定或退出。"}
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {(
                        [
                          {
                            id: "minimize_to_tray" as CloseBehavior,
                            title: mac
                              ? "最小化到顶部菜单栏（后台运行）"
                              : "最小化到右下角系统托盘（后台运行）",
                            badge: "推荐",
                            desc: mac
                              ? "仅隐藏主窗口并在后台保活，保留登录状态与周期性到期提醒，随时点击顶部图标或 Dock 图标秒开。"
                              : "仅隐藏主窗口并在右下角托盘保活，保留登录状态与周期性到期提醒，单击托盘图标秒开。",
                            icon: <MonitorDown className="h-4 w-4" />,
                          },
                          {
                            id: "exit" as CloseBehavior,
                            title: "直接退出程序",
                            badge: "",
                            desc: "点击关闭按钮时直接关闭窗口并完全结束程序进程，不留在系统托盘。",
                            icon: <Power className="h-4 w-4" />,
                          },
                          {
                            id: "ask" as CloseBehavior,
                            title: "每次关闭时弹窗询问",
                            badge: "",
                            desc: "每次点击关闭按钮时提示选择「隐藏到后台」或「直接退出」。",
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
                              "w-full text-left p-4 rounded-xl border transition flex items-start gap-3.5",
                              active
                                ? "border-zinc-900 dark:border-white/75 bg-zinc-50/90 dark:bg-white/[0.05] ring-1 ring-zinc-900/10 dark:ring-white/15"
                                : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.015] hover:bg-zinc-50/60 dark:hover:bg-white/[0.035]"
                            )}
                          >
                            <div
                              className={cn(
                                "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                                active
                                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950"
                                  : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400"
                              )}
                            >
                              {opt.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                                  {opt.title}
                                </span>
                                {opt.badge && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                                    {opt.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                                {opt.desc}
                              </p>
                            </div>
                            <div className="pt-1 shrink-0">
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

                {tab === "security" && isAdmin && (
                  <div className="space-y-5">
                    {/* 1. Admin Session Persistence */}
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            保持管理员登录状态
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                            个人电脑推荐
                          </span>
                        </div>
                        <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          开启后，即使完全退出软件再重新打开，也会自动保持管理员权限，无需反复输入密码；如需在公共电脑上防止他人编辑，关闭此项后将在下次启动时默认进入只读模式。
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.keepAdminSession}
                        disabled={savingSecurityPref}
                        onClick={() =>
                          handlePatchSecuritySetting(
                            { keepAdminSession: !settings.keepAdminSession },
                            !settings.keepAdminSession
                              ? "已开启管理员登录状态保持"
                              : "已关闭登录保持，下次退出重开后需重新登录管理员"
                          )
                        }
                        className={cn(
                          "relative inline-flex h-6 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors mt-0.5 cursor-pointer",
                          settings.keepAdminSession
                            ? "bg-zinc-900 dark:bg-white"
                            : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-zinc-950 shadow transform transition",
                            settings.keepAdminSession ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* 2. Independent App Lock (4-6 Digit PIN) */}
                    <div className="p-5 rounded-xl border border-zinc-200/85 dark:border-white/[0.09] bg-white dark:bg-white/[0.02] space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Lock className="h-4 w-4 text-indigo-500" />
                            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                              独立应用锁（快捷 PIN 码防窥）
                            </span>
                            {settings.appLockEnabled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/20 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                已开启 · {settings.appLockPinLength} 位 PIN 码
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
                                未开启
                              </span>
                            )}
                          </div>
                          <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            与管理员密码完全分离，专为临时离开工位防窥设计。解锁时输完 PIN 码自动秒开；忘记 PIN 码可通过管理员密码验证解除或重设。
                          </p>
                        </div>
                      </div>

                      {!settings.appLockEnabled ? (
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            默认关闭，开启时自定义 4~6 位纯数字 PIN 码
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenAppLockSetup?.("enable")}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition shrink-0"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>开启应用锁并设置 PIN 码</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* PIN Actions */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onOpenAppLockSetup?.("change")}
                              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-zinc-50/70 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                            >
                              修改 PIN 码
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
                              {disablingLock ? "关闭中..." : "关闭应用锁"}
                            </button>
                          </div>

                          {/* Independent Trigger Timings */}
                          <div className="pt-3 border-t border-zinc-200/75 dark:border-white/[0.07] space-y-3">
                            <div className="text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-200">
                              锁定触发时机（独立勾选）
                            </div>

                            <div className="flex items-center justify-between gap-3 py-1">
                              <div>
                                <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                  手动锁定
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  侧边栏锁图标、快捷键 ⌘/Ctrl + L 或{mac ? "顶部菜单栏" : "托盘右键菜单"}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
                                常驻可用
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 py-1">
                              <div>
                                <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                  无操作自动锁定
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  超过设定时长无鼠标/键盘活动时自动锁屏保护
                                </div>
                              </div>
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
                              <div>
                                <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                  隐藏到{mac ? "顶部菜单栏" : "系统托盘"}时自动锁定
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  点击关闭按钮最小化到后台时自动上锁，下次唤出需输入 PIN 码
                                </div>
                              </div>
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
                              <div>
                                <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                  启动程序时自动锁定
                                </div>
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  默认关闭；仅在希望每次打开软件都需输入 PIN 码时勾选（若锁屏状态下强制关闭，重开会自动保持锁定）
                                </div>
                              </div>
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

                    <form
                      onSubmit={handleChangePassword}
                      className="p-5 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] space-y-4"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        <KeyRound className="h-4 w-4 text-indigo-500" />
                        <span>修改管理员账号与密码</span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          管理员用户名
                        </label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={32}
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          当前原密码
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
                            新密码（至少 6 位）
                          </label>
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            确认新密码
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

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={savingPwd}
                          className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold transition"
                        >
                          {savingPwd ? "修改中..." : "确认更新凭据"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {tab === "backup" && isAdmin && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          本地 SQLite 与附件存储目录
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            api.openDataDir().catch((e) => onNotify(String(e), "error"))
                          }
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          打开本地目录
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 break-all bg-white dark:bg-[#0d0d10] px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-white/[0.07]">
                        {dirInfo?.dataDir || "加载中..."}
                      </div>
                      <div className="flex gap-6 text-xs text-zinc-600 dark:text-zinc-400 pt-1 font-mono tabular-nums">
                        <span>
                          SQLite 数据库：
                          <strong className="text-zinc-900 dark:text-zinc-100">
                            {formatFileSize(dirInfo?.dbSizeBytes || 0)}
                          </strong>
                        </span>
                        <span>
                          照片与报告：
                          <strong className="text-zinc-900 dark:text-zinc-100">
                            {formatFileSize(dirInfo?.attachmentsSizeBytes || 0)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-5 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-white/[0.02] flex flex-col justify-between gap-4">
                        <div>
                          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                            <Archive className="h-4 w-4" />
                          </div>
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                            导出完整本地备份
                          </h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                            将 SQLite 快照、位置照片及历年 PDF 校验报告打包为单个{" "}
                            <code className="font-mono">.zip</code> 文件，便于归档与迁移。
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={backingUp}
                          onClick={handleBackup}
                          className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold transition"
                        >
                          {backingUp ? "正在打包备份..." : "导出完整备份 (.zip)"}
                        </button>
                      </div>

                      <div className="p-5 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-white/[0.02] flex flex-col justify-between gap-4">
                        <div>
                          <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                            <RotateCcw className="h-4 w-4" />
                          </div>
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                            从备份包还原数据
                          </h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                            更换电脑或回滚数据时，导入之前导出的{" "}
                            <code className="font-mono">.zip</code> 备份包一键恢复全部记录与附件。
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={handleRestore}
                          className="w-full py-2 rounded-lg border border-zinc-300 dark:border-white/[0.14] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-50 text-zinc-800 dark:text-zinc-100 text-xs font-semibold transition"
                        >
                          {restoring ? "正在校验还原..." : "选择备份包并还原"}
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
                            当前安装版本
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
                        <span>{checkingUpdate ? "正在检查..." : "立即检查更新"}</span>
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
                              包含功能改进与稳定性优化，升级过程会自动保留本地台账数据与附件。
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

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              <span>自动校验 Ed25519 签名 · 保留本地台账与附件</span>
                            </span>
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
                                  ? "安装完成，正在重启..."
                                  : updateProgress?.phase === "installing"
                                    ? "正在校验签名并安装..."
                                    : updatingApp
                                      ? "正在下载更新包..."
                                      : "立即更新并重启"}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {updateResult && !updateResult.hasUpdate && (
                      <div className="px-4 py-3.5 rounded-xl bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] border border-emerald-500/20 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="text-xs text-zinc-700 dark:text-zinc-200">
                            当前已是最新版本{" "}
                            <span className="font-mono font-semibold text-zinc-950 dark:text-white">
                              v{updateResult.currentVersion}
                            </span>
                            ，无需更新。
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
                              更新源与加速代理配置
                            </span>
                            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
                              {githubRepo || "未配置仓库"}
                              {updateProxyUrl.trim() ? " · 代理加速" : " · 直连"}
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
                                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                  GitHub 仓库（格式：用户名/仓库名）
                                </label>
                                <input
                                  type="text"
                                  value={githubRepo}
                                  onChange={(e) => setGithubRepo(e.target.value)}
                                  placeholder="例如：MuY-DG/instrument-ledger"
                                  className={`${INPUT_CLS} font-mono text-xs`}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                  下载加速代理前缀（选填，国内网络直连较慢时填写）
                                </label>
                                <input
                                  type="text"
                                  value={updateProxyUrl}
                                  onChange={(e) => setUpdateProxyUrl(e.target.value)}
                                  placeholder="例如：https://gh-proxy.com/（留空则直连 GitHub）"
                                  className={`${INPUT_CLS} font-mono text-xs`}
                                />
                                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                  默认使用 <span className="font-mono">https://gh-proxy.com/</span>，可按需修改（如{" "}
                                  <span className="font-mono">https://ghfast.top/</span>、{" "}
                                  <span className="font-mono">https://gh-proxy.org/</span>）或清空以直连 GitHub；若代理不可用将自动回退直连。
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleSaveGeneral()}
                                className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.12] hover:bg-zinc-50 dark:hover:bg-white/[0.06] text-zinc-800 dark:text-zinc-200 text-xs font-medium transition"
                              >
                                保存更新源
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
