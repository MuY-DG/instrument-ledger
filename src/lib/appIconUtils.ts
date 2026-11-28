/**
 * Normalizes any user-picked image (PNG, JPG, WebP, SVG, ICO) into a crisp
 * 512x512 square PNG following Apple's macOS App Icon HIG grid:
 * 50px transparent margin on all 4 sides (412x412 visible squircle = 80.5% fill,
 * 22.3% corner radius, subtle macOS bottom drop shadow) so custom icons match
 * native macOS Dock and Windows Taskbar proportions without looking oversized.
 */
export async function normalizeAppIconToPngBase64(
  mime: string,
  base64Data: string
): Promise<string> {
  const dataUrl = `data:${mime};base64,${base64Data}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("无法解析所选图片文件"));
    el.src = dataUrl;
  });

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 初始化失败");

  ctx.clearRect(0, 0, size, size);

  // Apple macOS HIG icon grid: 824/1024 => 412x412 centered on 512x512 (50px inset)
  const pad = 50;
  const box = size - pad * 2;
  const radius = Math.round(box * 0.223);

  const traceSquircle = () => {
    ctx.beginPath();
    ctx.moveTo(pad + radius, pad);
    ctx.arcTo(pad + box, pad, pad + box, pad + box, radius);
    ctx.arcTo(pad + box, pad + box, pad, pad + box, radius);
    ctx.arcTo(pad, pad + box, pad, pad, radius);
    ctx.arcTo(pad, pad, pad + box, pad, radius);
    ctx.closePath();
  };

  // Subtle macOS Dock drop shadow inside the 50px safe gutter
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.24)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
  traceSquircle();
  ctx.fill();
  ctx.restore();

  // Clipped squircle artwork
  ctx.save();
  traceSquircle();
  ctx.clip();

  const sw = img.naturalWidth || img.width || size;
  const sh = img.naturalHeight || img.height || size;
  const scale = Math.max(box / sw, box / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = pad + (box - dw) / 2;
  const dy = pad + (box - dh) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();

  const outDataUrl = canvas.toDataURL("image/png");
  const commaIdx = outDataUrl.indexOf(",");
  return commaIdx >= 0 ? outDataUrl.slice(commaIdx + 1) : outDataUrl;
}
