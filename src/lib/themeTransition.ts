import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemeMode = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "instrument_ledger_theme_mode";

/** Cycles: 跟随系统 -> 亮色 -> 暗色 -> 跟随系统 */
export function getNextThemePreference(
  current: ThemePreference
): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

interface ViewTransitionHandle {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (
    updateCallback: () => void | Promise<void>
  ) => ViewTransitionHandle;
};

let activeRunId = 0;
let cancelFallbackAnimation: (() => void) | null = null;

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemTheme: ThemeMode = getSystemTheme()
): ThemeMode {
  return preference === "system" ? systemTheme : preference;
}

/**
 * Syncs the native OS window appearance (traffic light contrast on macOS,
 * native DWM titlebar on Windows). Passing `null` restores OS auto-follow.
 */
export function syncNativeWindowTheme(preference: ThemePreference): void {
  if (!isTauriEnvironment()) return;
  try {
    const target = preference === "system" ? null : preference;
    getCurrentWindow()
      .setTheme(target)
      .catch(() => {});
  } catch {
    // Ignore outside Tauri window context
  }
}

/**
 * Evaluates cubic-bezier(0.36, 0.06, 0.2, 1) at normalized time t in [0, 1].
 * Calibrated for radial area growth (A = pi * r^2): shows a clear circle/arc
 * emerging in the bottom-left before sweeping briskly to the top-right corner.
 */
function easeRadialSweep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const x1 = 0.36;
  const y1 = 0.06;
  const x2 = 0.2;
  const y2 = 1.0;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleDerivX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;

  let u = t;
  for (let i = 0; i < 6; i++) {
    const err = sampleX(u) - t;
    if (Math.abs(err) < 1e-5) return sampleY(u);
    const d = sampleDerivX(u);
    if (Math.abs(d) < 1e-5) break;
    u -= err / d;
  }

  let lo = 0;
  let hi = 1;
  u = t;
  for (let i = 0; i < 10; i++) {
    const x = sampleX(u);
    if (Math.abs(x - t) < 1e-5) break;
    if (t > x) lo = u;
    else hi = u;
    u = 0.5 * (lo + hi);
  }
  return sampleY(u);
}

/**
 * Resolves the expanding circle origin in the bottom-left area:
 * - Uses the bottom-left theme control center when available so the circle
 *   blooms directly out of the control, merges with the bottom/left edges into a
 *   semicircle/arc, and spreads diagonally across the workspace & titlebar to the top-right.
 * - Falls back to the exact bottom-left viewport corner (0, innerHeight).
 */
export function resolveThemeTransitionOrigin(
  triggerEl?: HTMLElement | null
): ThemeTransitionOrigin {
  const vh = typeof window !== "undefined" ? window.innerHeight || 880 : 880;
  if (triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    }
  }
  return { x: 0, y: vh };
}

/**
 * Runs a bottom-left -> top-right expanding circular theme reveal.
 * Uses native View Transitions API (GPU clip-path on ::view-transition-new(root))
 * with an automatic SVG circular-mask fallback for older WebViews.
 */
