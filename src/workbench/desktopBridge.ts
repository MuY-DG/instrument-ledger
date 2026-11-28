import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { api } from "@/lib/api";
import { isTauriEnvironment } from "@/lib/themeTransition";

export interface SaveFileResult {
  status: "saved" | "cancelled";
  path?: string;
}

function getFiltersForFileName(name: string): { name: string; extensions: string[] }[] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return [{ name: "PDF 文档", extensions: ["pdf"] }];
    case "png":
      return [{ name: "PNG 图片", extensions: ["png"] }];
    case "jpg":
    case "jpeg":
      return [{ name: "JPEG 图片", extensions: ["jpg", "jpeg"] }];
    case "webp":
      return [{ name: "WebP 图片", extensions: ["webp"] }];
    case "zip":
      return [{ name: "ZIP 压缩包", extensions: ["zip"] }];
    case "xlsx":
      return [{ name: "Excel 工作簿", extensions: ["xlsx"] }];
    case "csv":
      return [{ name: "CSV 表格", extensions: ["csv"] }];
    default:
      return [{ name: "所有文件", extensions: ["*"] }];
  }
}

function triggerBrowserDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const LAST_EXPORT_DIR_KEY = "workbench:last-export-dir:v1";

function readLastExportDir(): string {
  try {
    return window.localStorage.getItem(LAST_EXPORT_DIR_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function saveLastExportDir(filePath: string): void {
  const normalized = filePath.replace(/[/\\]+$/, "");
  const lastSep = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (lastSep <= 0) return;
  const dir = normalized.slice(0, lastSep);
  if (!dir) return;
  try {
    window.localStorage.setItem(LAST_EXPORT_DIR_KEY, dir);
  } catch {
    // ignore storage access issues
  }
}

function joinDirAndFile(dir: string, fileName: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[/\\]+$/, "")}${sep}${fileName}`;
}

async function resolveDefaultSavePath(defaultName: string): Promise<string> {
  if (/[/\\]/.test(defaultName)) return defaultName;
  let dir = readLastExportDir();
  if (!dir) {
    try {
      dir = (await api.getDefaultDownloadsDir()).trim();
    } catch {
      dir = "";
    }
  }
  return dir ? joinDirAndFile(dir, defaultName) : defaultName;
}

/**
 * Saves an exported Blob using native OS Save Dialog + raw binary Tauri IPC when running
 * inside the desktop shell, falling back to standard browser blob download in web dev mode.
 */
export async function saveExportBlob(
  blob: Blob,
  defaultName: string,
  dialogTitle = "保存导出文件"
): Promise<SaveFileResult> {
  if (!isTauriEnvironment()) {
    triggerBrowserDownload(blob, defaultName);
    return { status: "saved" };
  }

  const defaultPath = await resolveDefaultSavePath(defaultName);
  const destPath = await saveDialog({
    title: dialogTitle,
    defaultPath,
    filters: getFiltersForFileName(defaultName),
  });

  if (!destPath) {
    return { status: "cancelled" };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await api.writeWorkbenchFileRaw(destPath, bytes);
  saveLastExportDir(destPath);
  return { status: "saved", path: destPath };
}

/**
 * Reads a local file path via raw binary Tauri IPC and wraps it as a standard Web File object.
 */
export async function readLocalFileAsWebFile(
  filePath: string,
  fallbackMime = "application/pdf"
): Promise<File> {
  const bytes = await api.readWorkbenchFileRaw(filePath);
  const normalized = bytes.slice();
  const segments = filePath.split(/[/\\]/);
  const fileName = segments[segments.length - 1] || "document.pdf";
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : fallbackMime;
  return new File([normalized], fileName, { type: mime });
}

/**
 * Opens a native OS file picker for PDF files in Tauri mode; returns null when cancelled
 * or when not running in Tauri (caller should fall back to <input type="file">).
 */
export async function pickPdfFileInTauri(): Promise<File | null> {
  if (!isTauriEnvironment()) return null;
  const selected = await openDialog({
    multiple: false,
    title: "选择 PDF 工程图纸",
    filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
  });
  if (typeof selected !== "string" || !selected) {
    return null;
  }
  return readLocalFileAsWebFile(selected, "application/pdf");
}
