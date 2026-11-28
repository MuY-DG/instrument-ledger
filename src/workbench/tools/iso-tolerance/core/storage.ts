import type { SavedToleranceRecord } from "../types";

const HISTORY_STORAGE_KEY = "workbench:iso-tolerance:history:v1";
const MAX_HISTORY_RECORDS = 80;

export function loadToleranceHistory(): SavedToleranceRecord[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_HISTORY_RECORDS) as SavedToleranceRecord[];
  } catch {
    return [];
  }
}

export function saveToleranceHistory(records: SavedToleranceRecord[]): void {
  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_HISTORY_RECORDS))
    );
  } catch {
    // ignore quota issues
  }
}

export function appendToleranceRecord(
  record: SavedToleranceRecord
): SavedToleranceRecord[] {
  const existing = loadToleranceHistory();
  const next = [record, ...existing.filter((r) => r.id !== record.id)].slice(
    0,
    MAX_HISTORY_RECORDS
  );
  saveToleranceHistory(next);
  return next;
}

export function deleteToleranceRecord(id: string): SavedToleranceRecord[] {
  const next = loadToleranceHistory().filter((r) => r.id !== id);
  saveToleranceHistory(next);
  return next;
}

export function clearToleranceHistory(): SavedToleranceRecord[] {
  saveToleranceHistory([]);
  return [];
}
