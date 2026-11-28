import { DEFAULT_STYLE } from '../types';
import type { MarkerStyle } from '../types';
import { normalizeImageBudgetMode, type ImageBudgetMode } from './image-budget';
import { DEFAULT_PAGE_SPACING, MAX_PAGE_SPACING, type PageSpacing } from './geometry';
export const PREFERENCES_KEY = 'folio:workspace-preferences:v1';
export const EXPORT_DPIS = [25, 50, 72, 96, 100, 150, 300, 400, 600, 800, 1200, 1600, 2400, 3200];
export interface ExportPreferences {
  format: 'jpg' | 'png' | 'webp';
  dpi: string;
  quality: number;
  annotations: boolean;
  budgetMode: ImageBudgetMode;
}
export interface WorkspacePreferences {
  version: 1;
  sidebarOpen: boolean;
  sidebarTab: 'pages' | 'markers';
  inspectorPlacement: 'toolbar' | 'sidebar';
  showToolWindowNames: boolean;
  simplifiedPalette: boolean;
  wheelZoom: boolean;
  wheelResize: boolean;
  linked: boolean;
  zoomMode: 'fit' | 'custom';
  zoomScale: number;
  pageSpacing: PageSpacing;
  markerStyle: MarkerStyle;
  imageExport: ExportPreferences;
  editablePdf: boolean;
}
export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  version: 1,
  sidebarOpen: false,
  sidebarTab: 'pages',
  inspectorPlacement: 'toolbar',
  showToolWindowNames: false,
  simplifiedPalette: false,
  wheelZoom: false,
  wheelResize: true,
  linked: true,
  zoomMode: 'fit',
  zoomScale: 1,
  pageSpacing: DEFAULT_PAGE_SPACING,
  markerStyle: DEFAULT_STYLE,
  imageExport: { format: 'jpg', dpi: 'auto', quality: 0.95, annotations: true, budgetMode: 'auto' },
  editablePdf: false,
};
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const number = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const boolean = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const color = (v: unknown, fallback: string | null) =>
  v === null || (typeof v === 'string' && /^#[\da-f]{6}$/i.test(v))
    ? (v as string | null)
    : fallback;
export function normalizePreferences(value: unknown): WorkspacePreferences {
  const v = record(value),
    d = DEFAULT_PREFERENCES,
    style = record(v.markerStyle),
    image = record(v.imageExport),
    spacing = record(v.pageSpacing);
  return {
    version: 1,
    sidebarOpen: boolean(v.sidebarOpen, d.sidebarOpen),
    sidebarTab: v.sidebarTab === 'markers' ? 'markers' : 'pages',
    inspectorPlacement: v.inspectorPlacement === 'sidebar' ? 'sidebar' : 'toolbar',
    showToolWindowNames: boolean(v.showToolWindowNames, d.showToolWindowNames),
    simplifiedPalette: boolean(v.simplifiedPalette, d.simplifiedPalette),
    wheelZoom: boolean(v.wheelZoom, d.wheelZoom),
    wheelResize: boolean(v.wheelResize, d.wheelResize),
    editablePdf: boolean(v.editablePdf, d.editablePdf),
    linked: boolean(v.linked, d.linked),
    zoomMode: v.zoomMode === 'custom' ? 'custom' : 'fit',
    zoomScale: number(v.zoomScale, 1, 0.1, 32),
    pageSpacing: {
      paddingX: number(spacing.paddingX, d.pageSpacing.paddingX, 0, MAX_PAGE_SPACING),
      paddingY: number(spacing.paddingY, d.pageSpacing.paddingY, 0, MAX_PAGE_SPACING),
      gap: number(spacing.gap, d.pageSpacing.gap, 0, MAX_PAGE_SPACING),
    },
    markerStyle: {
      size: number(style.size, DEFAULT_STYLE.size, 4, 120),
      textSize: number(style.textSize, DEFAULT_STYLE.textSize, 2, 80),
      borderWidth: number(style.borderWidth, DEFAULT_STYLE.borderWidth, 0, 8),
      borderColor: color(style.borderColor, DEFAULT_STYLE.borderColor),
      fillColor: color(style.fillColor, DEFAULT_STYLE.fillColor),
      textColor: color(style.textColor, DEFAULT_STYLE.textColor) ?? DEFAULT_STYLE.textColor,
    },
    imageExport: {
      format: image.format === 'png' || image.format === 'webp' ? image.format : 'jpg',
      dpi: image.dpi === 'auto' ||
        (/^[1-9]\d{0,3}$/.test(String(image.dpi)) && Number(image.dpi) <= 3200)
        ? String(image.dpi)
        : 'auto',
      quality: [1, 0.98, 0.95, 0.9].includes(Number(image.quality)) ? Number(image.quality) : 0.95,
      annotations: boolean(image.annotations, true),
      budgetMode: normalizeImageBudgetMode(image.budgetMode),
    },
  };
}
export function readPreferences(): WorkspacePreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_KEY);
    if (saved) return normalizePreferences(JSON.parse(saved));
    return normalizePreferences({
      inspectorPlacement: localStorage.getItem('folio:inspector-placement'),
    });
  } catch {
    return normalizePreferences(undefined);
  }
}
export function writePreferences(value: WorkspacePreferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value));
  } catch {
    /* Layout is usable even when browser storage is blocked. */
  }
}
