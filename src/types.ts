export type LedgerCategory = "gauge" | "fixture";
export type CategoryTab = "gauge" | "fixture" | "all";
export type CalibrationType = "internal" | "external" | "exempt";
export type CalibrationStatus = "valid" | "warning" | "expired" | "exempt";
export type StatusFilter = "all" | "valid" | "warning" | "expired" | "exempt";
export type ExpiryFilter = "all" | "expired" | number;
export type SortMode = "seq" | "expiry" | "name";
export type AlertPopupFrequency = "every_open" | "daily" | "interval";
export type CloseBehavior = "ask" | "minimize_to_tray" | "exit";
export type UiLanguage = "system" | "zh-CN" | "en";
export type ResolvedLocale = "zh-CN" | "en";
export type UiScaleMode = "auto" | "manual";

export interface CustomAppIcon {
  id: string;
  name: string;
  storedPath: string;
}

export interface AppearancePreferencesInput {
  closeBehavior?: CloseBehavior;
  showTrayIcon?: boolean;
  uiLanguage?: UiLanguage;
  uiScaleMode?: UiScaleMode;
  uiScale?: number;
  appIconId?: string;
  compactToolbar?: boolean;
  showImportButton?: boolean;
  sidebarNavConfig?: string;
}

export interface WarningThreshold {
  id: string;
  days: number;
  color: string;
  label: string;
}

export interface Instrument {
  id: number;
  category: LedgerCategory;
  seqNo: number;
  department: string;
  name: string;
  purchaseDate: string;
  serialNo: string;
  modelSpec: string;
  location: string;
  calibrationType: CalibrationType;
  recordType: string;
  lastCalDate: string;
  calCycleMonths: number;
  nextCalDate: string;
  exemptCalibration: boolean;
  remark: string;
  supplier: string;
  contactPerson: string;
  contactPhone: string;
  calAgency: string;
  photoPath: string;
  reportCount: number;
  latestReportId: number | null;
  latestReportName: string | null;
  latestReportExt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstrumentInput {
  category: LedgerCategory;
  seqNo?: number;
  department: string;
  name: string;
  purchaseDate: string;
  serialNo: string;
  modelSpec: string;
  location: string;
  calibrationType: CalibrationType;
  recordType: string;
  lastCalDate: string;
  calCycleMonths: number;
  nextCalDate?: string;
  exemptCalibration: boolean;
  remark: string;
  supplier: string;
  contactPerson: string;
  contactPhone: string;
  calAgency: string;
  photoSourcePath?: string | null;
  photoBase64?: string | null;
  photoFilename?: string | null;
  removePhoto?: boolean;
}

export interface CalibrationReport {
  id: number;
  instrumentId: number;
  fileName: string;
  storedPath: string;
  fileExt: string;
  fileSize: number;
  calDate: string;
  calAgency: string;
  remark: string;
  uploadedAt: string;
}

export interface AddReportInput {
  instrumentId: number;
  sourcePath?: string | null;
  fileBase64?: string | null;
  fileName?: string | null;
  calDate: string;
  calAgency: string;
  remark: string;
  syncInstrumentCalDate: boolean;
}

export interface ImportResult {
  importedCount: number;
  gaugeCount: number;
  fixtureCount: number;
  mode: string;
}

export type BatchRemarkMode = "replace" | "append" | "clear";

export interface BatchUpdateInstrumentsInput {
  ids: number[];
  category?: LedgerCategory;
  department?: string;
  location?: string;
  calibrationType?: CalibrationType;
  exemptCalibration?: boolean;
  lastCalDate?: string;
  calCycleMonths?: number;
  calAgency?: string;
  remarkMode?: BatchRemarkMode;
  remark?: string;
}

export interface BatchOperationResult {
  affectedCount: number;
}

export interface AppSettings {
  adminUsername: string;
  adminTitle: string;
  adminAvatarPath: string;
  warningDays: number;
  warningThresholds: WarningThreshold[];
  alertPopupEnabled: boolean;
  alertPopupFrequency: AlertPopupFrequency;
  alertPopupIntervalHours: number;
  autoLockMinutes: number;
  closeBehavior: CloseBehavior;
  showTrayIcon: boolean;
  uiLanguage: UiLanguage;
  uiScaleMode: UiScaleMode;
  uiScale: number;
  appIconId: string;
  customAppIcons: CustomAppIcon[];
  compactToolbar: boolean;
  showImportButton: boolean;
  sidebarNavConfig: string;
  keepAdminSession: boolean;
  adminSessionDays: number;
  appLockEnabled: boolean;
  appLockPinLength: number;
  lockOnHide: boolean;
  lockOnStartup: boolean;
  docCode: string;
  docVersion: string;
  docTitle: string;
  docSubtitle: string;
  weeklyNotice: string;
  githubRepo: string;
  updateProxyUrl: string;
  companyLogoPath: string;
  workbenchCacheLimitMb: number;
  backupIncludePhotos: boolean;
  backupIncludeReports: boolean;
  backupIncludeSettings: boolean;
  backupIncludeWorkbench: boolean;
}

export interface SettingsUpdateInput {
  adminUsername?: string;
  adminTitle?: string;
  warningDays?: number;
  warningThresholds?: WarningThreshold[];
  alertPopupEnabled?: boolean;
  alertPopupFrequency?: AlertPopupFrequency;
  alertPopupIntervalHours?: number;
  autoLockMinutes?: number;
  closeBehavior?: CloseBehavior;
  showTrayIcon?: boolean;
  uiLanguage?: UiLanguage;
  uiScaleMode?: UiScaleMode;
  uiScale?: number;
  appIconId?: string;
  compactToolbar?: boolean;
  showImportButton?: boolean;
  sidebarNavConfig?: string;
  keepAdminSession?: boolean;
  adminSessionDays?: number;
  lockOnHide?: boolean;
  lockOnStartup?: boolean;
  docCode?: string;
  docVersion?: string;
  docTitle?: string;
  docSubtitle?: string;
  weeklyNotice?: string;
  githubRepo?: string;
  updateProxyUrl?: string;
  workbenchCacheLimitMb?: number;
  backupIncludePhotos?: boolean;
  backupIncludeReports?: boolean;
  backupIncludeSettings?: boolean;
  backupIncludeWorkbench?: boolean;
}

export interface AuthStatus {
  isInitialized: boolean;
  isAdmin: boolean;
  username: string;
  isLocked: boolean;
  appLockEnabled: boolean;
  appLockPinLength: number;
  adminSessionExpiresAt: string | null;
}

export interface Base64FilePayload {
  mime: string;
  base64: string;
  fileName: string;
  size: number;
}

export interface BackupResult {
  path: string;
  sizeBytes: number;
  instrumentCount: number;
  reportCount: number;
  createdAt: string;
}

export interface RestoreResult {
  instrumentCount: number;
  reportCount: number;
  restoredFrom: string;
}

export interface ResetAppResult {
  backup: BackupResult | null;
  auth: AuthStatus;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
  htmlUrl: string;
  assetName: string;
  assetSize: number;
  resolvedSource?: string;
}

export interface UpdateDownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  phase: string;
  message: string;
}

