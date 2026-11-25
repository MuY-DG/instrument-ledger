import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  EASE_PRECISION,
  POPOVER_MOTION,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ============================================================================
 * 1. PrecisionSwitch — Tactile spring toggle with subtle thumb squish
 * ========================================================================== */

interface PrecisionSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

export const PrecisionSwitch: React.FC<PrecisionSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  size = "md",
  ariaLabel,
  className,
}) => {
  const [pressed, setPressed] = useState(false);

  const trackCls = size === "sm" ? "h-5 w-9 p-[2px]" : "h-[22px] w-10 p-[2.5px]";
  const thumbBase = size === "sm" ? 16 : 17;
  const thumbWidth = pressed && !disabled ? thumbBase + 3 : thumbBase;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer select-none",
        trackCls,
        checked
          ? "justify-end bg-zinc-900 dark:bg-white shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]"
          : "justify-start bg-zinc-200/95 hover:bg-zinc-300/90 dark:bg-white/[0.12] dark:hover:bg-white/[0.18] shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      <motion.span
        layout
        transition={SPRING_SNAPPY}
        style={{ width: thumbWidth, height: thumbBase }}
        className={cn(
          "block rounded-full shadow-[0_1px_3px_rgba(15,23,42,0.22),0_0_0_0.5px_rgba(15,23,42,0.05)]",
          checked
            ? "bg-white dark:bg-zinc-950"
            : "bg-white dark:bg-zinc-200"
        )}
      />
    </button>
  );
};

/* ============================================================================
 * 2. PrecisionCheckbox — Animated SVG checkmark with tactile spring pop
 * ========================================================================== */

interface PrecisionCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: React.ReactNode;
}

export const PrecisionCheckbox: React.FC<PrecisionCheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  className,
  label,
}) => {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 select-none group",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className
      )}
    >
      <motion.button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.88 }}
        transition={SPRING_SNAPPY}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }}
        className={cn(
          "relative h-[17px] w-[17px] rounded-[5px] border flex items-center justify-center shrink-0 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35",
          checked
            ? "bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white shadow-[0_1px_2px_rgba(15,23,42,0.18)]"
            : "bg-white dark:bg-white/[0.04] border-zinc-300/95 dark:border-white/[0.18] group-hover:border-zinc-400 dark:group-hover:border-white/35 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        )}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <motion.path
            d="M2.5 6.2L4.9 8.6L9.5 3.6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white dark:text-zinc-950"
            initial={false}
            animate={{
              pathLength: checked ? 1 : 0,
              opacity: checked ? 1 : 0,
            }}
            transition={{ duration: 0.18, ease: EASE_PRECISION }}
          />
        </svg>
      </motion.button>
      {label}
    </label>
  );
};

/* ============================================================================
 * 3. PrecisionSelect — Portal-rendered animated select menu (replaces native <select>)
 * ========================================================================== */

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  hint?: string;
}

interface PrecisionSelectProps<T extends string | number = string> {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  placeholder?: string;
  size?: "xs" | "sm" | "md";
  align?: "left" | "right";
  className?: string;
  menuClassName?: string;
}

