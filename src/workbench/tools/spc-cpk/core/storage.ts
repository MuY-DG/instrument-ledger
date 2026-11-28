import type { SavedSpcRecord } from "../types";

const HISTORY_STORAGE_KEY = "workbench:spc-cpk:history:v1";
const MAX_HISTORY_RECORDS = 80;

export function loadSpcHistory(): SavedSpcRecord[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_HISTORY_RECORDS) as SavedSpcRecord[];
  } catch {
    return [];
  }
}

export function saveSpcHistory(records: SavedSpcRecord[]): void {
  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_HISTORY_RECORDS))
    );
  } catch {
    // ignore storage quota issues
  }
}

export function appendSpcRecord(record: SavedSpcRecord): SavedSpcRecord[] {
  const existing = loadSpcHistory();
  const next = [record, ...existing.filter((r) => r.id !== record.id)].slice(
    0,
    MAX_HISTORY_RECORDS
  );
  saveSpcHistory(next);
  return next;
}

export function deleteSpcRecord(id: string): SavedSpcRecord[] {
  const next = loadSpcHistory().filter((r) => r.id !== id);
  saveSpcHistory(next);
  return next;
}

export function clearSpcHistory(): SavedSpcRecord[] {
  saveSpcHistory([]);
  return [];
}
