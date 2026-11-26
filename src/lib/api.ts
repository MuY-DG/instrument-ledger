import { invoke } from "@tauri-apps/api/core";
import type {
  AddReportInput,
  AppSettings,
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
  ResetAppResult,
  RestoreResult,
  SettingsUpdateInput,
  UpdateCheckResult,
} from "@/types";

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
  createLocalBackup: (destZipPath: string) =>
    invoke<BackupResult>("create_local_backup", { destZipPath }),
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
  downloadAndLaunchUpdate: (
    githubRepoOverride?: string,
    proxyOverride?: string
  ) =>
    invoke<string>("download_and_launch_update", {
      githubRepoOverride: githubRepoOverride ?? null,
      proxyOverride: proxyOverride ?? null,
    }),
};
