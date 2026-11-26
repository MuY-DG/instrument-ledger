import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import {
  MapPin,
  RotateCcw,
  RotateCw,
  ScanSearch,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api } from "@/lib/api";
import { SPRING_SNAPPY, TAP_SCALE } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  photoPath: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

const LENS_SIZE = 184;
const LENS_ZOOM_STEPS = [2, 2.75, 3.75] as const;

interface LensSample {
  dx: number;
  dy: number;
  baseW: number;
  baseH: number;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  photoPath,
  title,
  subtitle,
  onClose,
}) => {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Optical Glass Lens Magnifier state
  const [lensEnabled, setLensEnabled] = useState(false);
  const [lensZoomIdx, setLensZoomIdx] = useState(1); // default 2.75x
  const [lensVisible, setLensVisible] = useState(false);
  const [lensSample, setLensSample] = useState<LensSample | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const lensZoom = LENS_ZOOM_STEPS[lensZoomIdx];
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const lensX = useSpring(rawX, { stiffness: 560, damping: 38, mass: 0.4 });
  const lensY = useSpring(rawY, { stiffness: 560, damping: 38, mass: 0.4 });

  useEffect(() => {
    if (!photoPath) return;
    setScale(1);
    setRotation(0);
    setLensEnabled(false);
    setLensVisible(false);
    setLensSample(null);
    setLoading(true);
    let active = true;
    api
      .getStoredImageDataUrl(photoPath)
      .then((url) => {
        if (active) setSrc(url);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [photoPath]);

  useEffect(() => {
    if (!photoPath) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=")
        setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)));
      if (e.key === "-") setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));
      if (e.key.toLowerCase() === "m") {
        setLensEnabled((v) => {
          const next = !v;
          if (!next) setLensVisible(false);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoPath, onClose]);

  const updateLensFromPointer = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    const overlay = overlayRef.current;
    if (!img || !overlay || !lensEnabled) return;
    const rect = img.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (!inside) {
      setLensVisible(false);
      return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const targetX = clientX - overlayRect.left - LENS_SIZE / 2;
    const targetY = clientY - overlayRect.top - LENS_SIZE / 2;
    if (!lensVisible) {
      rawX.jump(targetX);
      rawY.jump(targetY);
      lensX.jump(targetX);
      lensY.jump(targetY);
      setLensVisible(true);
    } else {
      rawX.set(targetX);
      rawY.set(targetY);
    }
    setLensSample({
      dx: clientX - cx,
      dy: clientY - cy,
      baseW: img.offsetWidth,
      baseH: img.offsetHeight,
    });
  };

  return (
    <AnimatePresence>
      {photoPath && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-x-0 bottom-0 top-[var(--titlebar-h,0px)] z-50 overflow-hidden bg-white/15 dark:bg-black/40 backdrop-blur-xl flex flex-col no-print"
          onClick={onClose}
        >
          {/* Translucent toolbar — keeps full frosted-glass stage while sharpening text & controls */}
          <div
            className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 text-zinc-900 dark:text-white border-b border-zinc-900/[0.06] dark:border-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white drop-shadow-[0_1px_2px_rgba(255,255,255,0.75)] dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] truncate">
                {title || "位置大图预览"}
              </h3>
              {subtitle && (
                <p className="text-xs text-zinc-600 dark:text-zinc-300 drop-shadow-[0_1px_1px_rgba(255,255,255,0.65)] dark:drop-shadow-none flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">{subtitle}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Optical Glass Lens Toggle + Multiplier */}
              <div className="flex items-center bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-900/10 dark:border-white/15 shadow-sm rounded-lg p-1 gap-1">
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={() => {
                    setLensEnabled((v) => {
                      const next = !v;
                      if (!next) setLensVisible(false);
                      return next;
                    });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    lensEnabled
                      ? "bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm"
                      : "text-zinc-800 dark:text-zinc-100 hover:bg-zinc-900/[0.08] hover:text-zinc-950 dark:hover:bg-white/15 dark:hover:text-white"
                  )}
                  title="光学放大镜检视铭牌与细节 (快捷键 M)"
                >
                  <ScanSearch className="h-3.5 w-3.5" />
                  <span>光学镜</span>
                </motion.button>
                {lensEnabled && (
                  <button
                    type="button"
                    onClick={() =>
                      setLensZoomIdx((i) => (i + 1) % LENS_ZOOM_STEPS.length)
                    }
                    className="px-2 py-1 rounded-md text-[11px] font-mono font-semibold tabular-nums text-indigo-700 dark:text-indigo-200 bg-indigo-500/10 dark:bg-indigo-400/15 hover:bg-indigo-500/20 dark:hover:bg-white/15 transition"
                    title="切换放大倍率（也可滚轮调节）"
                  >
                    {lensZoom}×
                  </button>
                )}
              </div>

              <div className="flex items-center bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md border border-zinc-900/10 dark:border-white/15 shadow-sm rounded-lg p-1 gap-0.5 text-zinc-800 dark:text-zinc-100">
                <button
                  type="button"
                  onClick={() =>
                    setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
                  }
                  className="p-1.5 rounded-md hover:bg-zinc-900/[0.08] hover:text-zinc-950 dark:hover:bg-white/15 dark:hover:text-white transition"
                  title="缩小 (-)"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-mono font-medium tabular-nums w-12 text-center text-zinc-900 dark:text-zinc-100 select-none">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))
                  }
                  className="p-1.5 rounded-md hover:bg-zinc-900/[0.08] hover:text-zinc-950 dark:hover:bg-white/15 dark:hover:text-white transition"
                  title="放大 (+)"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 rounded-md hover:bg-zinc-900/[0.08] hover:text-zinc-950 dark:hover:bg-white/15 dark:hover:text-white transition"
                  title="顺时针旋转 90°"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScale(1);
                    setRotation(0);
                    setLensEnabled(false);
                    setLensVisible(false);
                  }}
                  className="p-1.5 rounded-md hover:bg-zinc-900/[0.08] hover:text-zinc-950 dark:hover:bg-white/15 dark:hover:text-white transition"
                  title="重置视图"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-white/70 hover:bg-white/90 text-zinc-800 hover:text-zinc-950 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 dark:text-zinc-100 dark:hover:text-white backdrop-blur-md border border-zinc-900/10 dark:border-white/15 shadow-sm transition"
                title="关闭 (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Image Stage */}
          <div
            className="relative flex-1 overflow-auto flex items-center justify-center p-8"
            onPointerMove={(e) => {
              if (lensEnabled) updateLensFromPointer(e.clientX, e.clientY);
            }}
            onPointerLeave={() => setLensVisible(false)}
            onWheel={(e) => {
              e.preventDefault();
              if (lensEnabled) {
                setLensZoomIdx((i) =>
                  e.deltaY < 0
                    ? Math.min(LENS_ZOOM_STEPS.length - 1, i + 1)
                    : Math.max(0, i - 1)
                );
                return;
              }
              setScale((s) => {
                const next = e.deltaY < 0 ? s + 0.15 : s - 0.15;
                return Math.min(3, Math.max(0.5, +next.toFixed(2)));
              });
            }}
          >
            {loading ? (
              <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                正在加载高清现场图...
              </div>
            ) : src ? (
              <motion.img
                ref={imgRef}
                initial={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
                animate={{
                  opacity: 1,
                  scale,
                  rotate: rotation,
                  filter: "blur(0px)",
                }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                src={src}
                alt={title || "位置图"}
                onClick={(e) => e.stopPropagation()}
                onPointerEnter={(e) => {
                  if (lensEnabled) updateLensFromPointer(e.clientX, e.clientY);
                }}
                className={cn(
                  "max-h-[calc(80vh-var(--titlebar-h,0px))] max-w-[85vw] object-contain rounded-xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] shadow-[0_24px_64px_-12px_rgba(15,23,42,0.22)] dark:shadow-2xl select-none",
                  lensEnabled && "cursor-crosshair"
                )}
              />
            ) : (
              <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                图片加载失败
              </div>
            )}
          </div>

          {/* Floating Hint Pill when Optical Lens is enabled */}
          <AnimatePresence>
            {lensEnabled && !lensVisible && src && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 z-[60] px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-white/15 text-[11px] text-zinc-200 backdrop-blur-md shadow-elevated"
              >
                移动鼠标至图片任意区域检视细节 · 滚轮切换倍率 ({lensZoom}×) · 按 M 关闭
              </motion.div>
            )}
          </AnimatePresence>

          {/* Optical Water-Drop Glass Lens Overlay (positioned relative to lightbox to avoid backdrop-filter fixed-block offset) */}
          <AnimatePresence>
            {lensEnabled && lensVisible && lensSample && src && (
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.72 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.78 }}
                transition={SPRING_SNAPPY}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: LENS_SIZE,
                  height: LENS_SIZE,
                  x: lensX,
                  y: lensY,
                }}
                className="pointer-events-none z-[65] rounded-full overflow-hidden border border-white/35 bg-[#0b0b0e] shadow-[0_24px_60px_rgba(0,0,0,0.68),0_0_0_1px_rgba(255,255,255,0.12),inset_0_0_24px_rgba(255,255,255,0.18)]"
              >
                {/* Pixel-exact magnified image surface (supports scale & 90° rotations) */}
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: lensSample.baseW,
                    height: lensSample.baseH,
                    maxWidth: "none",
                    maxHeight: "none",
                    transformOrigin: "center center",
                    transform: `translate(${LENS_SIZE / 2 - lensSample.dx * lensZoom - lensSample.baseW / 2}px, ${LENS_SIZE / 2 - lensSample.dy * lensZoom - lensSample.baseH / 2}px) scale(${scale * lensZoom}) rotate(${rotation}deg)`,
                  }}
                  className="select-none pointer-events-none"
                />

                {/* Subtle glass specular curvature sheen & inner rim refraction */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 36%, transparent 62%), radial-gradient(circle at 50% 50%, transparent 72%, rgba(0,0,0,0.28) 100%)",
                    boxShadow: "inset 0 1.5px 3px rgba(255,255,255,0.4)",
                  }}
                />

                {/* Minimalist precision optical reticle */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="h-3.5 w-px bg-white/45 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
                  <span className="absolute w-3.5 h-px bg-white/45 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
                </div>

                {/* Magnification Readout Pill */}
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-mono tabular-nums text-white/95">
                  {(scale * lensZoom).toFixed(1)}×
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
