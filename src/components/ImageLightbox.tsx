import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "@/lib/api";

interface ImageLightboxProps {
  photoPath: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
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

  useEffect(() => {
    if (!photoPath) return;
    setScale(1);
    setRotation(0);
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
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoPath, onClose]);

  return (
    <AnimatePresence>
      {photoPath && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-[#09090b]/90 backdrop-blur-xl flex flex-col no-print"
          onClick={onClose}
        >
          {/* Toolbar */}
          <div
            className="flex items-center justify-between px-6 py-4 text-white border-b border-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {title || "位置大图预览"}
              </h3>
              {subtitle && (
                <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{subtitle}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white/[0.07] border border-white/[0.08] rounded-lg p-1 gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
                  }
                  className="p-1.5 rounded hover:bg-white/15 transition"
                  title="缩小 (-)"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-mono tabular-nums w-11 text-center">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))
                  }
                  className="p-1.5 rounded hover:bg-white/15 transition"
                  title="放大 (+)"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 rounded hover:bg-white/15 transition"
                  title="顺时针旋转 90°"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScale(1);
                    setRotation(0);
                  }}
                  className="p-1.5 rounded hover:bg-white/15 transition"
                  title="重置视图"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-white/[0.07] hover:bg-white/15 border border-white/[0.08] transition"
                title="关闭 (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Image Stage */}
          <div
            className="flex-1 overflow-auto flex items-center justify-center p-8"
            onWheel={(e) => {
              e.preventDefault();
              setScale((s) => {
                const next = e.deltaY < 0 ? s + 0.15 : s - 0.15;
                return Math.min(3, Math.max(0.5, +next.toFixed(2)));
              });
            }}
          >
            {loading ? (
              <div className="text-zinc-400 text-xs">正在加载高清现场图...</div>
            ) : src ? (
              <motion.img
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
                className="max-h-[80vh] max-w-[85vw] object-contain rounded-xl shadow-2xl select-none"
              />
            ) : (
              <div className="text-zinc-400 text-xs">图片加载失败</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
