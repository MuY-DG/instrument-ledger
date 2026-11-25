import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE } from "@/lib/motion";
import { ModalShell } from "@/components/ui/MotionPrimitives";

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
  const lastReqRef = useRef<PendingConfirm | null>(null);
  if (req) lastReqRef.current = req;
  const displayReq = req ?? lastReqRef.current;
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
    <ModalShell
      open={Boolean(req)}
      onClose={() => settle(false)}
      zIndexClass="z-[160]"
      role="alertdialog"
      ariaLabelledBy="confirm-dialog-title"
      panelClassName="w-full max-w-sm"
    >
      {displayReq && (
        <>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-hairline",
                    displayReq.destructive
                      ? "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400"
                      : "bg-zinc-100 dark:bg-white/[0.07] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-200"
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="confirm-dialog-title"
                    className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight"
                  >
                    {displayReq.title}
                  </h3>
                  {displayReq.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-line">
                      {displayReq.description}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => settle(false)}
                className="btn-tactile p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07] shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-end gap-2">
            <motion.button
              ref={cancelBtnRef}
              type="button"
              whileTap={TAP_SCALE}
              transition={SPRING_SNAPPY}
              onClick={() => settle(false)}
              className="px-4 py-1.5 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              {displayReq.cancelText || "取消"}
            </motion.button>
            <motion.button
              type="button"
              whileTap={TAP_SCALE}
              transition={SPRING_SNAPPY}
              onClick={() => settle(true)}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-semibold shadow-tactile-primary transition-colors",
                displayReq.destructive
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
              )}
            >
              {displayReq.confirmText || "确定"}
            </motion.button>
          </div>
        </>
      )}
    </ModalShell>
  );
};
