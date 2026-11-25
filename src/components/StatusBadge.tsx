import React from "react";
import type { InstrumentStatusInfo } from "@/lib/status";
import { getThresholdVisuals } from "@/lib/thresholdColors";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  info: InstrumentStatusInfo;
  compact?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(({ info, compact }) => {
  // Custom multi-tier warning color rendering
  if (info.status === "warning" && info.matchedThreshold) {
    const visuals = getThresholdVisuals(info.matchedThreshold.color);
    const shouldPulse =
      info.daysRemaining !== null &&
      info.daysRemaining <= Math.min(30, info.matchedThreshold.days);

    return (
      <div
        className="inline-flex flex-col items-start gap-1"
        style={visuals.cssVars}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors",
            "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)]",
            "text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]",
            "border-[var(--tier-border)] dark:border-[var(--tier-border-dark)]",
            compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-[11.5px]"
          )}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {shouldPulse && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                style={{ backgroundColor: visuals.hex }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{
                backgroundColor: visuals.hex,
                boxShadow: visuals.glow,
              }}
            />
          </span>
          <span className="tracking-tight">{info.label}</span>
        </span>

        {!compact && info.detailText && (
          <span className="text-[11px] font-mono tabular-nums pl-0.5 whitespace-nowrap font-medium text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]">
            {info.detailText}
          </span>
        )}
      </div>
    );
  }

  const styles: Record<
    InstrumentStatusInfo["status"],
    { pill: string; dot: string; glow: string; sub: string; pulse?: boolean }
  > = {
    valid: {
      pill: "bg-emerald-500/[0.08] text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/[0.12] dark:text-emerald-400 dark:border-emerald-500/25",
      dot: "bg-emerald-500 dark:bg-emerald-400",
      glow: "shadow-[0_0_8px_rgba(16,185,129,0.45)]",
      sub: "text-zinc-400 dark:text-zinc-500",
    },
    warning: {
      pill: "bg-amber-500/[0.09] text-amber-700 border-amber-500/25 dark:bg-amber-500/[0.12] dark:text-amber-300 dark:border-amber-500/25",
      dot: "bg-amber-500 dark:bg-amber-400",
      glow: "shadow-[0_0_8px_rgba(245,158,11,0.5)]",
      sub: "text-amber-600 dark:text-amber-400/90 font-medium",
      pulse: true,
    },
    expired: {
      pill: "bg-rose-500/[0.09] text-rose-700 border-rose-500/25 dark:bg-rose-500/[0.14] dark:text-rose-400 dark:border-rose-500/25",
      dot: "bg-rose-500 dark:bg-rose-400",
      glow: "shadow-[0_0_8px_rgba(244,63,94,0.5)]",
      sub: "text-rose-600 dark:text-rose-400 font-medium",
    },
    exempt: {
      pill: "bg-zinc-500/[0.07] text-zinc-600 border-zinc-500/20 dark:bg-zinc-500/[0.12] dark:text-zinc-400 dark:border-zinc-500/25",
      dot: "bg-zinc-400 dark:bg-zinc-500",
      glow: "",
      sub: "text-zinc-400 dark:text-zinc-500",
    },
  };

  const s = styles[info.status];

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors",
          compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-[11.5px]",
          s.pill
        )}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {s.pulse && (
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-70",
                s.dot
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-1.5 w-1.5",
              s.dot,
              s.glow
            )}
          />
        </span>
        <span className="tracking-tight">{info.label}</span>
      </span>

      {!compact && info.detailText && (
        <span
          className={cn(
            "text-[11px] font-mono tabular-nums pl-0.5 whitespace-nowrap",
            s.sub
          )}
        >
          {info.detailText}
        </span>
      )}
    </div>
  );
});
