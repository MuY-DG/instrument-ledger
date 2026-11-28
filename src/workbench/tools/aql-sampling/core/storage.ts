import type { SavedInspectionRecord } from "../types";

const HISTORY_STORAGE_KEY = "workbench:aql-sampling:history:v1";
const MAX_HISTORY_RECORDS = 100;

export function loadInspectionHistory(): SavedInspectionRecord[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_HISTORY_RECORDS) as SavedInspectionRecord[];
  } catch {
    return [];
  }
}

export function saveInspectionHistory(records: SavedInspectionRecord[]): void {
  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_HISTORY_RECORDS))
    );
  } catch {
    // ignore quota errors
  }
}

export function appendInspectionRecord(
  record: SavedInspectionRecord
): SavedInspectionRecord[] {
  const existing = loadInspectionHistory();
  const next = [record, ...existing.filter((r) => r.id !== record.id)].slice(
    0,
    MAX_HISTORY_RECORDS
  );
  saveInspectionHistory(next);
  return next;
}

export function deleteInspectionRecord(id: string): SavedInspectionRecord[] {
  const next = loadInspectionHistory().filter((r) => r.id !== id);
  saveInspectionHistory(next);
  return next;
}

export function clearInspectionHistory(): SavedInspectionRecord[] {
  saveInspectionHistory([]);
  return [];
}
