import { invoke } from "@tauri-apps/api/core";
import type {
  AddReportInput,
  AppSettings,
  AuthStatus,
  BackupResult,
  Base64FilePayload,
  CalibrationReport,
  DataDirInfo,
  ImportResult,
  Instrument,
  InstrumentInput,
  RestoreResult,
  SettingsUpdateInput,
  UpdateCheckResult,
} from "@/types";

const mediaDataUrlCache = new Map<string, string>();

export function clearMediaCache() {
  mediaDataUrlCache.clear();
}

export function invalidateMediaPath(relPath: string) {
  mediaDataUrlCache.delete(relPath);
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
  adminLogin: (username: string, password: string) =>
    invoke<AuthStatus>("admin_login", { username, password }),
  adminLogout: () => invoke<AuthStatus>("admin_logout"),
  lockApp: () => invoke<AuthStatus>("lock_app"),
  unlockApp: (password: string) => invoke<AuthStatus>("unlock_app", { password }),
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
    const cached = mediaDataUrlCache.get(relPath);
    if (cached) return cached;
    const payload = await invoke<Base64FilePayload>("read_stored_file_base64", {
      relPath,
    });
    const url = `data:${payload.mime};base64,${payload.base64}`;
    mediaDataUrlCache.set(relPath, url);
    return url;
  },

  // Settings, Backup & Updates
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (input: SettingsUpdateInput) =>
    invoke<AppSettings>("update_settings", { input }),
  uploadCompanyLogo: (sourcePath: string) =>
    invoke<string>("upload_company_logo", { sourcePath }),
  removeCompanyLogo: () => invoke<void>("remove_company_logo"),
  getDataDirInfo: () => invoke<DataDirInfo>("get_data_dir_info"),
  openDataDir: () => invoke<void>("open_data_dir"),
  createLocalBackup: (destZipPath: string) =>
    invoke<BackupResult>("create_local_backup", { destZipPath }),
  restoreLocalBackup: (srcZipPath: string) =>
    invoke<RestoreResult>("restore_local_backup", { srcZipPath }),

  checkForUpdates: (githubRepoOverride?: string, proxyOverride?: string) =>
    invoke<UpdateCheckResult>("check_for_updates", {
      githubRepoOverride: githubRepoOverride || null,
      proxyOverride: proxyOverride ?? null,
    }),
  downloadAndLaunchUpdate: (
    downloadUrl: string,
    assetName: string,
    proxyOverride?: string
  ) =>
    invoke<string>("download_and_launch_update", {
      downloadUrl,
      assetName,
      proxyOverride: proxyOverride ?? null,
    }),
};
