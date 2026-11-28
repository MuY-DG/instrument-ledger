import type { WorkspaceState } from './drafts';
const key = 'folio:tab-workspace:v1';
export function readTabWorkspace(): WorkspaceState | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value && (value.screen === 'home' || value.screen === 'document') &&
      (value.activeId === undefined || typeof value.activeId === 'string')) return value;
  } catch { /* Fall back to the last persisted workspace when tab storage is unavailable. */ }
  return null;
}
export function rememberTabWorkspace(value: WorkspaceState) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* IndexedDB keeps the shared fallback. */ }
}
