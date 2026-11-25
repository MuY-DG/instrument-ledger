import React, { useEffect, useState } from "react";
import { Image as ImageIcon, ZoomIn } from "lucide-react";
import { api } from "@/lib/api";

interface LocationThumbProps {
  photoPath: string;
  alt: string;
  onClick?: () => void;
}

export const LocationThumb: React.FC<LocationThumbProps> = ({
  photoPath,
  alt,
  onClick,
}) => {
  const [src, setSrc] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!photoPath) {
      setSrc("");
      return;
    }
    api
      .getStoredImageDataUrl(photoPath)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [photoPath]);

  if (!photoPath || failed) {
    return (
      <div
        className="h-9 w-9 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-center text-zinc-300 dark:text-zinc-700 shrink-0"
        title="未上传位置图"
      >
        <ImageIcon className="h-3.5 w-3.5" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className="h-9 w-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse shrink-0" />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="group relative h-9 w-9 rounded-lg overflow-hidden border border-zinc-200/90 dark:border-zinc-700/80 bg-zinc-100 dark:bg-zinc-900 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
      title="点击查看大图"
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-zinc-950/0 group-hover:bg-zinc-950/40 transition-colors flex items-center justify-center">
        <ZoomIn className="h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
};
