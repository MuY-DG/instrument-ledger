import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "motion/react";
import {
  BACKDROP_MOTION,
  EASE_PRECISION,
  MODAL_SURFACE_MOTION,
  SPRING_GENTLE,
  SPRING_SNAPPY,
  TAP_SCALE,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ============================================================================
 * 1. BlurText — Crisp blur-to-sharp text reveal (inspired by React Bits / Magic UI)
 * ========================================================================== */

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  by?: "char" | "word";
  as?: "h1" | "h2" | "p" | "span" | "div";
}

export const BlurText: React.FC<BlurTextProps> = ({
  text,
  className,
  delay = 0,
  stagger = 0.028,
  by = "char",
  as = "span",
}) => {
  const segments = by === "word" ? text.split(/(\s+)/) : Array.from(text);
  const Tag = as;

  return (
    <Tag className={cn("inline-flex flex-wrap justify-center", className)}>
      {segments.map((seg, i) => (
        <motion.span
          key={`${seg}-${i}`}
          initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            delay: delay + i * stagger,
            duration: 0.48,
            ease: EASE_PRECISION,
          }}
          className="inline-block whitespace-pre"
        >
          {seg}
        </motion.span>
      ))}
    </Tag>
  );
};

/* ============================================================================
 * 2. SlidingNumber — Spring-interpolated metric counter (inspired by Magic UI)
 * ========================================================================== */

interface SlidingNumberProps {
  value: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export const SlidingNumber: React.FC<SlidingNumberProps> = ({
  value,
  suffix = "",
  prefix = "",
  className,
}) => {
  const spring = useSpring(value, {
    stiffness: 260,
    damping: 30,
    mass: 0.75,
  });
  const [display, setDisplay] = useState(value);
  const lastRef = useRef(value);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsub = spring.on("change", (latest) => {
      const next = Math.round(latest);
      if (next !== lastRef.current) {
        lastRef.current = next;
        setDisplay(next);
      }
    });
    return () => unsub();
  }, [spring]);

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
};

/* ============================================================================
 * 3. BorderBeam — Luminous optical rim glide (light-mode ceramic tuned)
 * ========================================================================== */

interface BorderBeamProps {
  className?: string;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
}

export const BorderBeam: React.FC<BorderBeamProps> = ({
  className,
  duration = 9,
  colorFrom = "rgba(99, 102, 241, 0.55)",
  colorTo = "rgba(14, 165, 233, 0.45)",
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden",
        className
      )}
      style={{
        padding: "1.5px",
        mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMask:
          "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      }}
    >
      <div
        className="absolute inset-[-100%] animate-border-beam-spin"
        style={{
          animationDuration: `${duration}s`,
          background: `conic-gradient(from 0deg, transparent 0deg, transparent 275deg, ${colorFrom} 318deg, ${colorTo} 348deg, transparent 360deg)`,
        }}
      />
    </div>
  );
};

/* ============================================================================
 * 4. SpotlightSurface — Subtle porcelain optical sheen following cursor
 * ========================================================================== */

interface SpotlightSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlightColor?: string;
  radius?: number;
}

export const SpotlightSurface: React.FC<SpotlightSurfaceProps> = ({
  spotlightColor = "rgba(99, 102, 241, 0.08)",
  radius = 220,
  className,
  children,
  onMouseMove,
  onMouseLeave,
  ...rest
}) => {
  const mouseX = useMotionValue(-999);
  const mouseY = useMotionValue(-999);
  const [hovered, setHovered] = useState(false);

  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, ${spotlightColor}, transparent 75%)`;

  return (
    <div
      {...rest}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
        if (!hovered) setHovered(true);
        onMouseMove?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
      className={cn("relative overflow-hidden", className)}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ background, opacity: hovered ? 1 : 0 }}
      />
      {children}
    </div>
  );
};

/* ============================================================================
 * 5. ModalShell — Unified tactile spring modal with luminous glass elevation
 * ========================================================================== */

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  zIndexClass?: string;
  align?: "center" | "top";
  panelClassName?: string;
  backdropClassName?: string;
  role?: "dialog" | "alertdialog";
  ariaLabelledBy?: string;
  closeOnEsc?: boolean;
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  open,
  onClose,
  zIndexClass = "z-50",
  align = "center",
  panelClassName,
  backdropClassName,
  role = "dialog",
  ariaLabelledBy,
  closeOnEsc = false,
  children,
}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...BACKDROP_MOTION}
          className={cn(
            "fixed inset-x-0 bottom-0 top-[var(--titlebar-h,0px)] bg-slate-900/35 dark:bg-black/70 backdrop-blur-[6px] flex justify-center p-4 no-print",
            align === "top" ? "items-start pt-[12vh]" : "items-center",
            zIndexClass,
            backdropClassName
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <motion.div
            role={role}
            aria-modal="true"
            aria-labelledby={ariaLabelledBy}
            {...MODAL_SURFACE_MOTION}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative max-h-full bg-white dark:bg-[#121216] rounded-2xl shadow-modal-light dark:shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden",
              panelClassName
            )}
          >
            {/* Subtle top porcelain specular highlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white to-transparent dark:via-white/20 z-10"
            />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ============================================================================
 * 6. Collapsible — Silky animated height + opacity container
 * ========================================================================== */

interface CollapsibleProps {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Collapsible: React.FC<CollapsibleProps> = ({
  open,
  className,
  children,
}) => {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING_GENTLE}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ============================================================================
 * 7. TactileButton — Crisp press physics + machined surface highlight
 * ========================================================================== */

interface TactileButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
}

export const TactileButton: React.FC<TactileButtonProps> = ({
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  children,
  onClick,
  type = "button",
  title,
  ...rest
}) => {
  const variants: Record<NonNullable<TactileButtonProps["variant"]>, string> = {
    primary:
      "bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 shadow-tactile-primary border border-zinc-900/90 dark:border-white/90",
    secondary:
      "bg-white hover:bg-zinc-50/90 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-200 border border-zinc-200/90 dark:border-white/[0.1] shadow-tactile",
    ghost:
      "bg-transparent hover:bg-zinc-200/55 dark:hover:bg-white/[0.07] text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
    danger:
      "bg-rose-600 hover:bg-rose-500 text-white shadow-tactile-primary border border-rose-600/80",
  };

  const sizes: Record<NonNullable<TactileButtonProps["size"]>, string> = {
    xs: "px-2.5 py-1 text-[11.5px] rounded-lg gap-1.5",
    sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
    md: "px-4 py-2 text-xs rounded-xl gap-1.5",
    lg: "px-5 py-2.5 text-sm rounded-xl gap-2",
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      whileTap={disabled ? undefined : TAP_SCALE}
      transition={SPRING_SNAPPY}
      className={cn(
        "relative inline-flex items-center justify-center font-medium select-none transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/35",
        variants[variant],
        sizes[size],
        className
      )}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </motion.button>
  );
};
