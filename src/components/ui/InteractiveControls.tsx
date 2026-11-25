import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  Check,
  Copy,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  Upload,
  X,
} from "lucide-react";
import {
  EASE_PRECISION,
  SPRING_SNAPPY,
  SPRING_TACTILE,
  TAP_SCALE,
  TAP_SCALE_ICON,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ============================================================================
 * 1. HoldConfirmButton — Press-and-hold safety gate for destructive actions
 * ========================================================================== */

interface HoldConfirmButtonProps {
  onConfirm: () => void;
  idleLabel: string;
  holdingLabel?: string;
  completedLabel?: string;
  loadingLabel?: string;
  holdDurationMs?: number;
  icon?: React.ReactNode;
  variant?: "danger" | "primary";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const HoldConfirmButton: React.FC<HoldConfirmButtonProps> = ({
  onConfirm,
  idleLabel,
  holdingLabel = "继续按住...",
  completedLabel = "已确认",
  loadingLabel = "执行中...",
  holdDurationMs = 920,
  icon,
  variant = "danger",
  disabled = false,
  loading = false,
  className,
}) => {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const firedRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const stopHold = useCallback((reset = true) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHolding(false);
    if (reset && !firedRef.current) {
      setProgress(0);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loading && confirmed) {
      const t = window.setTimeout(() => {
        setConfirmed(false);
        setProgress(0);
        firedRef.current = false;
      }, 650);
      return () => window.clearTimeout(t);
    }
  }, [loading, confirmed]);

  const startHold = useCallback(() => {
    if (disabled || loading || firedRef.current) return;
    firedRef.current = false;
    setHolding(true);
    startTsRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTsRef.current;
      const ratio = Math.min(1, elapsed / holdDurationMs);
      setProgress(ratio);

      if (ratio >= 1) {
        firedRef.current = true;
        rafRef.current = null;
        setHolding(false);
        setConfirmed(true);
        onConfirmRef.current();
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [disabled, loading, holdDurationMs]);

  const isDanger = variant === "danger";

  return (
    <motion.button
      type="button"
      disabled={disabled || loading}
      animate={{
        scale: confirmed ? [1, 1.03, 1] : holding ? 0.975 : 1,
      }}
      transition={SPRING_SNAPPY}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        startHold();
      }}
      onPointerUp={() => stopHold(true)}
      onPointerCancel={() => stopHold(true)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          stopHold(true);
        }
      }}
      onBlur={() => stopHold(true)}
      aria-label={`${idleLabel}（长按确认）`}
      className={cn(
        "relative overflow-hidden inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold select-none touch-none shadow-tactile-primary transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-45 disabled:pointer-events-none",
        isDanger
          ? "bg-rose-600/90 hover:bg-rose-600 text-white border border-rose-500/80 focus-visible:ring-rose-500/40"
          : "bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 border border-zinc-900/90 dark:border-white/90 focus-visible:ring-indigo-500/40",
        className
      )}
    >
      {/* Sweeping fill layer */}
      <span
        aria-hidden="true"
        style={{
          transform: `scaleX(${confirmed ? 1 : progress})`,
          transition: holding ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className={cn(
          "pointer-events-none absolute inset-0 origin-left",
          isDanger
            ? "bg-gradient-to-r from-rose-700 via-rose-500 to-amber-400/90"
            : "bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-400"
        )}
      />

      {/* Luminous leading edge highlight during hold */}
      {holding && progress > 0.02 && progress < 1 && (
        <span
          aria-hidden="true"
          style={{ left: `${progress * 100}%` }}
          className="pointer-events-none absolute inset-y-0 w-4 -ml-2 bg-gradient-to-r from-transparent via-white/45 to-transparent blur-[2px]"
        />
      )}

      {/* Label + Icon */}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        ) : confirmed ? (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING_TACTILE}
            className="flex items-center"
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
          </motion.span>
        ) : (
          icon && <span className="flex items-center shrink-0">{icon}</span>
        )}
        <span>
          {loading
            ? loadingLabel
            : confirmed
              ? completedLabel
              : holding
                ? holdingLabel
                : idleLabel}
        </span>
      </span>
    </motion.button>
  );
};

/* ============================================================================
 * 2. ActionStatusButton & useActionStatus — Morphing idle -> loading -> success
 * ========================================================================== */

export type ActionStatus = "idle" | "loading" | "success" | "error";

export function useActionStatus(autoResetMs = 1400) {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const setTransientSuccess = useCallback(() => {
    clearTimer();
    setStatus("success");
    timerRef.current = window.setTimeout(() => {
      setStatus("idle");
      timerRef.current = null;
    }, autoResetMs);
  }, [autoResetMs, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setStatus("idle");
  }, [clearTimer]);

  return { status, setStatus, setTransientSuccess, reset };
}

