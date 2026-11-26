import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the active in-DOM macOS overlay titlebar / drag-strip height in px
 * so fixed portals (tooltips, dropdowns, etc.) never overlap the top window chrome.
 */
export function getTitlebarSafeTop(): number {
  if (typeof window === "undefined") return 0;
  const styles = window.getComputedStyle(document.documentElement);
  const titlebarH =
    Number.parseFloat(styles.getPropertyValue("--titlebar-h").trim()) || 0;
  const safeTop =
    Number.parseFloat(styles.getPropertyValue("--titlebar-safe-top").trim()) || 0;
  return Math.max(0, titlebarH, safeTop);
}
