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
