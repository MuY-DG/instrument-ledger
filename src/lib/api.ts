import { invoke } from "@tauri-apps/api/core";
import type {
  AddReportInput,
  AppSettings,
  AppearancePreferencesInput,
  AuthStatus,
  BackupResult,
  Base64FilePayload,
  BatchOperationResult,
  BatchUpdateInstrumentsInput,
  CalibrationReport,
  CloseBehavior,
  DataDirInfo,
  ImportResult,
  Instrument,
  InstrumentInput,
  ReleaseHistoryItem,
  ResetAppResult,
  RestoreResult,
  SaveSyncConfigInput,
  SettingsUpdateInput,
  SyncActionResult,
  SyncConfigView,
  SyncStatusResult,
  SyncTestResult,
  TestSyncConfigInput,
  UpdateCheckResult,
  WorkbenchCachePruneResult,
  WorkbenchCacheStats,
} from "@/types";

function encodeUtf8HeaderBase64(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < utf8.length; i++) {
    bin += String.fromCharCode(utf8[i]);
  }
  return btoa(bin);
}

export interface NativePdfWorkspaceState {
  activeId: string | null;
  screen: "home" | "document";
}

export interface NativePdfDraftMeta {
  id: string;
  name: string;
  byteLength: number;
  pageCount: number;
  markerCount: number;
  markersJson: string;
  viewJson: string | null;
  nextNumber: number;
  compatibility: boolean;
  revision: number;
  updatedAt: number;
}

export interface NativePdfSummary {
  id: string;
  name: string;
  updatedAt: number;
  markerCount: number;
  pageCount: number;
  byteLength: number;
}

export interface NativePdfPage {
  items: NativePdfSummary[];
  cursorUpdatedAt: number | null;
  cursorId: string | null;
  total: number;
}

export interface NativePdfSaveResult {
  revision: number;
  evictedCount: number;
  freedBytes: number;
}

const MAX_MEDIA_CACHE_ENTRIES = 120;
const mediaDataUrlCache = new Map<string, string>();
const mediaInFlight = new Map<string, Promise<string>>();

function setCachedMediaDataUrl(relPath: string, url: string) {
  if (mediaDataUrlCache.has(relPath)) {
    mediaDataUrlCache.delete(relPath);
  }
  mediaDataUrlCache.set(relPath, url);
  if (mediaDataUrlCache.size > MAX_MEDIA_CACHE_ENTRIES) {
    const oldestKey = mediaDataUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      mediaDataUrlCache.delete(oldestKey);
    }
  }
}

export function getCachedImageDataUrl(relPath: string): string {
  if (!relPath) return "";
  const hit = mediaDataUrlCache.get(relPath);
  if (!hit) return "";
  // Refresh LRU recency
  mediaDataUrlCache.delete(relPath);
  mediaDataUrlCache.set(relPath, hit);
  return hit;
}

export function clearMediaCache() {
  mediaDataUrlCache.clear();
  mediaInFlight.clear();
}

export function invalidateMediaPath(relPath: string) {
  mediaDataUrlCache.delete(relPath);
  mediaInFlight.delete(relPath);
}

