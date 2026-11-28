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
 * - macOS: 1.00 (100% native logical layout)
 * - Windows / Linux: automatically compensates for 100% / 125% / 150% OS DPI
 *   so 11–13px UI typography & dense ledger tables are effortless to read.
 */
export function computeAutoUiScale(): number {
  if (isMacOS()) return 1.0;
  if (typeof window === "undefined") return 1.0;

  const dpr = window.devicePixelRatio || 1;
  const screenW = window.screen?.width || 1920;
  const innerW = window.innerWidth || 1400;

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

export function resolveEffectiveUiScale(mode: UiScaleMode, manualScale: number): number {
  return mode === "auto" ? computeAutoUiScale() : clampUiScale(manualScale);
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