interface ActionStatusButtonProps {
  status: ActionStatus;
  idleLabel: string;
  loadingLabel?: string;
  successLabel?: string;
  idleIcon?: React.ReactNode;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export const ActionStatusButton: React.FC<ActionStatusButtonProps> = ({
  status,
  idleLabel,
  loadingLabel = "保存中...",
  successLabel = "已完成",
  idleIcon,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  className,
}) => {
  const isBusy = status === "loading";
  const isSuccess = status === "success";

  const sizeCls =
    size === "sm"
      ? "px-3.5 py-1.5 text-xs rounded-lg gap-1.5"
      : "px-4 py-2 text-xs rounded-xl gap-1.5";

  const toneCls = isSuccess
    ? "bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-500 text-white dark:text-zinc-950 border border-emerald-500/80 shadow-tactile-primary"
    : variant === "primary"
      ? "btn-sheen bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 border border-zinc-900/90 dark:border-white/90 shadow-tactile-primary"
      : "bg-white hover:bg-zinc-50 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-zinc-800 dark:text-zinc-100 border border-zinc-200/95 dark:border-white/[0.12] shadow-tactile";

  return (
    <motion.button
      layout="size"
      type={type}
      disabled={disabled || isBusy}
      whileTap={disabled || isBusy ? undefined : TAP_SCALE}
      transition={SPRING_SNAPPY}
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center justify-center font-semibold select-none overflow-hidden transition-colors duration-200 disabled:opacity-45 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35",
        sizeCls,
        toneCls,
        className
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {isBusy ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={{ duration: 0.16, ease: EASE_PRECISION }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>{loadingLabel}</span>
          </motion.span>
        ) : isSuccess ? (
          <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.78, filter: "blur(3px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={SPRING_TACTILE}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
            <span>{successLabel}</span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={{ duration: 0.16, ease: EASE_PRECISION }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {idleIcon && <span className="flex items-center shrink-0">{idleIcon}</span>}
            <span>{idleLabel}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/* ============================================================================
 * 3. CopyButton — Tactile one-click copy with spring icon morph
 * ========================================================================== */

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: "xs" | "sm";
  ariaLabel?: string;
  onCopied?: () => void;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  copiedLabel = "已复制",
  size = "xs",
  ariaLabel = "复制",
  onCopied,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    onCopied?.();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1500);
  };

  const iconCls = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <motion.button
      type="button"
      whileTap={TAP_SCALE_ICON}
      transition={SPRING_SNAPPY}
      onClick={handleCopy}
      aria-label={copied ? copiedLabel : ariaLabel}
      title={copied ? copiedLabel : ariaLabel}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35",
        label ? "px-2 py-1 text-[11px] font-medium" : size === "xs" ? "p-1" : "p-1.5",
        copied
          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-white/[0.08]",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.45, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={SPRING_TACTILE}
            className="inline-flex items-center gap-1"
          >
            <Check className={cn(iconCls, "stroke-[2.4]")} />
            {label && <span>{copiedLabel}</span>}
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="inline-flex items-center gap-1"
          >
            <Copy className={iconCls} />
            {label && <span>{label}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/* ============================================================================
 * 4. KeycapBadge — Machined 3D tactile keycap (Command button aesthetic)
 * ========================================================================== */

interface KeycapBadgeProps {
  children: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

export const KeycapBadge: React.FC<KeycapBadgeProps> = ({
  children,
  onClick,
  pressed = false,
  size = "xs",
  className,
}) => {
  const baseCls = cn(
    "keycap-3d inline-flex items-center justify-center font-mono leading-none select-none rounded-[5px] border",
    "bg-gradient-to-b from-white to-zinc-100/95 dark:from-zinc-800/95 dark:to-zinc-900",
    "border-zinc-200/95 dark:border-white/[0.12] text-zinc-600 dark:text-zinc-300",
    size === "xs" ? "px-1.5 py-[3px] text-[10px]" : "px-2 py-1 text-[11px]",
    pressed && "keycap-3d-pressed",
    onClick && "cursor-pointer hover:text-zinc-950 dark:hover:text-white",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseCls}>
        {children}
      </button>
    );
  }
  return <kbd className={baseCls}>{children}</kbd>;
};

/* ============================================================================
 * 5. AnimatedBellIcon — Physical pendulum swing micro-motion for alert bell
 * ========================================================================== */

interface AnimatedBellIconProps {
  hasAlerts: boolean;
  alertCount?: number;
  hovered?: boolean;
  className?: string;
}

export const AnimatedBellIcon: React.FC<AnimatedBellIconProps> = ({
  hasAlerts,
  alertCount = 0,
  hovered = false,
  className,
}) => {
  const [ringNonce, setRingNonce] = useState(0);
  const prevCountRef = useRef(alertCount);

  useEffect(() => {
    if (hasAlerts && alertCount > 0 && alertCount !== prevCountRef.current) {
      setRingNonce((n) => n + 1);
    }
    prevCountRef.current = alertCount;
  }, [hasAlerts, alertCount]);

  useEffect(() => {
    if (hovered) {
      setRingNonce((n) => n + 1);
    }
  }, [hovered]);

  // Subtle initial chime when alerts are present on load
  useEffect(() => {
    if (!hasAlerts) return;
    const t = window.setTimeout(() => setRingNonce((n) => n + 1), 650);
    return () => window.clearTimeout(t);
  }, [hasAlerts]);

  return (
    <motion.span
      key={ringNonce}
      style={{ originX: 0.5, originY: 0.14 }}
      animate={
        ringNonce > 0
          ? { rotate: [0, 15, -13, 10, -7, 4, -2, 0] }
          : { rotate: 0 }
      }
      transition={{ duration: 0.72, ease: EASE_PRECISION }}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <BellRing className="h-3.5 w-3.5" />
    </motion.span>
  );
};

/* ============================================================================
 * 6. NumberStepper — Vertical rolling numeric stepper with direct edit + hold
 * ========================================================================== */

interface NumberStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  disabled = false,
  size = "sm",
  className,
  ariaLabel,
}) => {
  const [direction, setDirection] = useState<1 | -1>(1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!editing) {
      setDraft(String(value));
    }
  }, [value, editing]);