export const api = {
  // Auth & Lock
  getAuthStatus: () => invoke<AuthStatus>("get_auth_status"),
  setupInitialAdmin: (
    username: string,
    password: string,
    docTitle?: string,
    docCode?: string
  ) =>
    invoke<AuthStatus>("setup_initial_admin", {
      username,
      password,
      docTitle: docTitle || null,
      docCode: docCode || null,
    }),
  adminLogin: (
    username: string,
    password: string,
    remember?: boolean,
    rememberDays?: number
  ) =>
    invoke<AuthStatus>("admin_login", {
      username,
      password,
      remember: remember ?? null,
      rememberDays: rememberDays ?? null,
    }),
  adminLogout: () => invoke<AuthStatus>("admin_logout"),
  configureAppLock: (
    pin: string,
    opts?: {
      autoLockMinutes?: number;
      lockOnHide?: boolean;
      lockOnStartup?: boolean;
    }
  ) =>
    invoke<AuthStatus>("configure_app_lock", {
      pin,
      autoLockMinutes: opts?.autoLockMinutes ?? null,
      lockOnHide: opts?.lockOnHide ?? null,
      lockOnStartup: opts?.lockOnStartup ?? null,
    }),
  disableAppLock: () => invoke<AuthStatus>("disable_app_lock"),
  lockApp: () => invoke<AuthStatus>("lock_app"),
  unlockApp: (pin: string) => invoke<AuthStatus>("unlock_app", { pin }),
  unlockAppWithAdmin: (
    adminPassword: string,
    opts?: { newPin?: string; disableLock?: boolean }
  ) =>
    invoke<AuthStatus>("unlock_app_with_admin", {
      adminPassword,
      newPin: opts?.newPin || null,
      disableLock: opts?.disableLock ?? null,
    }),
  performCloseAction: (action: "minimize_to_tray" | "exit", remember: boolean) =>
    invoke<void>("perform_close_action", { action, remember }),
  setCloseBehavior: (closeBehavior: CloseBehavior) =>
    invoke<AppSettings>("set_close_behavior", { closeBehavior }),
  updateAppearancePreferences: (input: AppearancePreferencesInput) =>
    invoke<AppSettings>("update_appearance_preferences", { input }),
  addCustomAppIcon: (name: string, pngBase64: string) =>
    invoke<AppSettings>("add_custom_app_icon", { name, pngBase64 }),
  deleteCustomAppIcon: (iconId: string) =>
    invoke<AppSettings>("delete_custom_app_icon", { iconId }),
  changeAdminPassword: (
    oldPassword: string,
    newPassword: string,
    newUsername?: string
  ) =>
    invoke<void>("change_admin_password", {
      oldPassword,
      newPassword,
      newUsername: newUsername || null,
    }),

  // Instruments
  listInstruments: () => invoke<Instrument[]>("list_instruments"),
  createInstrument: (input: InstrumentInput) =>
    invoke<Instrument>("create_instrument", { input }),
  updateInstrument: (id: number, input: InstrumentInput) =>
    invoke<Instrument>("update_instrument", { id, input }),
  deleteInstrument: (id: number) => invoke<void>("delete_instrument", { id }),
  batchDeleteInstruments: (ids: number[]) =>
    invoke<BatchOperationResult>("batch_delete_instruments", { ids }),
  batchUpdateInstruments: (input: BatchUpdateInstrumentsInput) =>
    invoke<BatchOperationResult>("batch_update_instruments", { input }),
  batchImportInstruments: (rows: InstrumentInput[], replaceExisting: boolean) =>
    invoke<ImportResult>("batch_import_instruments", { rows, replaceExisting }),

  // Calibration Reports
  listReports: (instrumentId: number) =>
    invoke<CalibrationReport[]>("list_reports", { instrumentId }),
  addReport: (input: AddReportInput) =>
    invoke<CalibrationReport>("add_report", { input }),
  deleteReport: (reportId: number) => invoke<void>("delete_report", { reportId }),
  openReportExternal: (reportId: number) =>
    invoke<void>("open_report_external", { reportId }),
  exportReportToPath: (reportId: number, destPath: string) =>
    invoke<void>("export_report_to_path", { reportId, destPath }),

  // Files & Media
  readStoredFileBase64: (relPath: string) =>
    invoke<Base64FilePayload>("read_stored_file_base64", { relPath }),
  readExternalFileBase64: (path: string) =>
    invoke<Base64FilePayload>("read_external_file_base64", { path }),
  writeExternalFileBase64: (path: string, base64Data: string) =>
    invoke<void>("write_external_file_base64", { path, base64Data }),
  readWorkbenchFileRaw: async (path: string): Promise<Uint8Array> => {
    const buffer = await invoke<ArrayBuffer>("read_workbench_file_raw", { path });
    return new Uint8Array(buffer);
  },
  writeWorkbenchFileRaw: async (path: string, bytes: Uint8Array): Promise<void> => {
    await invoke<void>("write_workbench_file_raw", bytes, {
      headers: { "x-dest-path-b64": encodeUtf8HeaderBase64(path) },
    });
  },

  // QI/QC Workbench Native Disk Draft Store (SQLite metadata + content-addressed files + LRU cap)
  workbenchPdfReadWorkspace: () =>
    invoke<NativePdfWorkspaceState>("workbench_pdf_read_workspace"),
  workbenchPdfWriteWorkspace: (activeId: string | null, screen: "home" | "document") =>
    invoke<void>("workbench_pdf_write_workspace", { activeId, screen }),
  workbenchPdfReadDraftMeta: (id: string) =>
    invoke<NativePdfDraftMeta | null>("workbench_pdf_read_draft_meta", { id }),
  workbenchPdfReadSourceRaw: async (id: string): Promise<Uint8Array> => {
    const buffer = await invoke<ArrayBuffer>("workbench_pdf_read_source_raw", { id });
    return new Uint8Array(buffer);
  },
  workbenchPdfListDrafts: (params: {
    cursorUpdatedAt?: number | null;
    cursorId?: string | null;
    limit?: number;
    query?: string;
  }) =>
    invoke<NativePdfPage>("workbench_pdf_list_drafts", {
      cursorUpdatedAt: params.cursorUpdatedAt ?? null,
      cursorId: params.cursorId ?? null,
      limit: params.limit ?? 12,
      query: params.query ?? "",
    }),
  workbenchPdfSaveSourceRaw: (
    meta: {
      id: string;
      name: string;
      pageCount: number;
      markerCount: number;
      markersJson: string;
      viewJson: string | null;
      nextNumber: number;
      compatibility: boolean;
      updatedAt: number;
    },
    bytes: Uint8Array | null
  ) =>
    invoke<NativePdfSaveResult>("workbench_pdf_save_source_raw", bytes ?? new Uint8Array(0), {
      headers: { "x-draft-meta-b64": encodeUtf8HeaderBase64(JSON.stringify(meta)) },
    }),
  workbenchPdfSaveMarkers: (input: {
    id: string;
    markerCount: number;
    markersJson: string;
    viewJson: string | null;
    nextNumber: number;
    compatibility: boolean;
    updatedAt: number;
    screen?: "home" | "document" | null;
  }) => invoke<number>("workbench_pdf_save_markers", { input }),
  workbenchPdfDeleteDraft: (id: string) =>
    invoke<void>("workbench_pdf_delete_draft", { id }),
  workbenchPdfClearAll: () =>
    invoke<WorkbenchCachePruneResult>("workbench_pdf_clear_all"),
  workbenchPdfCacheStats: () =>
    invoke<WorkbenchCacheStats>("workbench_pdf_cache_stats"),
  workbenchPdfPruneCache: (limitMb?: number | null, protectedId?: string | null) =>
    invoke<WorkbenchCachePruneResult>("workbench_pdf_prune_cache", {
      limitMb: limitMb ?? null,
      protectedId: protectedId ?? null,
    }),

  async getStoredImageDataUrl(relPath: string): Promise<string> {
    if (!relPath) return "";
    const cached = getCachedImageDataUrl(relPath);
    if (cached) return cached;
    const inflight = mediaInFlight.get(relPath);
    if (inflight) return inflight;

    const task = invoke<Base64FilePayload>("read_stored_file_base64", {
      relPath,
    })
      .then((payload) => {
        const url = `data:${payload.mime};base64,${payload.base64}`;
        setCachedMediaDataUrl(relPath, url);
        mediaInFlight.delete(relPath);
        return url;
      })
      .catch((err) => {
        mediaInFlight.delete(relPath);
        throw err;
      });
    mediaInFlight.set(relPath, task);
    return task;
  },

  // Settings, Backup & Updates
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (input: SettingsUpdateInput) =>
    invoke<AppSettings>("update_settings", { input }),
  uploadCompanyLogo: (sourcePath: string) =>
    invoke<string>("upload_company_logo", { sourcePath }),
  removeCompanyLogo: () => invoke<void>("remove_company_logo"),
  uploadAdminAvatar: (sourcePath: string) =>
    invoke<string>("upload_admin_avatar", { sourcePath }),
  removeAdminAvatar: () => invoke<void>("remove_admin_avatar"),
  getDataDirInfo: () => invoke<DataDirInfo>("get_data_dir_info"),
  openDataDir: () => invoke<void>("open_data_dir"),
  createLocalBackup: (destZipPath: string, includeWorkbench?: boolean) =>
    invoke<BackupResult>("create_local_backup", {
      destZipPath,
      includeWorkbench: includeWorkbench ?? null,
    }),
  restoreLocalBackup: (srcZipPath: string) =>
    invoke<RestoreResult>("restore_local_backup", { srcZipPath }),
  getDefaultDownloadsDir: () => invoke<string>("get_default_downloads_dir"),
  openFolderPath: (folderPath: string) =>
    invoke<void>("open_folder_path", { folderPath }),
  resetAppWithBackup: (adminPassword: string, backupDir?: string) =>
    invoke<ResetAppResult>("reset_app_with_backup", {
      adminPassword,
      backupDir: backupDir?.trim() || null,
    }),

  checkForUpdates: (githubRepoOverride?: string, proxyOverride?: string) =>
    invoke<UpdateCheckResult>("check_for_updates", {
      githubRepoOverride: githubRepoOverride ?? null,
      proxyOverride: proxyOverride ?? null,
    }),
  fetchReleaseHistory: (githubRepoOverride?: string, proxyOverride?: string) =>
    invoke<ReleaseHistoryItem[]>("fetch_release_history", {
      githubRepoOverride: githubRepoOverride ?? null,
      proxyOverride: proxyOverride ?? null,
    }),
  downloadAndLaunchUpdate: (
    githubRepoOverride?: string,
    proxyOverride?: string
  ) =>
    invoke<string>("download_and_launch_update", {
      githubRepoOverride: githubRepoOverride ?? null,
      proxyOverride: proxyOverride ?? null,
    }),

  // S3-Compatible Cloud Sync
  getSyncConfig: () => invoke<SyncConfigView>("get_sync_config"),
  saveSyncConfig: (input: SaveSyncConfigInput) =>
    invoke<SyncConfigView>("save_sync_config", { input }),
  testSyncConnection: (input: TestSyncConfigInput) =>
    invoke<SyncTestResult>("test_sync_connection", { input }),
  checkSyncStatus: () => invoke<SyncStatusResult>("check_sync_status"),
  syncPush: (force?: boolean) =>
    invoke<SyncActionResult>("sync_push", { force: force ?? false }),
  syncPull: (force?: boolean) =>
    invoke<SyncActionResult>("sync_pull", { force: force ?? false }),
  syncNow: () => invoke<SyncActionResult>("sync_now"),
};
