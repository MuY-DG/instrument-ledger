import React, { useEffect, useLayoutEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion } from "motion/react";
import { Cloud, Copy, Loader2, Minus, PanelLeft, Search, Square, X } from "lucide-react";
import { isMacPlatform } from "@/components/AuthLockModals";
import { MorphTooltip } from "@/components/ui/MorphTooltip";
import { useI18n } from "@/lib/i18n";
import { SPRING_SNAPPY, TAP_SCALE_ICON } from "@/lib/motion";
import { isTauriEnvironment } from "@/lib/themeTransition";
import { cn } from "@/lib/utils";
import type { SyncState } from "@/types";

interface WindowTitleBarProps {
  /** Keep only the window controls during initial onboarding */
  minimalDragOnly?: boolean;
  /** Hide interactive buttons (e.g., booting or locked) while keeping the top chrome height */
  hideActions?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
  /** Top-left Cloud Sync trigger (Admin) */
  showSync?: boolean;
  syncing?: boolean;
  syncReady?: boolean;
  syncState?: SyncState | null;
  syncHasPassphraseError?: boolean;
  syncTooltip?: string;
  onSyncClick?: () => void;
  /** Effective WebView zoom factor so macOS traffic-light safe inset never overlaps icons */
  uiZoom?: number;
}

const TOPBAR_HEIGHT_PX = 38;

export function isTauriMacDesktop(): boolean {
  return isTauriEnvironment() && isMacPlatform();
}