  const stopRepeat = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRepeat(), [stopRepeat]);

  const clamp = useCallback(
    (n: number) => Math.max(min, Math.min(max, n)),
    [min, max]
  );

  const nudge = useCallback(
    (delta: number) => {
      const next = clamp(valueRef.current + delta);
      if (next !== valueRef.current) {
        setDirection(delta > 0 ? 1 : -1);
        onChange(next);
      }
    },
    [clamp, onChange]
  );

  const beginRepeat = (delta: number) => {
    if (disabled) return;
    nudge(delta);
    stopRepeat();
    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        nudge(delta);
      }, 65);
    }, 360);
  };

  const commitDraft = () => {
    setEditing(false);
    const parsed = Math.round(Number(draft));
    if (Number.isFinite(parsed)) {
      const clamped = clamp(parsed);
      if (clamped !== value) {
        setDirection(clamped > value ? 1 : -1);
        onChange(clamped);
      }
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  const heightCls =
    size === "xs"
      ? "h-7 rounded-lg text-xs"
      : size === "md"
        ? "h-[38px] rounded-xl text-sm"
        : "h-8 rounded-lg text-xs";
  const btnWidthCls = size === "xs" ? "w-6" : size === "md" ? "w-8" : "w-7";

  return (
    <div
      className={cn(
        "inline-flex items-center border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile overflow-hidden select-none transition-colors",
        editing &&
          "border-zinc-400 dark:border-white/25 ring-[3px] ring-zinc-900/[0.06] dark:ring-white/[0.08]",
        disabled && "opacity-55 pointer-events-none",
        heightCls,
        className
      )}
    >
      <motion.button
        type="button"
        disabled={disabled || value <= min}
        whileTap={disabled || value <= min ? undefined : { scale: 0.86 }}
        transition={SPRING_SNAPPY}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          beginRepeat(-step);
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        aria-label={`减少${ariaLabel ? ` ${ariaLabel}` : ""}`}
        className={cn(
          "h-full inline-flex items-center justify-center text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100/90 dark:hover:bg-white/[0.07] disabled:opacity-30 transition-colors shrink-0",
          btnWidthCls
        )}
      >
        <Minus className="h-3 w-3" />
      </motion.button>

      <div
        onClick={() => {
          if (disabled || editing) return;
          setDraft(String(value));
          setEditing(true);
          window.setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }, 10);
        }}
        className="relative flex-1 min-w-[44px] h-full flex items-center justify-center px-1.5 border-x border-zinc-200/75 dark:border-white/[0.07] cursor-text overflow-hidden font-mono tabular-nums"
      >
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            aria-label={ariaLabel}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setDraft(String(value));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                nudge(step);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                nudge(-step);
              }
            }}
            className="w-full h-full bg-transparent text-center font-mono text-zinc-950 dark:text-white focus:outline-none"
          />
        ) : (
          <div className="inline-flex items-baseline justify-center gap-0.5 text-zinc-900 dark:text-zinc-100 font-medium">
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.span
                key={value}
                custom={direction}
                initial={{ opacity: 0, y: direction > 0 ? 11 : -11, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: direction > 0 ? -11 : 11, filter: "blur(2px)" }}
                transition={{ duration: 0.16, ease: EASE_PRECISION }}
                className="inline-block"
              >
                {value}
              </motion.span>
            </AnimatePresence>
            {suffix && (
              <span className="text-[10.5px] font-sans text-zinc-400 dark:text-zinc-500">
                {suffix}
              </span>
            )}
          </div>
        )}
      </div>

      <motion.button
        type="button"
        disabled={disabled || value >= max}
        whileTap={disabled || value >= max ? undefined : { scale: 0.86 }}
        transition={SPRING_SNAPPY}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          beginRepeat(step);
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        aria-label={`增加${ariaLabel ? ` ${ariaLabel}` : ""}`}
        className={cn(
          "h-full inline-flex items-center justify-center text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100/90 dark:hover:bg-white/[0.07] disabled:opacity-30 transition-colors shrink-0",
          btnWidthCls
        )}
      >
        <Plus className="h-3 w-3" />
      </motion.button>
    </div>
  );
};

