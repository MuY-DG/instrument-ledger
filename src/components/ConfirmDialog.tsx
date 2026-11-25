import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

type ConfirmListener = (req: PendingConfirm | null) => void;

let activeListener: ConfirmListener | null = null;
let currentPending: PendingConfirm | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (currentPending) {
      currentPending.resolve(false);
    }
    const req: PendingConfirm = { ...options, resolve };
    currentPending = req;
    if (activeListener) {
      activeListener(req);
    } else {
      currentPending = null;
      resolve(false);
    }
  });
}

export const ConfirmDialogHost: React.FC = () => {
  const [req, setReq] = useState<PendingConfirm | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeListener = setReq;
    if (currentPending) {
      setReq(currentPending);
    }
    return () => {
      if (activeListener === setReq) {
        activeListener = null;
      }
    };
  }, []);

  const settle = (confirmed: boolean) => {
    if (!req) return;
    const resolver = req.resolve;
    if (currentPending === req) {
      currentPending = null;
    }
    setReq(null);
    resolver(confirmed);
  };

  useEffect(() => {
    if (!req) return;
    const t = window.setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        settle(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [req]);

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[160] bg-zinc-950/55 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            e.stopPropagation();
            settle(false);
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm bg-white dark:bg-[#121216] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                      req.destructive
                        ? "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400"
                        : "bg-zinc-100 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-200"
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3
                      id="confirm-dialog-title"
                      className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight"
                    >
                      {req.title}
                    </h3>
                    {req.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-line">
                        {req.description}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07] transition shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] flex items-center justify-end gap-2">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => settle(false)}
                className="px-4 py-1.5 rounded-xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
              >
                {req.cancelText || "取消"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={cn(
                  "px-4 py-1.5 rounded-xl text-xs font-semibold shadow-hairline transition",
                  req.destructive
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : "bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
                )}
              >
                {req.confirmText || "确定"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
