import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTipProps {
  content: React.ReactNode;
  placement?: "top" | "bottom";
  tone?: "default" | "dark";
  className?: string;
}

const VIEWPORT_MARGIN = 12;
const GAP = 8;

export const InfoTip: React.FC<InfoTipProps> = ({
  content,
  placement = "top",
  tone = "default",
  className,
}) => {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    actualPlacement: "top" | "bottom";
  } | null>(null);

  const visible = hovered || pinned || focused;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const tipWidth = tooltipRef.current?.offsetWidth ?? 240;
    const tipHeight = tooltipRef.current?.offsetHeight ?? 44;

    const canPlaceTop = rect.top - tipHeight - GAP >= VIEWPORT_MARGIN;
    const canPlaceBottom =
      rect.bottom + tipHeight + GAP <= window.innerHeight - VIEWPORT_MARGIN;

    let actualPlacement: "top" | "bottom" = placement;
    if (placement === "top" && !canPlaceTop && canPlaceBottom) {
      actualPlacement = "bottom";
    } else if (placement === "bottom" && !canPlaceBottom && canPlaceTop) {
      actualPlacement = "top";
    }

    const rawLeft = rect.left + rect.width / 2 - tipWidth / 2;
    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      window.innerWidth - tipWidth - VIEWPORT_MARGIN
    );
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), maxLeft);
    const top =
      actualPlacement === "top"
        ? Math.max(VIEWPORT_MARGIN, rect.top - tipHeight - GAP)
        : Math.min(
            window.innerHeight - tipHeight - VIEWPORT_MARGIN,
            rect.bottom + GAP
          );

    setCoords({ top, left, actualPlacement });
  }, [placement]);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [visible, updatePosition, content]);

  useEffect(() => {
    if (!pinned) return;
    const handleOutside = (e: PointerEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) {
        return;
      }
      setPinned(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setHovered(false);
        setFocused(false);
      }
    };
    window.addEventListener("pointerdown", handleOutside, true);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("pointerdown", handleOutside, true);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [pinned]);

  const ariaLabel = typeof content === "string" ? content : "查看说明";

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHovered(false);
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((v) => !v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setPinned((v) => !v);
          } else if (e.key === "Escape") {
            setPinned(false);
            setHovered(false);
            setFocused(false);
          }
        }}
        className={cn(
          "inline-flex items-center justify-center align-middle rounded-full p-0.5 -m-0.5 cursor-pointer select-none transition-colors focus:outline-none",
          tone === "dark"
            ? "text-zinc-500 hover:text-zinc-200 focus-visible:text-zinc-200"
            : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 focus-visible:text-zinc-700 dark:focus-visible:text-zinc-200",
          visible &&
            (tone === "dark"
              ? "text-zinc-200"
              : "text-zinc-700 dark:text-zinc-200"),
          className
        )}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      </span>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                ref={tooltipRef}
                role="tooltip"
                initial={{
                  opacity: 0,
                  y: (coords?.actualPlacement ?? placement) === "top" ? 4 : -4,
                  scale: 0.97,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: (coords?.actualPlacement ?? placement) === "top" ? 3 : -3,
                  scale: 0.98,
                }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "fixed",
                  top: coords ? coords.top : -9999,
                  left: coords ? coords.left : -9999,
                  visibility: coords ? "visible" : "hidden",
                }}
                className="z-[200] pointer-events-none max-w-[260px] px-3 py-2 rounded-xl bg-zinc-900/95 dark:bg-zinc-800/95 text-zinc-100 border border-white/[0.12] shadow-elevated backdrop-blur-md text-[11.5px] leading-relaxed font-normal tracking-normal text-left whitespace-normal break-words"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
