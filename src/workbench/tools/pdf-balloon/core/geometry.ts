import type { PageInfo, Rect } from '../types';
import { IMAGE_BUDGETS, type ImageBudget } from './image-budget';
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export interface PageSpacing {
  paddingX: number;
  paddingY: number;
  gap: number;
}
export const DEFAULT_PAGE_SPACING: PageSpacing = { paddingX: 1, paddingY: 1, gap: 1 };
export const MAX_PAGE_SPACING = 1000;
export function pageLayout(pages: PageInfo[], scale: number, spacing = DEFAULT_PAGE_SPACING) {
  let height = spacing.paddingY;
  const offsets = pages.map((p) => {
    const top = height;
    height += p.height * scale + spacing.gap;
    return top;
  });
  return {
    offsets,
    height: height + spacing.paddingY - (pages.length ? spacing.gap : 0),
    width: Math.max(0, ...pages.map((p) => p.width * scale)) + spacing.paddingX * 2,
  };
}
export function visiblePages(
  offsets: number[],
  pages: PageInfo[],
  scale: number,
  top: number,
  height: number,
  margin = 500,
) {
  // Binary search keeps scrolling cost independent of page count.
  let lo = 0,
    hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] + pages[mid].height * scale <= top - margin) lo = mid + 1;
    else hi = mid;
  }
  const result: number[] = [];
  for (let i = lo; i < pages.length && offsets[i] < top + height + margin; i++) result.push(i);
  return result;
}
export function nearestPage(offsets: number[], pages: PageInfo[], scale: number, y: number) {
  let lo = 0, hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] + pages[mid].height * scale < y) lo = mid + 1;
    else hi = mid;
  }
  if (lo === offsets.length) return Math.max(0, lo - 1);
  if (lo > 0 && y < offsets[lo] &&
    y - (offsets[lo - 1] + pages[lo - 1].height * scale) <= offsets[lo] - y) return lo - 1;
  return lo;
}
export function renderRegion(
  page: PageInfo,
  scale: number,
  viewport: Rect,
  dpr: number,
  budget = 8_000_000,
) {
  const output = Math.min(2, Math.max(1, dpr));
  const full =
    page.width * page.height * scale * scale * output * output <= budget &&
    Math.max(page.width, page.height) * scale * output <= 8192;
  const margin = 180 / scale;
  const region: Rect = full
    ? { x: 0, y: 0, width: page.width, height: page.height }
    : {
        x: clamp(viewport.x - margin, 0, page.width),
        y: clamp(viewport.y - margin, 0, page.height),
        width: 0,
        height: 0,
      };
  if (!full) {
    region.width = Math.max(
      0,
      Math.min(page.width, viewport.x + viewport.width + margin) - region.x,
    );
    region.height = Math.max(
      0,
      Math.min(page.height, viewport.y + viewport.height + margin) - region.y,
    );
  }
  const pixels = region.width * region.height * scale * scale;
  return {
    region,
    output: Math.min(
      output,
      Math.sqrt(budget / Math.max(1, pixels)),
      8192 / Math.max(1, region.width * scale, region.height * scale),
    ),
  };
}
export function contains(outer: Rect, inner: Rect) {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}
export function parseRange(value: string, count: number) {
  const result = new Set<number>();
  for (const part of value.split(/[,，]/)) {
    const match = part.trim().match(/^(\d+)(?:\s*[-~—]\s*(\d+))?$/);
    if (!match) throw new Error('请输入有效页码，例如 1-3,5');
    const a = Number(match[1]),
      b = Number(match[2] ?? a);
    if (a < 1 || b < 1 || a > count || b > count) throw new Error(`页码应在 1 至 ${count} 之间`);
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) result.add(n);
  }
  return [...result].sort((a, b) => a - b);
}
export function exportScale(page: PageInfo, dpi: number, budget: ImageBudget = IMAGE_BUDGETS.safe) {
  return Math.min(
    dpi / 72,
    Math.sqrt(budget.maxPixels / (page.width * page.height)),
    budget.maxDimension / Math.max(page.width, page.height),
  );
}
export function exportDpiLimit(page: PageInfo, budget: ImageBudget = IMAGE_BUDGETS.safe) {
  // Use a whole DPI below the canvas budget so an explicit choice is never downsampled.
  let dpi = Math.floor(exportScale(page, Infinity, budget) * 72);
  const size = exportDimensions(page, dpi / 72);
  if (size.width * size.height > budget.maxPixels) dpi--;
  return Math.max(0, dpi);
}
export function exportDimensions(page: Pick<PageInfo, 'width' | 'height'>, scale: number) {
  // Avoid adding a pixel for floating-point noise (e.g. 108 * (150 / 72)).
  return {
    width: Math.ceil(page.width * scale - 1e-7),
    height: Math.ceil(page.height * scale - 1e-7),
  };
}