/* ============================================================================
 * 7. PrecisionFileDropZone — Physical drag-drop zone (Tauri v2 + HTML5)
 * ========================================================================== */

interface PrecisionFileDropZoneProps {
  onPickClick: () => void;
  onDropPaths?: (paths: string[]) => void;
  onDropFiles?: (files: File[]) => void;
  acceptedExtensions?: string[];
  selectedFileName?: string;
  selectedMeta?: string;
  onClear?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  idleTitle: string;
  idleSubtitle?: string;
  iconKind?: "excel" | "image" | "report";
  compact?: boolean;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}

function matchesAcceptedExtensions(nameOrPath: string, exts?: string[]): boolean {
  if (!exts || exts.length === 0) return true;
  const lower = nameOrPath.toLowerCase();
  return exts.some((ext) => lower.endsWith(`.${ext.toLowerCase().replace(/^\./, "")}`));
}

export const PrecisionFileDropZone: React.FC<PrecisionFileDropZoneProps> = ({
  onPickClick,
  onDropPaths,
  onDropFiles,
  acceptedExtensions,
  selectedFileName,
  selectedMeta,
  onClear,
  loading = false,
  loadingLabel = "处理中...",
  idleTitle,
  idleSubtitle,
  iconKind = "report",
  compact = false,
  disabled = false,
  active = true,
  className,
}) => {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const dragDepthRef = useRef(0);

  const onDropPathsRef = useRef(onDropPaths);
  onDropPathsRef.current = onDropPaths;
  const acceptedRef = useRef(acceptedExtensions);
  acceptedRef.current = acceptedExtensions;

  const flashRejected = useCallback(() => {
    setRejected(true);
    window.setTimeout(() => setRejected(false), 520);
  }, []);

  // Tauri v2 native window file drag-drop listener (safe no-op outside Tauri)
  useEffect(() => {
    if (!active || disabled || !onDropPathsRef.current) return;
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const hitTest = (pos: { x: number; y: number }): boolean => {
      const el = zoneRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const pad = 20;
      const lx = pos.x / dpr;
      const ly = pos.y / dpr;
      const inLogical =
        lx >= rect.left - pad &&
        lx <= rect.right + pad &&
        ly >= rect.top - pad &&
        ly <= rect.bottom + pad;
      if (inLogical) return true;
      // Fallback if OS reports logical directly
      return (
        pos.x >= rect.left - pad &&
        pos.x <= rect.right + pad &&
        pos.y >= rect.top - pad &&
        pos.y <= rect.bottom + pad
      );
    };

    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setDragging(hitTest(payload.position));
          } else if (payload.type === "leave") {
            setDragging(false);
          } else if (payload.type === "drop") {
            const inside = hitTest(payload.position);
            setDragging(false);
            if (!inside || payload.paths.length === 0) return;
            const valid = payload.paths.filter((p) =>
              matchesAcceptedExtensions(p, acceptedRef.current)
            );
            if (valid.length === 0) {
              flashRejected();
              return;
            }
            onDropPathsRef.current?.(valid);
          }
        })
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Ignore if running in pure browser mode
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [active, disabled, flashRejected]);

  const MainIcon =
    iconKind === "excel"
      ? FileSpreadsheet
      : iconKind === "image"
        ? ImageIcon
        : FileText;

  return (
    <motion.div
      ref={zoneRef}
      role="button"
      tabIndex={disabled || loading ? -1 : 0}
      aria-disabled={disabled || loading}
      onClick={() => {
        if (!disabled && !loading) onPickClick();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled && !loading) {
          e.preventDefault();
          onPickClick();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled || loading) return;
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !loading && !dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        if (disabled || loading) return;
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length === 0) return;
        const valid = files.filter((f) =>
          matchesAcceptedExtensions(f.name, acceptedExtensions)
        );
        if (valid.length === 0) {
          flashRejected();
          return;
        }
        onDropFiles?.(valid);
      }}
      animate={{
        scale: dragging ? 1.012 : 1,
        x: rejected ? [0, -6, 6, -4, 4, 0] : 0,
      }}
      transition={SPRING_SNAPPY}
      className={cn(
        "group relative w-full rounded-xl border border-dashed text-center cursor-pointer select-none overflow-hidden transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35",
        compact ? "py-3.5 px-3" : "py-6 px-4",
        disabled && "opacity-55 pointer-events-none",
        rejected
          ? "border-rose-500 bg-rose-500/[0.06]"
          : dragging
            ? "border-indigo-500 dark:border-indigo-400 bg-indigo-500/[0.07] dark:bg-indigo-400/[0.09] shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
            : selectedFileName
              ? "border-zinc-300/95 dark:border-white/[0.16] bg-white dark:bg-white/[0.03] hover:border-zinc-400 dark:hover:border-white/25"
              : "border-zinc-300 dark:border-white/[0.15] bg-zinc-50/60 dark:bg-white/[0.02] hover:border-zinc-400 dark:hover:border-white/30 hover:bg-zinc-50 dark:hover:bg-white/[0.04]",
        className
      )}
    >
      {/* Subtle radial glow when dragging over */}
      <motion.div
        aria-hidden="true"
        animate={{ opacity: dragging ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.14),transparent_72%)]"
      />

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="relative z-10 flex flex-col items-center justify-center gap-1.5"
          >
            <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
              {loadingLabel}
            </div>
          </motion.div>
        ) : selectedFileName ? (
          <motion.div
            key="selected"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={SPRING_SNAPPY}
            className="relative z-10 flex items-center justify-between gap-2.5 text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <MainIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {selectedFileName}
                </div>
                <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate">
                  {selectedMeta || "点击更换或拖入新文件"}
                </div>
              </div>
            </div>
            {onClear && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="btn-tactile p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"
                title="移除已选文件"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* Layered floating document stack icon */}
            <div className={cn("relative flex items-center justify-center", compact ? "mb-1.5 h-8 w-8" : "mb-2.5 h-10 w-10")}>
              <motion.span
                aria-hidden="true"
                animate={
                  dragging
                    ? { x: -10, y: -2, rotate: -14, opacity: 0.85 }
                    : { x: 0, y: 0, rotate: -6, opacity: 0.35 }
                }
                transition={SPRING_SNAPPY}
                className="absolute inset-1 rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900"
              />
              <motion.span
                aria-hidden="true"
                animate={
                  dragging
                    ? { x: 10, y: -2, rotate: 14, opacity: 0.85 }
                    : { x: 0, y: 0, rotate: 6, opacity: 0.35 }
                }
                transition={SPRING_SNAPPY}
                className="absolute inset-1 rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900"
              />
              <motion.div
                animate={
                  dragging
                    ? { y: -4, scale: 1.08, rotate: 0 }
                    : { y: 0, scale: 1, rotate: 0 }
                }
                transition={SPRING_TACTILE}
                className={cn(
                  "relative z-10 rounded-xl border flex items-center justify-center shadow-tactile transition-colors",
                  compact ? "h-8 w-8" : "h-10 w-10",
                  dragging
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-white dark:bg-[#17171c] border-zinc-200/90 dark:border-white/[0.1] text-zinc-500 dark:text-zinc-400 group-hover:text-indigo-500 group-hover:border-indigo-300/80 dark:group-hover:border-indigo-400/40"
                )}
              >
                {dragging ? (
                  <Upload className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                ) : (
                  <MainIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                )}
              </motion.div>
            </div>

            <div
              className={cn(
                "font-medium transition-colors",
                compact ? "text-xs" : "text-sm",
                dragging
                  ? "text-indigo-600 dark:text-indigo-300"
                  : "text-zinc-800 dark:text-zinc-100"
              )}
            >
              {rejected
                ? "文件格式不支持"
                : dragging
                  ? "松开即可导入文件"
                  : idleTitle}
            </div>
            {idleSubtitle && (
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                {idleSubtitle}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
