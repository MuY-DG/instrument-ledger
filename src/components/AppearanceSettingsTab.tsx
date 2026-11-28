import React, { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { motion } from "motion/react";
import {
  AlertTriangle,
  AppWindow,
  Check,
  FileSpreadsheet,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  Minus,
  Monitor,
  Moon,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { api } from "@/lib/api";
import { normalizeAppIconToPngBase64 } from "@/lib/appIconUtils";
import { useI18n } from "@/lib/i18n";
import { SPRING_SNAPPY, TAP_SCALE, TAP_SCALE_SUBTLE } from "@/lib/motion";
import {
  areSidebarConfigsEqual,
  getDefaultSidebarNavConfig,
  parseSidebarNavConfig,
  serializeSidebarNavConfig,
  type SidebarNavConfig,
} from "@/lib/sidebarConfig";
import type { ThemePreference } from "@/lib/themeTransition";
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_PRESETS,
  clampUiScale,
} from "@/lib/uiScale";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import { SidebarNavEditor } from "@/components/SidebarNavEditor";
import { PrecisionSelect, PrecisionSwitch } from "@/components/ui/FormControls";
import { ActionStatusButton, useActionStatus } from "@/components/ui/InteractiveControls";
import type {
  AppSettings,
  AppearancePreferencesInput,
  CloseBehavior,
  UiLanguage,
  UiScaleMode,
} from "@/types";

const COMPACT_INPUT_CLS =
  "precision-field w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-[#fafafa] hover:bg-white focus:bg-white dark:bg-white/[0.03] dark:focus:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed";

export const DEFAULT_EXPORT_HEADER = {
  docCode: "JSSK-MPR-170",
  docVersion: "A",
  docTitle: "监视与测量管理台账",
  docSubtitle: "The management record and plan of monitoring and measuring equipment",
  weeklyNotice: "定期核查监视与测量设备校准有效期，确保量值溯源准确可靠",
} as const;

type PendingLogoAction =
  | null
  | { type: "upload"; sourcePath: string; previewUrl: string }
  | { type: "remove" };

interface AppearanceSettingsTabProps {
  settings: AppSettings;
  isAdmin: boolean;
  themePreference: ThemePreference;
  autoUiZoom: number;
  onSelectThemePreference: (pref: ThemePreference, triggerEl?: HTMLElement | null) => void;
  onAppearanceChange: (patch: AppearancePreferencesInput) => Promise<AppSettings | null>;
  onSettingsChanged: (next: AppSettings) => void;
  onDirtyChange: (dirty: boolean) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
  onRequestLogin?: () => void;
  onPreviewOnboarding?: () => void;
  onOpenResetApp?: () => void;
}

export const AppearanceSettingsTab: React.FC<AppearanceSettingsTabProps> = ({
  settings,
  isAdmin,
  themePreference,
  autoUiZoom,
  onSelectThemePreference,
  onAppearanceChange,
  onSettingsChanged,
  onDirtyChange,
  onNotify,
  onRequestLogin,
  onPreviewOnboarding,
  onOpenResetApp,
}) => {
  const { t } = useI18n();

  // Staged draft state for ALL appearance settings
  const [draftTheme, setDraftTheme] = useState<ThemePreference>(themePreference);
  const [draftAppIconId, setDraftAppIconId] = useState<string>(settings.appIconId || "default");
  const [draftLanguage, setDraftLanguage] = useState<UiLanguage>(settings.uiLanguage || "system");
  const [draftScaleMode, setDraftScaleMode] = useState<UiScaleMode>(
    settings.uiScaleMode || "auto"
  );
  const [draftScale, setDraftScale] = useState<number>(clampUiScale(settings.uiScale || 1.0));
  const [draftShowTrayIcon, setDraftShowTrayIcon] = useState<boolean>(settings.showTrayIcon);
  const [draftCloseBehavior, setDraftCloseBehavior] = useState(settings.closeBehavior);
  const [draftCompactToolbar, setDraftCompactToolbar] = useState<boolean>(
    settings.compactToolbar !== false
  );
  const [draftShowImportButton, setDraftShowImportButton] = useState<boolean>(
    Boolean(settings.showImportButton)
  );
  const [draftSidebarConfig, setDraftSidebarConfig] = useState<SidebarNavConfig>(() =>
    parseSidebarNavConfig(settings.sidebarNavConfig)
  );

  // Staged draft state for Excel Export & Print Header
  const [docCode, setDocCode] = useState(settings.docCode);
  const [docVersion, setDocVersion] = useState(settings.docVersion);
  const [docTitle, setDocTitle] = useState(settings.docTitle);
  const [docSubtitle, setDocSubtitle] = useState(settings.docSubtitle);
  const [weeklyNotice, setWeeklyNotice] = useState(settings.weeklyNotice);
  const [savedLogoPreview, setSavedLogoPreview] = useState("");
  const [pendingLogo, setPendingLogo] = useState<PendingLogoAction>(null);

  // Custom app icons & busy states
  const [customIconPreviews, setCustomIconPreviews] = useState<Record<string, string>>({});
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [deletingIconId, setDeletingIconId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resettingHeader, setResettingHeader] = useState(false);

  const {
    status: saveStatus,
    setStatus: setSaveStatus,
    setTransientSuccess: setSaveSuccess,
  } = useActionStatus(1400);

  // Sync draft when persisted settings or themePreference change externally
  useEffect(() => {
    setDraftTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    setDraftAppIconId(settings.appIconId || "default");
    setDraftLanguage(settings.uiLanguage || "system");
    setDraftScaleMode(settings.uiScaleMode || "auto");
    setDraftScale(clampUiScale(settings.uiScale || 1.0));
    setDraftShowTrayIcon(settings.showTrayIcon);
    setDraftCloseBehavior(settings.closeBehavior);
    setDraftCompactToolbar(settings.compactToolbar !== false);
    setDraftShowImportButton(Boolean(settings.showImportButton));
    setDraftSidebarConfig(parseSidebarNavConfig(settings.sidebarNavConfig));
    setDocCode(settings.docCode);
    setDocVersion(settings.docVersion);
    setDocTitle(settings.docTitle);
    setDocSubtitle(settings.docSubtitle);
    setWeeklyNotice(settings.weeklyNotice);
    setPendingLogo(null);
  }, [
    settings.appIconId,
    settings.uiLanguage,
    settings.uiScaleMode,
    settings.uiScale,
    settings.showTrayIcon,
    settings.closeBehavior,
    settings.compactToolbar,
    settings.showImportButton,
    settings.sidebarNavConfig,
    settings.docCode,
    settings.docVersion,
    settings.docTitle,
    settings.docSubtitle,
    settings.weeklyNotice,
  ]);

  useEffect(() => {
    if (settings.companyLogoPath) {
      api
        .getStoredImageDataUrl(settings.companyLogoPath)
        .then(setSavedLogoPreview)
        .catch(() => setSavedLogoPreview(""));
    } else {
      setSavedLogoPreview("");
    }
  }, [settings.companyLogoPath]);

  useEffect(() => {
    let active = true;
    const list = settings.customAppIcons || [];
    if (list.length === 0) {
      setCustomIconPreviews({});
      return;
    }
    Promise.all(
      list.map(async (item) => {
        try {
          const url = await api.getStoredImageDataUrl(item.storedPath);
          return [item.id, url] as const;
        } catch {
          return [item.id, ""] as const;
        }
      })
    ).then((entries) => {
      if (!active) return;
      const map: Record<string, string> = {};
      for (const [id, url] of entries) {
        if (url) map[id] = url;
      }
      setCustomIconPreviews(map);
    });
    return () => {
      active = false;
    };
  }, [settings.customAppIcons]);

  const effectiveLogoPreview =
    pendingLogo?.type === "remove"
      ? ""
      : pendingLogo?.type === "upload"
        ? pendingLogo.previewUrl
        : savedLogoPreview;

  const draftEffectiveZoom = draftScaleMode === "auto" ? autoUiZoom : draftScale;
  const draftZoomPct = Math.round(draftEffectiveZoom * 100);
  const autoZoomPct = Math.round(autoUiZoom * 100);

  const persistedSidebarConfig = useMemo(
    () => parseSidebarNavConfig(settings.sidebarNavConfig),
    [settings.sidebarNavConfig]
  );

  const appearancePrefsDirty =
    draftTheme !== themePreference ||
    draftAppIconId !== (settings.appIconId || "default") ||
    draftLanguage !== (settings.uiLanguage || "system") ||
    draftScaleMode !== (settings.uiScaleMode || "auto") ||
    (draftScaleMode === "manual" &&
      Math.abs(draftScale - clampUiScale(settings.uiScale || 1.0)) > 0.005) ||
    draftShowTrayIcon !== settings.showTrayIcon ||
    draftCloseBehavior !== settings.closeBehavior ||
    draftCompactToolbar !== (settings.compactToolbar !== false) ||
    draftShowImportButton !== Boolean(settings.showImportButton) ||
    !areSidebarConfigsEqual(draftSidebarConfig, persistedSidebarConfig);

  const headerFieldsDirty =
    isAdmin &&
    (docCode !== settings.docCode ||
      docVersion !== settings.docVersion ||
      docTitle !== settings.docTitle ||
      docSubtitle !== settings.docSubtitle ||
      weeklyNotice !== settings.weeklyNotice ||
      pendingLogo !== null);

  const isDirty = appearancePrefsDirty || headerFieldsDirty;

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  const handleRevertDraft = () => {
    setDraftTheme(themePreference);
    setDraftAppIconId(settings.appIconId || "default");
    setDraftLanguage(settings.uiLanguage || "system");
    setDraftScaleMode(settings.uiScaleMode || "auto");
    setDraftScale(clampUiScale(settings.uiScale || 1.0));
    setDraftShowTrayIcon(settings.showTrayIcon);
    setDraftCloseBehavior(settings.closeBehavior);
    setDraftCompactToolbar(settings.compactToolbar !== false);
    setDraftShowImportButton(Boolean(settings.showImportButton));
    setDraftSidebarConfig(parseSidebarNavConfig(settings.sidebarNavConfig));
    setDocCode(settings.docCode);
    setDocVersion(settings.docVersion);
    setDocTitle(settings.docTitle);
    setDocSubtitle(settings.docSubtitle);
    setWeeklyNotice(settings.weeklyNotice);
    setPendingLogo(null);
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (savingAll || !isDirty) return;
    setSavingAll(true);
    setSaveStatus("loading");
    try {
      // 1. Apply theme preference (triggers smooth View Transition)
      if (draftTheme !== themePreference) {
        onSelectThemePreference(draftTheme);
      }

      // 2. Persist appearance & window/tray/layout preferences
      const prefPatch: AppearancePreferencesInput = {};
      if (draftAppIconId !== (settings.appIconId || "default")) {
        prefPatch.appIconId = draftAppIconId;
      }
      if (draftLanguage !== (settings.uiLanguage || "system")) {
        prefPatch.uiLanguage = draftLanguage;
      }
      if (draftScaleMode !== (settings.uiScaleMode || "auto")) {
        prefPatch.uiScaleMode = draftScaleMode;
      }
      if (
        draftScaleMode === "manual" &&
        (draftScaleMode !== settings.uiScaleMode ||
          Math.abs(draftScale - clampUiScale(settings.uiScale || 1.0)) > 0.005)
      ) {
        prefPatch.uiScale = draftScale;
      }
      if (draftShowTrayIcon !== settings.showTrayIcon) {
        prefPatch.showTrayIcon = draftShowTrayIcon;
      }
      if (draftCloseBehavior !== settings.closeBehavior) {
        prefPatch.closeBehavior = draftCloseBehavior;
      }
      if (draftCompactToolbar !== (settings.compactToolbar !== false)) {
        prefPatch.compactToolbar = draftCompactToolbar;
      }
      if (draftShowImportButton !== Boolean(settings.showImportButton)) {
        prefPatch.showImportButton = draftShowImportButton;
      }
      if (!areSidebarConfigsEqual(draftSidebarConfig, persistedSidebarConfig)) {
        prefPatch.sidebarNavConfig = serializeSidebarNavConfig(draftSidebarConfig);
      }

      let latestSettings: AppSettings | null = null;
      if (Object.keys(prefPatch).length > 0) {
        latestSettings = await onAppearanceChange(prefPatch);
      }

      // 3. Persist Excel Export & Print Header (Admin only)
      if (isAdmin && headerFieldsDirty) {
        if (pendingLogo?.type === "upload") {
          await api.uploadCompanyLogo(pendingLogo.sourcePath);
        } else if (pendingLogo?.type === "remove") {
          await api.removeCompanyLogo();
        }
        latestSettings = await api.updateSettings({
          docCode,
          docVersion,
          docTitle,
          docSubtitle,
          weeklyNotice,
        });
        setPendingLogo(null);
      }

      if (latestSettings) {
        onSettingsChanged(latestSettings);
      }
      setSaveSuccess();
      onNotify(t("外观设置已保存", "Appearance settings saved"), "success");
    } catch (err) {
      setSaveStatus("idle");
      onNotify(String(err), "error");
    } finally {
      setSavingAll(false);
    }
  };

  const handleResetAllAppearance = async () => {
    if (resettingAll || savingAll) return;
    const ok = await confirmDialog({
      title: t("恢复全部外观默认设置", "Reset All Appearance Settings"),
      description: isAdmin
        ? t(
            "将恢复主题、应用图标、语言、界面缩放、工具栏显示、侧边栏排序、窗口与托盘以及 Excel 导出与打印表头（含公司 Logo）为初始默认值，确定继续？",
            "Reset theme, app icon, language, scale, toolbar & sidebar layout, window & tray, and Excel export & print header (including company logo) to factory defaults?"
          )
        : t(
            "将恢复主题、应用图标、语言、界面缩放、工具栏显示、侧边栏排序与窗口托盘为初始默认值，确定继续？",
            "Reset theme, app icon, language, scale, toolbar & sidebar layout, and window & tray to factory defaults?"
          ),
      confirmText: t("恢复默认", "Reset Defaults"),
      destructive: true,
    });
    if (!ok) return;

    setResettingAll(true);
    try {
      if (themePreference !== "system") {
        onSelectThemePreference("system");
      }
      let latest = await onAppearanceChange({
        appIconId: "default",
        uiLanguage: "system",
        uiScaleMode: "auto",
        uiScale: 1.0,
        showTrayIcon: true,
        closeBehavior: "ask",
        compactToolbar: true,
        showImportButton: false,
        sidebarNavConfig: "",
      });
      setDraftSidebarConfig(getDefaultSidebarNavConfig());

      if (isAdmin) {
        if (settings.companyLogoPath) {
          await api.removeCompanyLogo();
        }
        latest = await api.updateSettings({
          docCode: DEFAULT_EXPORT_HEADER.docCode,
          docVersion: DEFAULT_EXPORT_HEADER.docVersion,
          docTitle: DEFAULT_EXPORT_HEADER.docTitle,
          docSubtitle: DEFAULT_EXPORT_HEADER.docSubtitle,
          weeklyNotice: DEFAULT_EXPORT_HEADER.weeklyNotice,
        });
      }

      setPendingLogo(null);
      if (latest) onSettingsChanged(latest);
      onNotify(t("全部外观设置已恢复默认", "All appearance settings restored to defaults"), "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setResettingAll(false);
    }
  };

  const handleResetExportHeaderOnly = async () => {
    if (!isAdmin || resettingHeader || savingAll) return;
    const ok = await confirmDialog({
      title: t("恢复导出与打印表头默认设置", "Reset Export & Print Header"),
      description: t(
        "仅将表单编号/版本、台账标题、英文标题、表头说明及公司 Logo 恢复为默认值，不影响其他外观设置。",
        "Only resets form code/version, titles, header notice, and company logo to defaults. Other appearance settings stay unchanged."
      ),
      confirmText: t("恢复默认", "Reset"),
      destructive: true,
    });
    if (!ok) return;

    setResettingHeader(true);
    try {
      if (settings.companyLogoPath) {
        await api.removeCompanyLogo();
      }
      const updated = await api.updateSettings({
        docCode: DEFAULT_EXPORT_HEADER.docCode,
        docVersion: DEFAULT_EXPORT_HEADER.docVersion,
        docTitle: DEFAULT_EXPORT_HEADER.docTitle,
        docSubtitle: DEFAULT_EXPORT_HEADER.docSubtitle,
        weeklyNotice: DEFAULT_EXPORT_HEADER.weeklyNotice,
      });
      setPendingLogo(null);
      onSettingsChanged(updated);
      onNotify(
        t("Excel 导出与打印表头已恢复默认", "Export & print header restored to defaults"),
        "success"
      );
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setResettingHeader(false);
    }
  };

  const handleAddCustomAppIcon = async () => {
    if (uploadingIcon) return;
    const picked = await open({
      multiple: false,
      title: t("选择自定义应用图标", "Select Custom App Icon"),
      filters: [
        {
          name: t("图片", "Images"),
          extensions: ["png", "jpg", "jpeg", "webp", "ico", "svg"],
        },
      ],
    });
    if (typeof picked !== "string" || !picked) return;

    setUploadingIcon(true);
    try {
      const raw = await api.readExternalFileBase64(picked);
      const pngBase64 = await normalizeAppIconToPngBase64(raw.mime, raw.base64);
      const baseName =
        raw.fileName.replace(/\.[^.]+$/, "").trim().slice(0, 16) ||
        t("自定义图标", "Custom Icon");
      const updated = await api.addCustomAppIcon(baseName, pngBase64);
      onSettingsChanged(updated);
      setDraftAppIconId(updated.appIconId);
      onNotify(t("自定义应用图标已添加并启用", "Custom app icon added and applied"), "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleDeleteCustomAppIcon = async (e: React.MouseEvent, iconId: string) => {
    e.stopPropagation();
    if (deletingIconId) return;
    setDeletingIconId(iconId);
    try {
      const updated = await api.deleteCustomAppIcon(iconId);
      onSettingsChanged(updated);
      if (draftAppIconId === iconId) {
        setDraftAppIconId(updated.appIconId);
      }
      onNotify(t("已移除自定义图标", "Custom app icon removed"), "success");
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setDeletingIconId(null);
    }
  };

  const handlePickLogo = async () => {
    if (!isAdmin) return;
    const picked = await open({
      multiple: false,
      title: t("选择公司表头 Logo 图片", "Select Company Header Logo"),
      filters: [{ name: t("图片", "Images"), extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof picked === "string" && picked) {
      try {
        const raw = await api.readExternalFileBase64(picked);
        setPendingLogo({
          type: "upload",
          sourcePath: picked,
          previewUrl: `data:${raw.mime};base64,${raw.base64}`,
        });
      } catch (err) {
        onNotify(String(err), "error");
      }
    }
  };

  const handleStageRemoveLogo = () => {
    if (!isAdmin) return;
    if (pendingLogo?.type === "upload") {
      setPendingLogo(null);
    } else if (settings.companyLogoPath) {
      setPendingLogo({ type: "remove" });
    }
  };

  const themeOptions: Array<{
    id: ThemePreference;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "system", label: t("跟随系统", "System"), icon: <Monitor className="h-3.5 w-3.5" /> },
    { id: "light", label: t("浅色", "Light"), icon: <Sun className="h-3.5 w-3.5" /> },
    { id: "dark", label: t("深色", "Dark"), icon: <Moon className="h-3.5 w-3.5" /> },
  ];

  const languageOptions: Array<{ id: UiLanguage; label: string }> = [
    { id: "system", label: t("跟随系统", "System") },
    { id: "zh-CN", label: "简体中文" },
    { id: "en", label: "English" },
  ];

  const builtInIcons = [
    { id: "default", name: t("默认", "Default"), src: "/app-icons/default.png" },
    { id: "obsidian", name: t("曜石", "Obsidian"), src: "/app-icons/obsidian.png" },
  ];

  const scaleSelectValue =
    draftScaleMode === "auto" ? "auto" : String(Math.round(draftScale * 100));

  const scaleSelectOptions = useMemo(() => {
    const opts = [
      { value: "auto", label: t(`自动 (${autoZoomPct}%)`, `Auto (${autoZoomPct}%)`) },
      ...UI_SCALE_PRESETS.map((p) => {
        const pct = Math.round(p * 100);
        return { value: String(pct), label: `${pct}%` };
      }),
    ];
    if (
      draftScaleMode === "manual" &&
      !opts.some((o) => o.value === String(Math.round(draftScale * 100)))
    ) {
      const pct = Math.round(draftScale * 100);
      opts.push({ value: String(pct), label: `${pct}%` });
    }
    return opts;
  }, [autoZoomPct, draftScaleMode, draftScale, t]);

  return (
    <form onSubmit={handleSaveAll} className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 1. Theme Selection (Taller, refined preview cards) */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
              {t("主题", "Theme")}
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((opt) => {
              const active = draftTheme === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  whileTap={TAP_SCALE_SUBTLE}
                  transition={SPRING_SNAPPY}
                  onClick={() => setDraftTheme(opt.id)}
                  className={cn(
                    "group relative rounded-xl border p-3 text-left transition-all cursor-pointer",
                    active
                      ? "border-zinc-900 dark:border-white/80 bg-zinc-50 dark:bg-white/[0.06] ring-1 ring-zinc-900/10 dark:ring-white/15"
                      : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:border-zinc-300 dark:hover:border-white/[0.16]"
                  )}
                >
                  {/* Taller Desktop Inset Shell Preview (h-[72px]) */}
                  <div className="h-[72px] w-full rounded-lg overflow-hidden border border-zinc-200/80 dark:border-white/[0.08] mb-2.5 flex">
                    {opt.id === "system" ? (
                      <>
                        <div className="w-1/2 h-full bg-[#f4f5f7] p-1.5 flex flex-col gap-1">
                          <div className="flex items-center gap-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/85" />
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/85" />
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/85" />
                          </div>
                          <div className="flex-1 flex gap-1 min-h-0">
                            <div className="w-3.5 flex flex-col gap-1 pt-0.5">
                              <div className="h-1.5 w-full rounded-full bg-zinc-300" />
                              <div className="h-1 w-4/5 rounded-full bg-zinc-200" />
                            </div>
                            <div className="flex-1 rounded-[4px] bg-white border border-zinc-200/90 p-1 space-y-1">
                              <div className="h-1.5 w-3/4 rounded-full bg-zinc-200" />
                              <div className="h-1 w-full rounded-full bg-zinc-100" />
                              <div className="h-1 w-2/3 rounded-full bg-zinc-100" />
                            </div>
                          </div>
                        </div>
                        <div className="w-1/2 h-full bg-[#121318] p-1.5 flex flex-col gap-1">
                          <div className="h-1.5" />
                          <div className="flex-1 flex gap-1 min-h-0">
                            <div className="w-3.5 flex flex-col gap-1 pt-0.5">
                              <div className="h-1.5 w-full rounded-full bg-white/25" />
                              <div className="h-1 w-4/5 rounded-full bg-white/10" />
                            </div>
                            <div className="flex-1 rounded-[4px] bg-[#09090b] border border-white/10 p-1 space-y-1">
                              <div className="h-1.5 w-3/4 rounded-full bg-white/20" />
                              <div className="h-1 w-full rounded-full bg-white/10" />
                              <div className="h-1 w-2/3 rounded-full bg-white/10" />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : opt.id === "light" ? (
                      <div className="w-full h-full bg-[#f4f5f7] p-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400/85" />
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/85" />
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/85" />
                        </div>
                        <div className="flex-1 flex gap-1.5 min-h-0">
                          <div className="w-6 flex flex-col gap-1.5 pt-0.5">
                            <div className="h-1.5 w-full rounded-full bg-zinc-300" />
                            <div className="h-1.5 w-4/5 rounded-full bg-zinc-200" />
                            <div className="h-1.5 w-3/5 rounded-full bg-zinc-200" />
                          </div>
                          <div className="flex-1 rounded-[5px] bg-white border border-zinc-200/90 p-1.5 space-y-1.5">
                            <div className="h-1.5 w-1/2 rounded-full bg-zinc-200" />
                            <div className="h-1 w-full rounded-full bg-zinc-100" />
                            <div className="h-1 w-3/4 rounded-full bg-zinc-100" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-[#121318] p-2 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400/75" />
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/75" />
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/75" />
                        </div>
                        <div className="flex-1 flex gap-1.5 min-h-0">
                          <div className="w-6 flex flex-col gap-1.5 pt-0.5">
                            <div className="h-1.5 w-full rounded-full bg-white/25" />
                            <div className="h-1.5 w-4/5 rounded-full bg-white/10" />
                            <div className="h-1.5 w-3/5 rounded-full bg-white/10" />
                          </div>
                          <div className="flex-1 rounded-[5px] bg-[#09090b] border border-white/[0.1] p-1.5 space-y-1.5">
                            <div className="h-1.5 w-1/2 rounded-full bg-white/20" />
                            <div className="h-1 w-full rounded-full bg-white/10" />
                            <div className="h-1 w-3/4 rounded-full bg-white/10" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100">
                      <span className="text-zinc-500 dark:text-zinc-400">{opt.icon}</span>
                      <span>{opt.label}</span>
                    </span>
                    {active && (
                      <span className="h-4 w-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* 2. App Icon Selector (2 Built-in HIG Icons + Custom Upload) */}
        <section className="p-3.5 rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] space-y-2.5">
          <div className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
              {t("应用图标", "App Icon")}
            </h3>
            <InfoTip
              content={t(
                "切换运行时的程序坞 / 任务栏图标；支持内置预设或自定义上传。",
                "Switch the runtime Dock / Taskbar icon. Choose a preset or upload a custom image."
              )}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {builtInIcons.map((item) => {
              const active = draftAppIconId === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={() => setDraftAppIconId(item.id)}
                  className={cn(
                    "group relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all cursor-pointer w-[72px]",
                    active
                      ? "border-zinc-900 dark:border-white/80 bg-zinc-50 dark:bg-white/[0.07] ring-1 ring-zinc-900/10 dark:ring-white/15"
                      : "border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.015] hover:border-zinc-300 dark:hover:border-white/[0.16]"
                  )}
                >
                  <div className="relative h-12 w-12 flex items-center justify-center">
                    <img
                      src={item.src}
                      alt={item.name}
                      className="h-12 w-12 object-contain"
                    />
                    {active && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-[#141418]">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200 truncate w-full text-center">
                    {item.name}
                  </span>
                </motion.button>
              );
            })}

            {(settings.customAppIcons || []).map((custom) => {
              const active = draftAppIconId === custom.id;
              const preview = customIconPreviews[custom.id];
              const deleting = deletingIconId === custom.id;
              return (
                <motion.div
                  key={custom.id}
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDraftAppIconId(custom.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDraftAppIconId(custom.id);
                    }
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all cursor-pointer w-[72px]",
                    active
                      ? "border-zinc-900 dark:border-white/80 bg-zinc-50 dark:bg-white/[0.07] ring-1 ring-zinc-900/10 dark:ring-white/15"
                      : "border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.015] hover:border-zinc-300 dark:hover:border-white/[0.16]"
                  )}
                >
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={(e) => handleDeleteCustomAppIcon(e, custom.id)}
                    title={t("移除此自定义图标", "Remove custom icon")}
                    className="opacity-0 group-hover:opacity-100 absolute -top-1.5 -left-1.5 h-4 w-4 rounded-full bg-zinc-800 hover:bg-rose-600 dark:bg-zinc-200 dark:hover:bg-rose-500 text-white dark:text-zinc-900 dark:hover:text-white flex items-center justify-center shadow-sm transition-all z-10"
                  >
                    <X className="h-2.5 w-2.5 stroke-[2.5]" />
                  </button>
                  <div className="relative h-12 w-12 flex items-center justify-center">
                    {preview ? (
                      <img
                        src={preview}
                        alt={custom.name}
                        className="h-12 w-12 object-contain"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-[10px] bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-zinc-400">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                    {active && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-[#141418]">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200 truncate w-full text-center">
                    {custom.name}
                  </span>
                </motion.div>
              );
            })}

            <motion.button
              type="button"
              disabled={uploadingIcon}
              whileTap={TAP_SCALE}
              transition={SPRING_SNAPPY}
              onClick={handleAddCustomAppIcon}
              className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/[0.16] hover:border-zinc-400 dark:hover:border-white/[0.3] bg-zinc-50/40 dark:bg-white/[0.015] hover:bg-zinc-100/70 dark:hover:bg-white/[0.04] transition-all cursor-pointer w-[72px] h-[82px] disabled:opacity-50"
            >
              <div className="h-9 w-9 rounded-[10px] bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center text-zinc-500 dark:text-zinc-300">
                {uploadingIcon ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {t("自定义", "Add")}
              </span>
            </motion.button>
          </div>
        </section>

        {/* 3. Language & Interface Scale (Grouped Compact Single-Row Cards, Zero Bloated Subtext) */}
        <section className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {/* Language Row */}
          <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white">
              <Globe className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>语言 / Language</span>
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] shrink-0">
              {languageOptions.map((opt) => {
                const active = draftLanguage === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraftLanguage(opt.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                      active
                        ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interface Scale Row (Ultra-Compact Single Row, No Small Text) */}
          <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white">
              <ZoomIn className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>{t("界面缩放", "Interface Scale")}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={draftEffectiveZoom <= UI_SCALE_MIN}
                onClick={() => {
                  setDraftScaleMode("manual");
                  setDraftScale(clampUiScale(draftEffectiveZoom - 0.05));
                }}
                aria-label={t("缩小界面", "Zoom Out")}
                className="h-7 w-7 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] bg-zinc-50 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.08] disabled:opacity-40 flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <PrecisionSelect
                value={scaleSelectValue}
                options={scaleSelectOptions}
                onChange={(val) => {
                  if (val === "auto") {
                    setDraftScaleMode("auto");
                  } else {
                    setDraftScaleMode("manual");
                    setDraftScale(clampUiScale(Number(val) / 100));
                  }
                }}
                size="xs"
                align="right"
                className="h-7 min-w-[106px] font-mono text-xs justify-between"
                menuClassName="min-w-[120px]"
              />

              <button
                type="button"
                disabled={draftEffectiveZoom >= UI_SCALE_MAX}
                onClick={() => {
                  setDraftScaleMode("manual");
                  setDraftScale(clampUiScale(draftEffectiveZoom + 0.05));
                }}
                aria-label={t("放大界面", "Zoom In")}
                className="h-7 w-7 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] bg-zinc-50 dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.08] disabled:opacity-40 flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              {draftScaleMode === "manual" && (
                <button
                  type="button"
                  onClick={() => setDraftScaleMode("auto")}
                  title={t("恢复自动适配", "Reset to Auto")}
                  className="px-2 h-7 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition cursor-pointer"
                >
                  {t("自动", "Auto")}
                </button>
              )}
              <span className="sr-only">{draftZoomPct}%</span>
            </div>
          </div>
        </section>

        {/* 4. Toolbar Display Preferences */}
        <section className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
              {t("工具栏显示", "Toolbar Display")}
            </h3>
          </div>

          <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {t("精简模式", "Compact Toolbar")}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t(
                    "台账右上角操作按钮仅显示图标与悬停提示，关闭后展开文字标签。",
                    "Show icon-only action buttons with tooltips in the ledger header; disable to show labels."
                  )}
                </p>
              </div>
              <PrecisionSwitch
                checked={draftCompactToolbar}
                onChange={setDraftCompactToolbar}
              />
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {t("显示导入按钮", "Show Import Button")}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t(
                    "关闭后不在工具栏占位，可直接将 .xlsx 文件拖入台账区域导入。",
                    "Hidden by default to keep the toolbar clean; drag & drop .xlsx files onto the ledger anytime."
                  )}
                </p>
              </div>
              <PrecisionSwitch
                checked={draftShowImportButton}
                onChange={setDraftShowImportButton}
              />
            </div>
          </div>
        </section>

        {/* 5. Sidebar Navigation Visibility & Drag-to-Reorder */}
        <SidebarNavEditor
          value={draftSidebarConfig}
          onChange={setDraftSidebarConfig}
        />

        {/* 6. Window & Tray */}
        <section className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] flex items-center gap-1.5">
            <AppWindow className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">
              {t("窗口与托盘", "Window & Tray")}
            </h3>
          </div>

          <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {t("显示系统托盘 / 菜单栏图标", "Show System Tray / Menu Bar Icon")}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t(
                    "窗口隐藏到后台时，图标会显示，方便重新打开窗口。",
                    "The icon appears while the window is hidden so you can reopen it."
                  )}
                </p>
              </div>
              <PrecisionSwitch
                checked={draftShowTrayIcon}
                onChange={setDraftShowTrayIcon}
              />
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                  {t("关闭窗口时", "When Closing the Window")}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t(
                    "选择点击窗口关闭按钮后的操作。",
                    "Choose what the window’s close button does."
                  )}
                </p>
              </div>
              <PrecisionSelect<CloseBehavior>
                value={draftCloseBehavior}
                onChange={setDraftCloseBehavior}
                align="right"
                options={[
                  { value: "ask", label: t("询问我", "Ask Me") },
                  { value: "minimize_to_tray", label: t("隐藏到托盘 / 菜单栏", "Hide to Tray / Menu Bar") },
                  { value: "exit", label: t("退出程序", "Quit App") },
                ]}
              />
            </div>
          </div>
        </section>

        {/* 5. Excel Export & Print Header (Compact 2-Column Grid, Zero Clutter, Dedicated Reset Button) */}
        <section className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{t("Excel 导出与打印表头", "Excel Export & Print Header")}</span>
            </div>

            {isAdmin ? (
              <button
                type="button"
                disabled={resettingHeader || savingAll}
                onClick={handleResetExportHeaderOnly}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t("恢复默认", "Reset")}</span>
              </button>
            ) : (
              onRequestLogin && (
                <button
                  type="button"
                  onClick={onRequestLogin}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-medium hover:opacity-90 transition cursor-pointer"
                >
                  <Lock className="h-3 w-3" />
                  <span>{t("管理员登录", "Admin Sign In")}</span>
                </button>
              )
            )}
          </div>

          <div className="p-3.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  {t("表单编号 / 版本", "Form Code / Rev")}
                </label>
                <div className="grid grid-cols-[1fr_64px] gap-1.5">
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={docCode}
                    onChange={(e) => setDocCode(e.target.value)}
                    placeholder="JSSK-MPR-170"
                    className={`${COMPACT_INPUT_CLS} font-mono`}
                  />
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={docVersion}
                    onChange={(e) => setDocVersion(e.target.value)}
                    placeholder="A"
                    className={`${COMPACT_INPUT_CLS} font-mono text-center`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  {t("台账标题", "Ledger Title")}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className={COMPACT_INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  {t("英文标题", "English Title")}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={docSubtitle}
                  onChange={(e) => setDocSubtitle(e.target.value)}
                  className={COMPACT_INPUT_CLS}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  {t("表头说明", "Header Notice")}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={weeklyNotice}
                  onChange={(e) => setWeeklyNotice(e.target.value)}
                  className={COMPACT_INPUT_CLS}
                />
              </div>
            </div>

            {/* Compact Single-Row Company Logo Strip */}
            <div className="px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/60 dark:bg-white/[0.02] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                  {t("公司 Logo", "Company Logo")}
                </span>
                {effectiveLogoPreview ? (
                  <img
                    src={effectiveLogoPreview}
                    alt="Company Logo"
                    className="h-7 max-w-[110px] object-contain bg-white border border-zinc-200 dark:border-white/10 rounded px-1.5 py-0.5"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    <ImageIcon className="h-3 w-3" />
                    <span>{t("未设置", "None")}</span>
                  </span>
                )}
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handlePickLogo}
                    className="px-2.5 py-1 rounded-md bg-white dark:bg-white/[0.05] border border-zinc-200 dark:border-white/[0.1] hover:bg-zinc-50 dark:hover:bg-white/[0.09] text-[11px] font-medium text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                  >
                    {effectiveLogoPreview ? t("更换", "Replace") : t("上传", "Upload")}
                  </button>
                  {effectiveLogoPreview && (
                    <button
                      type="button"
                      onClick={handleStageRemoveLogo}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{t("移除", "Remove")}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 8. Startup Intro Preview (Moved from Backup & Restore) */}
        {onPreviewOnboarding && (
          <div className="px-4 py-3.5 rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                  {t("启动引导动画", "Startup Intro Animation")}
                </span>
                <InfoTip
                  content={t(
                    "预览首次安装时的启动动画与引导界面，仅作效果演示，不会修改任何本地数据或账号配置。",
                    "Preview the first-launch animation and onboarding UI without changing any local data or account settings."
                  )}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onPreviewOnboarding}
              className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] shadow-tactile text-zinc-800 dark:text-zinc-100 text-xs font-medium shrink-0 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{t("预览动画", "Preview")}</span>
            </button>
          </div>
        )}

        {/* 9. Initialize / Reset Application (Admin, Moved from Backup & Restore) */}
        {isAdmin && onOpenResetApp && (
          <div className="px-4 py-3.5 rounded-xl border border-rose-200/85 dark:border-rose-500/20 bg-rose-50/35 dark:bg-rose-500/[0.03] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                  {t("初始化程序", "Factory Reset")}
                </span>
                <InfoTip
                  content={t(
                    "清空本地数据并恢复至首次安装状态；若存在台账数据将先自动导出备份。",
                    "Clear local data and restore to initial setup state; existing ledger records are backed up automatically first."
                  )}
                />
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={TAP_SCALE}
              transition={SPRING_SNAPPY}
              onClick={onOpenResetApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-tactile-primary transition-colors shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t("初始化", "Reset")}</span>
            </motion.button>
          </div>
        )}
      </div>

      {/* Fixed Bottom Action Footer Bar */}
      <div className="shrink-0 px-6 py-3 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/90 dark:bg-[#16161b]/95 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            disabled={resettingAll || savingAll}
            onClick={handleResetAllAppearance}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-100 dark:hover:bg-white/[0.08] disabled:opacity-45 text-xs font-medium text-zinc-600 dark:text-zinc-300 transition cursor-pointer shrink-0"
          >
            {resettingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            <span>{t("恢复默认", "Reset All")}</span>
          </button>

          {isDirty && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium truncate">
              {t("有未保存的更改", "Unsaved changes")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDirty && (
            <button
              type="button"
              disabled={savingAll}
              onClick={handleRevertDraft}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition cursor-pointer"
            >
              {t("撤销", "Revert")}
            </button>
          )}
          <ActionStatusButton
            type="submit"
            size="sm"
            status={saveStatus}
            disabled={savingAll || !isDirty}
            idleLabel={t("保存", "Save")}
            loadingLabel={t("保存中...", "Saving...")}
            successLabel={t("已保存", "Saved")}
            idleIcon={<Save className="h-3.5 w-3.5" />}
          />
        </div>
      </div>
    </form>
  );
};
