import React, { useEffect } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  CloudDownload,
  FileSpreadsheet,
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
  SlidersHorizontal,
  Sun,
  Upload,
  Wrench,
} from "lucide-react";
import { getInstrumentStatus } from "@/lib/status";
import { getMaxWarningDays, sortThresholdsDesc } from "@/lib/thresholdColors";
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
  theme: "light" | "dark";
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
  onOpenSettings: (tab: "general" | "alerts" | "security" | "backup" | "update") => void;
  onToggleTheme: () => void;
  onLoginOrLogout: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  instruments,
  warningThresholds,
  isAdmin,
  theme,
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
  onToggleTheme,
  onLoginOrLogout,
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[90] bg-zinc-950/45 dark:bg-black/65 backdrop-blur-sm flex items-start justify-center pt-[13vh] px-4 no-print"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#121216] border border-zinc-200/90 dark:border-white/[0.1] shadow-popover overflow-hidden"
          >
            <Command
              label="快速检索与命令面板"
              className="flex flex-col"
              loop
            >
              <div className="flex items-center gap-2.5 px-4 border-b border-zinc-200/80 dark:border-white/[0.08]">
                <Search className="h-4 w-4 text-zinc-400 shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder="搜索设备名称、出厂编号、存放位置，或输入快捷操作..."
                  className="w-full py-3.5 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
                />
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-zinc-100 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400 border border-zinc-200/80 dark:border-white/[0.08]">
                  ESC
                </kbd>
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
                        <span>新增仪器 / 检具记录</span>
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
                        <span>导入 Excel 台账 (.xlsx)</span>
                      </span>
                    </Command.Item>
                  )}

                  <Command.Item
                    onSelect={() => runAndClose(() => onOpenAlerts())}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <BellRing className="h-3.5 w-3.5 text-amber-500" />
                      <span>打开到期预警弹窗</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(() => onOpenSettings("alerts"))}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-500" />
                      <span>配置预警天数、颜色与弹窗策略</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onExportAll)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                      <span>导出完整双台账 Excel</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onPrint)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Printer className="h-3.5 w-3.5 text-zinc-400" />
                      <span>打印当前台账（横向 A4）</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onToggleTheme)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      {theme === "dark" ? (
                        <Sun className="h-3.5 w-3.5 text-amber-400" />
                      ) : (
                        <Moon className="h-3.5 w-3.5 text-indigo-500" />
                      )}
                      <span>
                        切换到{theme === "dark" ? "浅色精密模式" : "深色暗曜模式"}
                      </span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(onLock)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Lock className="h-3.5 w-3.5 text-amber-500" />
                      <span>立即全屏锁屏保护</span>
                    </span>
                    <kbd className="text-[10px] font-mono text-zinc-400">⌘L</kbd>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => runAndClose(() => onOpenSettings("update"))}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <CloudDownload className="h-3.5 w-3.5 text-sky-500" />
                      <span>检查软件更新</span>
                    </span>
                  </Command.Item>

                  {isAdmin && (
                    <Command.Item
                      onSelect={() => runAndClose(() => onOpenSettings("general"))}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-zinc-700 dark:text-zinc-200 cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-white/[0.07] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Settings className="h-3.5 w-3.5 text-zinc-400" />
                        <span>打开系统设置与备份中心</span>
                      </span>
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
                      <span>{isAdmin ? "退出管理员模式" : "管理员身份登录"}</span>
                    </span>
                  </Command.Item>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
