import type { PageInfo } from '../types';
import type { ImageBudget } from './image-budget';
import { exportDimensions, exportDpiLimit } from './geometry';

export type ImageFormat = 'png' | 'jpg' | 'webp';

export function imageOutputBudget(format: ImageFormat, budget: ImageBudget): ImageBudget {
  return format === 'webp'
    ? { ...budget, maxDimension: Math.min(16383, budget.maxDimension) }
    : { ...budget, maxPixels: Math.min(256_000_000, budget.maxPixels * 8), maxDimension: 32768 };
}

export function imageDpiLimit(page: PageInfo, format: ImageFormat, budget: ImageBudget) {
  return exportDpiLimit(page, imageOutputBudget(format, budget));
}

export function imagePlan(page: Pick<PageInfo, 'width' | 'height'>, scale: number, format: ImageFormat, budget: ImageBudget) {
  const size = exportDimensions(page, scale);
  const tiled = format !== 'webp' && (size.width * size.height > Math.min(8_000_000, budget.maxPixels) ||
    Math.max(size.width, size.height) > budget.maxDimension);
  // JPEG consumes 8-row MCUs. All intermediate stripes end on an MCU boundary.
  const stripePixels = Math.min(2_000_000, budget.maxPixels / 8);
  const rows = Math.max(8, Math.min(256, Math.floor(stripePixels / size.width / 8) * 8));
  const tileWidth = Math.min(4096, budget.maxDimension, size.width);
  const bufferBytes = tiled
    ? size.width * Math.min(rows, size.height) * 8 + tileWidth * (Math.min(rows, size.height) + 4) * 8
    : size.width * size.height * 4;
  return { ...size, tiled, rows, tileWidth, bufferBytes };
}
