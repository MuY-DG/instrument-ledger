import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriEnvironment } from "@/lib/themeTransition";
import type { UiScaleMode } from "@/types";

export const UI_SCALE_STORAGE_KEY = "instrument_ledger_ui_scale_pref";
export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_PRESETS = [0.85, 0.9, 1.0, 1.1, 1.15, 1.2, 1.25, 1.35, 1.5] as const;

export interface StoredUiScalePref {
  mode: UiScaleMode;
  scale: number;
}

function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.round(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value)) * 100) / 100;
}

/**
 * Computes the adaptive default UI zoom factor so that Windows displays
 * achieve the same comfortable visual readability as macOS Retina displays:
 * Screen and window widths are in logical pixels before WebView zoom.
 */
function computeAutoUiScale(dpr: number, screenW: number, innerW: number): number {
  let target = 1.0;
  if (dpr <= 1.05) {
    // Windows 100% DPI (1080p / 2K desktop monitor looks very small at 1.0)
    target = screenW >= 2200 ? 1.25 : 1.2;
  } else if (dpr <= 1.3) {
    // Windows 125% DPI
    target = screenW >= 1800 ? 1.15 : 1.1;
  } else if (dpr <= 1.6) {
    // Windows 150% DPI
    target = screenW >= 1600 ? 1.08 : 1.0;
  } else {
    // Windows 175%–200% HiDPI (already comparable to macOS Retina)
    target = 1.0;
  }

  // Keep effective logical width >= 1060px so tables and dialogs never feel cramped
  if (innerW > 0 && innerW / target < 1060) {
    target = Math.max(1.0, Math.floor((innerW / 1060) * 20) / 20);
  }

  return clampUiScale(target);
}

export function watchAutoUiScale(onChange: (scale: number) => void): (() => void) | void {
  if (isMacOS() || typeof window === "undefined") {
    onChange(1.0);
    return;
  }

  if (!isTauriEnvironment()) {
    const update = () => onChange(computeAutoUiScale(
      window.devicePixelRatio || 1,
      window.screen?.width || 1920,
      window.innerWidth || 1400
    ));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }

  // WebView zoom can trigger DOM resize and change viewport width and DPR.
  // OS window events and sizes keep those changes out of the calculation.
  const appWindow = getCurrentWindow();
  let disposed = false;
  let revision = 0;
  let resizeTimer: number | undefined;
  const logError = (error: unknown) => console.warn("Could not read native UI scale", error);

  const update = async (requestRevision: number) => {
    try {
      const [scaleFactor, size, monitor] = await Promise.all([
        appWindow.scaleFactor(),
        appWindow.innerSize(),
        currentMonitor(),
      ]);
      if (!disposed && requestRevision === revision && size.width > 0) {
        const screenWidth = monitor ? monitor.size.width / monitor.scaleFactor : 1920;
        onChange(computeAutoUiScale(scaleFactor, screenWidth, size.width / scaleFactor));
      }
    } catch (error) {
      logError(error);
    }
  };

  const scheduleUpdate = () => {
    if (disposed) return;
    window.clearTimeout(resizeTimer);
    const requestRevision = ++revision;
    resizeTimer = window.setTimeout(() => void update(requestRevision), 120);
  };

  const listeners = [
    appWindow.onResized(scheduleUpdate),
    appWindow.onMoved(scheduleUpdate),
    appWindow.onScaleChanged(scheduleUpdate),
  ].map((listener) => listener.catch(logError));
  void update(revision);

  return () => {
    disposed = true;
    window.clearTimeout(resizeTimer);
    for (const listener of listeners) {
      void listener.then((unlisten) => unlisten?.()).catch(logError);
    }
  };
}

export function getStoredUiScalePref(): StoredUiScalePref {
  if (typeof window === "undefined") return { mode: "auto", scale: 1.0 };
  try {
    const raw = window.localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredUiScalePref>;
      const mode: UiScaleMode = parsed.mode === "manual" ? "manual" : "auto";
      const scale = clampUiScale(typeof parsed.scale === "number" ? parsed.scale : 1.0);
      return { mode, scale };
    }
  } catch {
    // ignore
  }
  return { mode: "auto", scale: 1.0 };
}

export function saveStoredUiScalePref(pref: StoredUiScalePref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      UI_SCALE_STORAGE_KEY,
      JSON.stringify({ mode: pref.mode, scale: clampUiScale(pref.scale) })
    );
  } catch {
    // ignore
  }
}

let lastAppliedZoom = 1.0;

export function getAppliedUiZoom(): number {
  return lastAppliedZoom;
}

/**
 * Applies native WebView zoom via Tauri (`setZoom`) on desktop (cleanly scaling
 * typography, virtual lists, hit-testing, and modals with zero layout drift),
 * falling back to CSS zoom only in standalone browser dev previews.
 */
export async function applyUiZoom(factor: number): Promise<number> {
  const safe = clampUiScale(factor);
  lastAppliedZoom = safe;

  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--ui-zoom", String(safe));
  }

  if (isTauriEnvironment()) {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().setZoom(safe);
      return safe;
    } catch {
      // Fallback below if permission/API unavailable
    }
  }

  if (typeof document !== "undefined") {
    (document.documentElement.style as unknown as { zoom?: string }).zoom =
      safe === 1 ? "" : String(safe);
  }
  return safe;
}
