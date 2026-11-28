import React, { Component, Suspense, lazy, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE_SUBTLE } from "@/lib/motion";
import type { ThemeMode } from "@/lib/themeTransition";
import { getWorkbenchToolById } from "./registry";
import { WorkbenchHub } from "./WorkbenchHub";
import type { WorkbenchIncomingFile, WorkbenchToolProps } from "./types";

const lazyComponentCache = new Map<
  string,
  React.LazyExoticComponent<React.ComponentType<WorkbenchToolProps>>
>();

function getLazyToolComponent(toolId: string) {
  let cached = lazyComponentCache.get(toolId);
  if (!cached) {
    const def = getWorkbenchToolById(toolId);
    if (!def?.load) return null;
    cached = lazy(def.load);
    lazyComponentCache.set(toolId, cached);
  }
  return cached;
}

class ToolErrorBoundary extends Component<
  { toolName: string; onReset: () => void; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-[#09090b]">
          <div className="max-w-md w-full rounded-2xl border border-zinc-200/90 dark:border-white/[0.1] bg-zinc-50/70 dark:bg-[#131317] p-6 text-center space-y-3 shadow-tactile">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {this.props.toolName} 遇到运行异常
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 break-words">
              {this.state.error.message || "工具模块加载失败，请重试"}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-medium"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>重新加载</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onReset();
                }}
                className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-700 dark:text-zinc-200"
              >
                <span>返回工具台</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface WorkbenchShellProps {
  /** Whether the Workbench workspace is currently visible in the main app. */
  visible: boolean;
  /** Currently selected tool ID, or null when viewing the Workbench Hub. */
  activeToolId: string | null;
  /** Mounted keep-alive tool IDs (preserves open documents/state across navigation). */
  mountedToolIds: string[];
  /** True when any host modal/palette/lock screen is covering the workspace. */
  hostOverlayOpen: boolean;
  theme: ThemeMode;
  immersive: boolean;
  cacheLimitMb: number;
  onCacheLimitChanged: (nextLimitMb: number) => void;
  onCacheCleared: () => void;
  onToggleImmersive: () => void;
  onLaunchTool: (toolId: string) => void;
  onBackToHub: () => void;
  onCloseTool: (toolId: string) => void;
  onNotify: (message: string, type?: "success" | "error") => void;
  incomingFiles?: Record<string, WorkbenchIncomingFile | null>;
  onConsumeIncomingFile?: (toolId: string, fileId: string) => void;
  /** Automatically unmount keep-alive tools after this many idle minutes in background (default 15m). */
  idleHibernateMs?: number;
}

const DEFAULT_IDLE_HIBERNATE_MS = 15 * 60 * 1000;

