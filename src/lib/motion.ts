import type { Transition } from "motion/react";

/**
 * Unified Precision Motion Language
 * Calibrated for crisp desktop responsiveness (Apple / Linear Light feel).
 */

export const EASE_PRECISION: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_OUT_EXPO: [number, number, number, number] = [0.19, 1, 0.22, 1];

export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 36,
  mass: 0.72,
};

export const SPRING_SMOOTH: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.85,
};

export const SPRING_GENTLE: Transition = {
  type: "spring",
  stiffness: 270,
  damping: 28,
  mass: 0.95,
};

export const SPRING_TACTILE: Transition = {
  type: "spring",
  stiffness: 600,
  damping: 32,
  mass: 0.6,
};

export const BACKDROP_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: EASE_PRECISION },
};

export const MODAL_SURFACE_MOTION = {
  initial: { opacity: 0, scale: 0.96, y: 10, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.975, y: 6, filter: "blur(2px)" },
  transition: SPRING_SMOOTH,
};

export const POPOVER_MOTION = {
  initial: { opacity: 0, scale: 0.95, y: -4, filter: "blur(2px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.96, y: -3, filter: "blur(2px)" },
  transition: SPRING_SNAPPY,
};

export const TAP_SCALE = { scale: 0.975 };
export const TAP_SCALE_SUBTLE = { scale: 0.985 };
export const TAP_SCALE_ICON = { scale: 0.92 };
