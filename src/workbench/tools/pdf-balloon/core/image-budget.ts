export type ImageBudgetMode = 'auto' | 'safe' | 'high' | 'ultra';
export interface ImageBudget {
  label: string;
  maxPixels: number;
  maxDimension: number;
}

// These are application budgets, not measured device or browser capacity.
export const IMAGE_BUDGETS = {
  compact: { label: '轻量', maxPixels: 12_000_000, maxDimension: 8192 },
  safe: { label: '稳健', maxPixels: 24_000_000, maxDimension: 8192 },
  high: { label: '高清', maxPixels: 48_000_000, maxDimension: 12288 },
  ultra: { label: '超高清', maxPixels: 96_000_000, maxDimension: 16384 },
} as const satisfies Record<string, ImageBudget>;

export function normalizeImageBudgetMode(value: unknown): ImageBudgetMode {
  return value === 'safe' || value === 'high' || value === 'ultra' ? value : 'auto';
}

export function deviceMemoryGiB(): number | null {
  if (typeof navigator === 'undefined') return null;
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function resolveImageBudget(mode: ImageBudgetMode, memory = deviceMemoryGiB()) {
  const reportedMemory = memory !== null && Number.isFinite(memory) && memory > 0 ? memory : null;
  const recommended: keyof typeof IMAGE_BUDGETS = reportedMemory === null ? 'safe'
    : reportedMemory <= 2 ? 'compact' : reportedMemory >= 8 ? 'high' : 'safe';
  const tier = mode === 'auto' ? recommended : mode;
  return { ...IMAGE_BUDGETS[tier], tier, recommended, reportedMemory };
}