export const WorkbenchShell: React.FC<WorkbenchShellProps> = ({
  visible,
  activeToolId,
  mountedToolIds,
  hostOverlayOpen,
  theme,
  immersive,
  cacheLimitMb,
  onCacheLimitChanged,
  onCacheCleared,
  onToggleImmersive,
  onLaunchTool,
  onBackToHub,
  onCloseTool,
  onNotify,
  incomingFiles,
  onConsumeIncomingFile,
  idleHibernateMs = DEFAULT_IDLE_HIBERNATE_MS,
}) => {
  const activeTool = useMemo(
    () => (activeToolId ? getWorkbenchToolById(activeToolId) : undefined),
    [activeToolId]
  );

  // Idle auto-hibernation: release heavy PDF.js Workers & canvas RAM for tools left in background
  // for > 15 minutes (drafts & viewport state are auto-flushed to native disk store on switch).
  const hibernateTimersRef = useRef<Map<string, number>>(new Map());
  const onCloseToolRef = useRef(onCloseTool);
  onCloseToolRef.current = onCloseTool;

  useEffect(() => {
    const timers = hibernateTimersRef.current;

    // Clear timers for tools that are no longer mounted or currently visible
    for (const [toolId, timerId] of Array.from(timers.entries())) {
      const stillMounted = mountedToolIds.includes(toolId);
      const isNowActive = visible && activeToolId === toolId;
      if (!stillMounted || isNowActive) {
        window.clearTimeout(timerId);
        timers.delete(toolId);
      }
    }

    // Schedule idle hibernation for background mounted tools
    if (idleHibernateMs > 0) {
      for (const toolId of mountedToolIds) {
        const isToolActive = visible && activeToolId === toolId;
        if (!isToolActive && !timers.has(toolId)) {
          const id = window.setTimeout(() => {
            timers.delete(toolId);
            onCloseToolRef.current(toolId);
          }, idleHibernateMs);
          timers.set(toolId, id);
        }
      }
    }
  }, [visible, activeToolId, mountedToolIds, idleHibernateMs]);

  useEffect(() => {
    const timers = hibernateTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex-1 flex-col min-w-0 min-h-0 bg-white dark:bg-[#09090b]",
        visible ? "flex" : "hidden"
      )}
    >
      {/* Workbench Hub (shown when visible && no tool is active) */}
      {visible && !activeToolId && (
        <WorkbenchHub
          runningToolIds={mountedToolIds}
          cacheLimitMb={cacheLimitMb}
          onCacheLimitChanged={onCacheLimitChanged}
          onCacheCleared={onCacheCleared}
          onNotify={onNotify}
          onLaunchTool={onLaunchTool}
          onCloseRunningTool={onCloseTool}
        />
      )}

      {/* Compact contextual header bar when a tool is active */}
      {visible && activeTool && (
        <div className="h-9 px-3 border-b border-zinc-200/85 dark:border-white/[0.08] bg-[#f8f9fa] dark:bg-[#0d0d11] flex items-center justify-between gap-3 shrink-0 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <motion.button
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              transition={SPRING_SNAPPY}
              onClick={onBackToHub}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.07] transition-colors shrink-0"
              title="返回 QI/QC 工具台总览（保留当前打开的工作进度）"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>工具台</span>
            </motion.button>
            <span className="h-3.5 w-px bg-zinc-300/80 dark:bg-white/[0.1]" />
            <activeTool.icon
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: activeTool.accent }}
            />
            <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {activeTool.name}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-white/[0.06] text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
              QI / QC 工具服务
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <motion.button
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              transition={SPRING_SNAPPY}
              onClick={onToggleImmersive}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                immersive
                  ? "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.07]"
              )}
              title={immersive ? "恢复左侧导航栏" : "隐藏主侧栏以获得最大画布空间"}
            >
              {immersive ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
              <span>{immersive ? "退出沉浸" : "沉浸画布"}</span>
            </motion.button>
            <motion.button
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              transition={SPRING_SNAPPY}
              onClick={() => onCloseTool(activeTool.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="关闭当前工具实例并释放内存（草稿已自动保存）"
            >
              <X className="h-3 w-3" />
              <span className="hidden sm:inline">关闭工具</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* Keep-Alive Lazy Mounted Tool Instances */}
      {mountedToolIds.map((toolId) => {
        const def = getWorkbenchToolById(toolId);
        const LazyComp = getLazyToolComponent(toolId);
        if (!def || !LazyComp) return null;
        const isToolActive = visible && activeToolId === toolId;

        return (
          <div
            key={toolId}
            className={cn(
              "relative flex-1 min-h-0 min-w-0",
              isToolActive ? "flex flex-col" : "hidden"
            )}
          >
            <ToolErrorBoundary
              toolName={def.name}
              onReset={() => onCloseTool(toolId)}
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex flex-col items-center justify-center gap-2.5 bg-white dark:bg-[#09090b] text-xs text-zinc-400">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    <span>正在加载 {def.shortName} 引擎…</span>
                  </div>
                }
              >
                <LazyComp
                  active={isToolActive}
                  hostOverlayOpen={hostOverlayOpen}
                  theme={theme}
                  immersive={immersive}
                  onToggleImmersive={onToggleImmersive}
                  onBackToHub={onBackToHub}
                  onNotify={onNotify}
                  incomingFile={incomingFiles?.[toolId] ?? null}
                  onConsumeIncomingFile={
                    onConsumeIncomingFile
                      ? (fileId) => onConsumeIncomingFile(toolId, fileId)
                      : undefined
                  }
                />
              </Suspense>
            </ToolErrorBoundary>
          </div>
        );
      })}
    </div>
  );
};