export function runThemeTransition(options: {
  currentTheme: ThemeMode;
  nextTheme: ThemeMode;
  applyTheme: (next: ThemeMode) => void;
  triggerEl?: HTMLElement | null;
}): void {
  const { currentTheme, nextTheme, applyTheme, triggerEl } = options;

  if (cancelFallbackAnimation) {
    cancelFallbackAnimation();
    cancelFallbackAnimation = null;
  }

  if (
    currentTheme === nextTheme ||
    typeof document === "undefined" ||
    typeof window === "undefined"
  ) {
    applyTheme(nextTheme);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      document.documentElement.style.colorScheme = nextTheme;
    }
    return;
  }

  const root = document.documentElement;
  let committed = false;
  const commitDomTheme = () => {
    if (committed) return;
    committed = true;
    flushSync(() => {
      applyTheme(nextTheme);
    });
    root.classList.toggle("dark", nextTheme === "dark");
    root.style.colorScheme = nextTheme;
  };

  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  if (prefersReducedMotion || document.visibilityState === "hidden") {
    commitDomTheme();
    return;
  }

  const origin = resolveThemeTransitionOrigin(triggerEl);
  const vw = window.innerWidth || 1400;
  const vh = window.innerHeight || 880;
  const endRadius = Math.ceil(
    Math.hypot(
      Math.max(origin.x, vw - origin.x),
      Math.max(origin.y, vh - origin.y)
    )
  );
  const duration = Math.min(720, Math.max(560, Math.round(endRadius * 0.4)));
  const runId = ++activeRunId;

  const doc = document as DocumentWithViewTransition;

  // Primary path: Native View Transitions API
  if (typeof doc.startViewTransition === "function") {
    root.setAttribute("data-theme-transition", "active");

    let transition: ViewTransitionHandle;
    try {
      transition = doc.startViewTransition(() => {
        commitDomTheme();
      });
    } catch {
      if (runId === activeRunId) {
        root.removeAttribute("data-theme-transition");
      }
      commitDomTheme();
      return;
    }

    transition.ready
      .then(() => {
        if (runId !== activeRunId) return;
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${endRadius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration,
            easing: "cubic-bezier(0.36, 0.06, 0.2, 1)",
            fill: "forwards",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {
        // Safely ignore AbortError when superseded by rapid consecutive switches
      });

    transition.finished
      .catch(() => {})
      .finally(() => {
        if (runId === activeRunId) {
          root.removeAttribute("data-theme-transition");
        }
      });

    return;
  }

  // Fallback path for older WebViews without document.startViewTransition
  const prevSurfaceColor = currentTheme === "dark" ? "#09090b" : "#f7f7f5";
  const rimStrokeColor =
    nextTheme === "dark"
      ? "rgba(255, 255, 255, 0.16)"
      : "rgba(24, 24, 27, 0.12)";
  const maskId = `theme-reveal-mask-${runId}`;

  root.setAttribute("data-theme-transition", "active");
  commitDomTheme();

  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.className = "no-print";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;";

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.display = "block";

  const defs = document.createElementNS(svgNs, "defs");
  const mask = document.createElementNS(svgNs, "mask");
  mask.setAttribute("id", maskId);

  const maskBg = document.createElementNS(svgNs, "rect");
  maskBg.setAttribute("width", "100%");
  maskBg.setAttribute("height", "100%");
  maskBg.setAttribute("fill", "white");

  const holeCircle = document.createElementNS(svgNs, "circle");
  holeCircle.setAttribute("cx", String(origin.x));
  holeCircle.setAttribute("cy", String(origin.y));
  holeCircle.setAttribute("r", "0");
  holeCircle.setAttribute("fill", "black");

  mask.appendChild(maskBg);
  mask.appendChild(holeCircle);
  defs.appendChild(mask);

  const coverRect = document.createElementNS(svgNs, "rect");
  coverRect.setAttribute("width", "100%");
  coverRect.setAttribute("height", "100%");
  coverRect.setAttribute("fill", prevSurfaceColor);
  coverRect.setAttribute("mask", `url(#${maskId})`);

  const rimCircle = document.createElementNS(svgNs, "circle");
  rimCircle.setAttribute("cx", String(origin.x));
  rimCircle.setAttribute("cy", String(origin.y));
  rimCircle.setAttribute("r", "0");
  rimCircle.setAttribute("fill", "none");
  rimCircle.setAttribute("stroke", rimStrokeColor);
  rimCircle.setAttribute("stroke-width", "1.5");

  svg.appendChild(defs);
  svg.appendChild(coverRect);
  svg.appendChild(rimCircle);
  overlay.appendChild(svg);
  document.body.appendChild(overlay);

  let rafId = 0;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    overlay.remove();
    if (runId === activeRunId) {
      root.removeAttribute("data-theme-transition");
    }
    if (cancelFallbackAnimation === cleanup) {
      cancelFallbackAnimation = null;
    }
  };
  cancelFallbackAnimation = cleanup;

  const startTs = performance.now();
  const step = (now: number) => {
    if (cleaned) return;
    const progress = Math.min(1, (now - startTs) / duration);
    const radius = easeRadialSweep(progress) * endRadius;
    const rStr = radius.toFixed(1);
    holeCircle.setAttribute("r", rStr);
    rimCircle.setAttribute("r", rStr);
    rimCircle.setAttribute("stroke-opacity", String(1 - progress * 0.75));

    if (progress < 1) {
      rafId = window.requestAnimationFrame(step);
    } else {
      cleanup();
    }
  };

  rafId = window.requestAnimationFrame(step);
}
