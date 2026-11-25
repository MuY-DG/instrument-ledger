import React, { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
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
      const ok = window.confirm(
        `注意：选择「清空并全量替换」将删除当前已有的 ${existingCount} 条台账记录及其关联附件！确认继续吗？`
      );
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
    <AnimatePresence>
      {openModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-zinc-950/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={resetAndClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl bg-white dark:bg-[#111114] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                    导入 Excel 台账（兼容 JSSK-MPR-170 双表）
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    自动识别「量具」与「检具」工作表，还原编号与免校状态
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <button
                type="button"
                disabled={parsing}
                onClick={handleSelectExcel}
                className="w-full py-7 px-4 rounded-xl border border-dashed border-zinc-300 dark:border-white/15 hover:border-zinc-400 dark:hover:border-white/30 bg-zinc-50/50 dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition text-center"
              >
                <Upload className="h-7 w-7 text-zinc-400 dark:text-zinc-500 mx-auto mb-2" />
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {parsing
                    ? "正在解析工作簿..."
                    : fileName
                      ? `已选择：${fileName}（点击重新选择）`
                      : "点击选择 .xlsx 台账文件"}
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                  支持标准《监视与测量管理台账》双 Sheet 文件及常见简化表格
                </p>
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
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        !replaceExisting
                          ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-white/[0.05]"
                          : "border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={!replaceExisting}
                          onChange={() => setReplaceExisting(false)}
                        />
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                          追加导入（推荐）
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 pl-5">
                        保留现有记录及已上传的照片和报告，追加新条目
                      </p>
                    </label>

                    <label
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        replaceExisting
                          ? "border-rose-500 bg-rose-500/[0.06]"
                          : "border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={replaceExisting}
                          onChange={() => setReplaceExisting(true)}
                        />
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                          清空并全量替换
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 pl-5">
                        清空旧台账后完整导入当前 Excel 数据
                      </p>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={resetAndClose}
                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.07] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!parsed || importing}
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-45 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
              >
                {importing
                  ? "正在写入数据库..."
                  : `确认导入 (${parsed?.rows.length || 0} 条)`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
