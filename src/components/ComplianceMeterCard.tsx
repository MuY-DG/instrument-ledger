import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import {
  EASE_PRECISION,
  SPRING_GENTLE,
  SPRING_SNAPPY,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import {
  SlidingNumber,
  SpotlightSurface,
} from "@/components/ui/MotionPrimitives";
import { MorphTooltip } from "@/components/ui/MorphTooltip";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ExpiryFilter, StatusFilter } from "@/types";

export interface ComplianceTierSegment {
  id: string;
  label: string;
  days: number;
  color: string;
  count: number;
}

interface ComplianceMeterCardProps {
  collapsed?: boolean;
  controlled: number;
  compliancePct: number;
  valid: number;
  expired: number;
  tierSegments: ComplianceTierSegment[];
  onFilterStatus: (status: StatusFilter) => void;
  onFilterExpiry: (filter: ExpiryFilter) => void;
}

interface MeterSegment {
  key: string;
  label: string;
  color: string;
  count: number;
  pct: number;
  onSelect: () => void;
}

export const ComplianceMeterCard: React.FC<ComplianceMeterCardProps> = ({
  collapsed = false,
  controlled,
  compliancePct,
  valid,
  expired,
  tierSegments,
  onFilterStatus,
  onFilterExpiry,
}) => {
  const { t, isEn } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const segments = useMemo<MeterSegment[]>(() => {
    if (controlled <= 0) return [];
    const list: MeterSegment[] = [];
    if (valid > 0) {
      list.push({
        key: "valid",
        label: t("正常有效", "Valid"),
        color: "#10b981",
        count: valid,
        pct: Math.round((valid / controlled) * 100),
        onSelect: () => onFilterStatus("valid"),
      });
    }
    for (const seg of tierSegments) {
      if (seg.count > 0) {
        list.push({
          key: `tier-${seg.id}`,
          label: isEn ? `≤${seg.days}d` : seg.label || `${seg.days}天内`,
          color: seg.color,
          count: seg.count,
          pct: Math.round((seg.count / controlled) * 100),
          onSelect: () => onFilterExpiry(seg.days),
        });
      }
    }
    if (expired > 0) {
      list.push({
        key: "expired",
        label: t("已超期", "Expired"),
        color: "#f43f5e",
        count: expired,
        pct: Math.round((expired / controlled) * 100),
        onSelect: () => onFilterStatus("expired"),
      });
    }
    return list;
  }, [controlled, valid, tierSegments, expired, onFilterStatus, onFilterExpiry, t, isEn]);

  const activeHoverSeg = segments.find((s) => s.key === hoveredKey) || null;

  // Compact segmented circular compliance indicator when sidebar is collapsed to rail
  if (collapsed) {
    const r = 13.5;
    const strokeWidth = 3;
    const circ = 2 * Math.PI * r;
    const segCount = segments.length;

    const ringArcs: Array<{
      key: string;
      color: string;
      arcLen: number;
      offset: number;
    }> = [];

    if (segCount === 1) {
      ringArcs.push({
        key: segments[0].key,
        color: segments[0].color,
        arcLen: circ,
        offset: 0,
      });
    } else if (segCount >= 2 && controlled > 0) {
      const visualGap =
        segCount === 2 ? 4.8 : segCount === 3 ? 4.0 : segCount === 4 ? 3.2 : 2.6;
      const gapLen = strokeWidth + visualGap;
      const available = Math.max(segCount * 1.0, circ - segCount * gapLen);
      const minArc = 1.0;

      const lens = segments.map((s) => (s.count / controlled) * available);
      let deficit = 0;
      for (let i = 0; i < lens.length; i++) {
        if (lens[i] < minArc) {
          deficit += minArc - lens[i];
          lens[i] = minArc;
        }
      }
      if (deficit > 0) {
        const surplusTotal = lens.reduce(
          (acc, len) => acc + Math.max(0, len - minArc),
          0
        );
        if (surplusTotal > 0) {
          for (let i = 0; i < lens.length; i++) {
            const surplus = Math.max(0, lens[i] - minArc);
            if (surplus > 0) {
              lens[i] -= (surplus / surplusTotal) * deficit;
            }
          }
        }
      }

      let cursor = 0;
      for (let i = 0; i < segCount; i++) {
        const arcLen = Math.max(0.5, lens[i]);
        ringArcs.push({
          key: segments[i].key,
          color: segments[i].color,
          arcLen,
          offset: -cursor,
        });
        cursor += arcLen + gapLen;
      }
    }

    return (
      <div className="px-2 pb-2.5 flex justify-center">
        <MorphTooltip
          placement="right"
          content={
            <div className="space-y-1.5 min-w-[148px]">
              <div className="flex items-center justify-between gap-3 font-medium">
                <span>{t("在控合规率", "Compliance")}</span>
                <span className="font-mono">{compliancePct}%</span>
              </div>
              {segments.length > 0 ? (
                <div className="space-y-0.5 pt-0.5 border-t border-white/10">
                  {segments.map((seg) => (
                    <div
                      key={seg.key}
                      className="flex items-center justify-between gap-3 text-[10.5px]"
                    >
                      <span className="inline-flex items-center gap-1.5 text-zinc-300">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span>{seg.label}</span>
                      </span>
                      <span className="font-mono text-zinc-400">
                        {seg.count} · {seg.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10.5px] text-zinc-400 font-mono">
                  {t("受控", "Controlled")} {controlled} ·{" "}
                  {expired > 0
                    ? t(`${expired} 台待复校`, `${expired} overdue`)
                    : t("效期良好", "All valid")}
                </div>
              )}
            </div>
          }
        >
          <motion.button
            type="button"
            whileTap={TAP_SCALE_SUBTLE}
            transition={SPRING_SNAPPY}
            onClick={() =>
              expired > 0 ? onFilterStatus("expired") : onFilterStatus("all")
            }
            className="relative h-9 w-9 rounded-full bg-transparent hover:bg-zinc-200/55 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors focus:outline-none"
            aria-label={`在控设备合规率 ${compliancePct}%`}
          >
            <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90" fill="none">
              {ringArcs.length > 0 ? (
                ringArcs.map((arc) => (
                  <motion.circle
                    key={arc.key}
                    cx="18"
                    cy="18"
                    r={r}
                    stroke={arc.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap={segCount === 1 ? "butt" : "round"}
                    initial={false}
                    animate={{
                      strokeDasharray: `${arc.arcLen} ${Math.max(0, circ - arc.arcLen)}`,
                      strokeDashoffset: arc.offset,
                    }}
                    transition={{ duration: 0.45, ease: EASE_PRECISION }}
                  />
                ))
              ) : (
                <>
                  <circle
                    cx="18"
                    cy="18"
                    r={r}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${circ * 0.28} ${circ * 0.72}`}
                    strokeDashoffset={0}
                    className="text-zinc-300 dark:text-zinc-700"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r={r}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${circ * 0.52} ${circ * 0.48}`}
                    strokeDashoffset={-(circ * 0.38)}
                    className="text-zinc-300 dark:text-zinc-700"
                  />
                </>
              )}
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9.5px] font-mono font-semibold tabular-nums leading-none text-zinc-700 dark:text-zinc-200">
              {compliancePct}
            </span>
          </motion.button>
        </MorphTooltip>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <SpotlightSurface
        spotlightColor="rgba(79, 70, 229, 0.065)"
        radius={180}
        className="p-3 rounded-xl bg-white/90 dark:bg-white/[0.03] border border-zinc-200/85 dark:border-white/[0.07] shadow-tactile space-y-2.5"
      >
        {/* Header Row — clickable to toggle detailed breakdown */}
        <button
          type="button"
          onClick={() => segments.length > 0 && setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left group focus:outline-none"
          title={segments.length > 0 ? "点击展开各状态占比明细" : undefined}
        >
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200 transition-colors">
            <span>{t("在控设备合规率", "Compliance Rate")}</span>
            {segments.length > 0 && (
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={SPRING_SNAPPY}
                className="inline-flex items-center text-zinc-400"
              >
                <ChevronDown className="h-3 w-3" />
              </motion.span>
            )}
          </span>
          <SlidingNumber
            value={compliancePct}
            suffix="%"
            className="text-sm font-semibold font-mono text-zinc-900 dark:text-white"
          />
        </button>

        {/* Interactive Multi-Segment Storage-Meter Style Bar */}
        <div
          className="h-2 w-full rounded-full bg-zinc-200/80 dark:bg-white/[0.07] overflow-hidden flex gap-[2px] p-[1px]"
          onMouseLeave={() => setHoveredKey(null)}
        >
          {segments.length > 0 ? (
            segments.map((seg) => {
              const isHovered = hoveredKey === seg.key;
              const isDimmed = hoveredKey !== null && !isHovered;
              return (
                <motion.button
                  key={seg.key}
                  type="button"
                  initial={false}
                  animate={{
                    width: `${(seg.count / controlled) * 100}%`,
                    opacity: isDimmed ? 0.35 : 1,
                    scaleY: isHovered ? 1.25 : 1,
                  }}
                  transition={{
                    width: { duration: 0.45, ease: EASE_PRECISION },
                    opacity: { duration: 0.14 },
                    scaleY: SPRING_SNAPPY,
                  }}
                  onMouseEnter={() => setHoveredKey(seg.key)}
                  onClick={seg.onSelect}
                  aria-label={`${seg.label} ${seg.count} 台（${seg.pct}%），点击筛选`}
                  className="h-full rounded-full min-w-[4px] cursor-pointer focus:outline-none"
                  style={{ backgroundColor: seg.color }}
                />
              );
            })
          ) : (
            <div className="h-full w-full bg-zinc-300/60 dark:bg-zinc-700/50 rounded-full" />
          )}
        </div>

        {/* Live Hover Readout OR Default Footer */}
        <div className="h-4 flex items-center justify-between text-[10.5px] font-mono tabular-nums overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {activeHoverSeg ? (
              <motion.div
                key={`hover-${activeHoverSeg.key}`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.14, ease: EASE_PRECISION }}
                className="w-full flex items-center justify-between gap-2"
              >
                <span className="inline-flex items-center gap-1.5 font-sans text-zinc-700 dark:text-zinc-200 font-medium truncate">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeHoverSeg.color }}
                  />
                  <span className="truncate">{activeHoverSeg.label}</span>
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 shrink-0">
                  {isEn
                    ? `${activeHoverSeg.count} · ${activeHoverSeg.pct}%`
                    : `${activeHoverSeg.count} 台 · ${activeHoverSeg.pct}%`}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.14, ease: EASE_PRECISION }}
                className="w-full flex items-center justify-between text-zinc-400 dark:text-zinc-500"
              >
                <span>{t(`受控 ${controlled}`, `Tracked ${controlled}`)}</span>
                <span>
                  {expired > 0
                    ? t(`${expired} 台待复校`, `${expired} overdue`)
                    : t("效期状态良好", "All up to date")}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Expandable Per-Segment Breakdown List (Storage Meter detail view) */}
        <AnimatePresence initial={false}>
          {expanded && segments.length > 0 && (
            <motion.div
              key="meter-breakdown"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_GENTLE}
              className="overflow-hidden"
            >
              <div className="pt-2 border-t border-zinc-200/75 dark:border-white/[0.06] space-y-1">
                {segments.map((seg) => {
                  const active = hoveredKey === seg.key;
                  return (
                    <motion.button
                      key={seg.key}
                      type="button"
                      whileTap={TAP_SCALE_SUBTLE}
                      transition={SPRING_SNAPPY}
                      onMouseEnter={() => setHoveredKey(seg.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onClick={seg.onSelect}
                      className={cn(
                        "w-full px-1.5 py-1 rounded-lg flex items-center justify-between gap-2 text-[11px] transition-colors",
                        active
                          ? "bg-zinc-100/95 dark:bg-white/[0.07] text-zinc-950 dark:text-white"
                          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-white/[0.05]"
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="truncate font-medium">{seg.label}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-[10.5px] text-zinc-500 dark:text-zinc-400 shrink-0">
                        <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                          {seg.count}
                        </span>
                        <span className="w-7 text-right">{seg.pct}%</span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SpotlightSurface>
    </div>
  );
};