export interface ReleaseHistoryItem {
  version: string;
  tagName: string;
  name: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
  prerelease: boolean;
}

export interface DataDirInfo {
  dataDir: string;
  dbSizeBytes: number;
  attachmentsSizeBytes: number;
  workbenchCacheBytes: number;
  workbenchDraftCount: number;
  workbenchCacheLimitMb: number;
  instrumentCount: number;
  reportCount: number;
  appVersion: string;
}

export interface WorkbenchCacheStats {
  totalBytes: number;
  draftCount: number;
  limitBytes: number;
  limitMb: number;
}

export interface WorkbenchCachePruneResult {
  evictedCount: number;
  freedBytes: number;
  totalBytes: number;
  draftCount: number;
  limitBytes: number;
}

export type SyncProviderPreset = "r2" | "oss" | "cos" | "aws" | "minio" | "custom";

export type SyncState =
  | "unconfigured"
  | "disabled"
  | "up_to_date"
  | "local_ahead"
  | "remote_ahead"
  | "conflict";

export interface SyncConfigView {
  enabled: boolean;
  configured: boolean;
  providerPreset: SyncProviderPreset | string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  hasSecretAccessKey: boolean;
  secretAccessKeyHint: string;
  forcePathStyle: boolean;
  e2eeEnabled: boolean;
  hasE2eePassphrase: boolean;
  checkOnStartup: boolean;
  syncIncludePhotos: boolean;
  syncIncludeReports: boolean;
  syncIncludeSettings: boolean;
  syncIncludeWorkbench: boolean;
  deviceId: string;
  deviceName: string;
  lastSyncedRev: number;
  lastSyncedAt: string;
}

export interface SaveSyncConfigInput {
  enabled: boolean;
  providerPreset: string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey?: string | null;
  clearSecretAccessKey?: boolean | null;
  forcePathStyle: boolean;
  e2eeEnabled: boolean;
  e2eePassphrase?: string | null;
  clearE2eePassphrase?: boolean | null;
  checkOnStartup: boolean;
  syncIncludePhotos?: boolean;
  syncIncludeReports?: boolean;
  syncIncludeSettings?: boolean;
  syncIncludeWorkbench?: boolean;
  deviceName?: string | null;
}

export interface TestSyncConfigInput {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey?: string | null;
  forcePathStyle: boolean;
  e2eeEnabled: boolean;
  e2eePassphrase?: string | null;
}

export interface SyncTestResult {
  ok: boolean;
  message: string;
  hasRemoteData: boolean;
  remoteRevision: number | null;
  remoteInstrumentCount: number | null;
  remoteReportCount: number | null;
  remoteUpdatedAt: string | null;
  remoteDeviceName: string | null;
  remoteEncrypted: boolean;
  passphraseVerified: boolean | null;
}

export interface SyncStatusResult {
  configured: boolean;
  enabled: boolean;
  state: SyncState;
  summary: string;
  localInstrumentCount: number;
  localReportCount: number;
  localChanged: boolean;
  lastSyncedRev: number;
  lastSyncedAt: string;
  remoteRevision: number | null;
  remoteUpdatedAt: string | null;
  remoteDeviceName: string | null;
  remoteInstrumentCount: number | null;
  remoteReportCount: number | null;
  remoteEncrypted: boolean;
  localE2eeEnabled: boolean;
  encryptionMismatch: boolean;
  passphraseError: string | null;
}

export interface SyncActionResult {
  direction: "push" | "pull" | "noop";
  revision: number;
  instrumentCount: number;
  reportCount: number;
  transferredBlobs: number;
  skippedBlobs: number;
  dbBytes: number;
  encrypted: boolean;
  syncedAt: string;
  safetyBackupPath: string | null;
  message: string;
}

export interface SyncProgressEvent {
  phase: string;
  message: string;
  current: number;
  total: number;
  percent: number;
}
