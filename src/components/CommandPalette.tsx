import React, { useEffect } from "react";
import { Command } from "cmdk";
import { ModalShell } from "@/components/ui/MotionPrimitives";
import { KeycapBadge } from "@/components/ui/InteractiveControls";
import {
  BellRing,
  Check,
  Cloud,
  CloudDownload,
  FileSpreadsheet,
  Gauge,
  Layers,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Upload,
  Wrench,
} from "lucide-react";
import { getInstrumentStatus } from "@/lib/status";
import type { ThemePreference } from "@/lib/themeTransition";
import { getMaxWarningDays, sortThresholdsDesc } from "@/lib/thresholdColors";
import { WORKBENCH_TOOLS } from "@/workbench/registry";
import type {
  CategoryTab,
  ExpiryFilter,
  Instrument,
  StatusFilter,
  WarningThreshold,
} from "@/types";

interface CommandPaletteProps {
  open: boolean;
  instruments: Instrument[];
  warningThresholds: WarningThreshold[];
  isAdmin: boolean;
  themePreference: ThemePreference;
  onClose: () => void;
  onSelectInstrument: (inst: Instrument) => void;
  onNavigateTab: (tab: CategoryTab) => void;
  onFilterStatus: (status: StatusFilter) => void;
  onFilterExpiry: (filter: ExpiryFilter) => void;
  onOpenAlerts: () => void;
  onCreateInstrument: () => void;
  onOpenImport: () => void;
  onExportAll: () => void;
  onPrint: () => void;
  onLock: () => void;
  onOpenSettings: (
    tab:
      | "account"
      | "general"
      | "window"
      | "alerts"
      | "applock"
      | "sync"
      | "backup"
      | "update"
  ) => void;
  syncConfigured?: boolean;
  onSyncNow?: () => void;
  onSelectThemePreference: (pref: ThemePreference) => void;
  onLoginOrLogout: () => void;
  onOpenWorkbenchHub: () => void;
  onLaunchWorkbenchTool: (toolId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  instruments,
  warningThresholds,
  isAdmin,
  themePreference,
  onClose,
  onSelectInstrument,
  onNavigateTab,
  onFilterStatus,
  onFilterExpiry,
  onOpenAlerts,
  onCreateInstrument,
  onOpenImport,
  onExportAll,
  onPrint,
  onLock,
  onOpenSettings,
  syncConfigured = false,
  onSyncNow,
  onSelectThemePreference,
  onLoginOrLogout,
  onOpenWorkbenchHub,
  onLaunchWorkbenchTool,
}) => {
  const descThresholds = sortThresholdsDesc(warningThresholds);
  const maxWarningDays = getMaxWarningDays(warningThresholds);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const runAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      zIndexClass="z-[90]"
      align="top"
      panelClassName="w-full max-w-xl"
    >
      <Command label="快速检索与命令面板" className="flex flex-col" loop>
        <div className="flex items-center gap-2.5 px-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/40 dark:bg-white/[0.015]">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <Command.Input
            autoFocus
            placeholder="搜索设备或命令..."
            className="w-full py-3.5 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
          />
          <KeycapBadge onClick={onClose}>ESC</KeycapBadge>
        </div>

              <Command.List className="max-h-[380px] overflow-y-auto p-2 space-y-2">
                <Command.Empty className="py-10 text-center text-xs text-zinc-400">
                  没有找到匹配的设备或命令
                </Command.Empty>

                {/* Quick Actions */}
                <Command.Group
                  heading="快捷操作"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {isAdmin && (
                    <Command.Item
                      onSelect={() => runAndClose(onCreateInstrument)}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Plus className="h-3.5 w-3.5 text-indigo-500" />
                        <span>新增设备</span>
                      </span>
                      <span className="text-[10px] text-zinc-400">管理员</span>
                    </Command.Item>
                  )}

                  {isAdmin && (
                    <Command.Item
                      onSelect={() => runAndClose(onOpenImport)}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Upload className="h-3.5 w-3.5 text-emerald-500" />
                        <span>导入 Excel</span>
                      </span>
                    </Command.Item>
                  )}

                  <Command.Item
                    onSelect={() => runAndClose(() => onOpenAlerts())}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <BellRing className="h-3.5 w-3.5 text-amber-500" />
                      <span>到期预警</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(() => onOpenSettings("alerts"))}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-500" />
                      <span>预警设置</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onExportAll)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                      <span>导出 Excel</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onPrint)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Printer className="h-3.5 w-3.5 text-zinc-400" />
                      <span>打印台账</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() =>
                      runAndClose(() => onSelectThemePreference("light"))
                    }
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Sun className="h-3.5 w-3.5 text-amber-500" />
                      <span>主题：亮色模式</span>
                    </span>
                    {themePreference === "light" && (
                      <Check className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-300" />
                    )}
                  </Command.Item>

                  <Command.Item
                    onSelect={() =>
                      runAndClose(() => onSelectThemePreference("dark"))
                    }
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Moon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                      <span>主题：暗色模式</span>
                    </span>
                    {themePreference === "dark" && (
                      <Check className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-300" />
                    )}
                  </Command.Item>

                  <Command.Item
                    onSelect={() =>
                      runAndClose(() => onSelectThemePreference("system"))
                    }
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Monitor className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
                      <span>主题：跟随系统</span>
                    </span>
                    {themePreference === "system" && (
                      <Check className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-300" />
                    )}
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onLock)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Lock className="h-3.5 w-3.5 text-amber-500" />
                      <span>立即锁屏</span>
                    </span>
                    <KeycapBadge>⌘L</KeycapBadge>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(() => onOpenSettings("update"))}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <CloudDownload className="h-3.5 w-3.5 text-sky-500" />
                      <span>检查更新</span>
                    </span>
                  </Command.Item>

                  {isAdmin && (
                    <Command.Item
                      onSelect={() => runAndClose(() => onOpenSettings("general"))}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Settings className="h-3.5 w-3.5 text-zinc-400" />
                        <span>系统设置</span>
                      </span>
                    </Command.Item>
                  )}

                  {isAdmin && syncConfigured && onSyncNow && (
                    <Command.Item
                      value="云端同步 立即同步 s3 sync"
                      onSelect={() => runAndClose(onSyncNow)}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Cloud className="h-3.5 w-3.5 text-indigo-500" />
                        <span>云端同步：立即同步</span>
                      </span>
                      <span className="text-[10px] text-zinc-400">S3</span>
                    </Command.Item>
                  )}

                  {isAdmin && (
                    <Command.Item
                      value="云端同步设置 s3 加密 配置 sync settings"
                      onSelect={() => runAndClose(() => onOpenSettings("sync"))}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Cloud className="h-3.5 w-3.5 text-sky-500" />
                        <span>云端同步设置</span>
                      </span>
                      <span className="text-[10px] text-zinc-400">管理员</span>
                    </Command.Item>
                  )}

                  {isAdmin && (
                    <Command.Item
                      onSelect={() => runAndClose(() => onOpenSettings("backup"))}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <RotateCcw className="h-3.5 w-3.5 text-rose-500" />
                        <span>备份与初始化程序</span>
                      </span>
                      <span className="text-[10px] text-zinc-400">管理员</span>
                    </Command.Item>
                  )}

                  <Command.Item
                    onSelect={() => runAndClose(onLoginOrLogout)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      {isAdmin ? (
                        <LogOut className="h-3.5 w-3.5 text-zinc-400" />
                      ) : (
                        <LogIn className="h-3.5 w-3.5 text-indigo-500" />
                      )}
                      <span>{isAdmin ? "退出登录" : "管理员登录"}</span>
                    </span>
                  </Command.Item>
                </Command.Group>

                {/* QI/QC Workbench Tools */}
                <Command.Group
                  heading="QI / QC 质量工具台"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  <Command.Item
                    value="打开 QI QC 质量工具台 总览 workbench"
                    onSelect={() => runAndClose(onOpenWorkbenchHub)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                  >
                    <span className="flex items-center gap-2.5">
                      <LayoutGrid className="h-3.5 w-3.5 text-indigo-500" />
                      <span>打开 QI / QC 工具台总览</span>
                    </span>
                    <span className="text-[10px] text-zinc-400">工具服务</span>
                  </Command.Item>
                  {WORKBENCH_TOOLS.filter((t) => t.status === "ready").map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Command.Item
                        key={tool.id}
                        value={`启动 ${tool.name} ${tool.shortName} ${tool.tags.join(" ")}`}
                        onSelect={() => runAndClose(() => onLaunchWorkbenchTool(tool.id))}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-3.5 w-3.5" style={{ color: tool.accent }} />
                          <span>启动：{tool.name}</span>
                        </span>
                        <span className="text-[10px] text-zinc-400">工具</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>

                {/* Views & Filters */}
                <Command.Group
                  heading="视图切换"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  <Command.Item
                    onSelect={() => runAndClose(() => onNavigateTab("gauge"))}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                  >
                    <Gauge className="h-3.5 w-3.5 text-zinc-400" />
                    <span>切换至：仪器 / 量具台账</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runAndClose(() => onNavigateTab("fixture"))}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                  >
                    <Wrench className="h-3.5 w-3.5 text-zinc-400" />
                    <span>切换至：尺寸检具台账</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runAndClose(() => onNavigateTab("all"))}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                  >
                    <Layers className="h-3.5 w-3.5 text-zinc-400" />
                    <span>切换至：全部设备台账</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runAndClose(() => onFilterStatus("expired"))}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500 ml-0.5 mr-1" />
                    <span>仅查看已超期设备</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runAndClose(() => onFilterStatus("warning"))}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-500 ml-0.5 mr-1" />
                    <span>仅查看全部预警设备（≤{maxWarningDays}天）</span>
                  </Command.Item>
                  {descThresholds.map((t) => (
                    <Command.Item
                      key={t.id}
                      onSelect={() => runAndClose(() => onFilterExpiry(t.days))}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                    >
                      <span
                        className="h-2 w-2 rounded-full ml-0.5 mr-1"
                        style={{ backgroundColor: t.color }}
                      />
                      <span>
                        到期筛选：{t.days}天内到期（{t.label}）
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {/* Instruments direct jump */}
                {instruments.length > 0 && (
                  <Command.Group
                    heading={`设备档案（共 ${instruments.length} 台）`}
                    className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {instruments.slice(0, 60).map((inst) => {
                      const st = getInstrumentStatus(inst, warningThresholds);
                      const dotClass =
                        st.status === "valid"
                          ? "bg-emerald-500"
                          : st.status === "expired"
                            ? "bg-rose-500"
                            : st.status === "warning"
                              ? ""
                              : "bg-zinc-400";
                      const dotStyle =
                        st.status === "warning"
                          ? {
                              backgroundColor:
                                st.matchedThreshold?.color || "#f59e0b",
                            }
                          : undefined;
                      return (
                        <Command.Item
                          key={inst.id}
                          value={`${inst.name} ${inst.serialNo} ${inst.modelSpec} ${inst.location} ${inst.department}`}
                          onSelect={() => runAndClose(() => onSelectInstrument(inst))}
                          className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`}
                              style={dotStyle}
                            />
                            <span className="font-medium truncate">{inst.name}</span>
                            {inst.serialNo && (
                              <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                                {inst.serialNo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[11px] text-zinc-400">
                            {inst.department && <span>{inst.department}</span>}
                            <span className="font-mono tabular-nums">
                              {inst.exemptCalibration ? "免校" : inst.nextCalDate || "-"}
                            </span>
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
    </ModalShell>
  );
};
