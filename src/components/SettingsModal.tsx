import React, { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { api, clearMediaCache } from "@/lib/api";
import { formatFileSize, getTodayStr } from "@/lib/status";
import type {
  AppSettings,
  DataDirInfo,
  UpdateCheckResult,
  UpdateDownloadProgress,
} from "@/types";

type SettingsTab = "general" | "security" | "backup" | "update";

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
}

const INPUT_CLS =
  "w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition";

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
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  // General form
  const [warningDays, setWarningDays] = useState(settings.warningDays);
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

  useEffect(() => {
    if (!openModal) return;
    setTab(isAdmin ? initialTab : "update");
    setWarningDays(settings.warningDays);
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
        warningDays: Number(warningDays) || 30,
        autoLockMinutes: Number(autoLockMinutes) || 0,
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
      if (!res.hasUpdate) {
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

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
  }> = [
    { id: "general", label: "台账与表头", icon: <Settings className="h-3.5 w-3.5" />, adminOnly: true },
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
                  {isAdmin ? "系统偏好与维护中心" : "软件版本与更新检查"}
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
                      <span>{t.label}</span>
                    </button>
                  ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {tab === "general" && isAdmin && (
                  <form onSubmit={handleSaveGeneral} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          即将到期提前提醒（天）
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={warningDays}
                          onChange={(e) => setWarningDays(Number(e.target.value))}
                          className={`${INPUT_CLS} font-mono`}
                        />
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                          距下次校验 ≤ 该天数时自动归入「即将到期」视图
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          表单编号 / 版本
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={docCode}
                            onChange={(e) => setDocCode(e.target.value)}
                            placeholder="JSSK-MPR-170"
                            className={`${INPUT_CLS} flex-1 font-mono`}
                          />
                          <input
                            type="text"
                            value={docVersion}
                            onChange={(e) => setDocVersion(e.target.value)}
                            placeholder="A"
                            className={`${INPUT_CLS} w-16 font-mono text-center`}
                          />
                        </div>
                      </div>
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

                {tab === "security" && isAdmin && (
                  <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] space-y-3">
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        全屏应用锁自动锁定策略
                      </div>
                      <div className="flex items-center gap-3">
                        <select
                          value={autoLockMinutes}
                          onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                          className={`${INPUT_CLS} max-w-xs dark:bg-[#141418]`}
                        >
                          <option value={0}>仅手动锁屏（快捷键 ⌘/Ctrl + L）</option>
                          <option value={5}>无操作 5 分钟自动锁屏</option>
                          <option value={10}>无操作 10 分钟自动锁屏</option>
                          <option value={15}>无操作 15 分钟自动锁屏</option>
                          <option value={30}>无操作 30 分钟自动锁屏</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSaveGeneral()}
                          className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold transition"
                        >
                          应用
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        管理员登录状态下超过设定时间无鼠标/键盘活动时，自动遮罩锁屏保护数据安全
                      </p>
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
                  <div className="space-y-5">
                    <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between">
                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          当前安装版本
                        </div>
                        <div className="text-lg font-semibold font-mono tabular-nums text-zinc-950 dark:text-white mt-0.5">
                          v{dirInfo?.appVersion || "1.2.0"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={checkingUpdate}
                        onClick={handleCheckUpdate}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${checkingUpdate ? "animate-spin" : ""}`}
                        />
                        <span>{checkingUpdate ? "正在检查..." : "立即检查更新"}</span>
                      </button>
                    </div>

                    {isAdmin && (
                      <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] space-y-3">
                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          GitHub Releases 更新源配置
                        </div>
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

                    {updateError && (
                      <div className="p-3.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
                        {updateError}
                      </div>
                    )}

                    {updateResult && (
                      <div
                        className={`p-5 rounded-xl border space-y-3 ${
                          updateResult.hasUpdate
                            ? "bg-indigo-500/[0.05] border-indigo-500/25"
                            : "bg-emerald-500/[0.05] border-emerald-500/25"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {updateResult.hasUpdate ? (
                              <CloudDownload className="h-4.5 w-4.5 text-indigo-500" />
                            ) : (
                              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                            )}
                            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                              {updateResult.hasUpdate
                                ? `发现新版本 v${updateResult.latestVersion}`
                                : `已是最新版本 v${updateResult.currentVersion}`}
                            </span>
                          </div>
                          {updateResult.htmlUrl && (
                            <button
                              type="button"
                              onClick={() => openUrl(updateResult.htmlUrl)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              <span>查看 Release</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {updateResult.releaseNotes && (
                          <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-white/80 dark:bg-black/30 p-3 rounded-lg border border-zinc-200/80 dark:border-white/[0.08] whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                            {updateResult.releaseNotes}
                          </pre>
                        )}

                        {updateResult.hasUpdate && (
                          <div className="space-y-2.5 pt-1">
                            {updatingApp && updateProgress && (
                              <div className="space-y-1.5">
                                <div className="flex justify-between gap-2 text-[11px] text-zinc-500 font-mono tabular-nums">
                                  <span className="truncate font-sans text-indigo-700 dark:text-indigo-300 font-medium">
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
                                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                                  {updateProgress.total > 0 ||
                                  updateProgress.phase === "installing" ||
                                  updateProgress.phase === "restarting" ? (
                                    <div
                                      className="h-full bg-indigo-500 transition-all duration-150"
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
                                    <div className="h-full w-1/3 bg-indigo-500 rounded-full animate-pulse" />
                                  )}
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={updatingApp}
                              onClick={handleDownloadUpdate}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold transition"
                            >
                              <CloudDownload className="h-3.5 w-3.5" />
                              <span>
                                {updateProgress?.phase === "restarting"
                                  ? "安装完成，正在重启..."
                                  : updateProgress?.phase === "installing"
                                    ? "正在校验签名并安装..."
                                    : updatingApp
                                      ? "正在下载更新包..."
                                      : `立即下载并重启更新 (${updateResult.assetName || "新版"})`}
                              </span>
                            </button>
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