export function PrecisionSelect<T extends string | number = string>({
  value,
  options,
  onChange,
  disabled = false,
  icon,
  placeholder = "请选择",
  size = "sm",
  align = "left",
  className,
  menuClassName,
}: PrecisionSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    minWidth: number;
    openUp: boolean;
  } | null>(null);

  const selected = options.find((o) => o.value === value);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estHeight = Math.min(264, options.length * 32 + 12);
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const openUp = spaceBelow < estHeight && rect.top > estHeight;
    const minWidth = Math.max(rect.width, 136);
    const rawLeft = align === "right" ? rect.right - minWidth : rect.left;
    const left = Math.max(
      10,
      Math.min(rawLeft, window.innerWidth - minWidth - 10)
    );
    if (openUp) {
      setPos({
        bottom: window.innerHeight - rect.top + 6,
        left,
        minWidth,
        openUp: true,
      });
    } else {
      setPos({
        top: rect.bottom + 6,
        left,
        minWidth,
        openUp: false,
      });
    }
  }, [options.length, align]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const idx = options.findIndex((o) => o.value === value);
    setHighlightIdx(idx >= 0 ? idx : 0);
    const onScrollOrResize = () => updatePos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePos, options, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % Math.max(1, options.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx(
          (i) => (i - 1 + options.length) % Math.max(1, options.length)
        );
      } else if (e.key === "Enter" && highlightIdx >= 0 && options[highlightIdx]) {
        e.preventDefault();
        onChange(options[highlightIdx].value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, options, highlightIdx, onChange]);

  const sizeCls =
    size === "xs"
      ? "px-2.5 py-1.5 text-xs rounded-lg gap-1.5"
      : size === "md"
        ? "px-3 py-2 text-xs sm:text-sm rounded-xl gap-2"
        : "px-2.5 py-1.5 text-xs rounded-lg gap-1.5";

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        whileTap={disabled ? undefined : TAP_SCALE_SUBTLE}
        transition={SPRING_SNAPPY}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center justify-between border bg-white dark:bg-[#141418] text-zinc-700 dark:text-zinc-200 shadow-tactile transition-all duration-150 select-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
          open
            ? "border-zinc-400 dark:border-white/25 ring-[3px] ring-zinc-900/[0.06] dark:ring-white/[0.08]"
            : "border-zinc-200/95 dark:border-white/[0.1] hover:border-zinc-300 dark:hover:border-white/[0.18] hover:bg-zinc-50/70 dark:hover:bg-white/[0.05]",
          sizeCls,
          className
        )}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
          <span className="truncate font-medium">
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={SPRING_SNAPPY}
          className="text-zinc-400 shrink-0 flex items-center"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </motion.button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={menuRef}
                role="listbox"
                {...POPOVER_MOTION}
                style={{
                  position: "fixed",
                  top: pos.top,
                  bottom: pos.bottom,
                  left: pos.left,
                  minWidth: pos.minWidth,
                  transformOrigin: pos.openUp ? "bottom center" : "top center",
                }}
                className={cn(
                  "z-[180] max-h-64 overflow-y-auto rounded-xl bg-white dark:bg-[#16161b] border border-zinc-200/90 dark:border-white/[0.11] shadow-modal-light dark:shadow-popover p-1 no-print",
                  menuClassName
                )}
              >
                {options.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors",
                        isHighlighted
                          ? "bg-zinc-100/90 dark:bg-white/[0.08] text-zinc-950 dark:text-white"
                          : isSelected
                            ? "text-zinc-950 dark:text-white"
                            : "text-zinc-600 dark:text-zinc-300"
                      )}
                    >
                      <span className="truncate font-medium">{opt.label}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {opt.hint && (
                          <span className="text-[10.5px] font-mono text-zinc-400">
                            {opt.hint}
                          </span>
                        )}
                        <span className="w-3.5 flex items-center justify-center">
                          {isSelected && (
                            <motion.span
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={SPRING_SNAPPY}
                            >
                              <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                            </motion.span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

/* ============================================================================
 * 4. SearchField — Focus-illuminated inline search with animated clear action
 * ========================================================================== */

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon: React.ReactNode;
  className?: string;
  inputClassName?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  icon,
  className,
  inputClassName,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={cn(
        "relative flex items-center rounded-lg border bg-white dark:bg-white/[0.03] shadow-tactile transition-all duration-200",
        focused
          ? "border-zinc-400/90 dark:border-white/25 ring-[3px] ring-zinc-900/[0.055] dark:ring-white/[0.08]"
          : "border-zinc-200/95 dark:border-white/[0.09] hover:border-zinc-300 dark:hover:border-white/[0.16]",
        className
      )}
    >
      <span
        className={cn(
          "pl-2.5 pr-1.5 flex items-center transition-colors duration-150 pointer-events-none",
          focused
            ? "text-zinc-700 dark:text-zinc-200"
            : "text-zinc-400 dark:text-zinc-500"
        )}
      >
        {icon}
      </span>
      <input
        type="text"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full py-1.5 pr-7 text-xs bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none",
          inputClassName
        )}
      />
      <AnimatePresence>
        {value && (
          <motion.button
            key="search-clear"
            type="button"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            whileTap={TAP_SCALE}
            transition={SPRING_SNAPPY}
            onClick={() => onChange("")}
            aria-label="清空搜索"
            className="absolute right-1.5 p-0.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
