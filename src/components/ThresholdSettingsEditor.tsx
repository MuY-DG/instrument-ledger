import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Clock,
  Lock,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  DEFAULT_WARNING_THRESHOLDS,
  PRESET_THRESHOLD_COLORS,
  getThresholdVisuals,
  normalizeHexColor,
  normalizeThresholds,
} from "@/lib/thresholdColors";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import type {
  AlertPopupFrequency,
  AppSettings,
  WarningThreshold,
} from "@/types";

interface ThresholdSettingsEditorProps {
  settings: AppSettings;
  isAdmin: boolean;
  onSettingsChanged: (next: AppSettings) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
  onRequestLogin?: () => void;
}

const INPUT_CLS =
  "px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 disabled:opacity-60 transition";

function pickNextUnusedColor(existing: WarningThreshold[]): string {
  const used = new Set(existing.map((t) => normalizeHexColor(t.color)));
  const found = PRESET_THRESHOLD_COLORS.find((c) => !used.has(c.hex));
  return found ? found.hex : "#ef4444";
}

export const ThresholdSettingsEditor: React.FC<ThresholdSettingsEditorProps> = ({
  settings,
  isAdmin,
  onSettingsChanged,
  onNotify,
  onRequestLogin,
}) => {
  const [thresholds, setThresholds] = useState<WarningThreshold[]>(() =>
    normalizeThresholds(settings.warningThresholds)
  );
  const [popupEnabled, setPopupEnabled] = useState(settings.alertPopupEnabled);
  const [popupFrequency, setPopupFrequency] = useState<AlertPopupFrequency>(
    settings.alertPopupFrequency || "every_open"
  );
  const [popupIntervalHours, setPopupIntervalHours] = useState(
    settings.alertPopupIntervalHours || 4
  );
  const [saving, setSaving] = useState(false);

  // Add custom threshold form state
  const [newDays, setNewDays] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(() =>
    pickNextUnusedColor(normalizeThresholds(settings.warningThresholds))
  );

  // Sync draft when persisted settings change
  useEffect(() => {
    const normalized = normalizeThresholds(settings.warningThresholds);
    setThresholds(normalized);
    setPopupEnabled(settings.alertPopupEnabled);
    setPopupFrequency(settings.alertPopupFrequency || "every_open");
    setPopupIntervalHours(settings.alertPopupIntervalHours || 4);
    setNewColor(pickNextUnusedColor(normalized));
  }, [
    settings.warningThresholds,
    settings.alertPopupEnabled,
    settings.alertPopupFrequency,
    settings.alertPopupIntervalHours,
  ]);

  const isDirty = useMemo(() => {
    const base = normalizeThresholds(settings.warningThresholds);
    const sameThresholds =
      base.length === thresholds.length &&
      base.every(
        (b, idx) =>
          b.days === thresholds[idx]?.days &&
          normalizeHexColor(b.color) === normalizeHexColor(thresholds[idx]?.color) &&
          b.label.trim() === (thresholds[idx]?.label || "").trim()
      );
    return (
      !sameThresholds ||
      popupEnabled !== settings.alertPopupEnabled ||
      popupFrequency !== (settings.alertPopupFrequency || "every_open") ||
      popupIntervalHours !== (settings.alertPopupIntervalHours || 4)
    );
  }, [
    thresholds,
    popupEnabled,
    popupFrequency,
    popupIntervalHours,
    settings.warningThresholds,
    settings.alertPopupEnabled,
    settings.alertPopupFrequency,
    settings.alertPopupIntervalHours,
  ]);

  const handleUpdateRow = (
    id: string,
    patch: Partial<Pick<WarningThreshold, "days" | "color" | "label">>
  ) => {
    setThresholds((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleDeleteRow = (id: string) => {
    if (thresholds.length <= 1) {
      onNotify("至少需要保留 1 个到期预警阈值", "error");
      return;
    }
    setThresholds((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddThreshold = () => {
    const parsedDays = Math.round(Number(newDays));
    if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      onNotify("请输入 1 ~ 3650 之间的有效预警天数", "error");
      return;
    }
    if (thresholds.some((t) => t.days === parsedDays)) {
      onNotify(`已存在 ${parsedDays} 天的预警阈值，请修改天数或直接编辑原规则`, "error");
      return;
    }
    const color = normalizeHexColor(newColor, "#8b5cf6");
    const label = newLabel.trim() || `${parsedDays}天预警`;
    const nextItem: WarningThreshold = {
      id: `tier-${parsedDays}-${Date.now()}`,
      days: parsedDays,
      color,
      label,
    };
    const nextList = [...thresholds, nextItem].sort((a, b) => b.days - a.days);
    setThresholds(nextList);
    setNewDays("");
    setNewLabel("");
    setNewColor(pickNextUnusedColor(nextList));
  };

  const handleResetDefaults = () => {
    setThresholds(DEFAULT_WARNING_THRESHOLDS.map((t) => ({ ...t })));
    setPopupEnabled(true);
    setPopupFrequency("every_open");
    setPopupIntervalHours(4);
    setNewColor(pickNextUnusedColor(DEFAULT_WARNING_THRESHOLDS));
  };

  const handleDiscardChanges = () => {
    const normalized = normalizeThresholds(settings.warningThresholds);
    setThresholds(normalized);
    setPopupEnabled(settings.alertPopupEnabled);
    setPopupFrequency(settings.alertPopupFrequency || "every_open");
    setPopupIntervalHours(settings.alertPopupIntervalHours || 4);
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    if (thresholds.length === 0) {
      onNotify("至少需要配置 1 个预警阈值", "error");
      return;
    }

    // Validate unique valid days
    const seen = new Set<number>();
    const prepared: WarningThreshold[] = [];
    for (const item of thresholds) {
      const days = Math.round(Number(item.days));
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        onNotify("预警天数必须为 1 ~ 3650 之间的正整数", "error");
        return;
      }
      if (seen.has(days)) {
        onNotify(`存在重复的预警天数「${days} 天」，请调整后再保存`, "error");
        return;
      }
      seen.add(days);
      prepared.push({
        id: item.id.trim() || `tier-${days}`,
        days,
        color: normalizeHexColor(item.color),
        label: item.label.trim() || `${days}天预警`,
      });
    }

    prepared.sort((a, b) => b.days - a.days);
    const clampedHours = Math.max(
      1,
      Math.min(168, Math.round(Number(popupIntervalHours) || 4))
    );

    setSaving(true);
    try {
      const updated = await api.updateSettings({
        warningThresholds: prepared,
        alertPopupEnabled: popupEnabled,
        alertPopupFrequency: popupFrequency,
        alertPopupIntervalHours: clampedHours,
      });
      onSettingsChanged(updated);
      onNotify("到期预警阈值与弹窗规则已保存", "success");
    } catch (err) {
      onNotify(`保存失败：${String(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <Lock className="h-4 w-4 shrink-0 text-amber-500" />
            <span>只读模式，登录后可编辑</span>
          </div>
          {onRequestLogin && (
            <button
              type="button"
              onClick={onRequestLogin}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium shrink-0 transition"
            >
              登录
            </button>
          )}
        </div>
      )}

      {/* Section 1: Multi-tier Thresholds */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-indigo-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              预警阈值
            </h3>
            <InfoTip content="按剩余天数自动匹配最紧迫的预警档位（如 15天 / 30天 / 60天）；已超期固定高亮为玫红色。" />
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-[11px] font-medium text-zinc-600 dark:text-zinc-300 shrink-0 transition"
              title="恢复默认 60天 / 30天 / 15天 阈值及配色"
            >
              <RotateCcw className="h-3 w-3" />
              <span>恢复默认</span>
            </button>
          )}
        </div>

        {/* Threshold Rows */}
        <div className="space-y-2.5">
          {thresholds.map((item) => {
            const visuals = getThresholdVisuals(item.color);
            return (
              <div
                key={item.id}
                style={visuals.cssVars}
                className="p-3 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02] space-y-2.5"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Live Pill Preview */}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium shrink-0 bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)]">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: visuals.hex,
                        boxShadow: visuals.glow,
                      }}
                    />
                    <span>{item.label.trim() || `${item.days}天预警`}</span>
                  </span>

                  {/* Days Input */}
                  <div className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-mono text-[11px]">≤</span>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      disabled={!isAdmin}
                      value={item.days}
                      onChange={(e) =>
                        handleUpdateRow(item.id, {
                          days: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className={`${INPUT_CLS} w-20 font-mono text-center`}
                    />
                    <span className="text-[11px]">天</span>
                  </div>

                  {/* Label Input */}
                  <input
                    type="text"
                    maxLength={24}
                    disabled={!isAdmin}
                    value={item.label}
                    onChange={(e) =>
                      handleUpdateRow(item.id, { label: e.target.value })
                    }
                    placeholder={`${item.days || 30}天预警`}
                    className={`${INPUT_CLS} flex-1 min-w-[120px]`}
                  />

                  {/* Custom Hex Color Picker */}
                  <label
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-[11px] font-mono text-zinc-600 dark:text-zinc-300",
                      isAdmin ? "cursor-pointer hover:border-zinc-300 dark:hover:border-white/20" : "opacity-60"
                    )}
                    title="自定义选择任意颜色"
                  >
                    <input
                      type="color"
                      disabled={!isAdmin}
                      value={visuals.hex}
                      onChange={(e) =>
                        handleUpdateRow(item.id, { color: e.target.value })
                      }
                      className="h-4 w-4 rounded border-0 p-0 bg-transparent cursor-pointer"
                    />
                    <span className="uppercase">{visuals.hex}</span>
                  </label>

                  {/* Delete Row */}
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={thresholds.length <= 1}
                      onClick={() => handleDeleteRow(item.id)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:pointer-events-none transition"
                      title={
                        thresholds.length <= 1
                          ? "至少保留一个阈值"
                          : "删除该阈值"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Preset Color Swatches */}
                {isAdmin && (
                  <div className="flex items-center gap-1.5 pl-0.5 flex-wrap">
                    <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mr-1">
                      快捷配色：
                    </span>
                    {PRESET_THRESHOLD_COLORS.map((swatch) => {
                      const selected =
                        normalizeHexColor(item.color) === swatch.hex;
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          onClick={() =>
                            handleUpdateRow(item.id, { color: swatch.hex })
                          }
                          title={`${swatch.name} (${swatch.hex})`}
                          className={cn(
                            "h-4 w-4 rounded-full transition-transform hover:scale-110",
                            selected &&
                              "ring-2 ring-offset-2 ring-zinc-900 dark:ring-white dark:ring-offset-[#111114] scale-110"
                          )}
                          style={{ backgroundColor: swatch.hex }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Custom Add Row */}
        {isAdmin && (
          <div className="p-3.5 rounded-xl border border-dashed border-zinc-300 dark:border-white/[0.14] bg-white dark:bg-white/[0.015] space-y-2.5">
            <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-indigo-500" />
              <span>添加阈值</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="font-mono text-[11px]">≤</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddThreshold();
                    }
                  }}
                  placeholder="天数"
                  className={`${INPUT_CLS} w-20 font-mono text-center`}
                />
                <span className="text-[11px]">天</span>
              </div>

              <input
                type="text"
                maxLength={24}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddThreshold();
                  }
                }}
                placeholder="标签名称（选填）"
                className={`${INPUT_CLS} flex-1 min-w-[160px]`}
              />

              <label
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-[11px] font-mono text-zinc-600 dark:text-zinc-300 cursor-pointer"
                title="选择新阈值颜色"
              >
                <input
                  type="color"
                  value={normalizeHexColor(newColor, "#8b5cf6")}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-4 w-4 rounded border-0 p-0 bg-transparent cursor-pointer"
                />
                <span className="uppercase">{normalizeHexColor(newColor, "#8b5cf6")}</span>
              </label>

              <button
                type="button"
                onClick={handleAddThreshold}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>添加</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mr-1">
                预设色：
              </span>
              {PRESET_THRESHOLD_COLORS.map((swatch) => {
                const selected = normalizeHexColor(newColor) === swatch.hex;
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => setNewColor(swatch.hex)}
                    title={`${swatch.name} (${swatch.hex})`}
                    className={cn(
                      "h-4 w-4 rounded-full transition-transform hover:scale-110",
                      selected &&
                        "ring-2 ring-offset-2 ring-zinc-900 dark:ring-white dark:ring-offset-[#111114] scale-110"
                    )}
                    style={{ backgroundColor: swatch.hex }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Popup Trigger Policy */}
      <section className="p-4 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              自动弹窗提醒
            </h3>
            <InfoTip content="仅当存在已超期或命中以上阈值的设备时自动弹窗；也可随时点击顶部铃铛手动查看。" />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={popupEnabled}
            disabled={!isAdmin}
            onClick={() => setPopupEnabled((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
              popupEnabled
                ? "bg-zinc-900 dark:bg-white"
                : "bg-zinc-300 dark:bg-zinc-700"
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full transition-transform",
                popupEnabled
                  ? "translate-x-[18px] bg-white dark:bg-zinc-950"
                  : "translate-x-[3px] bg-white dark:bg-zinc-300"
              )}
            />
          </button>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-3 gap-2.5 transition-opacity",
            !popupEnabled && "opacity-45 pointer-events-none"
          )}
        >
          {(
            [
              {
                id: "every_open",
                title: "每次打开",
                tip: "每次启动应用时自动核查并弹窗提醒",
              },
              {
                id: "daily",
                title: "每天一次",
                tip: "同一天内仅首次打开时弹出一次",
              },
              {
                id: "interval",
                title: "定时提醒",
                tip: "启动时提醒，且应用常驻期间按设定间隔再次弹出",
              },
            ] as const
          ).map((opt) => {
            const active = popupFrequency === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={!isAdmin || !popupEnabled}
                onClick={() => setPopupFrequency(opt.id)}
                className={cn(
                  "px-3 py-2.5 rounded-xl border text-left transition",
                  active
                    ? "border-zinc-900 dark:border-white bg-white dark:bg-white/[0.06] shadow-hairline"
                    : "border-zinc-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.015] hover:border-zinc-300 dark:hover:border-white/[0.15]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <span>{opt.title}</span>
                    <InfoTip content={opt.tip} />
                  </span>
                  <span
                    className={cn(
                      "h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0",
                      active
                        ? "border-zinc-900 dark:border-white"
                        : "border-zinc-300 dark:border-zinc-600"
                    )}
                  >
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-white" />
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {popupEnabled && popupFrequency === "interval" && (
          <div className="flex items-center gap-2 pt-1 text-xs text-zinc-600 dark:text-zinc-300">
            <Clock className="h-3.5 w-3.5 text-zinc-400" />
            <span>每</span>
            <input
              type="number"
              min={1}
              max={168}
              disabled={!isAdmin}
              value={popupIntervalHours}
              onChange={(e) =>
                setPopupIntervalHours(
                  Math.max(1, Math.min(168, Number(e.target.value) || 1))
                )
              }
              className={`${INPUT_CLS} w-16 font-mono text-center`}
            />
            <span>小时提醒一次</span>
          </div>
        )}
      </section>

      {/* Footer Save Bar */}
      {isAdmin && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {isDirty && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                有未保存的更改
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscardChanges}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition"
              >
                撤销
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? "保存中..." : "保存"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
