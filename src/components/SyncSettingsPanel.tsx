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
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { api } from "@/lib/api";
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
  const [providerPreset, setProviderPreset] = useState<SyncProviderPreset>("r2");
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

  // Optional E2EE state
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState("");
  const [e2eeConfirm, setE2eeConfirm] = useState("");
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
    const matchedPreset = S3_PRESETS.find((p) => p.id === syncConfig.providerPreset);
    setProviderPreset(matchedPreset ? matchedPreset.id : "custom");
    setEndpoint(syncConfig.endpoint);
    setRegion(syncConfig.region || "auto");
    setBucket(syncConfig.bucket);
    setPrefix(syncConfig.prefix || "instrument-ledger");
    setAccessKeyId(syncConfig.accessKeyId);
    setSecretAccessKey("");
    setForcePathStyle(syncConfig.forcePathStyle);
    setCheckOnStartup(syncConfig.checkOnStartup);
    setDeviceName(syncConfig.deviceName);
    setE2eeEnabled(syncConfig.e2eeEnabled);
    setE2eePassphrase("");
    setE2eeConfirm("");
  }, [syncConfig]);

  const activePreset = useMemo(
    () => S3_PRESETS.find((p) => p.id === providerPreset) || S3_PRESETS[0],
    [providerPreset]
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!syncConfig) return false;
    return (
      enabled !== syncConfig.enabled ||
      providerPreset !== syncConfig.providerPreset ||
      endpoint.trim().replace(/\/+$/, "") !== syncConfig.endpoint.trim().replace(/\/+$/, "") ||
      (region.trim() || "auto") !== (syncConfig.region.trim() || "auto") ||
      bucket.trim() !== syncConfig.bucket.trim() ||
      prefix.trim().replace(/^\/+|\/+$/g, "") !==
        syncConfig.prefix.trim().replace(/^\/+|\/+$/g, "") ||
      accessKeyId.trim() !== syncConfig.accessKeyId.trim() ||
      secretAccessKey.trim() !== "" ||
      forcePathStyle !== syncConfig.forcePathStyle ||
      checkOnStartup !== syncConfig.checkOnStartup ||
      deviceName.trim() !== syncConfig.deviceName.trim() ||
      e2eeEnabled !== syncConfig.e2eeEnabled ||
      e2eePassphrase !== ""
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
    deviceName,
    e2eeEnabled,
    e2eePassphrase,
  ]);

  const handleSelectPreset = (preset: PresetMeta) => {
    setProviderPreset(preset.id);
    setForcePathStyle(preset.forcePathStyle);
    if (!region.trim() || ALL_DEFAULT_REGIONS.has(region.trim())) {
      setRegion(preset.defaultRegion);
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
        e2eeEnabled,
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

    if (e2eeEnabled) {
      const needsNewPass = !syncConfig?.hasE2eePassphrase;
      if (needsNewPass && !e2eePassphrase) {
        onNotify("开启端到端加密时请填写加密口令", "error");
        return;
      }
      if (e2eePassphrase) {
        if (e2eePassphrase.length < 4) {
          onNotify("端到端加密口令长度至少为 4 位", "error");
          return;
        }
        if (e2eePassphrase !== e2eeConfirm) {
          onNotify("两次输入的加密口令不一致，请核对", "error");
          return;
        }
      }
    }

    setSaving(true);
    setSaveBtnStatus("loading");
    setCheckError("");
    try {
      const saved = await api.saveSyncConfig({
        enabled,
        providerPreset,
        endpoint,
        region,
        bucket,
        prefix,
        accessKeyId,
        secretAccessKey: secretAccessKey.trim() || null,
        forcePathStyle,
        e2eeEnabled,
        e2eePassphrase: e2eePassphrase || null,
        clearE2eePassphrase: !e2eeEnabled ? true : false,
        checkOnStartup,
        deviceName: deviceName.trim() || null,
      });
      onConfigSaved(saved);
      setSecretAccessKey("");
      setE2eePassphrase("");
      setE2eeConfirm("");
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

  const canRunSync = Boolean(syncConfig?.configured && syncConfig?.enabled && !hasUnsavedChanges);
  const pct = Math.max(0, Math.min(100, Math.round(syncProgress?.percent ?? 0)));

  return (
    <div className="space-y-4">
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

      {/* Configuration Form */}
      <form onSubmit={handleSaveConfig} className="space-y-4">
        {/* Enable & Startup Check Toggles */}
        <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-zinc-200/75 dark:divide-white/[0.07]">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                启用 S3 云端同步
              </div>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                同步台账记录、位置照片、校准报告与表头预警配置（不含本地工具台大缓存）
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

        {/* S3 Endpoint & Credentials */}
        <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
              对象存储服务配置（S3 兼容）
            </span>
            <InfoTip content={activePreset.tip} />
          </div>

          {/* Provider Quick Presets */}
          <div className="flex flex-wrap gap-1.5">
            {S3_PRESETS.map((preset) => {
              const active = providerPreset === preset.id;
              return (
                <motion.button
                  key={preset.id}
                  type="button"
                  whileTap={TAP_SCALE_SUBTLE}
                  transition={SPRING_SNAPPY}
                  onClick={() => handleSelectPreset(preset)}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Endpoint 服务端点
              </label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={activePreset.endpointPlaceholder}
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
                placeholder={activePreset.regionPlaceholder}
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
                  {showSecretKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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

          <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.07] flex items-center justify-between gap-4">
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
        </div>

        {/* Optional End-to-End Encryption Card */}
        <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  "h-8 w-8 rounded-lg border flex items-center justify-center shrink-0",
                  e2eeEnabled
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-zinc-100 dark:bg-white/[0.05] border-zinc-200/80 dark:border-white/[0.08] text-zinc-500"
                )}
              >
                {e2eeEnabled ? <Lock className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                    端到端加密（选填）
                  </span>
                  <InfoTip content="使用 Argon2id 派生密钥与 AES-256-GCM 在本机完成加密后再上传，云存储服务商无法读取台账数据与校准报告内容。" />
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {e2eeEnabled
                    ? "上传前本机加密数据库与全部附件，换设备同步需填写相同口令"
                    : "未开启时以明文 gzip 快照及原始附件存储于你的私有存储桶"}
                </div>
              </div>
            </div>
            <PrecisionSwitch
              checked={e2eeEnabled}
              size="sm"
              ariaLabel="启用端到端加密"
              onChange={setE2eeEnabled}
            />
          </div>

          <Collapsible open={e2eeEnabled}>
            <div className="pt-3 border-t border-zinc-200/70 dark:border-white/[0.07] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      <KeyRound className="h-3 w-3" />
                      <span>加密口令</span>
                    </label>
                    {syncConfig?.hasE2eePassphrase && !e2eePassphrase && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        已设置口令
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassphrase ? "text" : "password"}
                      value={e2eePassphrase}
                      onChange={(e) => setE2eePassphrase(e.target.value)}
                      placeholder={
                        syncConfig?.hasE2eePassphrase
                          ? "已保存（留空保持不变）"
                          : "输入至少 4 位加密口令"
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
                      e2eePassphrase ? "再次输入以确认口令" : "修改口令时需二次确认"
                    }
                    autoComplete="new-password"
                    className={`${INPUT_CLS} text-xs disabled:opacity-50`}
                  />
                </div>
              </div>

              <p className="text-[11px] text-amber-700 dark:text-amber-300/90 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
                请妥善保管加密口令：口令仅保存在本机配置文件，不会上传至云端。如遗忘口令，云端已加密数据将无法解密恢复。
              </p>
            </div>
          </Collapsible>
        </div>

        {/* Inline Connection Test Feedback */}
        {testError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/[0.06] border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2.5 leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{testError}</span>
          </div>
        )}

        {testResult && (
          <div
            className={cn(
              "px-4 py-3 rounded-xl border text-xs flex items-start gap-2.5 leading-relaxed",
              testResult.passphraseVerified === false
                ? "bg-amber-500/[0.06] border-amber-500/25 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/[0.05] border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
            )}
          >
            {testResult.passphraseVerified === false ? (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div>{testResult.message}</div>
              {testResult.hasRemoteData && testResult.remoteUpdatedAt && (
                <div className="text-[11px] opacity-80 font-mono">
                  来源：{testResult.remoteDeviceName || "未知设备"} ·{" "}
                  {formatSyncTime(testResult.remoteUpdatedAt)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {hasUnsavedChanges ? "有未保存的配置修改" : "凭据仅保存在本机，不会写入同步数据库"}
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
    </div>
  );
};
