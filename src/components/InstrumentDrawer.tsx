import React, { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Image as ImageIcon,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, invalidateMediaPath } from "@/lib/api";
import { calcNextCalDate, getInstrumentStatus } from "@/lib/status";
import { InfoTip } from "@/components/InfoTip";
import { StatusBadge } from "@/components/StatusBadge";
import {
  BACKDROP_MOTION,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import { Collapsible } from "@/components/ui/MotionPrimitives";
import { PrecisionSelect, PrecisionSwitch } from "@/components/ui/FormControls";
import type {
  CalibrationType,
  Instrument,
  InstrumentInput,
  LedgerCategory,
  WarningThreshold,
} from "@/types";

interface InstrumentDrawerProps {
  openDrawer: boolean;
  mode: "create" | "edit" | "view";
  initialCategory: LedgerCategory;
  instrument: Instrument | null;
  allInstruments: Instrument[];
  warningThresholds: WarningThreshold[];
  onClose: () => void;
  onSaved: (saved: Instrument) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const INPUT_CLS =
  "precision-field w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/55 hover:bg-white focus:bg-white dark:bg-white/[0.03] dark:focus:bg-white/[0.05] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 disabled:bg-zinc-50/80 dark:disabled:bg-white/[0.02] disabled:text-zinc-500";

export const InstrumentDrawer: React.FC<InstrumentDrawerProps> = ({
  openDrawer,
  mode,
  initialCategory,
  instrument,
  allInstruments,
  warningThresholds,
  onClose,
  onSaved,
  onNotify,
}) => {
  const readOnly = mode === "view";

  const [category, setCategory] = useState<LedgerCategory>(initialCategory);
  const [department, setDepartment] = useState("");
  const [name, setName] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [modelSpec, setModelSpec] = useState("");
  const [location, setLocation] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [calibrationType, setCalibrationType] = useState<CalibrationType>("external");
  const [recordType, setRecordType] = useState("校准报告");
  const [lastCalDate, setLastCalDate] = useState("");
  const [calCycleMonths, setCalCycleMonths] = useState<number>(12);
  const [nextCalDate, setNextCalDate] = useState("");
  const [manualNextOverride, setManualNextOverride] = useState(false);
  const [exemptCalibration, setExemptCalibration] = useState(false);
  const [remark, setRemark] = useState("");
  const [supplier, setSupplier] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [calAgency, setCalAgency] = useState("");

  // Photo state
  const [existingPhotoPath, setExistingPhotoPath] = useState("");
  const [existingPhotoPreview, setExistingPhotoPreview] = useState("");
  const [newPhotoPath, setNewPhotoPath] = useState<string | null>(null);
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | null>(null);
  const [newPhotoName, setNewPhotoName] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [showExtended, setShowExtended] = useState(true);
  const [saving, setSaving] = useState(false);

  const departments = useMemo(() => {
    const set = new Set<string>();
    allInstruments.forEach((i) => i.department && set.add(i.department));
    ["品质部", "CCS车间", "仓务部", "生产部", "注塑部"].forEach((d) => set.add(d));
    return Array.from(set);
  }, [allInstruments]);

  const agencies = useMemo(() => {
    const set = new Set<string>();
    allInstruments.forEach((i) => i.calAgency && set.add(i.calAgency));
    return Array.from(set);
  }, [allInstruments]);

  useEffect(() => {
    if (!openDrawer) return;
    setNewPhotoPath(null);
    setNewPhotoBase64(null);
    setNewPhotoName(null);
    setRemovePhoto(false);
    setManualNextOverride(false);

    if (instrument && (mode === "edit" || mode === "view")) {
      setCategory(instrument.category);
      setDepartment(instrument.department);
      setName(instrument.name);
      setSerialNo(instrument.serialNo);
      setModelSpec(instrument.modelSpec);
      setLocation(instrument.location);
      setPurchaseDate(instrument.purchaseDate);
      setCalibrationType(instrument.calibrationType);
      setRecordType(instrument.recordType || "校准报告");
      setLastCalDate(instrument.lastCalDate);
      setCalCycleMonths(instrument.calCycleMonths || 12);
      setNextCalDate(instrument.nextCalDate);
      setExemptCalibration(instrument.exemptCalibration);
      setRemark(instrument.remark);
      setSupplier(instrument.supplier);
      setContactPerson(instrument.contactPerson);
      setContactPhone(instrument.contactPhone);
      setCalAgency(instrument.calAgency);
      setExistingPhotoPath(instrument.photoPath);
      setShowExtended(true);

      if (instrument.photoPath) {
        api
          .getStoredImageDataUrl(instrument.photoPath)
          .then(setExistingPhotoPreview)
          .catch(() => setExistingPhotoPreview(""));
      } else {
        setExistingPhotoPreview("");
      }
    } else {
      setCategory(initialCategory);
      setDepartment("品质部");
      setName("");
      setSerialNo("");
      setModelSpec("");
      setLocation("");
      setPurchaseDate("");
      setCalibrationType(initialCategory === "fixture" ? "internal" : "external");
      setRecordType("校准报告");
      setLastCalDate("");
      setCalCycleMonths(12);
      setNextCalDate("");
      setExemptCalibration(false);
      setRemark("");
      setSupplier("");
      setContactPerson("");
      setContactPhone("");
      setCalAgency("");
      setExistingPhotoPath("");
      setExistingPhotoPreview("");
      setShowExtended(false);
    }
  }, [openDrawer, mode, instrument, initialCategory]);

  useEffect(() => {
    if (exemptCalibration) {
      setNextCalDate("");
      return;
    }
    if (!manualNextOverride && lastCalDate && calCycleMonths > 0) {
      setNextCalDate(calcNextCalDate(lastCalDate, calCycleMonths));
    }
  }, [lastCalDate, calCycleMonths, exemptCalibration, manualNextOverride]);

  const duplicateWarning = useMemo(() => {
    const s = serialNo.trim().toLowerCase();
    if (!s || s === "/" || s === "-") return null;
    const hit = allInstruments.find(
      (i) => i.serialNo.trim().toLowerCase() === s && i.id !== instrument?.id
    );
    return hit
      ? `台账中已存在相同编号记录「${hit.name}」（${hit.department || "未设部门"}），可继续保存但建议核对`
      : null;
  }, [serialNo, allInstruments, instrument?.id]);

  const liveStatus = useMemo(
    () =>
      getInstrumentStatus(
        { exemptCalibration, nextCalDate, remark },
        warningThresholds
      ),
    [exemptCalibration, nextCalDate, remark, warningThresholds]
  );

  const handlePickPhoto = async () => {
    const picked = await open({
      multiple: false,
      title: "选择仪器存放位置照片",
      filters: [{ name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
    });
    if (typeof picked === "string" && picked) {
      try {
        const payload = await api.readExternalFileBase64(picked);
        setNewPhotoPath(picked);
        setNewPhotoBase64(`data:${payload.mime};base64,${payload.base64}`);
        setNewPhotoName(payload.fileName);
        setRemovePhoto(false);
      } catch (err) {
        onNotify(String(err), "error");
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setNewPhotoPath(null);
      setNewPhotoBase64(String(reader.result || ""));
      setNewPhotoName(file.name);
      setRemovePhoto(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!name.trim()) {
      onNotify("请输入仪器或检具名称", "error");
      return;
    }

    setSaving(true);
    try {
      const payload: InstrumentInput = {
        category,
        department,
        name,
        purchaseDate,
        serialNo,
        modelSpec,
        location,
        calibrationType: exemptCalibration ? "exempt" : calibrationType,
        recordType,
        lastCalDate: exemptCalibration ? "" : lastCalDate,
        calCycleMonths: Number(calCycleMonths) || 12,
        nextCalDate: exemptCalibration ? "" : nextCalDate,
        exemptCalibration,
        remark,
        supplier,
        contactPerson,
        contactPhone,
        calAgency,
        photoSourcePath: newPhotoPath,
        photoBase64: newPhotoPath ? null : newPhotoBase64,
        photoFilename: newPhotoName,
        removePhoto,
      };

      let saved: Instrument;
      if (mode === "edit" && instrument) {
        saved = await api.updateInstrument(instrument.id, payload);
        if (existingPhotoPath && (removePhoto || newPhotoPath || newPhotoBase64)) {
          invalidateMediaPath(existingPhotoPath);
        }
        onNotify("设备记录已更新", "success");
      } else {
        saved = await api.createInstrument(payload);
        onNotify("新增设备记录成功", "success");
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const currentDisplayPhoto = removePhoto
    ? ""
    : newPhotoBase64 || existingPhotoPreview;

  return (
    <AnimatePresence>
      {openDrawer && (
        <motion.div
          {...BACKDROP_MOTION}
          className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/65 backdrop-blur-[4px] flex justify-end no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%", opacity: 0.92 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.96 }}
            transition={SPRING_SMOOTH}
            className="w-full max-w-2xl bg-white dark:bg-[#111114] h-full shadow-modal-light dark:shadow-2xl border-l border-zinc-200/90 dark:border-white/[0.08] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/70 dark:bg-white/[0.02]">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                {mode === "create"
                  ? "新增设备"
                  : mode === "edit"
                    ? "编辑设备"
                    : "设备档案"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="btn-tactile p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
            >
              {/* Core Fields */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    核心台账信息
                  </h3>
                  <StatusBadge info={liveStatus} compact />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      台账类别
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-zinc-100/90 dark:bg-white/[0.05] p-1 rounded-xl border border-zinc-200/80 dark:border-white/[0.06]">
                      {(["gauge", "fixture"] as const).map((cat) => {
                        const active = category === cat;
                        return (
                          <motion.button
                            key={cat}
                            type="button"
                            disabled={readOnly}
                            whileTap={readOnly ? undefined : TAP_SCALE_SUBTLE}
                            onClick={() => {
                              setCategory(cat);
                              if (mode === "create") {
                                setCalibrationType(
                                  cat === "fixture" ? "internal" : "external"
                                );
                              }
                            }}
                            className={`relative py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              active
                                ? "text-zinc-950 dark:text-white"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="drawer-cat-pill"
                                transition={SPRING_SNAPPY}
                                className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.12] shadow-tactile"
                              />
                            )}
                            <span className="relative z-10">
                              {cat === "gauge" ? "仪器 / 量具" : "尺寸检具"}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      使用部门
                    </label>
                    <input
                      type="text"
                      list="dept-options"
                      disabled={readOnly}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="如：品质部 / CCS车间"
                      className={INPUT_CLS}
                    />
                    <datalist id="dept-options">
                      {departments.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      设备名称 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={readOnly}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例如：数显卡尺 / UV能量计"
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      出厂 / 管理编号
                    </label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={serialNo}
                      onChange={(e) => setSerialNo(e.target.value)}
                      placeholder="例如：DCJ-01 / 128004369"
                      className={`${INPUT_CLS} font-mono`}
                    />
                  </div>
                </div>

                {duplicateWarning && !readOnly && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      规格型号
                    </label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={modelSpec}
                      onChange={(e) => setModelSpec(e.target.value)}
                      placeholder="例如：LS128 / (0~200)mm"
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      存放位置
                    </label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="例如：三楼检测室 / 半自动一号线"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </section>

              {/* Calibration Schedule */}
              <section className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.07] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-indigo-500" />
                    <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      校验计划与有效期
                    </h3>
                  </div>

                  <div className="inline-flex items-center gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 select-none">
                      免校
                    </span>
                    <InfoTip content="辅助工具无需周期校验时勾选" />
                    <PrecisionSwitch
                      checked={exemptCalibration}
                      onChange={setExemptCalibration}
                      disabled={readOnly}
                      size="sm"
                      ariaLabel="免校"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      校验方式
                    </label>
                    <PrecisionSelect
                      disabled={readOnly || exemptCalibration}
                      value={exemptCalibration ? "exempt" : calibrationType}
                      onChange={(val) => setCalibrationType(val as CalibrationType)}
                      size="md"
                      className="w-full"
                      options={[
                        { value: "external", label: "外校" },
                        { value: "internal", label: "内校" },
                        { value: "exempt", label: "免校" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      上次检验日期
                    </label>
                    <input
                      type="date"
                      disabled={readOnly || exemptCalibration}
                      value={lastCalDate}
                      onChange={(e) => {
                        setLastCalDate(e.target.value);
                        setManualNextOverride(false);
                      }}
                      className={`${INPUT_CLS} font-mono`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      检定周期（月）
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      disabled={readOnly || exemptCalibration}
                      value={calCycleMonths}
                      onChange={(e) => {
                        setCalCycleMonths(Number(e.target.value) || 0);
                        setManualNextOverride(false);
                      }}
                      className={`${INPUT_CLS} font-mono`}
                    />
                    {!readOnly && !exemptCalibration && (
                      <div className="flex gap-1 mt-1.5">
                        {[3, 6, 12, 24].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setCalCycleMonths(m);
                              setManualNextOverride(false);
                            }}
                            className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition ${
                              calCycleMonths === m
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-medium"
                                : "bg-white dark:bg-white/[0.04] border-zinc-200 dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                            }`}
                          >
                            {m}月
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        <span>下次检验日期</span>
                        <InfoTip content="按「上次校验 + 周期(月) - 1天」自动推算，也可手动修改。" />
                      </label>
                      {manualNextOverride && !readOnly && !exemptCalibration && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualNextOverride(false);
                            setNextCalDate(calcNextCalDate(lastCalDate, calCycleMonths));
                          }}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          自动计算
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      disabled={readOnly || exemptCalibration}
                      value={nextCalDate}
                      onChange={(e) => {
                        setNextCalDate(e.target.value);
                        setManualNextOverride(true);
                      }}
                      className={`${INPUT_CLS} font-mono font-medium`}
                    />
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-[#111114] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      效期状态
                    </span>
                    <StatusBadge info={liveStatus} />
                  </div>
                </div>
              </section>

              {/* Location Photo */}
              <section className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    位置照片
                  </h3>
                  <InfoTip content="支持 PNG / JPG / WebP 格式，未更换时自动保留原图。" />
                </div>

                <div className="flex items-center gap-4 p-3.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02]">
                  {currentDisplayPhoto ? (
                    <img
                      src={currentDisplayPhoto}
                      alt="位置预览"
                      className="h-24 w-24 rounded-xl object-cover border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-zinc-900 shrink-0"
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-white/[0.02] flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 shrink-0">
                      <ImageIcon className="h-5 w-5 mb-1" />
                      <span className="text-[10px]">暂无图片</span>
                    </div>
                  )}

                  {!readOnly ? (
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handlePickPhoto}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.05] border border-zinc-200 dark:border-white/[0.1] hover:bg-zinc-50 dark:hover:bg-white/[0.09] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>{currentDisplayPhoto ? "更换" : "上传图片"}</span>
                        </button>

                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer transition">
                          <span>文件选择</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />
                        </label>

                        {currentDisplayPhoto && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewPhotoPath(null);
                              setNewPhotoBase64(null);
                              setNewPhotoName(null);
                              setRemovePhoto(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>移除</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {currentDisplayPhoto ? "已上传位置照片" : "未上传"}
                    </div>
                  )}
                </div>
              </section>

              {/* Extended Fields */}
              <section className="border border-zinc-200/85 dark:border-white/[0.08] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExtended((v) => !v)}
                  className="w-full px-4 py-3 bg-zinc-50/75 dark:bg-white/[0.02] hover:bg-zinc-100/75 dark:hover:bg-white/[0.04] flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
                >
                  <span>扩展信息</span>
                  <motion.span
                    animate={{ rotate: showExtended ? 180 : 0 }}
                    transition={SPRING_SNAPPY}
                    className="flex items-center"
                  >
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  </motion.span>
                </button>

                <Collapsible open={showExtended}>
                  <div className="p-4 space-y-3.5 bg-white dark:bg-[#111114] border-t border-zinc-200/70 dark:border-white/[0.06]">
                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          购买时间
                        </label>
                        <input
                          type="date"
                          disabled={readOnly}
                          value={
                            /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? purchaseDate : ""
                          }
                          onChange={(e) => setPurchaseDate(e.target.value)}
                          className={`${INPUT_CLS} font-mono`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          记录类型
                        </label>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={recordType}
                          onChange={(e) => setRecordType(e.target.value)}
                          placeholder="校准报告"
                          className={INPUT_CLS}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        检测机构
                      </label>
                      <input
                        type="text"
                        list="agency-options"
                        disabled={readOnly}
                        value={calAgency}
                        onChange={(e) => setCalAgency(e.target.value)}
                        placeholder="例如：东莞市帝恩检测有限公司 / 江苏世通"
                        className={INPUT_CLS}
                      />
                      <datalist id="agency-options">
                        {agencies.map((a) => (
                          <option key={a} value={a} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        厂商 / 供应商
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                        placeholder="设备生产厂商或供应商名称"
                        className={INPUT_CLS}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          联系人
                        </label>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={contactPerson}
                          onChange={(e) => setContactPerson(e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          联系电话
                        </label>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className={`${INPUT_CLS} font-mono`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        备注
                      </label>
                      <textarea
                        rows={2}
                        disabled={readOnly}
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        placeholder="如：已核对 / 待更新编号 / 对应产品型号等"
                        className={`${INPUT_CLS} resize-none`}
                      />
                    </div>
                  </div>
                </Collapsible>
              </section>
            </form>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-end gap-2.5">
              <motion.button
                type="button"
                whileTap={TAP_SCALE}
                transition={SPRING_SNAPPY}
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
              >
                {readOnly ? "关闭" : "取消"}
              </motion.button>
              {!readOnly && (
                <motion.button
                  type="button"
                  disabled={saving}
                  whileTap={saving ? undefined : TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={handleSubmit}
                  className="btn-sheen inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{saving ? "保存中..." : "保存"}</span>
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
