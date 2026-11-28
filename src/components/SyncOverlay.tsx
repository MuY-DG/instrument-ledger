import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Cloud,
  CloudDownload,
  CloudUpload,
  HardDrive,
  Loader2,
  Lock,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { ModalShell } from "@/components/ui/MotionPrimitives";
import {
  ActionStatusButton,
  HoldConfirmButton,
} from "@/components/ui/InteractiveControls";
import type { SyncProgressEvent, SyncStatusResult } from "@/types";

export function formatSyncTime(raw?: string | null): string {
  if (!raw || !raw.trim()) return "尚未同步";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface SyncBannerToastProps {
  open: boolean;
  status: SyncStatusResult | null;
  syncing: boolean;
  progress: SyncProgressEvent | null;
  offsetForUpdateBanner?: boolean;
  onPullNow: () => void;
  onOpenConflict: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export const SyncBannerToast: React.FC<SyncBannerToastProps> = ({
  open,
  status,
  syncing,
  progress,
  offsetForUpdateBanner = false,
  onPullNow,
  onOpenConflict,
  onOpenSettings,
  onDismiss,
}) => {
  const isConflict = status?.state === "conflict";
  const isRemoteAhead = status?.state === "remote_ahead";
  const hasPassError = Boolean(status?.passphraseError);
  const visible =
    open && Boolean(status) && (isRemoteAhead || isConflict || hasPassError);

  const pct = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));

  return (
    <AnimatePresence>
      {visible && status && (
        <motion.aside
          key="sync-slide-toast"
          initial={{ opacity: 0, x: 112, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 112, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 360, damping: 32 }}
          className={cn(
            "fixed right-5 z-40 w-[364px] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200/90 dark:border-white/[0.12] bg-white dark:bg-zinc-900 shadow-modal-light dark:shadow-elevated overflow-hidden no-print",
            offsetForUpdateBanner
              ? "top-[calc(var(--titlebar-h,0px)+16.5rem)]"
              : "top-[calc(var(--titlebar-h,0px)+4rem)]"
          )}
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "h-[2px] w-full",
              isConflict || hasPassError
                ? "bg-gradient-to-r from-amber-500 via-orange-400 to-rose-500"
                : "bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400"
            )}
          />

          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={cn(
                    "mt-0.5 h-8 w-8 rounded-xl border flex items-center justify-center shrink-0",
                    isConflict || hasPassError
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                  )}
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isConflict || hasPassError ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Cloud className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-zinc-950 dark:text-white tracking-tight">
                      {hasPassError
                        ? "云端加密口令异常"
                        : isConflict
                          ? "检测到同步冲突"
                          : "云端台账有新版本"}
                    </span>
                    {status.remoteRevision !== null && (
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-mono text-[11px] font-semibold">
                        r{status.remoteRevision}
                      </span>
                    )}
                    {status.remoteEncrypted && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium"
                        title="端到端加密"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        <span>加密</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    {hasPassError ? status.passphraseError : status.summary}
                  </p>
                  {status.remoteDeviceName && status.remoteUpdatedAt && (
                    <div className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-500 mt-1 truncate">
                      {status.remoteDeviceName} · {formatSyncTime(status.remoteUpdatedAt)}
                      {status.remoteInstrumentCount !== null &&
                        ` · ${status.remoteInstrumentCount} 台设备`}
                    </div>
                  )}
                </div>
              </div>

              {!syncing && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition shrink-0"
                  title="暂不处理"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {syncing && progress && (
              <div className="space-y-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate">
                    {progress.message || "正在同步..."}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-200/90 dark:bg-white/10 overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="h-full rounded-full bg-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                disabled={syncing}
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition"
              >
                <Settings className="h-3 w-3" />
                <span>同步设置</span>
              </button>

              <div className="flex items-center gap-1.5">
                {!syncing && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition"
                  >
                    稍后
                  </button>
                )}

                {hasPassError ? (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold transition"
                  >
                    去填写口令
                  </button>
                ) : isConflict ? (
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={onOpenConflict}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold transition"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>处理冲突</span>
                  </button>
                ) : (
                  <ActionStatusButton
                    size="sm"
                    status={syncing ? "loading" : "idle"}
                    disabled={syncing}
                    idleLabel="立即拉取"
                    loadingLabel="拉取中..."
                    successLabel="已更新"
                    idleIcon={<CloudDownload className="h-3.5 w-3.5" />}
                    onClick={onPullNow}
                  />
                )}
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

interface SyncConflictModalProps {
  open: boolean;
  status: SyncStatusResult | null;
  syncing: boolean;
  progress: SyncProgressEvent | null;
  onClose: () => void;
  onResolvePull: () => void;
  onResolvePush: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  open,
  status,
  syncing,
  progress,
  onClose,
  onResolvePull,
  onResolvePush,
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));

  return (
    <ModalShell
      open={open && Boolean(status)}
      onClose={syncing ? () => {} : onClose}
      closeOnEsc={!syncing}
      zIndexClass="z-[95]"
      panelClassName="w-full max-w-lg"
    >
      {status && (
        <div className="flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-amber-500/[0.05] dark:bg-amber-500/[0.06] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                  本机与云端存在不同版本
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  请选择要保留哪一端作为最新台账；为防误操作，需按住按钮确认
                </p>
              </div>
            </div>
            {!syncing && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="p-6 space-y-4">
            {/* Side-by-side Version Comparison */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-zinc-50/80 dark:bg-white/[0.025] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white">
                    <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
                    <span>本机当前数据</span>
                  </span>
                  {status.lastSyncedRev > 0 && (
                    <span className="text-[10.5px] font-mono text-zinc-400">
                      基于 r{status.lastSyncedRev}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-700 dark:text-zinc-200 font-mono tabular-nums">
                  {status.localInstrumentCount} 台设备 · {status.localReportCount} 份报告
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  上次同步：{formatSyncTime(status.lastSyncedAt)}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-500/25 bg-indigo-50/45 dark:bg-indigo-500/[0.05] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white">
                    <Cloud className="h-3.5 w-3.5 text-indigo-500" />
                    <span>云端最新版本</span>
                  </span>
                  {status.remoteRevision !== null && (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-[10.5px] font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                      r{status.remoteRevision}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-700 dark:text-zinc-200 font-mono tabular-nums">
                  {status.remoteInstrumentCount ?? 0} 台设备 ·{" "}
                  {status.remoteReportCount ?? 0} 份报告
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {status.remoteDeviceName || "另一台设备"} ·{" "}
                  {formatSyncTime(status.remoteUpdatedAt)}
                </div>
              </div>
            </div>

            {status.passphraseError && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/[0.07] border border-rose-500/25 text-xs text-rose-600 dark:text-rose-400">
                {status.passphraseError}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20 px-3.5 py-2.5 text-[11.5px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                安全保护：选择「拉取云端覆盖本地」前，系统会自动将当前本地台账另存为{" "}
                <span className="font-mono">.zip</span> 备份至{" "}
                <span className="font-mono">data/sync_backups/</span>，且保留本地工具台图纸缓存。
              </span>
            </div>

            {syncing && progress && (
              <div className="space-y-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] px-3.5 py-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate">
                    {progress.message}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Resolution Actions */}
            <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={syncing}
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition"
              >
                暂不处理
              </button>

              <div className="inline-flex items-center gap-1.5">
                <HoldConfirmButton
                  disabled={syncing}
                  loading={syncing}
                  onConfirm={onResolvePush}
                  variant="danger"
                  icon={<CloudUpload className="h-3.5 w-3.5" />}
                  idleLabel="按住以本地覆盖云端"
                  holdingLabel="继续按住覆盖云端..."
                  loadingLabel="推送中..."
                  className="px-3.5 py-2 rounded-xl text-xs"
                />
              </div>

              <div className="inline-flex items-center gap-1.5">
                <HoldConfirmButton
                  disabled={syncing || Boolean(status.passphraseError)}
                  loading={syncing}
                  onConfirm={onResolvePull}
                  variant="primary"
                  icon={<CloudDownload className="h-3.5 w-3.5" />}
                  idleLabel="按住拉取云端覆盖本地"
                  holdingLabel="继续按住拉取覆盖..."
                  loadingLabel="拉取中..."
                  className="px-3.5 py-2 rounded-xl text-xs"
                />
                <InfoTip content="覆盖前会自动在本地保存一份备份 ZIP，可随时还原。" />
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
};
