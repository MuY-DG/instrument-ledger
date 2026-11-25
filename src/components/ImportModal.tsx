import React, { useState } from "react";
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
import { confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import { SPRING_SNAPPY, TAP_SCALE } from "@/lib/motion";
import { ModalShell } from "@/components/ui/MotionPrimitives";
import {
  base64ToArrayBuffer,
  parseJsskExcel,
  type ParsedExcelSummary,
} from "@/lib/excel";

interface ImportModalProps {
  openModal: boolean;
  existingCount: number;
  onClose: () => void;
  onImported: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  openModal,
  existingCount,
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

  const resetAndClose = () => {
    setFileName("");
    setParsed(null);
    setError("");
    onClose();
  };

  const handleSelectExcel = async () => {
    setError("");
    const picked = await open({
      multiple: false,
      title: "选择 JSSK-MPR-170 监视与测量管理台账 Excel 文件",
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
    });
    if (typeof picked !== "string" || !picked) return;

    setParsing(true);
    try {
      const payload = await api.readExternalFileBase64(picked);
      const buffer = base64ToArrayBuffer(payload.base64);
      const summary = await parseJsskExcel(buffer);
      if (summary.rows.length === 0) {
        setError("未能从该 Excel 中解析出有效的台账数据行，请检查表头格式。");
        setParsed(null);
      } else {
        setFileName(payload.fileName);
        setParsed(summary);
      }
    } catch (err) {
      setError(`解析 Excel 失败：${String(err)}`);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    if (replaceExisting && existingCount > 0) {
      const ok = await confirmDialog({
        title: "覆盖替换台账",
        description: `将清空现有 ${existingCount} 条记录及关联附件并导入新数据，确定继续？`,
        destructive: true,
      });
      if (!ok) return;
    }

    setImporting(true);
    try {
      const res = await api.batchImportInstruments(parsed.rows, replaceExisting);
      onNotify(
        `导入成功！共导入 ${res.importedCount} 条（量具 ${res.gaugeCount} 条，检具 ${res.fixtureCount} 条）`,
        "success"
      );
      onImported();
      resetAndClose();
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <ModalShell
      open={openModal}
      onClose={resetAndClose}
      closeOnEsc
      panelClassName="w-full max-w-2xl"
    >
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                  导入 Excel
                </h2>
                <InfoTip content="兼容标准 JSSK-MPR-170 双工作表及常见表格，自动识别「量具」与「检具」并还原编号与免校状态。" />
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <button
                type="button"
                disabled={parsing}
                onClick={handleSelectExcel}
                className="w-full py-6 px-4 rounded-xl border border-dashed border-zinc-300 dark:border-white/15 hover:border-zinc-400 dark:hover:border-white/30 bg-zinc-50/50 dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition text-center"
              >
                <Upload className="h-6 w-6 text-zinc-400 dark:text-zinc-500 mx-auto mb-2" />
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {parsing
                    ? "解析中..."
                    : fileName || "选择 .xlsx 文件"}
                </div>
              </button>

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
                        追加导入
                      </span>
                      <InfoTip content="保留现有记录及已上传的照片和报告，追加新条目。" />
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
                        覆盖替换
                      </span>
                      <InfoTip content="清空现有台账及关联附件后，完整导入当前 Excel 数据。" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-end gap-2.5">
              <motion.button
                type="button"
                whileTap={TAP_SCALE}
                transition={SPRING_SNAPPY}
                onClick={resetAndClose}
                className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
              >
                取消
              </motion.button>
              <motion.button
                type="button"
                disabled={!parsed || importing}
                whileTap={!parsed || importing ? undefined : TAP_SCALE}
                transition={SPRING_SNAPPY}
                onClick={handleConfirmImport}
                className="btn-sheen px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-45 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary transition-colors"
              >
                {importing
                  ? "导入中..."
                  : parsed
                    ? `导入 (${parsed.rows.length})`
                    : "导入"}
              </motion.button>
            </div>
    </ModalShell>
  );
};
