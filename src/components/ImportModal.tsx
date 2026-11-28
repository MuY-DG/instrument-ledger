import React, { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { InfoTip } from "@/components/InfoTip";
import { SPRING_SNAPPY, TAP_SCALE } from "@/lib/motion";
import { ModalShell } from "@/components/ui/MotionPrimitives";
import {
  ActionStatusButton,
  HoldConfirmButton,
  PrecisionFileDropZone,
  useActionStatus,
} from "@/components/ui/InteractiveControls";
import {
  base64ToArrayBuffer,
  parseJsskExcel,
  type ParsedExcelSummary,
} from "@/lib/excel";

interface ImportModalProps {
  openModal: boolean;
  existingCount: number;
  initialDropPath?: string | null;
  initialDropFile?: File | null;
  onClose: () => void;
  onImported: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  openModal,
  existingCount,
  initialDropPath = null,
  initialDropFile = null,
  onClose,
  onImported,
  onNotify,
}) => {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedExcelSummary | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(existingCount === 0);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const handledDropKeyRef = useRef<string | null>(null);
  const {
    status: importStatus,
    setStatus: setImportStatus,
    setTransientSuccess: setImportSuccess,
    reset: resetImportStatus,
  } = useActionStatus(900);

  const resetAndClose = () => {
    setFileName("");
    setParsed(null);
    setError("");
    handledDropKeyRef.current = null;
    resetImportStatus();
    onClose();
  };

  const parseExcelBuffer = async (buffer: ArrayBuffer, displayFileName: string) => {
    setError("");
    setParsing(true);
    try {
      const summary = await parseJsskExcel(buffer);
      if (summary.rows.length === 0) {
        setError("未能从该 Excel 中解析出有效的台账数据行，请检查表头格式。");
        setParsed(null);
      } else {
        setFileName(displayFileName);
        setParsed(summary);
      }
    } catch (err) {
      setError(`解析 Excel 失败：${String(err)}`);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const parseExcelFromPath = async (filePath: string) => {
    setError("");
    setParsing(true);
    try {
      const payload = await api.readExternalFileBase64(filePath);
      const buffer = base64ToArrayBuffer(payload.base64);
      await parseExcelBuffer(buffer, payload.fileName);
    } catch (err) {
      setError(`解析 Excel 失败：${String(err)}`);
      setParsed(null);
      setParsing(false);
    }
  };

  // Auto-parse file dropped directly onto the Ledger canvas
  useEffect(() => {
    if (!openModal) {
      handledDropKeyRef.current = null;
      return;
    }
    setReplaceExisting(existingCount === 0);
    if (initialDropPath) {
      const key = `path:${initialDropPath}`;
      if (handledDropKeyRef.current === key) return;
      handledDropKeyRef.current = key;
      void parseExcelFromPath(initialDropPath);
    } else if (initialDropFile) {
      const key = `file:${initialDropFile.name}:${initialDropFile.size}:${initialDropFile.lastModified}`;
      if (handledDropKeyRef.current === key) return;
      handledDropKeyRef.current = key;
      initialDropFile
        .arrayBuffer()
        .then((buf) => parseExcelBuffer(buf, initialDropFile.name))
        .catch((err) => {
          setError(`读取文件失败：${String(err)}`);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openModal, initialDropPath, initialDropFile, existingCount]);

  const handleSelectExcel = async () => {
    setError("");
    const picked = await open({
      multiple: false,
      title: "选择 JSSK-MPR-170 监视与测量管理台账 Excel 文件",
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
    });
    if (typeof picked !== "string" || !picked) return;
    await parseExcelFromPath(picked);
  };

  const handleConfirmImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;

    setImporting(true);
    setImportStatus("loading");
    try {
      const res = await api.batchImportInstruments(parsed.rows, replaceExisting);
      setImportSuccess();
      onNotify(
        `导入成功！共导入 ${res.importedCount} 条（量具 ${res.gaugeCount} 条，检具 ${res.fixtureCount} 条）`,
        "success"
      );
      onImported();
      window.setTimeout(() => {
        resetAndClose();
      }, 360);
    } catch (err) {
      setImportStatus("idle");
      onNotify(String(err), "error");
    } finally {
      setImporting(false);
    }
  };

  const { t } = useI18n();
  return (
    <ModalShell
      open={openModal}
      onClose={resetAndClose}
      closeOnEsc
      panelClassName="w-full max-w-2xl flex flex-col"
    >
            <div className="shrink-0 px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                  {t("导入 Excel", "Import Excel")}
                </h2>
                <InfoTip
                  content={t(
                    "兼容标准双工作表及常见表格，自动识别「量具」与「检具」并还原编号与免校状态。",
                    "Supports standard dual-sheet templates and regular Excel tables, detecting Gauges & Fixtures automatically."
                  )}
                />
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
              <PrecisionFileDropZone
                active={openModal}
                iconKind="excel"
                acceptedExtensions={["xlsx"]}
                loading={parsing}
                loadingLabel={t("正在解析 Excel 台账...", "Parsing Excel workbook...")}
                selectedFileName={fileName}
                selectedMeta={
                  parsed
                    ? t(
                        `已识别 ${parsed.rows.length} 条记录（量具 ${parsed.gaugeCount} · 检具 ${parsed.fixtureCount}）`,
                        `Parsed ${parsed.rows.length} rows (${parsed.gaugeCount} gauges · ${parsed.fixtureCount} fixtures)`
                      )
                    : undefined
                }
                idleTitle={t("拖入或点击选择 .xlsx 台账文件", "Drop or click to choose a .xlsx file")}
                idleSubtitle={t("支持标准双工作表与常规 Excel 表格", "Supports standard dual-sheet and regular Excel files")}
                onPickClick={handleSelectExcel}
                onDropPaths={(paths) => {
                  if (paths[0]) void parseExcelFromPath(paths[0]);
                }}
                onDropFiles={(files) => {
                  const file = files[0];
                  if (!file) return;
                  void file.arrayBuffer().then((buf) => parseExcelBuffer(buf, file.name));
                }}
                onClear={
                  fileName
                    ? () => {
                        setFileName("");
                        setParsed(null);
                        setError("");
                      }
                    : undefined
                }
              />

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {parsed && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                    <div>
                      解析完成，共识别{" "}
                      <strong className="font-mono">{parsed.rows.length}</strong> 条有效记录
                      （量具 <strong className="font-mono">{parsed.gaugeCount}</strong> · 检具{" "}
                      <strong className="font-mono">{parsed.fixtureCount}</strong>）
                    </div>
                  </div>

                  {parsed.warnings.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                      {parsed.warnings.map((w, i) => (
                        <div key={i}>• {w}</div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                      数据预览（前 5 条）
                    </div>
                    <div className="border border-zinc-200/80 dark:border-white/[0.08] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 border-b border-zinc-200/80 dark:border-white/[0.07]">
                          <tr>
                            <th className="py-2 px-3 text-left font-medium">分类</th>
                            <th className="py-2 px-3 text-left font-medium">部门</th>
                            <th className="py-2 px-3 text-left font-medium">名称</th>
                            <th className="py-2 px-3 text-left font-medium">编号</th>
                            <th className="py-2 px-3 text-left font-medium">下次校验</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                          {parsed.rows.slice(0, 5).map((r, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 px-3">
                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 text-[11px]">
                                  {r.category === "fixture" ? "检具" : "量具"}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-zinc-600 dark:text-zinc-400">
                                {r.department || "—"}
                              </td>
                              <td className="py-1.5 px-3 font-medium text-zinc-800 dark:text-zinc-100">
                                {r.name}
                              </td>
                              <td className="py-1.5 px-3 font-mono text-zinc-600 dark:text-zinc-400">
                                {r.serialNo || "—"}
                              </td>
                              <td className="py-1.5 px-3 font-mono text-zinc-600 dark:text-zinc-400">
                                {r.exemptCalibration ? "免校" : r.nextCalDate || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center gap-2 ${
                        !replaceExisting
                          ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-white/[0.05]"
                          : "border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={!replaceExisting}
                        onChange={() => setReplaceExisting(false)}
                      />
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                        {t("追加导入", "Append Rows")}
                      </span>
                      <InfoTip
                        content={t(
                          "保留现有记录及已上传的照片和报告，追加新条目。",
                          "Keep existing records, photos, and reports and append imported rows."
                        )}
                      />
                    </label>

                    <label
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-center gap-2 ${
                        replaceExisting
                          ? "border-rose-500 bg-rose-500/[0.06]"
                          : "border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <input
                        type="radio"
                        checked={replaceExisting}
                        onChange={() => setReplaceExisting(true)}
                      />
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                        {t("覆盖替换", "Replace All")}
                      </span>
                      <InfoTip
                        content={t(
                          "清空现有台账及关联附件后，完整导入当前 Excel 数据。",
                          "Clear all existing records and attachments, then import this workbook."
                        )}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between gap-2.5">
              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                {parsed && replaceExisting && existingCount > 0
                  ? t(
                      `将清空现有 ${existingCount} 条记录，长按右侧按钮确认覆盖`,
                      `Will clear ${existingCount} existing records. Hold to confirm replace.`
                    )
                  : ""}
              </span>
              <div className="flex items-center gap-2.5 shrink-0">
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={resetAndClose}
                  className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
                >
                  {t("取消", "Cancel")}
                </motion.button>
                {parsed && replaceExisting && existingCount > 0 ? (
                  <HoldConfirmButton
                    disabled={importing}
                    loading={importing}
                    loadingLabel={t("覆盖导入中...", "Replacing...")}
                    idleLabel={t(
                      `按住覆盖导入 (${parsed.rows.length})`,
                      `Hold to Replace (${parsed.rows.length})`
                    )}
                    holdingLabel={t("继续按住确认覆盖...", "Keep holding...")}
                    completedLabel={t("开始覆盖", "Replacing")}
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onConfirm={() => {
                      void handleConfirmImport();
                    }}
                    className="py-2"
                  />
                ) : (
                  <ActionStatusButton
                    status={importStatus}
                    disabled={!parsed || importing}
                    idleLabel={
                      parsed
                        ? t(`导入 (${parsed.rows.length})`, `Import (${parsed.rows.length})`)
                        : t("导入", "Import")
                    }
                    loadingLabel={t("导入中...", "Importing...")}
                    successLabel={t("已导入", "Imported")}
                    idleIcon={<Upload className="h-3.5 w-3.5" />}
                    onClick={handleConfirmImport}
                  />
                )}
              </div>
            </div>
    </ModalShell>
  );
};
