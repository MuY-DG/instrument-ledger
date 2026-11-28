import type { MarkerStyle } from '../types';
import { clamp } from './geometry';

/** Keep the gesture's original ratio, even after the text reaches a size limit. */
export function resizeStyle<T extends MarkerStyle>(
  current: T, baseline: MarkerStyle, delta: number, linked: boolean,
): T {
  const size = clamp(current.size + delta, 4, 120);
  const textSize = linked ? clamp(baseline.textSize * size / baseline.size, 2, 80) : current.textSize;
  return size === current.size && textSize === current.textSize
    ? current : { ...current, size, textSize };
}
