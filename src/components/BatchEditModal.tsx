import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  CalendarClock,
  Layers,
  MapPin,
  MessageSquare,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { calcNextCalDate, getTodayStr } from "@/lib/status";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE_SUBTLE } from "@/lib/motion";
import { ModalShell } from "@/components/ui/MotionPrimitives";
import {
  PrecisionCheckbox,
  PrecisionSelect,
} from "@/components/ui/FormControls";
import {
  ActionStatusButton,
  NumberStepper,
  useActionStatus,
} from "@/components/ui/InteractiveControls";
import type {
  BatchRemarkMode,
  BatchUpdateInstrumentsInput,
  CalibrationType,
  Instrument,
  LedgerCategory,
} from "@/types";

interface BatchEditModalProps {
  open: boolean;
  selectedInstruments: Instrument[];
  allInstruments: Instrument[];
  onClose: () => void;
  onUpdated: (affectedCount: number) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const INPUT_CLS =
  "precision-field w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-[#fafafa] hover:bg-white focus:bg-white dark:bg-white/[0.03] dark:focus:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 disabled:opacity-50";

export const BatchEditModal: React.FC<BatchEditModalProps> = ({
  open,
  selectedInstruments,
  allInstruments,
  onClose,
  onUpdated,
  onNotify,
}) => {
  // Per-field enable flags so unmodified fields are guaranteed untouched
  const [editLastCalDate, setEditLastCalDate] = useState(false);
  const [lastCalDate, setLastCalDate] = useState(() => getTodayStr());

  const [editCalCycle, setEditCalCycle] = useState(false);
  const [calCycleMonths, setCalCycleMonths] = useState(12);

  const [editCalAgency, setEditCalAgency] = useState(false);
  const [calAgency, setCalAgency] = useState("");

  const [editCalType, setEditCalType] = useState(false);
  const [calibrationType, setCalibrationType] =
    useState<CalibrationType>("external");

  const [editCategory, setEditCategory] = useState(false);
  const [category, setCategory] = useState<LedgerCategory>("gauge");

  const [editDepartment, setEditDepartment] = useState(false);
  const [department, setDepartment] = useState("");

  const [editLocation, setEditLocation] = useState(false);
  const [location, setLocation] = useState("");

  const [editRemark, setEditRemark] = useState(false);
  const [remarkMode, setRemarkMode] = useState<BatchRemarkMode>("append");
  const [remark, setRemark] = useState("");

  const [saving, setSaving] = useState(false);
  const {
    status: saveStatus,
    setStatus: setSaveStatus,
    setTransientSuccess: setSaveSuccess,
    reset: resetSaveStatus,
  } = useActionStatus(900);

  // Reset form each time modal opens
  useEffect(() => {
    if (!open) return;
    resetSaveStatus();
    setSaving(false);
    setEditLastCalDate(false);
    setLastCalDate(getTodayStr());
    setEditCalCycle(false);
    setCalCycleMonths(12);
    setEditCalAgency(false);
    setCalAgency("");
    setEditCalType(false);
    setCalibrationType("external");
    setEditCategory(false);
    setCategory(selectedInstruments[0]?.category || "gauge");
    setEditDepartment(false);
    setDepartment("");
    setEditLocation(false);
    setLocation("");
    setEditRemark(false);
    setRemarkMode("append");
    setRemark("");
  }, [open, resetSaveStatus]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    allInstruments.forEach((i) => i.department.trim() && set.add(i.department.trim()));
    ["品质部", "CCS车间", "仓务部", "生产部", "注塑部"].forEach((d) => set.add(d));
    return Array.from(set).sort();
  }, [allInstruments]);

  const agencies = useMemo(() => {
    const set = new Set<string>();
    allInstruments.forEach((i) => i.calAgency.trim() && set.add(i.calAgency.trim()));
    return Array.from(set).sort();
  }, [allInstruments]);

  const selectionSummary = useMemo(() => {
    let gauge = 0;
    let fixture = 0;
    for (const item of selectedInstruments) {
      if (item.category === "fixture") fixture++;
      else gauge++;
    }
    return { total: selectedInstruments.length, gauge, fixture };
  }, [selectedInstruments]);

  const enabledFieldCount = [
    editLastCalDate,
    editCalCycle,
    editCalAgency,
    editCalType,
    editCategory,
    editDepartment,
    editLocation,
    editRemark,
  ].filter(Boolean).length;

  const previewNextDate = useMemo(() => {
    if (!editLastCalDate || !lastCalDate) return "";
    const months = editCalCycle ? calCycleMonths : 12;
    return calcNextCalDate(lastCalDate, months);
  }, [editLastCalDate, lastCalDate, editCalCycle, calCycleMonths]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || enabledFieldCount === 0 || selectedInstruments.length === 0) {
      return;
    }

    if (editRemark && remarkMode !== "clear" && !remark.trim()) {
      onNotify("请输入备注内容，或切换为「清空备注」模式", "error");
      return;
    }

