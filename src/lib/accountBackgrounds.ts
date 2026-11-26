export type GrainMeshId =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12";

export type AccountBgId = GrainMeshId | "default";

export interface AccountBgPreset {
  id: AccountBgId;
  name: string;
  isGrainMesh: boolean;
}

export interface SilkMeshPaletteSpec {
  l: [number, number, number];
  a: [number, number, number];
  b: [number, number, number];
  p: [number, number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
}

function hexToNormRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Exact 1:1 sRGB definitions of all 12 `[data-av]` palettes shared by
 * Onboarding's post-Netflix silk canvas and the sidebar user card.
 */
export const SILK_MESH_PALETTES: Record<GrainMeshId, SilkMeshPaletteSpec> = {
  "1": {
    l: hexToNormRgb("#ff8fd0"),
    a: hexToNormRgb("#ff3fa6"),
    b: hexToNormRgb("#6a35ff"),
    p: hexToNormRgb("#ffd3ec"),
    p1: [0.12, 0.1],
    p2: [0.92, 0.08],
    p3: [0.88, 0.96],
  },
  "2": {
    l: hexToNormRgb("#7fe3ff"),
    a: hexToNormRgb("#2b8cff"),
    b: hexToNormRgb("#5a35ff"),
    p: hexToNormRgb("#cdf3ff"),
    p1: [1.029, 0.656],
    p2: [0.346, 1.074],
    p3: [-0.059, 0.292],
  },
  "3": {
    l: hexToNormRgb("#d6ff5a"),
    a: hexToNormRgb("#22d39a"),
    b: hexToNormRgb("#0a8a8f"),
    p: hexToNormRgb("#efffb0"),
    p1: [0.656, -0.029],
    p2: [1.074, 0.654],
    p3: [0.292, 1.059],
  },
  "4": {
    l: hexToNormRgb("#ffb866"),
    a: hexToNormRgb("#ff4a5e"),
    b: hexToNormRgb("#c31f86"),
    p: hexToNormRgb("#ffe0b8"),
    p1: [0.344, 1.029],
    p2: [-0.074, 0.346],
    p3: [0.708, -0.059],
  },
  "5": {
    l: hexToNormRgb("#fff27a"),
    a: hexToNormRgb("#ffa51f"),
    b: hexToNormRgb("#ff4a2e"),
    p: hexToNormRgb("#fff3bf"),
    p1: [-0.036, 0.629],
    p2: [0.346, -0.074],
    p3: [1.088, 0.401],
  },
  "6": {
    l: hexToNormRgb("#7dffea"),
    a: hexToNormRgb("#1fa8ff"),
    b: hexToNormRgb("#3a3cff"),
    p: hexToNormRgb("#c9fff5"),
    p1: [0.9, 0.12],
    p2: [0.92, 0.92],
    p3: [0.04, 0.88],
  },
  "7": {
    l: hexToNormRgb("#ffd3f1"),
    a: hexToNormRgb("#c07bff"),
    b: hexToNormRgb("#ff4f9a"),
    p: hexToNormRgb("#f0dcff"),
    p1: [0.629, 1.036],
    p2: [-0.074, 0.654],
    p3: [0.401, -0.088],
  },
  "8": {
    l: hexToNormRgb("#c2ffd6"),
    a: hexToNormRgb("#2fe08a"),
    b: hexToNormRgb("#0a9a6a"),
    p: hexToNormRgb("#e2ffec"),
    p1: [0.371, -0.036],
    p2: [1.074, 0.346],
    p3: [0.599, 1.088],
  },
  "9": {
    l: hexToNormRgb("#ffe3b5"),
    a: hexToNormRgb("#ff8a6a"),
    b: hexToNormRgb("#ff3f86"),
    p: hexToNormRgb("#ffe6d8"),
    p1: [0.1, 0.88],
    p2: [0.08, 0.08],
    p3: [0.96, 0.12],
  },
  "10": {
    l: hexToNormRgb("#bfa0ff"),
    a: hexToNormRgb("#5a3cff"),
    b: hexToNormRgb("#1a1ab0"),
    p: hexToNormRgb("#e0d2ff"),
    p1: [1.036, 0.371],
    p2: [0.654, 1.074],
    p3: [-0.088, 0.599],
  },
  "11": {
    l: hexToNormRgb("#f6ff86"),
    a: hexToNormRgb("#8ae83a"),
    b: hexToNormRgb("#1fb86a"),
    p: hexToNormRgb("#fbffc8"),
    p1: [-0.029, 0.344],
    p2: [0.654, -0.074],
    p3: [1.059, 0.708],
  },
  "12": {
    l: hexToNormRgb("#ffa3cd"),
    a: hexToNormRgb("#e03cff"),
    b: hexToNormRgb("#6a2cff"),
    p: hexToNormRgb("#ffd2ea"),
    p1: [0.88, 0.9],
    p2: [0.08, 0.92],
    p3: [0.12, 0.04],
  },
};

/** Bright pastel palettes where dark ink foreground text reads crisper than white text */
export const LIGHT_TONE_MESH_IDS: ReadonlySet<GrainMeshId> = new Set<GrainMeshId>([
  "3",
  "5",
  "8",
  "9",
  "11",
]);

export const ACCOUNT_BG_PRESETS: ReadonlyArray<AccountBgPreset> = [
  { id: "2", name: "冰川湛蓝", isGrainMesh: true },
  { id: "6", name: "碧空海蓝", isGrainMesh: true },
  { id: "3", name: "极光青柠", isGrainMesh: true },
  { id: "8", name: "翡翠薄荷", isGrainMesh: true },
  { id: "11", name: "初春嫩绿", isGrainMesh: true },
  { id: "9", name: "蜜桃暖阳", isGrainMesh: true },
  { id: "4", name: "晚霞珊瑚", isGrainMesh: true },
  { id: "5", name: "琥珀落日", isGrainMesh: true },
  { id: "1", name: "霓虹粉紫", isGrainMesh: true },
  { id: "7", name: "幻彩薰衣", isGrainMesh: true },
  { id: "12", name: "电光兰紫", isGrainMesh: true },
  { id: "10", name: "星夜靛紫", isGrainMesh: true },
  { id: "default", name: "经典网格", isGrainMesh: false },
];

export const QUICK_SHOWCASE_IDS: ReadonlyArray<GrainMeshId> = [
  "2",
  "4",
  "6",
  "9",
  "1",
];

const VALID_IDS = new Set<string>(ACCOUNT_BG_PRESETS.map((p) => p.id));
export const ACCOUNT_BG_STORAGE_KEY = "instrument_ledger_account_bg";
export const DEFAULT_ACCOUNT_BG: AccountBgId = "2";

export function loadAccountBg(): AccountBgId {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_BG_STORAGE_KEY);
    if (raw && VALID_IDS.has(raw)) {
      return raw as AccountBgId;
    }
  } catch {
    // ignore storage access issues
  }
  return DEFAULT_ACCOUNT_BG;
}

export function saveAccountBg(id: AccountBgId): void {
  try {
    window.localStorage.setItem(ACCOUNT_BG_STORAGE_KEY, id);
  } catch {
    // ignore storage access issues
  }
}

export function isGrainMeshId(id: AccountBgId): id is GrainMeshId {
  return id !== "default";
}
