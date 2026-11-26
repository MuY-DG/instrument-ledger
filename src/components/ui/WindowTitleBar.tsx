import React, { useEffect, useLayoutEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMacPlatform } from "@/components/AuthLockModals";
import { isTauriEnvironment } from "@/lib/themeTransition";
import { cn } from "@/lib/utils";

interface WindowTitleBarProps {
  docTitle?: string;
  docCode?: string;
  /** When true (e.g., cinematic Onboarding intro), renders a transparent drag region only */
  minimalDragOnly?: boolean;
}

const MAC_TITLEBAR_HEIGHT_PX = 32;

export function isTauriMacDesktop(): boolean {
  return isTauriEnvironment() && isMacPlatform();
}

/**
 * Custom in-DOM macOS Overlay Title Bar (`titleBarStyle: "Overlay"`, `hiddenTitle: true`).
 * Keeps native macOS traffic lights (`🔴 🟡 🟢`) while bringing the titlebar background,
 * title text, and bottom hairline inside the WebView DOM so the circular View Transition
 * sweeps seamlessly all the way to the top edge of the window.
 */
export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({
  docTitle = "监视与测量设备管理台账",
  docCode = "JSSK-MPR-170",
  minimalDragOnly = false,
}) => {
  const [enabled] = useState(isTauriMacDesktop);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);

  useEffect(() => {
    if (!enabled) {
      document.documentElement.style.setProperty("--titlebar-h", "0px");
      document.documentElement.style.setProperty("--titlebar-safe-top", "0px");
      return;
    }

    const appWindow = getCurrentWindow();
    // Ensure overlay style even if frontend hot-reloaded before Rust restarted
    appWindow.setTitleBarStyle("overlay").catch(() => {});

    let active = true;
    const syncFullscreen = () => {
      appWindow
        .isFullscreen()
        .then((fs) => {
          if (active) setIsFullscreen(fs);
        })
        .catch(() => {});
    };

    syncFullscreen();

    const unlistenResize = appWindow.onResized(() => {
      syncFullscreen();
    });
    const unlistenFocus = appWindow.onFocusChanged(({ payload }) => {
      if (active) setWindowFocused(payload);
    });

    return () => {
      active = false;
      unlistenResize.then((fn) => fn()).catch(() => {});
      unlistenFocus.then((fn) => fn()).catch(() => {});
    };
  }, [enabled]);

  useLayoutEffect(() => {
    const safeTop =
      enabled && !isFullscreen ? `${MAC_TITLEBAR_HEIGHT_PX}px` : "0px";
    const h =
      enabled && !isFullscreen && !minimalDragOnly
        ? `${MAC_TITLEBAR_HEIGHT_PX}px`
        : "0px";
    document.documentElement.style.setProperty("--titlebar-h", h);
    document.documentElement.style.setProperty("--titlebar-safe-top", safeTop);
  }, [enabled, isFullscreen, minimalDragOnly]);

  if (!enabled || isFullscreen) {
    return null;
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const appWindow = getCurrentWindow();
    if (e.detail === 2) {
      appWindow.toggleMaximize().catch(() => {});
    } else {
      appWindow.startDragging().catch(() => {});
    }
  };

  if (minimalDragOnly) {
    return (
      <div
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        className="fixed top-0 inset-x-0 h-8 z-[150] select-none no-print"
      />
    );
  }

  const displayTitle = docCode
    ? `${docTitle || "监视与测量设备管理台账"} · ${docCode}`
    : docTitle || "监视与测量设备管理台账";

  return (
    <div
      role="banner"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      style={{ height: MAC_TITLEBAR_HEIGHT_PX }}
      className={cn(
        "relative z-[110] shrink-0 w-full pl-[80px] pr-4 flex items-center select-none no-print",
        "bg-[#f8f8f9] dark:bg-[#0b0b0e] border-b border-zinc-200/85 dark:border-white/[0.07]"
      )}
    >
      <span
        data-tauri-drag-region
        className={cn(
          "text-[12px] font-semibold tracking-tight truncate pointer-events-none",
          windowFocused
            ? "text-zinc-700 dark:text-zinc-200"
            : "text-zinc-400 dark:text-zinc-500"
        )}
      >
        {displayTitle}
      </span>
    </div>
  );
};
