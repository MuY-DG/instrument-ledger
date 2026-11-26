import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { EASE_PRECISION } from "@/lib/motion";
import { cn, getTitlebarSafeTop } from "@/lib/utils";

export type TooltipPlacement = "top" | "bottom" | "right" | "left";

interface Coords {
  top: number;
  left: number;
  actualPlacement: TooltipPlacement;
}

interface ActiveTooltipState {
  id: string;
  anchorEl: HTMLElement;
  content: React.ReactNode;
  placement: TooltipPlacement;
  tone: "default" | "dark";
  /** Increments when opening fresh or jumping across distant regions (prevents flying across screen) */
  instanceKey: number;
  /** True only when transitioning between two adjacent sibling triggers */
  isGliding: boolean;
  coords: Coords;
}

export interface MorphTooltipShowInput {
  id: string;
  anchorEl: HTMLElement;
  content: React.ReactNode;
  placement: TooltipPlacement;
  tone: "default" | "dark";
}

interface MorphTooltipActions {
  show: (state: MorphTooltipShowInput) => void;
  updateContent: (state: MorphTooltipShowInput) => void;
  hide: (id: string, immediate?: boolean) => void;
}

/**
 * Stable actions-only context: identity never changes across tooltip state updates,
 * preventing unnecessary re-renders or cleanup triggers in consumers.
 */
const MorphTooltipContext = createContext<MorphTooltipActions | null>(null);

const VIEWPORT_MARGIN = 12;
const GAP = 8;
/** Only glide smoothly between adjacent controls (e.g. sibling toolbar icons) */
const MAX_GLIDE_DISTANCE = 150;

