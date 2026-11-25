import type { CSSProperties } from "react";
import type { WarningThreshold } from "@/types";

export const DEFAULT_WARNING_THRESHOLDS: WarningThreshold[] = [
  { id: "tier-60", days: 60, color: "#0ea5e9", label: "60天提醒" },
  { id: "tier-30", days: 30, color: "#eab308", label: "30天预警" },
  { id: "tier-15", days: 15, color: "#f97316", label: "15天紧急" },
];

export const PRESET_THRESHOLD_COLORS: Array<{ name: string; hex: string }> = [
  { name: "天蓝", hex: "#0ea5e9" },
  { name: "靛蓝", hex: "#3b82f6" },
  { name: "紫罗兰", hex: "#8b5cf6" },
  { name: "青绿", hex: "#14b8a6" },
  { name: "明黄", hex: "#eab308" },
  { name: "琥珀", hex: "#f59e0b" },
  { name: "警示橙", hex: "#f97316" },
  { name: "赤红", hex: "#ef4444" },
  { name: "玫粉", hex: "#ec4899" },
];

export function normalizeHexColor(raw: string, fallback = "#f59e0b"): string {
  const trimmed = (raw || "").trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHexColor(hex).slice(1);
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function blendWithWhite(
  r: number,
  g: number,
  b: number,
  colorWeight: number
): string {
  const w = Math.max(0, Math.min(1, colorWeight));
  const inv = 1 - w;
  return rgbToHex(r * w + 255 * inv, g * w + 255 * inv, b * w + 255 * inv);
}

export interface ThresholdVisuals {
  hex: string;
  textLight: string;
  textDark: string;
  bgLight: string;
  bgDark: string;
  borderLight: string;
  borderDark: string;
  glow: string;
  rowAccentShadow: string;
  printBg: string;
  printText: string;
  excelFillArgb: string;
  excelTextArgb: string;
  cssVars: CSSProperties;
}

const thresholdVisualsCache = new Map<string, ThresholdVisuals>();

export function getThresholdVisuals(rawHex: string): ThresholdVisuals {
  const hex = normalizeHexColor(rawHex);
  const cached = thresholdVisualsCache.get(hex);
  if (cached) return cached;

  const { r, g, b } = hexToRgb(hex);

  // Perceived luminance in [0, 1]
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Ensure crisp legibility on light backgrounds (target lum <= 0.36)
  let textLight = hex;
  if (lum > 0.36) {
    const scale = 0.36 / lum;
    textLight = rgbToHex(r * scale, g * scale, b * scale);
  }

  // Ensure crisp legibility on dark backgrounds (target lum >= 0.68)
  let textDark = hex;
  if (lum < 0.68) {
    const t = Math.min(0.58, (0.68 - lum) / Math.max(0.05, 1 - lum));
    textDark = blendWithWhite(r, g, b, 1 - t);
  } else {
    textDark = blendWithWhite(r, g, b, 0.88);
  }

  const bgLight = `rgba(${r}, ${g}, ${b}, 0.10)`;
  const bgDark = `rgba(${r}, ${g}, ${b}, 0.16)`;
  const borderLight = `rgba(${r}, ${g}, ${b}, 0.28)`;
  const borderDark = `rgba(${r}, ${g}, ${b}, 0.34)`;
  const glow = `0 0 8px rgba(${r}, ${g}, ${b}, 0.5)`;
  const rowAccentShadow = `inset 2.5px 0 0 0 ${hex}`;

  const printBg = blendWithWhite(r, g, b, 0.16);
  const excelFillArgb = `FF${printBg.slice(1).toUpperCase()}`;
  const excelTextArgb = `FF${textLight.slice(1).toUpperCase()}`;

  const cssVars = {
    "--tier-dot": hex,
    "--tier-bg": bgLight,
    "--tier-bg-dark": bgDark,
    "--tier-border": borderLight,
    "--tier-border-dark": borderDark,
    "--tier-text": textLight,
    "--tier-text-dark": textDark,
    "--tier-glow": glow,
  } as CSSProperties;

  const result: ThresholdVisuals = {
    hex,
    textLight,
    textDark,
    bgLight,
    bgDark,
    borderLight,
    borderDark,
    glow,
    rowAccentShadow,
    printBg,
    printText: textLight,
    excelFillArgb,
    excelTextArgb,
    cssVars,
  };
  thresholdVisualsCache.set(hex, result);
  return result;
}

export function normalizeThresholds(
  thresholds?: WarningThreshold[] | null
): WarningThreshold[] {
  if (!thresholds || thresholds.length === 0) {
    return DEFAULT_WARNING_THRESHOLDS;
  }
  const seen = new Set<number>();
  const cleaned: WarningThreshold[] = [];
  for (let i = 0; i < thresholds.length; i++) {
    const item = thresholds[i];
    const days = Math.max(1, Math.min(3650, Math.round(Number(item.days) || 0)));
    if (!Number.isFinite(days) || days <= 0 || seen.has(days)) continue;
    seen.add(days);
    const fallbackColor =
      PRESET_THRESHOLD_COLORS[i % PRESET_THRESHOLD_COLORS.length].hex;
    cleaned.push({
      id: (item.id || "").trim() || `tier-${days}`,
      days,
      color: normalizeHexColor(item.color, fallbackColor),
      label: (item.label || "").trim() || `${days}天预警`,
    });
  }
  if (cleaned.length === 0) return DEFAULT_WARNING_THRESHOLDS;
  return cleaned.sort((a, b) => b.days - a.days);
}

export function sortThresholdsAsc(
  thresholds?: WarningThreshold[] | null
): WarningThreshold[] {
  return [...normalizeThresholds(thresholds)].sort((a, b) => a.days - b.days);
}

export function sortThresholdsDesc(
  thresholds?: WarningThreshold[] | null
): WarningThreshold[] {
  return normalizeThresholds(thresholds);
}

export function getMaxWarningDays(
  thresholds?: WarningThreshold[] | null,
  fallback = 60
): number {
  const list = normalizeThresholds(thresholds);
  if (list.length === 0) return fallback;
  return list[0].days;
}
