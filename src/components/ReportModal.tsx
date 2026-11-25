import React, { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatFileSize, formatShortDateTime, getTodayStr } from "@/lib/status";
import type { CalibrationReport, Instrument } from "@/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ReportModalProps {
  instrument: Instrument | null;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

export const ReportModal: React.FC<ReportModalProps> = ({
  instrument,
  isAdmin,
  onClose,
  onChanged,
  onNotify,
}) => {
  const [reports, setReports] = useState<CalibrationReport[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [pickedPath, setPickedPath] = useState("");
  const [pickedName, setPickedName] = useState("");
  const [calDate, setCalDate] = useState(getTodayStr());
  const [calAgency, setCalAgency] = useState("");
  const [remark, setRemark] = useState("");
  const [syncDate, setSyncDate] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.15);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const selectedReport = reports.find((r) => r.id === selectedId) || null;

  const loadReports = async (instId: number, autoSelectFirst = true) => {
    setLoadingList(true);
    try {
      const list = await api.listReports(instId);
      setReports(list);
      if (autoSelectFirst && list.length > 0) {
        setSelectedId(list[0].id);
      } else if (list.length === 0) {
        setSelectedId(null);
      }
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!instrument) return;
    setShowUpload(false);
    setPickedPath("");
    setPickedName("");
    setCalDate(instrument.lastCalDate || getTodayStr());
    setCalAgency(instrument.calAgency || "");
    setRemark("");
    setSyncDate(true);
    loadReports(instrument.id, true);
  }, [instrument?.id]);

  useEffect(() => {
    let cancelled = false;
    setPreviewError("");
    setImageDataUrl("");
    setPdfTotalPages(0);
    setPdfPage(1);
    setPdfDoc((prev) => {
      prev?.destroy();
      return null;
    });

    if (!selectedReport) return;

    const ext = selectedReport.fileExt.toLowerCase();
    if (ext !== "pdf" && !IMAGE_EXTS.has(ext)) return;

    setPreviewLoading(true);
    api
      .readStoredFileBase64(selectedReport.storedPath)
      .then(async (payload) => {
        if (cancelled) return;
        if (IMAGE_EXTS.has(ext)) {
          setImageDataUrl(`data:${payload.mime};base64,${payload.base64}`);
        } else if (ext === "pdf") {
          const bin = atob(payload.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const doc = await loadingTask.promise;
          if (cancelled) {
            doc.destroy();
            return;
          }
          setPdfDoc(doc);
          setPdfTotalPages(doc.numPages);
          setPdfPage(1);
        }
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(`无法预览文件：${String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let active = true;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        const page = await pdfDoc.getPage(pdfPage);
        if (!active || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: zoom * window.devicePixelRatio });
        const cssViewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== "RenderingCancelledException") {
          setPreviewError(`PDF 渲染失败：${String(err)}`);
        }
      }
    };

    renderPage();
    return () => {
      active = false;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, pdfPage, zoom]);

  const handlePickFile = async () => {
    const selected = await open({
      multiple: false,
      title: "选择仪器校验报告附件",
      filters: [
        {
          name: "校验报告 (PDF / 图片 / Office)",
          extensions: ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx"],
        },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (typeof selected === "string" && selected) {
      setPickedPath(selected);
      const parts = selected.split(/[/\\]/);
      setPickedName(parts[parts.length - 1] || selected);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instrument) return;
    if (!pickedPath) {
      onNotify("请先选择要上传的校验报告文件", "error");
      return;
    }
    setUploading(true);
    try {
      const created = await api.addReport({
        instrumentId: instrument.id,
        sourcePath: pickedPath,
        calDate,
        calAgency,
        remark,
        syncInstrumentCalDate: syncDate,
      });
      onNotify(
        syncDate && calDate
          ? "校验报告上传成功，并已同步更新设备校验日期"
          : "校验报告上传成功",
        "success"
      );
      setShowUpload(false);
      setPickedPath("");
      setPickedName("");
      setRemark("");
      await loadReports(instrument.id, false);
      setSelectedId(created.id);
      onChanged();
    } catch (err) {
      onNotify(String(err), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (rep: CalibrationReport) => {
    if (!instrument) return;
    if (!window.confirm(`确定删除校验报告「${rep.fileName}」吗？此操作不可恢复。`)) {
      return;
    }
    try {
      await api.deleteReport(rep.id);
      onNotify("校验报告已删除", "success");
      const list = await api.listReports(instrument.id);
      setReports(list);
      if (selectedId === rep.id) {
        setSelectedId(list[0]?.id ?? null);
      }
      onChanged();
    } catch (err) {
      onNotify(String(err), "error");
    }
  };

  const handleOpenExternal = async (rep: CalibrationReport) => {
    try {
      await api.openReportExternal(rep.id);
    } catch (err) {
      onNotify(String(err), "error");
    }
  };

  const handleSaveAs = async (rep: CalibrationReport) => {
    try {
      const dest = await save({
        title: "另存为校验报告",
        defaultPath: rep.fileName,
      });
      if (!dest) return;
      await api.exportReportToPath(rep.id, dest);
      onNotify("报告已另存到目标路径", "success");
    } catch (err) {
      onNotify(String(err), "error");
    }
  };

  const renderFileIcon = (ext: string) => {
    const low = ext.toLowerCase();
    if (low === "pdf") return <FileText className="h-4 w-4 text-rose-500 shrink-0" />;
    if (IMAGE_EXTS.has(low)) return <ImageIcon className="h-4 w-4 text-sky-500 shrink-0" />;
    if (low === "xls" || low === "xlsx")
      return <FileSpreadsheet className="h-4 w-4 text-emerald-500 shrink-0" />;
    return <FileText className="h-4 w-4 text-zinc-400 shrink-0" />;
  };

  return (
    <AnimatePresence>
      {instrument && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-zinc-950/55 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white dark:bg-[#111114] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] w-full max-w-6xl h-[86vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/70 dark:bg-white/[0.02]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                    校验报告附件 · {instrument.name}
                  </h2>
                  {instrument.serialNo && (
                    <span className="px-2 py-0.5 text-[11px] font-mono bg-zinc-200/70 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-300 rounded">
                      {instrument.serialNo}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  支持 PDF 与高清图片内嵌直览，支持历年复校报告归档追溯
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowUpload((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{showUpload ? "取消上传" : "上传报告"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Split Body */}
            <div className="flex-1 flex min-h-0">
              {/* Left Sidebar */}
              <div className="w-80 md:w-96 border-r border-zinc-200/80 dark:border-white/[0.07] flex flex-col bg-zinc-50/40 dark:bg-[#0d0d10] shrink-0">
                {showUpload && isAdmin && (
                  <form
                    onSubmit={handleUpload}
                    className="p-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-indigo-500/[0.04] space-y-3"
                  >
                    <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                      上传新的校准 / 校验报告
                    </div>

                    <button
                      type="button"
                      onClick={handlePickFile}
                      className="w-full py-3 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-white/20 bg-white dark:bg-white/[0.03] hover:border-indigo-400 text-center transition"
                    >
                      <Upload className="h-4 w-4 text-indigo-500 mx-auto mb-1" />
                      <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">
                        {pickedName || "点击选择 PDF / 图片 / Office 文件"}
                      </div>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          本次校验日期
                        </label>
                        <input
                          type="date"
                          value={calDate}
                          onChange={(e) => setCalDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                          检测机构
                        </label>
                        <input
                          type="text"
                          value={calAgency}
                          onChange={(e) => setCalAgency(e.target.value)}
                          placeholder="如：帝恩检测"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                        报告备注（选填）
                      </label>
                      <input
                        type="text"
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        placeholder="如：2026年度外校合格报告"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400"
                      />
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncDate}
                        onChange={(e) => setSyncDate(e.target.checked)}
                        className="mt-0.5 rounded border-zinc-300 dark:border-zinc-700"
                      />
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        同步更新设备「上次检验日期」并自动重算下次校验日期
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={uploading || !pickedPath}
                      className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-45 text-white dark:text-zinc-950 text-xs font-semibold transition"
                    >
                      {uploading ? "正在归档..." : "确认保存报告"}
                    </button>
                  </form>
                )}

                <div className="px-4 py-2.5 border-b border-zinc-200/80 dark:border-white/[0.07] flex items-center justify-between text-[11px] text-zinc-500">
                  <span>已归档（{reports.length} 份）</span>
                  <span>按日期倒序</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {loadingList ? (
                    <div className="text-center py-10 text-xs text-zinc-400">
                      正在加载报告列表...
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <FileText className="h-9 w-9 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        暂无校验报告附件
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {isAdmin
                          ? "点击右上角「上传报告」添加 PDF 或扫描件"
                          : "管理员上传后可在此直接查阅与下载"}
                      </p>
                    </div>
                  ) : (
                    reports.map((rep, idx) => {
                      const active = rep.id === selectedId;
                      return (
                        <div
                          key={rep.id}
                          onClick={() => setSelectedId(rep.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition ${
                            active
                              ? "bg-white dark:bg-white/[0.07] border-zinc-900/30 dark:border-white/25 shadow-hairline"
                              : "bg-white/60 dark:bg-white/[0.02] border-zinc-200/80 dark:border-white/[0.06] hover:bg-white dark:hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="mt-0.5">{renderFileIcon(rep.fileExt)}</div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                                    {rep.fileName}
                                  </span>
                                  {idx === 0 && (
                                    <span className="px-1.5 py-0.2 text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded shrink-0">
                                      最新
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                                  {rep.calDate && (
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {rep.calDate}
                                    </span>
                                  )}
                                  <span>{formatFileSize(rep.fileSize)}</span>
                                </div>
                                {rep.calAgency && (
                                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                                    <Building2 className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{rep.calAgency}</span>
                                  </div>
                                )}
                                {rep.remark && (
                                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 line-clamp-2">
                                    {rep.remark}
                                  </div>
                                )}
                              </div>
                            </div>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(rep);
                                }}
                                className="p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition shrink-0"
                                title="删除该报告"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Preview Pane */}
              <div className="flex-1 flex flex-col bg-zinc-100/80 dark:bg-[#09090b] min-w-0">
                {selectedReport ? (
                  <>
                    <div className="px-4 py-2.5 bg-white dark:bg-[#111114] border-b border-zinc-200/80 dark:border-white/[0.07] flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {selectedReport.fileName}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500 ml-2 font-mono text-[11px]">
                          {formatShortDateTime(selectedReport.uploadedAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {pdfDoc && (
                          <div className="flex items-center gap-1 mr-2 bg-zinc-100 dark:bg-white/[0.06] rounded-lg px-1.5 py-1 text-zinc-700 dark:text-zinc-200">
                            <button
                              type="button"
                              disabled={pdfPage <= 1}
                              onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                              className="p-1 rounded hover:bg-white dark:hover:bg-white/10 disabled:opacity-40"
                              title="上一页"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-xs font-mono tabular-nums px-1.5">
                              {pdfPage} / {pdfTotalPages}
                            </span>
                            <button
                              type="button"
                              disabled={pdfPage >= pdfTotalPages}
                              onClick={() =>
                                setPdfPage((p) => Math.min(pdfTotalPages, p + 1))
                              }
                              className="p-1 rounded hover:bg-white dark:hover:bg-white/10 disabled:opacity-40"
                              title="下一页"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <div className="w-px h-4 bg-zinc-300 dark:bg-white/15 mx-1" />
                            <button
                              type="button"
                              onClick={() =>
                                setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))
                              }
                              className="p-1 rounded hover:bg-white dark:hover:bg-white/10"
                              title="缩小"
                            >
                              <ZoomOut className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[11px] font-mono tabular-nums w-10 text-center">
                              {Math.round(zoom * 100)}%
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))
                              }
                              className="p-1 rounded hover:bg-white dark:hover:bg-white/10"
                              title="放大"
                            >
                              <ZoomIn className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleSaveAs(selectedReport)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>另存为</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenExternal(selectedReport)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>系统打开</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
                      {previewLoading ? (
                        <div className="self-center text-xs text-zinc-400">
                          正在渲染校验报告预览...
                        </div>
                      ) : previewError ? (
                        <div className="self-center text-center max-w-md bg-white dark:bg-[#141418] p-6 rounded-xl border border-zinc-200 dark:border-white/[0.1]">
                          <p className="text-xs text-rose-500 font-medium">{previewError}</p>
                          <button
                            type="button"
                            onClick={() => handleOpenExternal(selectedReport)}
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-semibold"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            用系统程序打开
                          </button>
                        </div>
                      ) : pdfDoc ? (
                        <div className="bg-white shadow-elevated rounded-lg overflow-hidden">
                          <canvas ref={canvasRef} className="block" />
                        </div>
                      ) : imageDataUrl ? (
                        <img
                          src={imageDataUrl}
                          alt={selectedReport.fileName}
                          className="max-w-full rounded-lg shadow-elevated bg-white"
                        />
                      ) : (
                        <div className="self-center text-center max-w-sm bg-white dark:bg-[#141418] p-8 rounded-2xl border border-zinc-200 dark:border-white/[0.08]">
                          <div className="h-11 w-11 rounded-xl bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
                            {renderFileIcon(selectedReport.fileExt)}
                          </div>
                          <h4 className="text-xs font-semibold text-zinc-900 dark:text-white break-all">
                            {selectedReport.fileName}
                          </h4>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                            该格式（.{selectedReport.fileExt}）暂不支持内嵌预览，可调用系统默认软件打开
                          </p>
                          <div className="flex items-center justify-center gap-2 mt-5">
                            <button
                              type="button"
                              onClick={() => handleOpenExternal(selectedReport)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-semibold transition"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              系统打开
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveAs(selectedReport)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-200 text-xs font-medium transition"
                            >
                              <Download className="h-3.5 w-3.5" />
                              另存为
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs">
                    请选择左侧报告进行预览
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
