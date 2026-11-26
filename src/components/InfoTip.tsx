import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle } from "lucide-react";
import { useMorphTooltip } from "@/components/ui/MorphTooltip";
import { cn, getTitlebarSafeTop } from "@/lib/utils";

interface InfoTipProps {
  content: React.ReactNode;
  placement?: "top" | "bottom";
  tone?: "default" | "dark";
  className?: string;
}

const VIEWPORT_MARGIN = 12;
const GAP = 8;
let infoTipSeq = 0;

export const InfoTip: React.FC<InfoTipProps> = ({
  content,
  placement = "top",
  tone = "default",
  className,
}) => {
  const morphCtx = useMorphTooltip();
  const morphCtxRef = useRef(morphCtx);
  morphCtxRef.current = morphCtx;

  const idRef = useRef<string>("");
  if (!idRef.current) {
    infoTipSeq += 1;
    idRef.current = `infotip-${infoTipSeq}`;
  }

  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    actualPlacement: "top" | "bottom";
  } | null>(null);

  const visible = hovered || focused;

  // Only hide on actual unmount
  useEffect(() => {
    const id = idRef.current;
    return () => {
      morphCtxRef.current?.hide(id, true);
    };
  }, []);

  // Keep dynamic content synced if currently hovered
  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    morphCtxRef.current?.updateContent({
      id: idRef.current,
      anchorEl: triggerRef.current,
      content,
      placement,
      tone,
    });
  }, [visible, content, placement, tone]);

  // Fallback standalone positioning when rendered outside MorphTooltipProvider
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const tipWidth = tooltipRef.current?.offsetWidth ?? 240;
    const tipHeight = tooltipRef.current?.offsetHeight ?? 44;

    const topMargin = getTitlebarSafeTop() + VIEWPORT_MARGIN;
    const canPlaceTop = rect.top - tipHeight - GAP >= topMargin;
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
        ? Math.max(topMargin, rect.top - tipHeight - GAP)
        : Math.min(
            window.innerHeight - tipHeight - VIEWPORT_MARGIN,
            rect.bottom + GAP
          );

    setCoords({ top, left, actualPlacement });
  }, [placement]);

  useLayoutEffect(() => {
    if (morphCtx || !visible) return;
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [morphCtx, visible, updatePosition, content]);

  const ariaLabel = typeof content === "string" ? content : "查看说明";

  const showTip = () => {
    setHovered(true);
    if (morphCtxRef.current && triggerRef.current) {
      morphCtxRef.current.show({
        id: idRef.current,
        anchorEl: triggerRef.current,
        content,
        placement,
        tone,
      });
    }
  };

  const hideTip = (immediate = false) => {
    setHovered(false);
    morphCtxRef.current?.hide(idRef.current, immediate);
  };

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onMouseEnter={showTip}
        onMouseLeave={() => hideTip(false)}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          showTip();
        }}
        onFocus={() => {
          setFocused(true);
          if (morphCtxRef.current && triggerRef.current) {
            morphCtxRef.current.show({
              id: idRef.current,
              anchorEl: triggerRef.current,
              content,
              placement,
              tone,
            });
          }
        }}
        onBlur={() => {
          setFocused(false);
          morphCtxRef.current?.hide(idRef.current, true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setHovered(false);
            setFocused(false);
            morphCtxRef.current?.hide(idRef.current, true);
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

      {!morphCtx &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {visible && coords && (
              <motion.div
                ref={tooltipRef}
                role="tooltip"
                initial={{
                  opacity: 0,
                  y: coords.actualPlacement === "top" ? 4 : -4,
                  scale: 0.97,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: coords.actualPlacement === "top" ? 3 : -3,
                  scale: 0.98,
                }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
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
