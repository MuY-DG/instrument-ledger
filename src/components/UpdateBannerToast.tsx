import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CloudDownload,
  ExternalLink,
  Loader2,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatFileSize } from "@/lib/status";
import { InfoTip } from "@/components/InfoTip";
import { MarkdownNotes } from "@/components/MarkdownNotes";
import type { UpdateCheckResult, UpdateDownloadProgress } from "@/types";

interface UpdateBannerToastProps {
  open: boolean;
  update: UpdateCheckResult | null;
  updating: boolean;
  progress: UpdateDownloadProgress | null;
  onUpdateNow: () => void;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export const UpdateBannerToast: React.FC<UpdateBannerToastProps> = ({
  open,
  update,
  updating,
  progress,
  onUpdateNow,
  onDismiss,
  onOpenSettings,
}) => {
  const visible = open && Boolean(update?.hasUpdate);
  const phase = progress?.phase || "downloading";
  const isInstallingOrRestarting = phase === "installing" || phase === "restarting";
  const pct = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
  const hasKnownTotal = (progress?.total ?? 0) > 0;

  return (
    <AnimatePresence>
      {visible && update && (
        <motion.aside
          key="update-slide-toast"
          initial={{ opacity: 0, x: 112, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 112, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 360, damping: 32 }}
          className="fixed top-16 right-5 z-40 w-[364px] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200/90 dark:border-white/[0.12] bg-white dark:bg-zinc-900 shadow-modal-light dark:shadow-elevated overflow-hidden"
          role="status"
          aria-live="polite"
        >
          {/* Subtle top accent hairline */}
          <div className="h-[2px] w-full bg-gradient-to-r from-sky-500/80 via-cyan-400/70 to-emerald-400/70" />

          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 h-8 w-8 rounded-xl bg-zinc-100 dark:bg-white/[0.07] border border-zinc-200/80 dark:border-white/[0.1] text-zinc-900 dark:text-white flex items-center justify-center shrink-0">
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-zinc-950 dark:text-white tracking-tight">
                      发现新版本
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 font-mono text-[11px] font-semibold">
                      v{update.latestVersion}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                    <span>当前 v{update.currentVersion}</span>
                    <InfoTip content="更新会自动校验签名并在安装后重启，保留本地数据与附件。" />
                  </div>
                </div>
              </div>

              {!isInstallingOrRestarting && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition shrink-0"
                  title="暂不更新（可在左侧边栏随时再次打开）"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Rendered Markdown Release Notes Preview */}
            {update.releaseNotes.trim() && !updating && (
              <div className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.035] border border-zinc-200/75 dark:border-white/[0.07] px-3 py-2.5 max-h-32 overflow-y-auto">
                <MarkdownNotes content={update.releaseNotes} compact />
              </div>
            )}

            {/* Live Progress Bar when Updating */}
            {updating && (
              <div className="space-y-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate">
                    {progress?.message || "正在连接更新源..."}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                    {isInstallingOrRestarting
                      ? "100%"
                      : hasKnownTotal
                        ? `${pct}%`
                        : progress?.downloaded
                          ? formatFileSize(progress.downloaded)
                          : "..."}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-200/90 dark:bg-white/10 overflow-hidden">
                  {hasKnownTotal || isInstallingOrRestarting ? (
                    <motion.div
                      initial={false}
                      animate={{ width: `${isInstallingOrRestarting ? 100 : pct}%` }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="h-full rounded-full bg-sky-500"
                    />
                  ) : (
                    <div className="h-full w-1/3 rounded-full bg-sky-500 animate-pulse" />
                  )}
                </div>
                {hasKnownTotal && !isInstallingOrRestarting && progress && (
                  <div className="text-[10.5px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 text-right">
                    {formatFileSize(progress.downloaded)} / {formatFileSize(progress.total)}
                  </div>
                )}
              </div>
            )}

            {/* Footer Action Row */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1">
                {update.htmlUrl && (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => openUrl(update.htmlUrl)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition"
                    title="在浏览器查看更新日志"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>日志</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={updating}
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition"
                  title="打开更新源与代理设置"
                >
                  <Settings className="h-3 w-3" />
                  <span>设置</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {!updating && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition"
                  >
                    稍后
                  </button>
                )}
                <button
                  type="button"
                  disabled={updating}
                  onClick={onUpdateNow}
                  className="btn-sheen btn-tactile inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-60 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary"
                >
                  {updating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CloudDownload className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {phase === "restarting"
                      ? "重启中..."
                      : phase === "installing"
                        ? "安装中..."
                        : updating
                          ? "下载中..."
                          : "立即更新"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