function getAnchorCenter(anchor: HTMLElement): { cx: number; cy: number } {
  const r = anchor.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function computeTooltipCoords(
  anchor: HTMLElement,
  tooltipEl: HTMLElement | null,
  preferred: TooltipPlacement
): Coords {
  const rect = anchor.getBoundingClientRect();
  const tipWidth = tooltipEl?.offsetWidth || 168;
  const tipHeight = tooltipEl?.offsetHeight || 32;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const topMargin = getTitlebarSafeTop() + VIEWPORT_MARGIN;

  let actual: TooltipPlacement = preferred;
  const canTop = rect.top - tipHeight - GAP >= topMargin;
  const canBottom = rect.bottom + tipHeight + GAP <= vh - VIEWPORT_MARGIN;
  const canRight = rect.right + tipWidth + GAP <= vw - VIEWPORT_MARGIN;
  const canLeft = rect.left - tipWidth - GAP >= VIEWPORT_MARGIN;

  if (preferred === "top" && !canTop && canBottom) actual = "bottom";
  else if (preferred === "bottom" && !canBottom && canTop) actual = "top";
  else if (preferred === "right" && !canRight && canLeft) actual = "left";
  else if (preferred === "left" && !canLeft && canRight) actual = "right";

  let top = 0;
  let left = 0;

  if (actual === "top" || actual === "bottom") {
    const rawLeft = rect.left + rect.width / 2 - tipWidth / 2;
    left = Math.min(
      Math.max(VIEWPORT_MARGIN, rawLeft),
      Math.max(VIEWPORT_MARGIN, vw - tipWidth - VIEWPORT_MARGIN)
    );
    top =
      actual === "top"
        ? Math.max(topMargin, rect.top - tipHeight - GAP)
        : Math.min(vh - tipHeight - VIEWPORT_MARGIN, rect.bottom + GAP);
  } else {
    const rawTop = rect.top + rect.height / 2 - tipHeight / 2;
    top = Math.min(
      Math.max(topMargin, rawTop),
      Math.max(topMargin, vh - tipHeight - VIEWPORT_MARGIN)
    );
    left =
      actual === "right"
        ? Math.min(vw - tipWidth - VIEWPORT_MARGIN, rect.right + GAP)
        : Math.max(VIEWPORT_MARGIN, rect.left - tipWidth - GAP);
  }

  return { top, left, actualPlacement: actual };
}

export const MorphTooltipProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [active, setActive] = useState<ActiveTooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const activeRef = useRef<ActiveTooltipState | null>(null);
  const instanceSeqRef = useRef(0);
  const lastCenterRef = useRef<{ cx: number; cy: number } | null>(null);
  activeRef.current = active;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (next: MorphTooltipShowInput) => {
      clearHideTimer();
      const center = getAnchorCenter(next.anchorEl);
      const prev = activeRef.current;

      let shouldGlide = false;
      if (prev && prev.id !== next.id && lastCenterRef.current) {
        const dist = Math.hypot(
          center.cx - lastCenterRef.current.cx,
          center.cy - lastCenterRef.current.cy
        );
        shouldGlide = dist <= MAX_GLIDE_DISTANCE && prev.placement === next.placement;
      }

      lastCenterRef.current = center;

      const instanceKey =
        prev && (prev.id === next.id || shouldGlide)
          ? prev.instanceKey
          : (instanceSeqRef.current += 1);

      const initialCoords = computeTooltipCoords(
        next.anchorEl,
        shouldGlide ? tooltipRef.current : null,
        next.placement
      );

      setActive({
        ...next,
        instanceKey,
        isGliding: shouldGlide,
        coords: initialCoords,
      });
    },
    [clearHideTimer]
  );

  const updateContent = useCallback((next: MorphTooltipShowInput) => {
    setActive((prev) => {
      if (!prev || prev.id !== next.id) return prev;
      return {
        ...prev,
        anchorEl: next.anchorEl,
        content: next.content,
        placement: next.placement,
        tone: next.tone,
      };
    });
  }, []);

  const hide = useCallback(
    (id: string, immediate = false) => {
      clearHideTimer();
      const doHide = () => {
        setActive((prev) => {
          if (!prev || prev.id !== id) return prev;
          return null;
        });
      };
      if (immediate) {
        doHide();
      } else {
        hideTimerRef.current = window.setTimeout(doHide, 95);
      }
    },
    [clearHideTimer]
  );

  const syncPosition = useCallback(() => {
    const cur = activeRef.current;
    if (!cur || !document.body.contains(cur.anchorEl)) {
      setActive(null);
      return;
    }
    const nextCoords = computeTooltipCoords(
      cur.anchorEl,
      tooltipRef.current,
      cur.placement
    );
    setActive((prev) => {
      if (!prev || prev.id !== cur.id) return prev;
      if (
        Math.abs(prev.coords.top - nextCoords.top) < 0.5 &&
        Math.abs(prev.coords.left - nextCoords.left) < 0.5 &&
        prev.coords.actualPlacement === nextCoords.actualPlacement
      ) {
        return prev;
      }
      return { ...prev, coords: nextCoords };
    });
  }, []);

  useLayoutEffect(() => {
    if (!active) return;
    syncPosition();
    const raf = window.requestAnimationFrame(syncPosition);
    const ro =
      typeof ResizeObserver !== "undefined" && tooltipRef.current
        ? new ResizeObserver(syncPosition)
        : null;
    if (ro && tooltipRef.current) {
      ro.observe(tooltipRef.current);
    }
    window.addEventListener("scroll", syncPosition, true);
    window.addEventListener("resize", syncPosition);
    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("scroll", syncPosition, true);
      window.removeEventListener("resize", syncPosition);
    };
  }, [active?.id, active?.instanceKey, active?.content, syncPosition]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const actions = useMemo<MorphTooltipActions>(
    () => ({ show, updateContent, hide }),
    [show, updateContent, hide]
  );

  const offsetInit =
    active?.coords.actualPlacement === "top"
      ? { x: 0, y: 4 }
      : active?.coords.actualPlacement === "bottom"
        ? { x: 0, y: -4 }
        : active?.coords.actualPlacement === "right"
          ? { x: -4, y: 0 }
          : { x: 4, y: 0 };

  return (
    <MorphTooltipContext.Provider value={actions}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {active && (
              <motion.div
                key={active.instanceKey}
                ref={tooltipRef}
                role="tooltip"
                initial={{
                  opacity: 0,
                  scale: 0.96,
                  x: offsetInit.x,
                  y: offsetInit.y,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: 0,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  scale: 0.97,
                  transition: { duration: 0.09, ease: EASE_PRECISION },
                }}
                transition={{
                  duration: 0.13,
                  ease: EASE_PRECISION,
                }}
                style={{
                  position: "fixed",
                  top: active.coords.top,
                  left: active.coords.left,
                  transition: active.isGliding
                    ? "left 140ms cubic-bezier(0.16, 1, 0.3, 1), top 140ms cubic-bezier(0.16, 1, 0.3, 1)"
                    : "none",
                  willChange: "transform, opacity",
                }}
                className={cn(
                  "z-[210] pointer-events-none max-w-[264px] px-2.5 py-1.5 rounded-xl border shadow-elevated backdrop-blur-md text-[11.5px] leading-relaxed font-normal tracking-normal text-left whitespace-normal break-words",
                  "bg-zinc-900/95 dark:bg-zinc-800/95 text-zinc-100 border-white/[0.12]"
                )}
              >
                {active.content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </MorphTooltipContext.Provider>
  );
};

export function useMorphTooltip() {
  return useContext(MorphTooltipContext);
}

interface MorphTooltipProps {
  content: React.ReactNode;
  placement?: TooltipPlacement;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

let tooltipSeq = 0;

export const MorphTooltip: React.FC<MorphTooltipProps> = ({
  content,
  placement = "top",
  disabled = false,
  className,
  children,
}) => {
  const ctx = useMorphTooltip();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const idRef = useRef<string>("");
  if (!idRef.current) {
    tooltipSeq += 1;
    idRef.current = `mt-${tooltipSeq}`;
  }
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Only hide on actual unmount
  useEffect(() => {
    const id = idRef.current;
    return () => {
      ctxRef.current?.hide(id, true);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      ctxRef.current?.hide(idRef.current, true);
    }
  }, [disabled]);

  // Keep live content synced if this tooltip is currently open (e.g. theme label toggle)
  useEffect(() => {
    if (disabled || !wrapRef.current) return;
    ctxRef.current?.updateContent({
      id: idRef.current,
      anchorEl: wrapRef.current,
      content,
      placement,
      tone: "default",
    });
  }, [disabled, content, placement]);

  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <span
      ref={wrapRef}
      onMouseEnter={() => {
        if (wrapRef.current && ctxRef.current) {
          ctxRef.current.show({
            id: idRef.current,
            anchorEl: wrapRef.current,
            content,
            placement,
            tone: "default",
          });
        }
      }}
      onMouseLeave={() => {
        ctxRef.current?.hide(idRef.current);
      }}
      onFocus={() => {
        if (wrapRef.current && ctxRef.current) {
          ctxRef.current.show({
            id: idRef.current,
            anchorEl: wrapRef.current,
            content,
            placement,
            tone: "default",
          });
        }
      }}
      onBlur={() => {
        ctxRef.current?.hide(idRef.current, true);
      }}
      className={cn("inline-flex", className)}
    >
      {children}
    </span>
  );
};
