export type LedgerCategory = "gauge" | "fixture";
export type CategoryTab = "gauge" | "fixture" | "all";
export type CalibrationType = "internal" | "external" | "exempt";
export type CalibrationStatus = "valid" | "warning" | "expired" | "exempt";
export type StatusFilter = "all" | "valid" | "warning" | "expired" | "exempt";
export type ExpiryFilter = "all" | "expired" | number;
export type SortMode = "seq" | "expiry" | "name";
export type AlertPopupFrequency = "every_open" | "daily" | "interval";
export type CloseBehavior = "ask" | "minimize_to_tray" | "exit";

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

export interface AppSettings {
  adminUsername: string;
  warningDays: number;
  warningThresholds: WarningThreshold[];
  alertPopupEnabled: boolean;
  alertPopupFrequency: AlertPopupFrequency;
  alertPopupIntervalHours: number;
  autoLockMinutes: number;
  closeBehavior: CloseBehavior;
  keepAdminSession: boolean;
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
}

export interface SettingsUpdateInput {
  warningDays?: number;
  warningThresholds?: WarningThreshold[];
  alertPopupEnabled?: boolean;
  alertPopupFrequency?: AlertPopupFrequency;
  alertPopupIntervalHours?: number;
  autoLockMinutes?: number;
  closeBehavior?: CloseBehavior;
  keepAdminSession?: boolean;
  lockOnHide?: boolean;
  lockOnStartup?: boolean;
  docCode?: string;
  docVersion?: string;
  docTitle?: string;
  docSubtitle?: string;
  weeklyNotice?: string;
  githubRepo?: string;
  updateProxyUrl?: string;
}

export interface AuthStatus {
  isInitialized: boolean;
  isAdmin: boolean;
  username: string;
  isLocked: boolean;
  appLockEnabled: boolean;
  appLockPinLength: number;
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
}

export interface UpdateDownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  phase: string;
  message: string;
}

export interface DataDirInfo {
  dataDir: string;
  dbSizeBytes: number;
  attachmentsSizeBytes: number;
  appVersion: string;
}