    const payload: BatchUpdateInstrumentsInput = {
      ids: selectedInstruments.map((i) => i.id),
    };

    if (editLastCalDate) payload.lastCalDate = lastCalDate.trim();
    if (editCalCycle) payload.calCycleMonths = Math.max(0, calCycleMonths);
    if (editCalAgency) payload.calAgency = calAgency.trim();
    if (editCalType) {
      payload.calibrationType = calibrationType;
      payload.exemptCalibration = calibrationType === "exempt";
    }
    if (editCategory) payload.category = category;
    if (editDepartment) payload.department = department.trim();
    if (editLocation) payload.location = location.trim();
    if (editRemark) {
      payload.remarkMode = remarkMode;
      payload.remark = remarkMode === "clear" ? "" : remark.trim();
    }

    setSaving(true);
    setSaveStatus("loading");
    try {
      const res = await api.batchUpdateInstruments(payload);
      setSaveSuccess();
      onUpdated(res.affectedCount);
      onClose();
    } catch (err) {
      setSaveStatus("idle");
      onNotify(`批量编辑失败：${String(err)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      closeOnEsc={!saving}
      zIndexClass="z-[60]"
      ariaLabelledBy="batch-edit-modal-title"
      panelClassName="w-full max-w-xl max-h-[84vh] flex flex-col"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3 bg-zinc-50/75 dark:bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-tactile-primary shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                id="batch-edit-modal-title"
                className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight"
              >
                批量编辑设备
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 text-[11px] font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                已选 {selectionSummary.total} 台
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
              仅勾选的字段会被批量修改，未勾选字段保持各设备原值不变
              {selectionSummary.gauge > 0 && selectionSummary.fixture > 0
                ? `（量具 ${selectionSummary.gauge} · 检具 ${selectionSummary.fixture}）`
                : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          aria-label="关闭弹窗"
          className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Group 1: Calibration & Renewal */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <CalendarClock className="h-3.5 w-3.5" />
              <span>复校与效期更新</span>
            </div>

            <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-zinc-50/45 dark:bg-white/[0.02] divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {/* Last Calibration Date */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PrecisionCheckbox
                    checked={editLastCalDate}
                    onChange={(v) => setEditLastCalDate(v)}
                    label={
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        上次校验日期
                      </span>
                    }
                  />
                  {editLastCalDate && (
                    <button
                      type="button"
                      onClick={() => setLastCalDate(getTodayStr())}
                      className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      设为今日
                    </button>
                  )}
                </div>
                {editLastCalDate && (
                  <div className="pl-6 space-y-1.5">
                    <input
                      type="date"
                      value={lastCalDate}
                      onChange={(e) => setLastCalDate(e.target.value)}
                      className={cn(INPUT_CLS, "font-mono")}
                    />
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      保存后将自动按每台设备的校验周期重算「下次校验日期」
                      {previewNextDate && (
                        <span className="font-mono text-zinc-700 dark:text-zinc-300">
                          （以 {editCalCycle ? calCycleMonths : 12} 月周期为例 → {previewNextDate}）
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Calibration Cycle */}
              <div className="p-3 space-y-2">
                <PrecisionCheckbox
                  checked={editCalCycle}
                  onChange={(v) => setEditCalCycle(v)}
                  label={
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      校验周期（月）
                    </span>
                  }
                />
                {editCalCycle && (
                  <div className="pl-6 flex flex-wrap items-center gap-2">
                    <NumberStepper
                      value={calCycleMonths}
                      onChange={(v) => setCalCycleMonths(v)}
                      min={1}
                      max={120}
                      suffix="个月"
                    />
                    <div className="inline-flex items-center gap-1">
                      {[6, 12, 24, 36].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setCalCycleMonths(m)}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[11px] font-mono border transition-colors",
                            calCycleMonths === m
                              ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white"
                              : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.1] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                          )}
                        >
                          {m}月
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Calibration Type / Exempt */}
              <div className="p-3 space-y-2">
                <PrecisionCheckbox
                  checked={editCalType}
                  onChange={(v) => setEditCalType(v)}
                  label={
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      校验方式 / 免校状态
                    </span>
                  }
                />
                {editCalType && (
                  <div className="pl-6 space-y-1.5">
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08]">
                      {(
                        [
                          { id: "external", label: "外校" },
                          { id: "internal", label: "内校" },
                          { id: "exempt", label: "免校归档" },
                        ] as const
                      ).map((opt) => {
                        const active = calibrationType === opt.id;
                        return (
                          <motion.button
                            key={opt.id}
                            type="button"
                            whileTap={TAP_SCALE_SUBTLE}
                            transition={SPRING_SNAPPY}
                            onClick={() => setCalibrationType(opt.id)}
                            className={cn(
                              "relative px-3 py-1 rounded-md text-xs font-medium transition-colors",
                              active
                                ? "text-zinc-950 dark:text-white"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                            )}
                          >
                            {active && (
                              <motion.span
                                layoutId="batch-cal-type-pill"
                                transition={SPRING_SNAPPY}
                                className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.12] shadow-tactile"
                              />
                            )}
                            <span className="relative z-10">{opt.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {calibrationType === "exempt"
                        ? "设为免校后将标记为免校归档，并清空下次校验日期"
                        : "切换为受控校验后，如设备已有上次校验日期和周期将自动恢复下次校验日期"}
                    </p>
                  </div>
                )}
              </div>

              {/* Calibration Agency */}
              <div className="p-3 space-y-2">
                <PrecisionCheckbox
                  checked={editCalAgency}
                  onChange={(v) => setEditCalAgency(v)}
                  label={
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      检测机构
                    </span>
                  }
                />
                {editCalAgency && (
                  <div className="pl-6">
                    <input
                      type="text"
                      list="batch-edit-agencies"
                      value={calAgency}
                      onChange={(e) => setCalAgency(e.target.value)}
                      placeholder="输入检测/校准机构名称（留空则清空）"
                      className={INPUT_CLS}
                    />
                    <datalist id="batch-edit-agencies">
                      {agencies.map((a) => (
                        <option key={a} value={a} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Group 2: Category, Department & Location */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <Layers className="h-3.5 w-3.5" />
              <span>台账分类与归属</span>
            </div>

            <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-zinc-50/45 dark:bg-white/[0.02] divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {/* Category */}
              <div className="p-3 space-y-2">
                <PrecisionCheckbox
                  checked={editCategory}
                  onChange={(v) => setEditCategory(v)}
                  label={
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      台账分类
                    </span>
                  }
                />
                {editCategory && (
                  <div className="pl-6">
                    <PrecisionSelect<LedgerCategory>
                      value={category}
                      onChange={setCategory}
                      options={[
                        { value: "gauge", label: "仪器与量具" },
                        { value: "fixture", label: "尺寸检具" },
                      ]}
                      className="w-48"
                    />
                  </div>
                )}
              </div>

              {/* Department */}
              <div className="p-3 space-y-2">
                <PrecisionCheckbox
                  checked={editDepartment}
                  onChange={(v) => setEditDepartment(v)}
                  label={
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      使用部门
                    </span>
                  }
                />
                {editDepartment && (
                  <div className="pl-6">
                    <input
                      type="text"
                      list="batch-edit-departments"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="输入或选择使用部门（留空则清空）"
                      className={INPUT_CLS}
                    />
                    <datalist id="batch-edit-departments">
                      {departments.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              {/* Location */}
              <div className="p-3 space-y-2">
                <PrecisionCheckbox
                  checked={editLocation}
                  onChange={(v) => setEditLocation(v)}
                  label={
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      <MapPin className="h-3 w-3 text-zinc-400" />
                      <span>存放位置</span>
                    </span>
                  }
                />
                {editLocation && (
                  <div className="pl-6">
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="输入新的存放位置（留空则清空）"
                      className={INPUT_CLS}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Group 3: Remark */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>备注说明</span>
            </div>

            <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-zinc-50/45 dark:bg-white/[0.02] p-3 space-y-2">
              <PrecisionCheckbox
                checked={editRemark}
                onChange={(v) => setEditRemark(v)}
                label={
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    批量更新备注
                  </span>
                }
              />
              {editRemark && (
                <div className="pl-6 space-y-2">
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08]">
                    {(
                      [
                        { id: "append", label: "追加内容" },
                        { id: "replace", label: "覆盖原备注" },
                        { id: "clear", label: "清空备注" },
                      ] as const
                    ).map((m) => {
                      const active = remarkMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRemarkMode(m.id)}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors",
                            active
                              ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-tactile"
                              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                          )}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  {remarkMode !== "clear" && (
                    <input
                      type="text"
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder={
                        remarkMode === "append"
                          ? "输入要追加到原有备注末尾的文字..."
                          : "输入新的备注内容（将覆盖所选设备原备注）..."
                      }
                      className={INPUT_CLS}
                    />
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/75 dark:bg-white/[0.02] flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
            {enabledFieldCount > 0 ? (
              <span>
                将更新{" "}
                <strong className="font-mono text-zinc-900 dark:text-white">
                  {selectionSummary.total}
                </strong>{" "}
                台设备的{" "}
                <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                  {enabledFieldCount}
                </strong>{" "}
                项字段
              </span>
            ) : (
              <span>请至少勾选一项需要批量修改的字段</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="btn-tactile px-4 py-1.5 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200"
            >
              取消
            </button>
            <ActionStatusButton
              type="submit"
              status={saveStatus}
              disabled={saving || enabledFieldCount === 0}
              idleLabel="应用修改"
              loadingLabel="保存中..."
              successLabel="已更新"
              idleIcon={<Save className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </form>
    </ModalShell>
  );
};