export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({
  minimalDragOnly = false,
  hideActions = false,
  sidebarCollapsed = false,
  onToggleSidebar,
  onOpenSearch,
  showSync = false,
  syncing = false,
  syncReady = false,
  syncState = null,
  syncHasPassphraseError = false,
  syncTooltip,
  onSyncClick,
  uiZoom = 1,
}) => {
  const { t } = useI18n();
  const [isMacDesktop] = useState(isTauriMacDesktop);
  const [isWindowsDesktop] = useState(
    () => isTauriEnvironment() && /Windows/i.test(navigator.userAgent)
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);
  const modKey = isMacPlatform() ? "⌘" : "Ctrl+";

  useEffect(() => {
    if (!isMacDesktop && !isWindowsDesktop) return;

    const appWindow = getCurrentWindow();
    if (isMacDesktop) appWindow.setTitleBarStyle("overlay").catch(() => {});

    let active = true;
    const syncWindowState = () => {
      appWindow
        .isFullscreen()
        .then((fs) => {
          if (active) setIsFullscreen(fs);
        })
        .catch(() => {});
      if (isWindowsDesktop) {
        appWindow
          .isMaximized()
          .then((maximized) => {
            if (active) setIsMaximized(maximized);
          })
          .catch(() => {});
      }
    };

    syncWindowState();

    const unlistenResize = appWindow.onResized(syncWindowState);
    const unlistenFocus = isMacDesktop ? appWindow.onFocusChanged(({ payload }) => {
      if (active) setWindowFocused(payload);
    }) : null;

    return () => {
      active = false;
      unlistenResize.then((fn) => fn()).catch(() => {});
      unlistenFocus?.then((fn) => fn()).catch(() => {});
    };
  }, [isMacDesktop, isWindowsDesktop]);

  const showWindowsControls = isWindowsDesktop && !isFullscreen;
  useLayoutEffect(() => {
    const safeTop = ((isMacDesktop && !isFullscreen) || showWindowsControls)
      ? `${TOPBAR_HEIGHT_PX}px`
      : "0px";
    const h = !minimalDragOnly || showWindowsControls ? `${TOPBAR_HEIGHT_PX}px` : "0px";
    document.documentElement.style.setProperty("--titlebar-h", h);
    document.documentElement.style.setProperty("--titlebar-safe-top", safeTop);
  }, [isMacDesktop, isFullscreen, minimalDragOnly, showWindowsControls]);

  if (minimalDragOnly && !showWindowsControls) {
    if (!isMacDesktop || isFullscreen) return null;
    return (
      <div
        data-tauri-drag-region
        className="fixed top-0 inset-x-0 h-[38px] z-[150] select-none no-print"
      />
    );
  }

  // Keep traffic-light clearance accurate on macOS across any WebView zoom level
  const safeZoom = Math.max(0.75, Math.min(1.5, uiZoom || 1));
  const leftPaddingPx =
    isMacDesktop && !isFullscreen ? Math.max(74, Math.ceil(78 / safeZoom)) : 12;
  const showAppActions = !hideActions && !minimalDragOnly;
  const maximizeLabel = isMaximized ? t("还原窗口", "Restore Window") : t("最大化", "Maximize");

  return (
    <div
      role="banner"
      data-tauri-drag-region="deep"
      style={{ height: TOPBAR_HEIGHT_PX, paddingLeft: leftPaddingPx }}
      className={cn(
        "relative shrink-0 w-full flex items-center select-none no-print",
        showWindowsControls ? "z-[125] bg-[#f4f5f7] dark:bg-[#121318]" : "z-[110] pr-3",
        "transition-opacity duration-150",
        !windowFocused && isMacDesktop ? "opacity-75" : "opacity-100"
      )}
    >
      {/* Left chrome controls beside macOS traffic lights */}
      <div className="flex items-center gap-1">
        {showAppActions && onToggleSidebar && (
          <MorphTooltip
            placement="bottom"
            content={
              sidebarCollapsed
                ? t(`展开侧边栏 (${modKey}B)`, `Expand Sidebar (${modKey}B)`)
                : t(`折叠侧边栏 (${modKey}B)`, `Collapse Sidebar (${modKey}B)`)
            }
          >
            <motion.button
              type="button"
              whileTap={TAP_SCALE_ICON}
              transition={SPRING_SNAPPY}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onToggleSidebar}
              aria-label={
                sidebarCollapsed
                  ? t("展开侧边栏", "Expand Sidebar")
                  : t("折叠侧边栏", "Collapse Sidebar")
              }
              aria-expanded={!sidebarCollapsed}
              className="h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/75 dark:hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
            >
              <PanelLeft className="h-[15px] w-[15px]" />
            </motion.button>
          </MorphTooltip>
        )}

        {showAppActions && onOpenSearch && (
          <MorphTooltip
            placement="bottom"
            content={t(`快速检索 (${modKey}K)`, `Quick Search (${modKey}K)`)}
          >
            <motion.button
              type="button"
              whileTap={TAP_SCALE_ICON}
              transition={SPRING_SNAPPY}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onOpenSearch}
              aria-label={t("快速检索", "Quick Search")}
              className="h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/75 dark:hover:bg-white/[0.08] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Search className="h-[15px] w-[15px]" />
            </motion.button>
          </MorphTooltip>
        )}

        {showAppActions && showSync && onSyncClick && (() => {
          const isConflict = syncState === "conflict";
          const isRemoteAhead = syncState === "remote_ahead";
          const isLocalAhead = syncState === "local_ahead";
          const isSynced = syncState === "up_to_date";
          const hasErr = Boolean(syncHasPassphraseError);

          return (
            <MorphTooltip
              placement="bottom"
              content={
                syncTooltip ||
                (syncing
                  ? t("正在与云端同步...", "Syncing with cloud...")
                  : syncReady
                    ? t("点击立即云端同步", "Sync with cloud now")
                    : t("配置 S3 云端同步", "Configure S3 Cloud Sync"))
              }
            >
              <motion.button
                type="button"
                disabled={syncing}
                whileTap={syncing ? undefined : TAP_SCALE_ICON}
                transition={SPRING_SNAPPY}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onSyncClick}
                aria-label={t("云端同步", "Cloud Sync")}
                className={cn(
                  "relative h-7 w-7 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-65",
                  isConflict || hasErr
                    ? "text-rose-600 dark:text-rose-400 hover:bg-rose-500/12"
                    : isRemoteAhead
                      ? "text-sky-600 dark:text-sky-400 hover:bg-sky-500/12"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/75 dark:hover:bg-white/[0.08]"
                )}
              >
                {syncing ? (
                  <Loader2 className="h-[15px] w-[15px] animate-spin text-indigo-500" />
                ) : (
                  <Cloud
                    className={cn(
                      "h-[15px] w-[15px]",
                      isConflict || hasErr
                        ? "text-rose-500"
                        : isRemoteAhead
                          ? "text-sky-500"
                          : syncReady
                            ? "text-indigo-500 dark:text-indigo-400"
                            : undefined
                    )}
                  />
                )}
                {syncReady && !syncing && (
                  <span
                    className={cn(
                      "absolute top-1 right-1 h-1.5 w-1.5 rounded-full ring-[1.5px] ring-[#f4f5f7] dark:ring-[#121318]",
                      isConflict || hasErr
                        ? "bg-rose-500"
                        : isRemoteAhead
                          ? "bg-sky-500 animate-pulse"
                          : isLocalAhead
                            ? "bg-amber-500"
                            : isSynced
                              ? "bg-emerald-500"
                              : "bg-zinc-400"
                    )}
                  />
                )}
              </motion.button>
            </MorphTooltip>
          );
        })()}
      </div>

      <div className="flex-1 self-stretch" />
      {showWindowsControls && (
        <div className="flex self-stretch" data-tauri-drag-region="false">
          {[
            {
              id: "minimize",
              label: t("最小化", "Minimize"),
              icon: <Minus className="size-3.5" />,
              run: () => getCurrentWindow().minimize(),
            },
            {
              id: "maximize",
              label: maximizeLabel,
              icon: isMaximized ? <Copy className="size-3" /> : <Square className="size-3" />,
              run: () => getCurrentWindow().toggleMaximize(),
            },
            {
              id: "close",
              label: t("关闭窗口", "Close Window"),
              icon: <X className="size-4" />,
              run: () => getCurrentWindow().close(),
            },
          ].map(({ id, label, icon, run }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => void run().catch(console.error)}
              className={cn(
                "grid w-11 place-items-center text-zinc-700 dark:text-zinc-200",
                "focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-indigo-500",
                id === "close"
                  ? "hover:bg-[#c42b1c] hover:text-white"
                  : "hover:bg-black/[0.07] dark:hover:bg-white/[0.10]"
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
