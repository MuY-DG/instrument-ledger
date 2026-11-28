import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudDownload,
  CloudUpload,
  Database,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Lock,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatFileSize } from "@/lib/status";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { formatSyncTime } from "@/components/SyncOverlay";
import { Collapsible } from "@/components/ui/MotionPrimitives";
import { PrecisionSwitch } from "@/components/ui/FormControls";
import {
  ActionStatusButton,
  useActionStatus,
} from "@/components/ui/InteractiveControls";
import { SPRING_SNAPPY, TAP_SCALE_SUBTLE } from "@/lib/motion";
import type {
  DataDirInfo,
  SyncConfigView,
  SyncProgressEvent,
  SyncProviderPreset,
  SyncStatusResult,
  SyncTestResult,
} from "@/types";

interface SyncSettingsPanelProps {
  syncConfig: SyncConfigView | null;
  syncStatus: SyncStatusResult | null;
  syncing: boolean;
  syncProgress: SyncProgressEvent | null;
  dirInfo?: DataDirInfo | null;
  onConfigSaved: (next: SyncConfigView) => void;
  onStatusUpdated: (next: SyncStatusResult) => void;
  onSyncNow: () => Promise<void>;
  onManualPush: () => Promise<void>;
  onManualPull: () => Promise<void>;
  onOpenConflictModal: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const INPUT_CLS =
  "precision-field w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-[#fafafa] hover:bg-white focus:bg-white dark:bg-white/[0.03] dark:focus:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500";

interface PresetMeta {
  id: SyncProviderPreset;
  label: string;
  defaultRegion: string;
  forcePathStyle: boolean;
  endpointPlaceholder: string;
  regionPlaceholder: string;
  tip: string;
}

const S3_PRESETS: PresetMeta[] = [
  {
    id: "r2",
    label: "Cloudflare R2",
    defaultRegion: "auto",
    forcePathStyle: true,
    endpointPlaceholder: "https://<account_id>.r2.cloudflarestorage.com",
    regionPlaceholder: "auto",
    tip: "10 GB 免费存储且免出口流量费，Region 填 auto，推荐开启路径风格寻址。",
  },
  {
    id: "oss",
    label: "阿里云 OSS",
    defaultRegion: "cn-hangzhou",
    forcePathStyle: false,
    endpointPlaceholder: "https://oss-cn-hangzhou.aliyuncs.com",
    regionPlaceholder: "cn-hangzhou",
    tip: "阿里云 OSS 要求使用虚拟主机寻址（已自动关闭路径风格），Region 填如 cn-hangzhou。",
  },
  {
    id: "cos",
    label: "腾讯云 COS",
    defaultRegion: "ap-guangzhou",
    forcePathStyle: false,
    endpointPlaceholder: "https://cos.ap-guangzhou.myqcloud.com",
    regionPlaceholder: "ap-guangzhou",
    tip: "腾讯云 COS 推荐使用虚拟主机寻址，Bucket 需包含 APPID（如 ledger-1250000000）。",
  },
  {
    id: "aws",
    label: "AWS S3",
    defaultRegion: "us-east-1",
    forcePathStyle: false,
    endpointPlaceholder: "https://s3.us-east-1.amazonaws.com",
    regionPlaceholder: "us-east-1",
    tip: "标准 Amazon S3，填写对应区域 Endpoint 与 Region。",
  },
  {
    id: "minio",
    label: "MinIO / 自建",
    defaultRegion: "us-east-1",
    forcePathStyle: true,
    endpointPlaceholder: "http://192.168.1.10:9000",
    regionPlaceholder: "us-east-1",
    tip: "支持内网/NAS 部署的 MinIO、RustFS、Garage 等 S3 兼容服务，需开启路径风格。",
  },
  {
    id: "custom",
    label: "自定义",
    defaultRegion: "auto",
    forcePathStyle: true,
    endpointPlaceholder: "https://s3.example.com",
    regionPlaceholder: "auto",
    tip: "兼容任何支持 AWS Signature V4 协议的对象存储（如 Backblaze B2、七牛、华为 OBS 等）。",
  },
];

const ALL_DEFAULT_REGIONS = new Set(S3_PRESETS.map((p) => p.defaultRegion));

export const SyncSettingsPanel: React.FC<SyncSettingsPanelProps> = ({
  syncConfig,
  syncStatus,
  syncing,
  syncProgress,
  dirInfo = null,
  onConfigSaved,
  onStatusUpdated,
  onSyncNow,
  onManualPush,
  onManualPull,
  onOpenConflictModal,
  onNotify,
}) => {
  // Form state
  const [enabled, setEnabled] = useState(false);
  const [providerPreset, setProviderPreset] = useState<SyncProviderPreset | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("auto");
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("instrument-ledger");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [forcePathStyle, setForcePathStyle] = useState(true);
  const [checkOnStartup, setCheckOnStartup] = useState(true);
  const [deviceName, setDeviceName] = useState("");

  // Sync content scopes
  const [syncIncludePhotos, setSyncIncludePhotos] = useState(true);
  const [syncIncludeReports, setSyncIncludeReports] = useState(true);
  const [syncIncludeSettings, setSyncIncludeSettings] = useState(true);
  const [syncIncludeWorkbench, setSyncIncludeWorkbench] = useState(false);

  // Collapsible S3 details (collapsed by default; clicking a provider expands, clicking again collapses)
  const [s3ConfigExpanded, setS3ConfigExpanded] = useState(false);

  // Toggle-free optional E2EE state (filled = enabled, empty/cleared = disabled)
  const [e2eePassphrase, setE2eePassphrase] = useState("");
  const [e2eeConfirm, setE2eeConfirm] = useState("");
  const [clearSavedE2ee, setClearSavedE2ee] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Action states
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SyncTestResult | null>(null);
  const [testError, setTestError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showManualOps, setShowManualOps] = useState(false);

  const {
    status: saveBtnStatus,
    setStatus: setSaveBtnStatus,
    setTransientSuccess: setSaveBtnSuccess,
  } = useActionStatus(1400);

  // Hydrate form whenever loaded config updates
  useEffect(() => {
    if (!syncConfig) return;
    setEnabled(syncConfig.enabled);
    if (syncConfig.configured) {
      const matchedPreset = S3_PRESETS.find((p) => p.id === syncConfig.providerPreset);
      setProviderPreset(matchedPreset ? matchedPreset.id : "custom");
    } else {
      setProviderPreset(null);
    }
    setEndpoint(syncConfig.endpoint);
    setRegion(syncConfig.region || "auto");
    setBucket(syncConfig.bucket);
    setPrefix(syncConfig.prefix || "instrument-ledger");
    setAccessKeyId(syncConfig.accessKeyId);
    setSecretAccessKey("");
    setForcePathStyle(syncConfig.forcePathStyle);
    setCheckOnStartup(syncConfig.checkOnStartup);
    setSyncIncludePhotos(syncConfig.syncIncludePhotos ?? true);
    setSyncIncludeReports(syncConfig.syncIncludeReports ?? true);
    setSyncIncludeSettings(syncConfig.syncIncludeSettings ?? true);
    setSyncIncludeWorkbench(syncConfig.syncIncludeWorkbench ?? false);
    setDeviceName(syncConfig.deviceName);
    setE2eePassphrase("");
    setE2eeConfirm("");
    setClearSavedE2ee(false);
  }, [syncConfig]);

  const activePreset = useMemo(
    () => (providerPreset ? S3_PRESETS.find((p) => p.id === providerPreset) || null : null),
    [providerPreset]
  );

  const savedPresetMeta = useMemo(
    () =>
      syncConfig?.configured
        ? S3_PRESETS.find((p) => p.id === syncConfig.providerPreset) || null
        : null,
    [syncConfig]
  );

  // Toggle-free E2EE effective state: active whenever user entered a passphrase OR kept an already-saved one
  const effectiveE2eeEnabled = Boolean(
    e2eePassphrase.length > 0 || (syncConfig?.hasE2eePassphrase && !clearSavedE2ee)
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!syncConfig) return false;
    const presetChanged = syncConfig.configured
      ? Boolean(providerPreset && providerPreset !== syncConfig.providerPreset)
      : false;
    return (
      enabled !== syncConfig.enabled ||
      presetChanged ||
      endpoint.trim().replace(/\/+$/, "") !== syncConfig.endpoint.trim().replace(/\/+$/, "") ||
      (region.trim() || "auto") !== (syncConfig.region.trim() || "auto") ||
      bucket.trim() !== syncConfig.bucket.trim() ||
      prefix.trim().replace(/^\/+|\/+$/g, "") !==
        syncConfig.prefix.trim().replace(/^\/+|\/+$/g, "") ||
      accessKeyId.trim() !== syncConfig.accessKeyId.trim() ||
      secretAccessKey.trim() !== "" ||
      forcePathStyle !== syncConfig.forcePathStyle ||
      checkOnStartup !== syncConfig.checkOnStartup ||
      syncIncludePhotos !== (syncConfig.syncIncludePhotos ?? true) ||
      syncIncludeReports !== (syncConfig.syncIncludeReports ?? true) ||
      syncIncludeSettings !== (syncConfig.syncIncludeSettings ?? true) ||
      syncIncludeWorkbench !== (syncConfig.syncIncludeWorkbench ?? false) ||
      deviceName.trim() !== syncConfig.deviceName.trim() ||
      e2eePassphrase !== "" ||
      clearSavedE2ee
    );
  }, [
    syncConfig,
    enabled,
    providerPreset,
    endpoint,
    region,
    bucket,
    prefix,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    checkOnStartup,
    syncIncludePhotos,
    syncIncludeReports,
    syncIncludeSettings,
    syncIncludeWorkbench,
    deviceName,
    e2eePassphrase,
    clearSavedE2ee,
  ]);

  const handleSelectPreset = (preset: PresetMeta) => {
    // Clicking the currently expanded preset collapses the config box
    if (s3ConfigExpanded && providerPreset === preset.id) {
      setS3ConfigExpanded(false);
      if (
        !syncConfig?.configured &&
        !endpoint.trim() &&
        !bucket.trim() &&
        !accessKeyId.trim() &&
        !secretAccessKey.trim()
      ) {
        setProviderPreset(null);
        setForcePathStyle(syncConfig?.forcePathStyle ?? true);
        setRegion(syncConfig?.region || "auto");
      }
      return;
    }

    const isOpeningSavedSame =
      Boolean(syncConfig?.configured) && preset.id === syncConfig?.providerPreset;
    setProviderPreset(preset.id);
    setS3ConfigExpanded(true);
    if (!isOpeningSavedSame) {
      setForcePathStyle(preset.forcePathStyle);
      if (!region.trim() || ALL_DEFAULT_REGIONS.has(region.trim())) {
        setRegion(preset.defaultRegion);
      }
    }
    setTestResult(null);
    setTestError("");
  };

  const handleCheckStatus = async () => {
    if (checking || syncing) return;
    setChecking(true);
    setCheckError("");
    try {
      const res = await api.checkSyncStatus();
      onStatusUpdated(res);
      if (res.state === "up_to_date") {
        onNotify(res.summary, "success");
      }
    } catch (err) {
      setCheckError(String(err));
    } finally {
      setChecking(false);
    }
  };

  const handleTestConnection = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    setTestError("");
    try {
      const res = await api.testSyncConnection({
        endpoint,
        region,
        bucket,
        prefix,
        accessKeyId,
        secretAccessKey: secretAccessKey.trim() || null,
        forcePathStyle,
        e2eeEnabled: effectiveE2eeEnabled,
        e2eePassphrase: e2eePassphrase || null,
      });
      setTestResult(res);
    } catch (err) {
      setTestError(String(err));
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;

    if (e2eePassphrase) {
      if (e2eePassphrase.length < 4) {
        setS3ConfigExpanded(true);
        onNotify("端到端加密口令长度至少为 4 位", "error");
        return;
      }
      if (e2eePassphrase !== e2eeConfirm) {
        setS3ConfigExpanded(true);
        onNotify("两次输入的加密口令不一致，请核对", "error");
        return;
      }
    }

    setSaving(true);
    setSaveBtnStatus("loading");
    setCheckError("");
    try {
      const saved = await api.saveSyncConfig({
        enabled,
        providerPreset: providerPreset ?? syncConfig?.providerPreset ?? "custom",
        endpoint,
        region,
        bucket,
        prefix,
        accessKeyId,
        secretAccessKey: secretAccessKey.trim() || null,
        forcePathStyle,
        e2eeEnabled: effectiveE2eeEnabled,
        e2eePassphrase: e2eePassphrase || null,
        clearE2eePassphrase: !effectiveE2eeEnabled,
        checkOnStartup,
        syncIncludePhotos,
        syncIncludeReports,
        syncIncludeSettings,
        syncIncludeWorkbench,
        deviceName: deviceName.trim() || null,
      });
      onConfigSaved(saved);
      setSecretAccessKey("");
      setE2eePassphrase("");
      setE2eeConfirm("");
      setClearSavedE2ee(false);
      setSaveBtnSuccess();
      onNotify("云端同步配置已保存", "success");

      // Automatically refresh remote status after saving an enabled configuration
      if (saved.enabled && saved.configured) {
        api
          .checkSyncStatus()
          .then(onStatusUpdated)
          .catch((err) => setCheckError(String(err)));
      }
    } catch (err) {
      setSaveBtnStatus("idle");
      if (enabled && (!endpoint.trim() || !bucket.trim() || !accessKeyId.trim())) {
        setS3ConfigExpanded(true);
      }
      onNotify(String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const stateBadge = useMemo(() => {
    if (!syncConfig?.configured) {
      return {
        label: "未配置",
        dot: "bg-zinc-400",
        cls: "bg-zinc-100 dark:bg-white/[0.06] border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300",
      };
    }
    if (!syncConfig.enabled) {
      return {
        label: "已暂停",
        dot: "bg-zinc-400",
        cls: "bg-zinc-100 dark:bg-white/[0.06] border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300",
      };
    }
    if (syncStatus?.passphraseError) {
      return {
        label: "口令异常",
        dot: "bg-rose-500",
        cls: "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300",
      };
    }
    switch (syncStatus?.state) {
      case "up_to_date":
        return {
          label: syncStatus.remoteRevision ? `已同步 r${syncStatus.remoteRevision}` : "已同步",
          dot: "bg-emerald-500",
          cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
        };
      case "local_ahead":
        return {
          label: "本地有未推送变更",
          dot: "bg-amber-500",
          cls: "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300",
        };
      case "remote_ahead":
        return {
          label: `云端有新版本 r${syncStatus.remoteRevision ?? ""}`,
          dot: "bg-sky-500",
          cls: "bg-sky-500/10 border-sky-500/25 text-sky-700 dark:text-sky-300",
        };
      case "conflict":
        return {
          label: "存在冲突",
          dot: "bg-rose-500",
          cls: "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300",
        };
      default:
        return {
          label: syncConfig.lastSyncedRev > 0 ? `上次 r${syncConfig.lastSyncedRev}` : "就绪",
          dot: "bg-indigo-500",
          cls: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300",
        };
    }
  }, [syncConfig, syncStatus]);

  const enabledSyncCount =
    1 +
    (syncIncludePhotos ? 1 : 0) +
    (syncIncludeReports ? 1 : 0) +
    (syncIncludeSettings ? 1 : 0) +
    (syncIncludeWorkbench ? 1 : 0);

  const syncScopeItems = useMemo(
    () => [
      {
        key: "core" as const,
        title: "仪器台账记录",
        description: "量具与检具明细、校准周期、状态与备注",
        meta: dirInfo ? `${dirInfo.instrumentCount} 台设备` : undefined,
        checked: true,
        required: true,
        icon: <Database className="h-3.5 w-3.5" />,
        iconCls:
          "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400",
        onChange: () => {},
      },
      {
        key: "photos" as const,
        title: "位置照片与图片",
        description: "设备位置照片、公司表头 Logo 与管理员头像",
        checked: syncIncludePhotos,
        required: false,
        icon: <ImageIcon className="h-3.5 w-3.5" />,
        iconCls: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400",
        onChange: setSyncIncludePhotos,
      },
      {
        key: "reports" as const,
        title: "校准报告附件",
        description: "设备关联的 PDF / 图片校验报告与证书",
        meta: dirInfo ? `${dirInfo.reportCount} 份报告` : undefined,
        checked: syncIncludeReports,
        required: false,
        icon: <FileText className="h-3.5 w-3.5" />,
        iconCls:
          "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
        onChange: setSyncIncludeReports,
      },
      {
        key: "settings" as const,
        title: "表头与预警配置",
        description: "表单编号、台账标题、多档到期预警阈值与弹窗规则",
        checked: syncIncludeSettings,
        required: false,
        icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
        iconCls:
          "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
        onChange: setSyncIncludeSettings,
      },
      {
        key: "workbench" as const,
        title: "QI / QC 工具台草稿",
        description: "工程图纸 PDF 原件与气泡标注草稿（默认关闭以保持同步轻量）",
        meta: dirInfo
          ? `${dirInfo.workbenchDraftCount} 份草稿 · ${formatFileSize(dirInfo.workbenchCacheBytes)}`
          : undefined,
        checked: syncIncludeWorkbench,
        required: false,
        icon: <Layers className="h-3.5 w-3.5" />,
        iconCls:
          "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400",
        onChange: setSyncIncludeWorkbench,
      },
    ],
    [
      dirInfo,
      syncIncludePhotos,
      syncIncludeReports,
      syncIncludeSettings,
      syncIncludeWorkbench,
    ]
  );

  const canRunSync = Boolean(syncConfig?.configured && syncConfig?.enabled && !hasUnsavedChanges);
  const pct = Math.max(0, Math.min(100, Math.round(syncProgress?.percent ?? 0)));
  const isS3Filled = Boolean(
    endpoint.trim() && bucket.trim() && accessKeyId.trim() && (secretAccessKey.trim() || syncConfig?.hasSecretAccessKey)
  );

  return (
    <form onSubmit={handleSaveConfig} className="flex-1 flex flex-col min-h-0">
      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Status & Manual Sync Hero Bar */}
        <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.08] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.09] shadow-hairline flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Cloud className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                    S3 云端同步
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium",
                      stateBadge.cls
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", stateBadge.dot)} />
                    <span>{stateBadge.label}</span>
                  </span>
                  {syncConfig?.e2eeEnabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" />
                      <span>端到端加密</span>
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {syncStatus?.passphraseError ||
                    syncStatus?.summary ||
                    "使用 S3 兼容对象存储跨设备增量同步台账与附件（支持可选端到端加密）"}
                </p>
                {syncConfig?.configured && (
                  <div className="flex items-center gap-2 text-[10.5px] font-mono text-zinc-400 dark:text-zinc-500 mt-1 flex-wrap">
                    <span>上次同步：{formatSyncTime(syncConfig.lastSyncedAt)}</span>
                    {syncStatus?.remoteDeviceName && (
                      <>
                        <span>·</span>
                        <span>
                          云端来源：{syncStatus.remoteDeviceName}（
                          {syncStatus.remoteInstrumentCount ?? 0} 台）
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!canRunSync || checking || syncing}
                onClick={handleCheckStatus}
                title={hasUnsavedChanges ? "请先保存当前修改的配置" : "检测云端版本状态"}
                className="btn-tactile inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-45 shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
                <span>检测</span>
              </button>

              {syncStatus?.state === "conflict" ? (
                <button
                  type="button"
                  disabled={!canRunSync || syncing}
                  onClick={onOpenConflictModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-45 text-white text-xs font-semibold shadow-tactile-primary transition"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>处理冲突</span>
                </button>
              ) : (
                <ActionStatusButton
                  size="sm"
                  status={syncing ? "loading" : "idle"}
                  disabled={!canRunSync || syncing || checking}
                  idleLabel="立即同步"
                  loadingLabel="同步中..."
                  successLabel="已同步"
                  idleIcon={<Cloud className="h-3.5 w-3.5" />}
                  onClick={onSyncNow}
                />
              )}
            </div>
          </div>

          {/* Live Sync Progress */}
          {syncing && syncProgress && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate">
                  {syncProgress.message || "正在同步..."}
                </span>
                <span className="font-mono tabular-nums text-zinc-500 shrink-0">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-200/90 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Expandable Explicit Push / Pull Controls */}
          {syncConfig?.configured && syncConfig.enabled && (
            <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setShowManualOps((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    showManualOps && "rotate-180"
                  )}
                />
                <span>手动指定推送 / 拉取方向</span>
              </button>
              <Collapsible open={showManualOps}>
                <div className="pt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canRunSync || syncing}
                    onClick={onManualPush}
                    className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-45 text-zinc-700 dark:text-zinc-200 text-xs font-medium"
                  >
                    <CloudUpload className="h-3.5 w-3.5 text-indigo-500" />
                    <span>推送本地至云端</span>
                  </button>
                  <button
                    type="button"
                    disabled={!canRunSync || syncing}
                    onClick={onManualPull}
                    className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-45 text-zinc-700 dark:text-zinc-200 text-xs font-medium"
                  >
                    <CloudDownload className="h-3.5 w-3.5 text-emerald-500" />
                    <span>从云端拉取覆盖本地</span>
                  </button>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    遇到版本冲突时将自动拦截并提示确认
                  </span>
                </div>
              </Collapsible>
            </div>
          )}
        </div>

        {checkError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{checkError}</span>
          </div>
        )}

        {/* Enable & Startup Check Toggles */}
        <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-zinc-200/75 dark:divide-white/[0.07]">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                启用 S3 云端同步
              </div>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                开启后可按下方同步内容在多设备间增量同步台账数据
              </div>
            </div>
            <PrecisionSwitch
              checked={enabled}
              size="sm"
              ariaLabel="启用 S3 云端同步"
              onChange={setEnabled}
            />
          </div>

          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                启动应用时自动检测云端状态
              </div>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                启动后仅静默拉取 1 次轻量清单文件，发现云端新版本或冲突时弹窗提醒
              </div>
            </div>
            <PrecisionSwitch
              checked={checkOnStartup}
              disabled={!enabled}
              size="sm"
              ariaLabel="启动时自动检测云端状态"
              onChange={setCheckOnStartup}
            />
          </div>
        </div>

        {/* S3 Endpoint, Credentials & Optional E2EE (Details Collapsed by Default) */}
        <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                对象存储服务配置（S3 兼容）
              </span>
              <InfoTip
                content={
                  s3ConfigExpanded && activePreset
                    ? activePreset.tip
                    : "选择下方对象存储服务商展开填写配置，再次点击已选服务商可收起。"
                }
              />
            </div>

            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-medium shrink-0",
                isS3Filled
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-zinc-100 dark:bg-white/[0.05] border-zinc-200/80 dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isS3Filled ? "bg-emerald-500" : "bg-zinc-400"
                )}
              />
              <span>
                {isS3Filled
                  ? savedPresetMeta
                    ? `已配置 · ${savedPresetMeta.label}`
                    : "已配置"
                  : "未配置"}
              </span>
            </span>
          </div>

          {/* Provider Quick Presets (all unselected by default; click to expand, click again to collapse) */}
          <div className="flex flex-wrap gap-1.5">
            {S3_PRESETS.map((preset) => {
              const active = s3ConfigExpanded && providerPreset === preset.id;
              return (
                <motion.button
                  key={preset.id}
                  type="button"
                  whileTap={TAP_SCALE_SUBTLE}
                  transition={SPRING_SNAPPY}
                  onClick={() => handleSelectPreset(preset)}
                  aria-expanded={active}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                    active
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-tactile-primary"
                      : "bg-zinc-50 dark:bg-white/[0.03] border-zinc-200/90 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.07]"
                  )}
                >
                  {preset.label}
                </motion.button>
              );
            })}
          </div>

          {/* Collapsible Detail Form + Integrated Toggle-Free E2EE */}
          <Collapsible open={s3ConfigExpanded}>
            <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.07] space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Endpoint 服务端点
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder={activePreset?.endpointPlaceholder || "https://s3.example.com"}
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Bucket 存储桶名称
                  </label>
                  <input
                    type="text"
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                    placeholder="例如：my-instrument-ledger"
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Region 区域
                  </label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder={activePreset?.regionPlaceholder || "auto"}
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Access Key ID
                  </label>
                  <input
                    type="text"
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                    placeholder="输入访问密钥 ID"
                    autoComplete="off"
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      Secret Access Key
                    </label>
                    {syncConfig?.hasSecretAccessKey && !secretAccessKey && (
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                        已保存 {syncConfig.secretAccessKeyHint}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showSecretKey ? "text" : "password"}
                      value={secretAccessKey}
                      onChange={(e) => setSecretAccessKey(e.target.value)}
                      placeholder={
                        syncConfig?.hasSecretAccessKey
                          ? "已保存（留空保持不变）"
                          : "输入访问密钥 Secret"
                      }
                      autoComplete="new-password"
                      className={`${INPUT_CLS} font-mono text-xs pr-9`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition p-0.5"
                      tabIndex={-1}
                      aria-label={showSecretKey ? "隐藏密钥" : "显示密钥"}
                    >
                      {showSecretKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      同步目录前缀
                    </label>
                    <InfoTip content="存储桶内的子目录前缀，留空则存放在根目录；换用不同前缀可隔离多套台账。" />
                  </div>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="instrument-ledger"
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    本机设备名称（用于识别来源）
                  </label>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="例如：办公室台式机 / MacBook"
                    maxLength={48}
                    className={`${INPUT_CLS} text-xs`}
                  />
                </div>
              </div>

              <div className="pt-2.5 border-t border-zinc-200/70 dark:border-white/[0.07] flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <span>路径风格寻址（Path-Style）</span>
                  <InfoTip content="Cloudflare R2、MinIO 及 IP 地址自建服务建议开启；阿里云 OSS、腾讯云 COS、AWS S3 需关闭（使用虚拟主机模式）。" />
                </div>
                <PrecisionSwitch
                  checked={forcePathStyle}
                  size="sm"
                  ariaLabel="路径风格寻址"
                  onChange={setForcePathStyle}
                />
              </div>

              {/* Integrated Toggle-Free End-to-End Encryption (Optional) */}
              <div className="pt-3 border-t border-zinc-200/70 dark:border-white/[0.07] space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "h-6 w-6 rounded-md border flex items-center justify-center shrink-0",
                        effectiveE2eeEnabled
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-zinc-100 dark:bg-white/[0.05] border-zinc-200/80 dark:border-white/[0.08] text-zinc-500"
                      )}
                    >
                      {effectiveE2eeEnabled ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                        端到端加密（选填）
                      </span>
                      <InfoTip content="填写口令即自动启用本机加密（Argon2id + AES-256-GCM），云存储服务商无法读取台账与附件；不填则不启用（明文存储）。" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {syncConfig?.hasE2eePassphrase && !e2eePassphrase && (
                      clearSavedE2ee ? (
                        <button
                          type="button"
                          onClick={() => setClearSavedE2ee(false)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>恢复已保存口令</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setClearSavedE2ee(true);
                            setE2eePassphrase("");
                            setE2eeConfirm("");
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>清空口令</span>
                        </button>
                      )
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-medium",
                        effectiveE2eeEnabled
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-100 dark:bg-white/[0.05] border-zinc-200/80 dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          effectiveE2eeEnabled ? "bg-emerald-500" : "bg-zinc-400"
                        )}
                      />
                      <span>
                        {effectiveE2eeEnabled
                          ? "已启用"
                          : clearSavedE2ee
                            ? "保存后关闭"
                            : "未启用"}
                      </span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  填写口令即自动启用本机加密，留空则不启用（明文 gzip 存储于私有存储桶）
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        <KeyRound className="h-3 w-3" />
                        <span>加密口令</span>
                      </label>
                      {syncConfig?.hasE2eePassphrase && !e2eePassphrase && !clearSavedE2ee && (
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          已保存口令
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassphrase ? "text" : "password"}
                        value={e2eePassphrase}
                        onChange={(e) => {
                          const next = e.target.value;
                          setE2eePassphrase(next);
                          if (next) setClearSavedE2ee(false);
                          else setE2eeConfirm("");
                        }}
                        placeholder={
                          syncConfig?.hasE2eePassphrase && !clearSavedE2ee
                            ? "已保存（留空保持不变）"
                            : "留空不启用，填至少 4 位自动开启"
                        }
                        autoComplete="new-password"
                        className={`${INPUT_CLS} text-xs pr-9`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition p-0.5"
                        tabIndex={-1}
                        aria-label={showPassphrase ? "隐藏口令" : "显示口令"}
                      >
                        {showPassphrase ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                      确认口令
                    </label>
                    <input
                      type={showPassphrase ? "text" : "password"}
                      value={e2eeConfirm}
                      onChange={(e) => setE2eeConfirm(e.target.value)}
                      disabled={!e2eePassphrase}
                      placeholder={
                        e2eePassphrase ? "再次输入以确认口令" : "填写口令时需二次确认"
                      }
                      autoComplete="new-password"
                      className={`${INPUT_CLS} text-xs disabled:opacity-50`}
                    />
                  </div>
                </div>

                <Collapsible open={effectiveE2eeEnabled}>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300/90 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
                    请妥善保管加密口令：口令仅保存在本机配置文件，不会上传至云端。换设备同步需填写相同口令，遗忘将无法解密云端数据。
                  </p>
                </Collapsible>
              </div>
            </div>
          </Collapsible>
        </div>

        {/* Sync Contents & Per-Item Enabled Status */}
        <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200/75 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-white/[0.015] flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                同步内容
              </span>
              <InfoTip content="选择参与 S3 跨设备云端同步的数据模块；未开启的项目仅保存在本机，拉取时不会被云端覆盖。" />
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10.5px] font-medium font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
              已开启 {enabledSyncCount}/5 项
            </span>
          </div>

          <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {syncScopeItems.map((item) => (
              <div
                key={item.key}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 transition-opacity",
                      item.iconCls,
                      !item.checked && "opacity-45"
                    )}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        {item.title}
                      </span>
                      {item.meta && (
                        <span className="text-[10.5px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
                          · {item.meta}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                      {item.description}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-medium",
                      item.checked
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : "bg-zinc-100 dark:bg-white/[0.05] border-zinc-200/80 dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        item.checked ? "bg-emerald-500" : "bg-zinc-400"
                      )}
                    />
                    <span>
                      {item.required ? "必选" : item.checked ? "已开启" : "未开启"}
                    </span>
                  </span>

                  <PrecisionSwitch
                    checked={item.checked}
                    disabled={item.required}
                    size="sm"
                    ariaLabel={`同步${item.title}`}
                    onChange={item.onChange}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-2.5 border-t border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.01] text-[10.5px] text-zinc-400 dark:text-zinc-500">
            应用锁 PIN、窗口托盘行为、更新源与 S3 凭据仅保存在本机，不参与云端同步。
          </div>
        </div>
      </div>

      {/* Anchored Connection Test Feedback (always visible above fixed footer) */}
      {(testError || testResult) && (
        <div className="shrink-0 px-6 pt-3 pb-1 border-t border-zinc-200/70 dark:border-white/[0.07] bg-white dark:bg-[#121216]">
          {testError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start justify-between gap-2.5 leading-relaxed">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="break-words">{testError}</span>
              </div>
              <button
                type="button"
                onClick={() => setTestError("")}
                aria-label="关闭提示"
                className="p-0.5 rounded text-rose-500/70 hover:text-rose-600 dark:hover:text-rose-300 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {testResult && (
            <div
              className={cn(
                "px-3.5 py-2.5 rounded-xl border text-xs flex items-start justify-between gap-2.5 leading-relaxed",
                testResult.passphraseVerified === false
                  ? "bg-amber-500/[0.06] border-amber-500/25 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-500/[0.05] border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
              )}
            >
              <div className="flex items-start gap-2 min-w-0">
                {testResult.passphraseVerified === false ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div>{testResult.message}</div>
                  {testResult.hasRemoteData && testResult.remoteUpdatedAt && (
                    <div className="text-[11px] opacity-80 font-mono">
                      来源：{testResult.remoteDeviceName || "未知设备"} ·{" "}
                      {formatSyncTime(testResult.remoteUpdatedAt)}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestResult(null)}
                aria-label="关闭提示"
                className="p-0.5 rounded opacity-65 hover:opacity-100 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fixed Footer Actions */}
      <div className="shrink-0 px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/85 dark:bg-[#16161b]/95 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="text-[11px]">
          {hasUnsavedChanges && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              有未保存的配置修改
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={testing || saving}
            onClick={handleTestConnection}
            className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] disabled:opacity-45 shadow-tactile text-zinc-800 dark:text-zinc-100 text-xs font-medium"
          >
            <PlugZap className={cn("h-3.5 w-3.5 text-indigo-500", testing && "animate-pulse")} />
            <span>{testing ? "测试中..." : "测试连接"}</span>
          </button>

          <ActionStatusButton
            type="submit"
            size="sm"
            status={saveBtnStatus}
            disabled={saving}
            idleLabel="保存配置"
            loadingLabel="保存中..."
            successLabel="已保存"
            idleIcon={<Save className="h-3.5 w-3.5" />}
          />
        </div>
      </div>
    </form>
  );
};
