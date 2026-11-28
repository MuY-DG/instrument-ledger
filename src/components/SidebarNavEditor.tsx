import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Gauge,
  GripVertical,
  Layers,
  LayoutGrid,
  PanelLeft,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  countVisibleSidebarItems,
  getDefaultSidebarNavConfig,
  isDefaultSidebarNavConfig,
  type SidebarGroupId,
  type SidebarNavConfig,
} from "@/lib/sidebarConfig";
import { cn } from "@/lib/utils";
import { PrecisionSwitch } from "@/components/ui/FormControls";
import { Collapsible } from "@/components/ui/MotionPrimitives";
import { WORKBENCH_TOOLS } from "@/workbench/registry";

interface SidebarNavEditorProps {
  value: SidebarNavConfig;
  onChange: (next: SidebarNavConfig) => void;
}

type DragSession =
  | { kind: "group"; groupId: SidebarGroupId }
  | { kind: "item"; groupId: SidebarGroupId; itemId: string };

const REORDER_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 38,
  mass: 0.7,
};

function moveArrayItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr;
  }
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const SidebarNavEditor: React.FC<SidebarNavEditorProps> = ({
  value,
  onChange,
}) => {
  const { t } = useI18n();
  const [expandedGroups, setExpandedGroups] = useState<Record<SidebarGroupId, boolean>>({
    categories: false,
    status: false,
    workbench: false,
  });
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const savedExpandedRef = useRef<Record<SidebarGroupId, boolean> | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const toolMap = useMemo(() => {
    const map = new Map<string, (typeof WORKBENCH_TOOLS)[number]>();
    for (const tool of WORKBENCH_TOOLS) {
      map.set(tool.id, tool);
    }
    return map;
  }, []);

  const groupMeta: Record<SidebarGroupId, { title: string }> = useMemo(
    () => ({
      categories: { title: t("台账分类", "Categories") },
      status: { title: t("效期状态", "Calibration Status") },
      workbench: { title: t("QI / QC 工具台", "QI / QC Workbench") },
    }),
    [t]
  );

  const renderItemMeta = (
    groupId: SidebarGroupId,
    itemId: string
  ): { label: string; leading: React.ReactNode } => {
    if (groupId === "categories") {
      if (itemId === "gauge") {
        return {
          label: t("仪器与量具", "Gauges"),
          leading: <Gauge className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />,
        };
      }
      if (itemId === "fixture") {
        return {
          label: t("尺寸检具", "Fixtures"),
          leading: <Wrench className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />,
        };
      }
      return {
        label: t("全部设备", "All Equipment"),
        leading: <Layers className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />,
      };
    }

    if (groupId === "status") {
      const dotMap: Record<string, { label: string; dot: string }> = {
        all: {
          label: t("全部状态", "All Status"),
          dot: "bg-zinc-400 dark:bg-zinc-500",
        },
        valid: { label: t("正常有效", "Valid"), dot: "bg-emerald-500" },
        warning: { label: t("即将到期", "Due Soon"), dot: "bg-amber-500" },
        expired: { label: t("已超期", "Expired"), dot: "bg-rose-500" },
        exempt: {
          label: t("免校归档", "Exempt"),
          dot: "bg-zinc-300 dark:bg-zinc-600",
        },
      };
      const meta = dotMap[itemId] || { label: itemId, dot: "bg-zinc-400" };
      return {
        label: meta.label,
        leading: (
          <span className="w-3.5 flex items-center justify-center shrink-0">
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          </span>
        ),
      };
    }

    if (itemId === "hub") {
      return {
        label: t("工具台总览", "Workbench Hub"),
        leading: (
          <LayoutGrid className="h-3.5 w-3.5 text-indigo-500/80 dark:text-indigo-400/80 shrink-0" />
        ),
      };
    }

    const tool = toolMap.get(itemId);
    if (tool) {
      const Icon = tool.icon;
      return {
        label: tool.shortName,
        leading: (
          <Icon
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: tool.accent }}
          />
        ),
      };
    }
    return {
      label: itemId,
      leading: <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />,
    };
  };

  // Pointer-event drag-to-reorder (avoids HTML5 draggable conflict with Tauri native file drop)
  useEffect(() => {
    if (!dragSession) return;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const handlePointerMove = (e: PointerEvent) => {
      const root = containerRef.current;
      if (!root) return;
      const cur = valueRef.current;

      if (dragSession.kind === "group") {
        const currentIdx = cur.groups.findIndex((g) => g.id === dragSession.groupId);
        if (currentIdx === -1) return;

        for (let i = 0; i < cur.groups.length; i++) {
          if (i === currentIdx) continue;
          const targetId = cur.groups[i].id;
          const el = root.querySelector<HTMLElement>(
            `[data-sidebar-group="${targetId}"]`
          );
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const movingDown = i > currentIdx && e.clientY > rect.top + rect.height * 0.55;
          const movingUp = i < currentIdx && e.clientY < rect.top + rect.height * 0.45;
          if (movingDown || movingUp) {
            onChangeRef.current({
              groups: moveArrayItem(cur.groups, currentIdx, i),
            });
            return;
          }
        }
      } else {
        const groupIdx = cur.groups.findIndex((g) => g.id === dragSession.groupId);
        if (groupIdx === -1) return;
        const group = cur.groups[groupIdx];
        const currentIdx = group.items.findIndex((it) => it.id === dragSession.itemId);
        if (currentIdx === -1) return;

        for (let i = 0; i < group.items.length; i++) {
          if (i === currentIdx) continue;
          const targetItemId = group.items[i].id;
          const el = root.querySelector<HTMLElement>(
            `[data-sidebar-item="${dragSession.groupId}:${targetItemId}"]`
          );
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const movingDown = i > currentIdx && e.clientY > rect.top + rect.height * 0.55;
          const movingUp = i < currentIdx && e.clientY < rect.top + rect.height * 0.45;
          if (movingDown || movingUp) {
            const nextGroups = cur.groups.map((g, idx) =>
              idx === groupIdx
                ? { ...g, items: moveArrayItem(g.items, currentIdx, i) }
                : g
            );
            onChangeRef.current({ groups: nextGroups });
            return;
          }
        }
      }
    };

    const endDrag = () => {
      setDragSession(null);
      if (savedExpandedRef.current) {
        setExpandedGroups(savedExpandedRef.current);
        savedExpandedRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [dragSession]);

  const startGroupDrag = (e: React.PointerEvent, groupId: SidebarGroupId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Temporarily collapse expanded groups so all 3 group rows share uniform height during drag
    if (Object.values(expandedGroups).some(Boolean)) {
      savedExpandedRef.current = { ...expandedGroups };
      setExpandedGroups({ categories: false, status: false, workbench: false });
    }
    setDragSession({ kind: "group", groupId });
  };

  const startItemDrag = (
    e: React.PointerEvent,
    groupId: SidebarGroupId,
    itemId: string
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDragSession({ kind: "item", groupId, itemId });
  };

  const toggleGroupVisibility = (groupId: SidebarGroupId, visible: boolean) => {
    onChange({
      groups: value.groups.map((g) => (g.id === groupId ? { ...g, visible } : g)),
    });
  };

  const toggleItemVisibility = (
    groupId: SidebarGroupId,
    itemId: string,
    visible: boolean
  ) => {
    onChange({
      groups: value.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              items: g.items.map((it) =>
                it.id === itemId ? { ...it, visible } : it
              ),
            }
          : g
      ),
    });
  };

  const allExpanded = value.groups.every((g) => expandedGroups[g.id]);
  const toggleExpandAll = () => {
    const next = !allExpanded;
    setExpandedGroups({
      categories: next,
      status: next,
      workbench: next,
    });
  };

  const isDefault = isDefaultSidebarNavConfig(value);
  const summary = countVisibleSidebarItems(value);

  return (
    <section className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 min-w-0">
          <PanelLeft className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
            {t("侧边栏列表显示与排序", "Sidebar Navigation & Order")}
          </h3>
          <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-[10.5px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
            {summary.visibleItems}/{summary.totalItems}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleExpandAll}
            className="px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition cursor-pointer"
          >
            {allExpanded ? t("全部收起", "Collapse") : t("全部展开", "Expand")}
          </button>
          {!isDefault && (
            <button
              type="button"
              onClick={() => onChange(getDefaultSidebarNavConfig())}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t("恢复默认", "Reset")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Group & Item Tree */}
      <div ref={containerRef} className="p-2.5 space-y-1.5">
        {value.groups.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const isDraggingThisGroup =
            dragSession?.kind === "group" && dragSession.groupId === group.id;
          const visibleChildCount = group.items.filter((i) => i.visible).length;

          return (
            <motion.div
              key={group.id}
              layout
              transition={REORDER_SPRING}
              data-sidebar-group={group.id}
              className={cn(
                "rounded-lg border transition-colors",
                isDraggingThisGroup
                  ? "relative z-20 border-zinc-400 dark:border-white/30 bg-white dark:bg-[#1c1c22] shadow-md ring-2 ring-zinc-900/10 dark:ring-white/10"
                  : group.visible
                    ? "border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/55 dark:bg-white/[0.015]"
                    : "border-zinc-200/60 dark:border-white/[0.05] bg-zinc-50/30 dark:bg-white/[0.01]"
              )}
            >
              {/* Group Row */}
              <div className="px-2.5 py-2 flex items-center justify-between gap-2 select-none">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onPointerDown={(e) => startGroupDrag(e, group.id)}
                    aria-label={t("拖拽调整分组顺序", "Drag to reorder group")}
                    title={t("按住拖动排序", "Drag to reorder")}
                    className="h-6 w-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.07] cursor-grab active:cursor-grabbing shrink-0 touch-none"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [group.id]: !prev[group.id],
                      }))
                    }
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left py-0.5 rounded hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-xs font-semibold truncate",
                        group.visible
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-400 dark:text-zinc-500 line-through"
                      )}
                    >
                      {groupMeta[group.id].title}
                    </span>
                    {!group.visible ? (
                      <span className="px-1.5 py-0.2 rounded bg-zinc-200/80 dark:bg-white/[0.07] text-[10px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                        {t("整组已隐藏", "Hidden")}
                      </span>
                    ) : (
                      <span className="text-[10.5px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500 shrink-0">
                        {visibleChildCount}/{group.items.length}
                      </span>
                    )}
                  </button>
                </div>

                <PrecisionSwitch
                  checked={group.visible}
                  size="sm"
                  ariaLabel={groupMeta[group.id].title}
                  onChange={(checked) => toggleGroupVisibility(group.id, checked)}
                />
              </div>

              {/* Child Items */}
              <Collapsible open={isExpanded}>
                <div className="px-2.5 pb-2 pt-1 border-t border-zinc-200/65 dark:border-white/[0.06] space-y-1">
                  {!group.visible && (
                    <div className="px-2 py-1 rounded-md bg-zinc-100/90 dark:bg-white/[0.04] text-[10.5px] text-zinc-500 dark:text-zinc-400">
                      {t(
                        "大标题已关闭，以下子项在侧边栏均不显示（开关状态已保留）。",
                        "Section is hidden; child items will not appear in sidebar (states preserved)."
                      )}
                    </div>
                  )}

                  {group.items.map((item) => {
                    const meta = renderItemMeta(group.id, item.id);
                    const isDraggingThisItem =
                      dragSession?.kind === "item" &&
                      dragSession.groupId === group.id &&
                      dragSession.itemId === item.id;
                    const effectivelyHidden = !group.visible || !item.visible;

                    return (
                      <motion.div
                        key={item.id}
                        layout
                        transition={REORDER_SPRING}
                        data-sidebar-item={`${group.id}:${item.id}`}
                        className={cn(
                          "pl-2 pr-1.5 py-1.5 rounded-md flex items-center justify-between gap-2 select-none transition-colors",
                          isDraggingThisItem
                            ? "relative z-20 bg-white dark:bg-[#23232b] ring-1 ring-zinc-400 dark:ring-white/30 shadow-sm"
                            : "bg-white/80 dark:bg-white/[0.025] hover:bg-white dark:hover:bg-white/[0.045]",
                          !group.visible && "opacity-50"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onPointerDown={(e) =>
                              startItemDrag(e, group.id, item.id)
                            }
                            aria-label={t("拖拽调整排序", "Drag to reorder")}
                            title={t("按住拖动排序", "Drag to reorder")}
                            className="h-5 w-4 rounded flex items-center justify-center text-zinc-350 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                          >
                            <GripVertical className="h-3 w-3" />
                          </button>
                          {meta.leading}
                          <span
                            className={cn(
                              "text-xs truncate",
                              effectivelyHidden
                                ? "text-zinc-400 dark:text-zinc-500"
                                : "text-zinc-700 dark:text-zinc-200 font-medium"
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <PrecisionSwitch
                          checked={item.visible}
                          size="sm"
                          ariaLabel={meta.label}
                          onChange={(checked) =>
                            toggleItemVisibility(group.id, item.id, checked)
                          }
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </Collapsible>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
