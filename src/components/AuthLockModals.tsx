import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  MonitorDown,
  Power,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import {
  EASE_PRECISION,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_SUBTLE,
} from "@/lib/motion";
import { ModalShell } from "@/components/ui/MotionPrimitives";
import {
  PrecisionCheckbox,
  PrecisionSelect,
  PrecisionSwitch,
} from "@/components/ui/FormControls";
import type { AuthStatus } from "@/types";

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/* ============================================================================
 * Shared Tactile N-Slot PIN Input
 * Ported damped-harmonic spring engine (OTP code merge -> green Verified pill)
 * ========================================================================== */

interface SpringState {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
}

const createSpring = (x: number, k = 400, c = 30): SpringState => ({
  x,
  v: 0,
  t: x,
  k,
  c,
});

const stepSpring = (s: SpringState, dt: number) => {
  const a = -s.k * (s.x - s.t) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
};

const clampNum = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface PinSlotInputProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  /** Triggers the OTP merge -> green pill verification success animation */
  verified?: boolean;
  verifiedLabel?: string;
  showDigits?: boolean;
  autoFocus?: boolean;
  focusNonce?: number;
  size?: "md" | "lg";
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
}

interface BoxSpringPack {
  y: SpringState;
  o: SpringState;
  a: SpringState;
}

const PinSlotInput: React.FC<PinSlotInputProps> = ({
  length,
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  verified = false,
  verifiedLabel = "已解锁",
  showDigits = false,
  autoFocus = false,
  focusNonce = 0,
  size = "lg",
  inputRef: externalRef,
}) => {
  const internalRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalRef ?? internalRef;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ringRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const activeFillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const greenFillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const glyphRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const caretRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const okRef = useRef<HTMLDivElement | null>(null);
  const checkPathRef = useRef<SVGPathElement | null>(null);

  const [focused, setFocused] = useState(false);

  // Physics state refs (updated at 60-120fps without React re-renders)
  const springsRef = useRef<BoxSpringPack[]>([]);
  const mergeSpringRef = useRef<SpringState>(createSpring(0, 260, 24));
  const greenSpringRef = useRef<SpringState>(createSpring(0, 220, 28));
  const prevValueRef = useRef<string>("");
  const propsRef = useRef({
    length,
    value,
    focused,
    disabled,
    hasError,
    verified,
    size,
  });
  propsRef.current = { length, value, focused, disabled, hasError, verified, size };

  // Ensure box spring array matches length
  if (springsRef.current.length !== length) {
    springsRef.current = Array.from({ length }, (_, idx) => {
      const hasChar = Boolean(value[idx]);
      return {
        y: createSpring(0, 520, 16),
        o: createSpring(hasChar ? 1 : 0, 400, 28),
        a: createSpring(0, 300, 26),
      };
    });
    prevValueRef.current = value;
  }

  // Trigger bouncy drop-in when new digits land, or fade out when cleared
  useEffect(() => {
    const prev = prevValueRef.current;
    const packs = springsRef.current;
    for (let i = 0; i < length; i++) {
      const pack = packs[i];
      if (!pack) continue;
      const c = value[i] || "";
      const p = prev[i] || "";
      if (c && c !== p) {
        pack.y.x = -14;
        pack.y.v = 0;
        pack.y.t = 0;
        pack.o.x = 0;
        pack.o.v = 0;
        pack.o.t = 1;
      } else if (!c) {
        pack.o.t = 0;
      }
    }
    prevValueRef.current = value;
  }, [value, length]);

  // Trigger DesignBookmark OTP merge -> green pill verification sequence
  useEffect(() => {
    if (!verified) {
      mergeSpringRef.current = createSpring(0, 260, 24);
      greenSpringRef.current = createSpring(0, 220, 28);
      return;
    }
    const tMerge = window.setTimeout(() => {
      mergeSpringRef.current.t = 1;
    }, 120);
    const tGreen = window.setTimeout(() => {
      greenSpringRef.current.t = 1;
    }, 360);
    return () => {
      window.clearTimeout(tMerge);
      window.clearTimeout(tGreen);
    };
  }, [verified]);

  useEffect(() => {
    if (!autoFocus || disabled || verified) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [autoFocus, disabled, verified, focusNonce, length, inputRef]);

  // 4-substep damped harmonic spring render loop (with synchronous initial layout before paint)
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();
    let clock = 0;

    const applyDom = () => {
      const cur = propsRef.current;
      const N = cur.length;
      const val = cur.value;
      const packs = springsRef.current;
      const M = mergeSpringRef.current;
      const G = greenSpringRef.current;

      const container = containerRef.current;
      if (!container) return;

      const W = container.offsetWidth || (cur.size === "lg" ? 312 : 264);
      const gap0 = cur.size === "lg" ? 10 : 8;
      const maxBw = cur.size === "lg" ? 50 : 42;
      const baseRadius = cur.size === "lg" ? 14 : 12;
      const bw = Math.min(maxBw, (W - gap0 * (N - 1)) / N);

      const m = clampNum(M.x, 0, 1);
      const g = clampNum(G.x, 0, 1);
      const gap = gap0 * (1 - m);
      const total = bw * N + gap * (N - 1);
      const left0 = (W - total) / 2;
      const innerR = baseRadius * (1 - m);

      for (let i = 0; i < N; i++) {
        const b = packs[i];
        const el = boxRefs.current[i];
        if (!b || !el) continue;

        const left = left0 + i * (bw + gap);
        const overlap = i < N - 1 ? gap0 * m + (m > 0.01 ? 2.5 * m : 0) : 0;
        const width = bw + overlap;

        el.style.left = `${left.toFixed(2)}px`;
        el.style.width = `${width.toFixed(2)}px`;
        el.style.borderRadius =
          i === 0
            ? `${baseRadius}px ${innerR.toFixed(2)}px ${innerR.toFixed(2)}px ${baseRadius}px`
            : i === N - 1
              ? `${innerR.toFixed(2)}px ${baseRadius}px ${baseRadius}px ${innerR.toFixed(2)}px`
              : `${innerR.toFixed(2)}px`;

        // Fade individual slot inset hairline border completely to 0 as boxes fuse (zero vertical seam lines)
        const ringEl = ringRefs.current[i];
        if (ringEl) {
          const ringOpacity = clampNum(1 - Math.max(m * 1.45, g * 1.6), 0, 1);
          ringEl.style.opacity = ringOpacity.toFixed(3);
        }

        const a = clampNum(b.a.x, 0, 1);
        const activeFill = activeFillRefs.current[i];
        if (activeFill) {
          activeFill.style.opacity = g > 0.01 ? "0" : a.toFixed(3);
        }

        const greenFill = greenFillRefs.current[i];
        if (greenFill) {
          greenFill.style.opacity = g.toFixed(3);
        }

        const glyph = glyphRefs.current[i];
        if (glyph) {
          const o = clampNum(b.o.x, 0, 1) * clampNum(1 - g * 1.55, 0, 1);
          glyph.style.opacity = o.toFixed(3);
          glyph.style.transform = `translateY(${b.y.x.toFixed(2)}px)`;
        }

        const caret = caretRefs.current[i];
        if (caret) {
          const showCaret =
            a > 0.5 &&
            !val[i] &&
            !cur.verified &&
            !cur.hasError &&
            (clock * 1.8) % 2 < 1.2;
          caret.style.opacity = showCaret ? "1" : "0";
        }
      }

      const glow = glowRef.current;
      if (glow) {
        glow.style.left = `${left0.toFixed(2)}px`;
        glow.style.width = `${total.toFixed(2)}px`;
        glow.style.borderRadius = `${baseRadius}px`;
        glow.style.opacity = g.toFixed(3);
      }

      const ok = okRef.current;
      if (ok) {
        const okOpacity = clampNum(g * 1.6 - 0.5, 0, 1);
        ok.style.opacity = okOpacity.toFixed(3);
        ok.style.transform = `translateY(${((1 - g) * 8).toFixed(2)}px)`;
      }

      const checkPath = checkPathRef.current;
      if (checkPath) {
        const drawProgress = clampNum((g - 0.34) / 0.62, 0, 1);
        checkPath.style.strokeDashoffset = `${(24 * (1 - drawProgress)).toFixed(2)}`;
      }
    };

    // Position all boxes immediately on mount
    applyDom();

    const frame = (now: number) => {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      clock += rawDt;

      const cur = propsRef.current;
      const N = cur.length;
      const val = cur.value;
      const activeIdx = Math.min(val.length, N - 1);
      const packs = springsRef.current;
      const M = mergeSpringRef.current;
      const G = greenSpringRef.current;

      const subDt = rawDt / 4;
      for (let sub = 0; sub < 4; sub++) {
        for (let i = 0; i < N; i++) {
          const b = packs[i];
          if (!b) continue;
          b.a.t =
            cur.focused &&
            !cur.disabled &&
            !cur.verified &&
            !cur.hasError &&
            val.length < N &&
            i === activeIdx
              ? 1
              : 0;
          stepSpring(b.y, subDt);
          stepSpring(b.o, subDt);
          stepSpring(b.a, subDt);
        }
        stepSpring(M, subDt);
        stepSpring(G, subDt);
      }

      applyDom();
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || verified) return;
    const digits = e.target.value.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length && onComplete) {
      onComplete(digits);
    }
  };

  const slots = useMemo(() => Array.from({ length }, (_, idx) => idx), [length]);
  const activeIdx = Math.min(value.length, length - 1);
  const boxHeightCls = size === "lg" ? "h-[56px]" : "h-[44px]";

  return (
    <motion.div
      ref={containerRef}
      animate={hasError ? { x: [0, -7, 7, -5, 5, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.36, ease: EASE_PRECISION }}
      className={cn(
        "relative w-full mx-auto cursor-text select-none",
        boxHeightCls
      )}
      onClick={() => {
        if (!disabled && !verified) inputRef.current?.focus();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        disabled={disabled || verified}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={`输入 ${length} 位数字 PIN 码`}
        className="absolute inset-0 w-full h-full opacity-0 caret-transparent text-transparent select-none cursor-text z-20"
      />

      {/* Seamless unified emerald pill & ambient glow once merged */}
      <div
        ref={glowRef}
        aria-hidden="true"
        style={{ opacity: 0, backgroundColor: "#34d17a" }}
        className={cn(
          "pointer-events-none absolute top-0 shadow-[0_12px_30px_-8px_rgba(52,209,122,0.52)]",
          boxHeightCls
        )}
      />

      {slots.map((idx) => {
        const char = value[idx] || "";
        const filled = char !== "";
        const isCurrent =
          focused && !disabled && !verified && !hasError && idx === activeIdx && value.length < length;

        return (
          <div
            key={idx}
            ref={(el) => {
              boxRefs.current[idx] = el;
            }}
            className={cn(
              "absolute top-0 flex items-center justify-center font-mono overflow-hidden will-change-[transform,width,left]",
              boxHeightCls,
              size === "lg" ? "text-xl" : "text-base",
              hasError
                ? "bg-rose-50 dark:bg-[#2a151c]"
                : isCurrent
                  ? "bg-white dark:bg-[#1e1e25] shadow-sm"
                  : filled
                    ? "bg-white dark:bg-[#1c1c23]"
                    : "bg-zinc-50 dark:bg-[#17171d]",
              disabled && !verified && "opacity-60"
            )}
          >
            {/* Inset hairline border overlay (fades cleanly to 0 on merge -> zero vertical seams) */}
            <span
              ref={(el) => {
                ringRefs.current[idx] = el;
              }}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset transition-colors duration-150",
                hasError
                  ? "ring-rose-500/80"
                  : isCurrent
                    ? "ring-[1.5px] ring-zinc-900/75 dark:ring-indigo-400/85"
                    : filled
                      ? "ring-zinc-300/95 dark:ring-white/[0.16]"
                      : "ring-zinc-200/95 dark:ring-white/[0.1]"
              )}
            />

            {/* Active slot soft tint layer */}
            <span
              ref={(el) => {
                activeFillRefs.current[idx] = el;
              }}
              aria-hidden="true"
              style={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-zinc-900/[0.045] dark:bg-white/[0.09]"
            />

            {/* Verification success emerald flood layer (#34d17a) */}
            <span
              ref={(el) => {
                greenFillRefs.current[idx] = el;
              }}
              aria-hidden="true"
              style={{ opacity: 0, backgroundColor: "#34d17a" }}
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
            />

            {/* Bouncy digit / masked dot */}
            <span
              ref={(el) => {
                glyphRefs.current[idx] = el;
              }}
              style={{ opacity: filled ? 1 : 0 }}
              className="relative z-10 flex items-center justify-center will-change-[transform,opacity]"
            >
              {filled ? (
                showDigits ? (
                  <span className="font-semibold text-zinc-950 dark:text-white tabular-nums">
                    {char}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "rounded-full bg-zinc-900 dark:bg-white",
                      size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2"
                    )}
                  />
                )
              ) : null}
            </span>

            {/* Crisp blinking caret (strictly empty active slot, instant off once typed) */}
            <span
              ref={(el) => {
                caretRefs.current[idx] = el;
              }}
              aria-hidden="true"
              style={{ opacity: 0 }}
              className={cn(
                "pointer-events-none absolute z-10 w-[2px] rounded-full bg-zinc-900/85 dark:bg-indigo-300",
                size === "lg" ? "h-6" : "h-5"
              )}
            />
          </div>
        );
      })}

      {/* Fused green pill verification overlay (Checkmark + Verified label) */}
      <div
        ref={okRef}
        aria-live="polite"
        style={{ opacity: 0, color: "#04140a" }}
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 font-semibold tracking-tight will-change-[transform,opacity]"
      >
        <svg
          viewBox="0 0 24 24"
          className={size === "lg" ? "h-5 w-5" : "h-4 w-4"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            ref={checkPathRef}
            d="M5 12.5l4.5 4.5L19 7.5"
            strokeDasharray="24"
            strokeDashoffset="24"
          />
        </svg>
        <span className={size === "lg" ? "text-[15px]" : "text-xs"}>
          {verifiedLabel}
        </span>
      </div>
    </motion.div>
  );
};

/* ============================================================================
 * 1. Admin Login Modal (with Persistent Session Toggle)
 * ========================================================================== */

interface AdminLoginModalProps {
  open: boolean;
  defaultUsername: string;
  defaultKeepSession?: boolean;
  defaultSessionDays?: number;
  onClose: () => void;
  onSuccess: (status: AuthStatus, keepSession: boolean, sessionDays: number) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  open,
  defaultUsername,
  defaultKeepSession = true,
  defaultSessionDays = 7,
  onClose,
  onSuccess,
}) => {
  const sessionDays = defaultSessionDays > 0 ? defaultSessionDays : 7;
  const [username, setUsername] = useState(defaultUsername || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(defaultKeepSession);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setUsername(defaultUsername || "");
      setPassword("");
      setRemember(defaultKeepSession);
      setError("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, defaultUsername, defaultKeepSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const status = await api.adminLogin(username, password, remember, sessionDays);
      onSuccess(status, remember, sessionDays);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeOnEsc
      panelClassName="w-full max-w-md"
    >
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between bg-zinc-50/55 dark:bg-white/[0.015]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shrink-0 shadow-tactile-primary">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                  管理员身份验证
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  管理员账号
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入管理员账号"
                  className="precision-field w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/60 hover:bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-white/[0.05]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  登录密码
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPwd ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    className="precision-field w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/60 hover:bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-white/[0.05]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.07]">
                <PrecisionCheckbox
                  checked={remember}
                  onChange={setRemember}
                  label={
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {sessionDays} 天内保持登录
                    </span>
                  }
                />
                <InfoTip
                  content={`勾选后 ${sessionDays} 天内重启软件无需重输密码，到期自动恢复只读；可随时在侧边栏退出。`}
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    transition={SPRING_SNAPPY}
                    className="overflow-hidden"
                  >
                    <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3.5 py-2.5">
                      {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-end gap-2 pt-2">
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors"
                >
                  取消
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={loading ? undefined : TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  className="btn-sheen inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>{loading ? "登录中..." : "登录"}</span>
                </motion.button>
              </div>
            </form>
    </ModalShell>
  );
};

/* ============================================================================
 * 2. App Lock Setup / Change PIN Modal (4-6 Digit Independent PIN)
 * ========================================================================== */

interface AppLockSetupModalProps {
  open: boolean;
  mode: "enable" | "change";
  lockAfterSave?: boolean;
  initialPinLength?: number;
  initialAutoLockMinutes?: number;
  initialLockOnHide?: boolean;
  initialLockOnStartup?: boolean;
  onClose: () => void;
  onConfigured: (status: AuthStatus, lockedNow: boolean) => void;
}

export const AppLockSetupModal: React.FC<AppLockSetupModalProps> = ({
  open,
  mode,
  lockAfterSave = false,
  initialPinLength = 4,
  initialAutoLockMinutes = 0,
  initialLockOnHide = false,
  initialLockOnStartup = false,
  onClose,
  onConfigured,
}) => {
  const mac = useMemo(() => isMacPlatform(), []);
  const [pinLength, setPinLength] = useState<4 | 5 | 6>(
    initialPinLength === 5 || initialPinLength === 6 ? initialPinLength : 4
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showDigits, setShowDigits] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(initialAutoLockMinutes);
  const [lockOnHide, setLockOnHide] = useState(initialLockOnHide);
  const [lockOnStartup, setLockOnStartup] = useState(initialLockOnStartup);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const confirmInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPinLength(
      initialPinLength === 5 || initialPinLength === 6 ? initialPinLength : 4
    );
    setPin("");
    setConfirmPin("");
    setShowDigits(false);
    setAutoLockMinutes(initialAutoLockMinutes);
    setLockOnHide(initialLockOnHide);
    setLockOnStartup(initialLockOnStartup);
    setError("");
    setSaving(false);
  }, [
    open,
    initialPinLength,
    initialAutoLockMinutes,
    initialLockOnHide,
    initialLockOnStartup,
  ]);

  const handleChangeLength = (nextLen: 4 | 5 | 6) => {
    setPinLength(nextLen);
    setPin("");
    setConfirmPin("");
    setError("");
    setTimeout(() => pinInputRef.current?.focus(), 40);
  };

  const pinsMatch = pin.length === pinLength && confirmPin.length === pinLength && pin === confirmPin;
  const pinsMismatch = confirmPin.length === pinLength && pin !== confirmPin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== pinLength) {
      setError(`请输入完整的 ${pinLength} 位数字 PIN 码`);
      return;
    }
    if (pin !== confirmPin) {
      setError("两次输入的 PIN 码不一致，请核对");
      setConfirmPin("");
      setTimeout(() => confirmInputRef.current?.focus(), 40);
      return;
    }

    setSaving(true);
    setError("");
    try {
      let status = await api.configureAppLock(
        pin,
        mode === "enable"
          ? { autoLockMinutes, lockOnHide, lockOnStartup }
          : undefined
      );
      let lockedNow = false;
      if (mode === "enable" && lockAfterSave) {
        status = await api.lockApp();
        lockedNow = true;
      }
      onConfigured(status, lockedNow);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeOnEsc
      zIndexClass="z-[70]"
      panelClassName="w-full max-w-md"
    >
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/55 dark:bg-white/[0.015] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                    {mode === "change" ? "修改 PIN 码" : "开启应用锁"}
                  </h2>
                  <InfoTip content="独立于管理员密码，输完位数自动解锁；忘记时可用管理员密码解锁或重设。" />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* PIN Length Selector */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  PIN 码位数
                </span>
                <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08]">
                  {([4, 5, 6] as const).map((len) => {
                    const active = pinLength === len;
                    return (
                      <motion.button
                        key={len}
                        type="button"
                        whileTap={TAP_SCALE_SUBTLE}
                        onClick={() => handleChangeLength(len)}
                        className={cn(
                          "relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                          active
                            ? "text-zinc-950 dark:text-white"
                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="pin-len-pill"
                            transition={SPRING_SNAPPY}
                            className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.12] shadow-tactile"
                          />
                        )}
                        <span className="relative z-10">{len} 位</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Step 1: Enter PIN */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    输入 {pinLength} 位 PIN 码
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDigits((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  >
                    {showDigits ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showDigits ? "隐藏" : "显示"}</span>
                  </button>
                </div>
                <PinSlotInput
                  length={pinLength}
                  value={pin}
                  onChange={(next) => {
                    setPin(next);
                    setError("");
                  }}
                  onComplete={() => {
                    setTimeout(() => confirmInputRef.current?.focus(), 60);
                  }}
                  showDigits={showDigits}
                  autoFocus={open}
                  size="md"
                  inputRef={pinInputRef}
                />
              </div>

              {/* Step 2: Confirm PIN */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    确认 PIN 码
                  </label>
                  {pinsMatch && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="h-3 w-3" />
                      一致
                    </span>
                  )}
                  {pinsMismatch && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      两次输入不一致
                    </span>
                  )}
                </div>
                <PinSlotInput
                  length={pinLength}
                  value={confirmPin}
                  onChange={(next) => {
                    setConfirmPin(next);
                    setError("");
                  }}
                  hasError={pinsMismatch}
                  showDigits={showDigits}
                  size="md"
                  inputRef={confirmInputRef}
                />
              </div>

              {/* Trigger Timings (shown when enabling) */}
              {mode === "enable" && (
                <div className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/80 dark:border-white/[0.07] space-y-3">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-200">
                    <span>触发时机</span>
                    <InfoTip content="后续可随时在「设置 → 应用锁」调整" />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      无操作自动锁定
                    </span>
                    <PrecisionSelect
                      value={autoLockMinutes}
                      onChange={setAutoLockMinutes}
                      align="right"
                      className="min-w-[100px]"
                      options={[
                        { value: 0, label: "关闭" },
                        { value: 5, label: "5 分钟" },
                        { value: 10, label: "10 分钟" },
                        { value: 15, label: "15 分钟" },
                        { value: 30, label: "30 分钟" },
                      ]}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 select-none">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      隐藏到{mac ? "菜单栏" : "托盘"}时锁定
                    </span>
                    <PrecisionSwitch
                      checked={lockOnHide}
                      onChange={setLockOnHide}
                      size="sm"
                      ariaLabel="隐藏时锁定"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 select-none">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      启动程序时锁定
                    </span>
                    <PrecisionSwitch
                      checked={lockOnStartup}
                      onChange={setLockOnStartup}
                      size="sm"
                      ariaLabel="启动程序时锁定"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  取消
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={saving || !pinsMatch}
                  whileTap={saving || !pinsMatch ? undefined : TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  className="btn-sheen inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-45 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary transition-colors"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>
                    {saving
                      ? "保存中..."
                      : mode === "change"
                        ? "确定"
                        : lockAfterSave
                          ? "确定并锁定"
                          : "确定"}
                  </span>
                </motion.button>
              </div>
            </form>
    </ModalShell>
  );
};

/* ============================================================================
 * 3. Redesigned Adaptive Light & Dark App Lock Overlay (Auto-Unlock PIN + Admin Recovery)
 * ========================================================================== */

interface AppLockOverlayProps {
  locked: boolean;
  username: string;
  docTitle: string;
  pinLength: number;
  focusNonce?: number;
  onUnlocked: (status: AuthStatus, resetApplied?: boolean) => void;
}

type RecoveryAction = "unlock_only" | "reset_pin" | "disable_lock";

export const AppLockOverlay: React.FC<AppLockOverlayProps> = ({
  locked,
  username,
  docTitle,
  pinLength,
  focusNonce = 0,
  onUnlocked,
}) => {
  const effectivePinLen = pinLength >= 4 && pinLength <= 6 ? pinLength : 4;
  const [view, setView] = useState<"pin" | "recovery">("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [unlockedSuccess, setUnlockedSuccess] = useState(false);
  const [clock, setClock] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  // Admin recovery state
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [recoveryAction, setRecoveryAction] = useState<RecoveryAction>("unlock_only");
  const [newPin, setNewPin] = useState("");

  const pinRef = useRef<HTMLInputElement | null>(null);
  const adminInputRef = useRef<HTMLInputElement | null>(null);
  const unlockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!locked) return;
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setView("pin");
    setPin("");
    setAdminPassword("");
    setNewPin("");
    setRecoveryAction("unlock_only");
    setError("");
    setVerifying(false);
    setUnlockedSuccess(false);

    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
      setDateLabel(
        now.toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        })
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [locked]);

  useEffect(() => {
    if (!locked) return;
    if (view === "recovery") {
      setTimeout(() => adminInputRef.current?.focus(), 80);
    } else {
      setTimeout(() => pinRef.current?.focus(), 80);
    }
  }, [locked, view, focusNonce]);

  useEffect(() => {
    if (!locked || view !== "recovery") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setView("pin");
        setError("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, view]);

  const triggerShake = () => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 380);
  };

  const handlePinComplete = async (completedPin: string) => {
    if (verifying || unlockedSuccess) return;
    setVerifying(true);
    setError("");
    try {
      const status = await api.unlockApp(completedPin);
      setVerifying(false);
      setUnlockedSuccess(true);
      // Keep overlay visible while the OTP merge -> green "已解锁" pill animation plays out,
      // even though backend emits `auth-status-changed` (`isLocked: false`) immediately.
      unlockTimerRef.current = window.setTimeout(() => {
        unlockTimerRef.current = null;
        setPin("");
        setUnlockedSuccess(false);
        onUnlocked(status, false);
      }, 1320);
    } catch (err) {
      setError(String(err));
      triggerShake();
      setPin("");
      setVerifying(false);
      window.setTimeout(() => pinRef.current?.focus(), 60);
    }
  };

  const handleAdminRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword || verifying) return;
    if (recoveryAction === "reset_pin") {
      if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
        setError("新 PIN 码必须为 4 到 6 位纯数字");
        triggerShake();
        return;
      }
    }

    setVerifying(true);
    setError("");
    try {
      const status = await api.unlockAppWithAdmin(adminPassword, {
        newPin: recoveryAction === "reset_pin" ? newPin : undefined,
        disableLock: recoveryAction === "disable_lock",
      });
      setAdminPassword("");
      setNewPin("");
      onUnlocked(status, recoveryAction !== "unlock_only");
    } catch (err) {
      setError(String(err));
      triggerShake();
      setAdminPassword("");
      window.setTimeout(() => adminInputRef.current?.focus(), 60);
    } finally {
      setVerifying(false);
    }
  };

  // Keep overlay mounted during active PIN verification & success merge animation
  // so backend `auth-status-changed` (`isLocked: false`) does not unmount it prematurely.
  const overlayVisible = locked || verifying || unlockedSuccess;

  return (
    <AnimatePresence>
      {overlayVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE_PRECISION }}
          className="fixed inset-0 z-[100] bg-[#f4f5f8]/[0.86] dark:bg-[#09090b]/[0.88] backdrop-blur-2xl flex flex-col items-center justify-center p-6 select-none no-print overflow-hidden"
        >
          {/* Adaptive Architectural Grid */}
          <div className="absolute inset-0 bg-precision-grid-light dark:bg-precision-grid pointer-events-none" />

          {/* Subtle Radial Ambient Depth (Light & Dark tuned) */}
          <div
            className="absolute inset-0 pointer-events-none dark:hidden"
            style={{
              background:
                "radial-gradient(ellipse 68% 54% at 50% 38%, rgba(255,255,255,0.85) 0%, rgba(226,232,240,0.28) 55%, rgba(244,245,248,0.65) 100%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none hidden dark:block"
            style={{
              background:
                "radial-gradient(ellipse 68% 54% at 50% 36%, rgba(99,102,241,0.16) 0%, rgba(56,189,248,0.05) 42%, rgba(9,9,11,0.92) 82%)",
            }}
          />

          {/* Top Minimal Brand Pill */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.3 }}
            className="absolute top-6 inset-x-0 flex justify-center pointer-events-none"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-white/[0.05] border border-zinc-200/90 dark:border-white/[0.09] shadow-hairline text-[11.5px] text-zinc-600 dark:text-zinc-300 transition-colors">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors duration-300",
                  unlockedSuccess
                    ? "bg-emerald-500"
                    : "bg-indigo-500 dark:bg-indigo-400"
                )}
              />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {docTitle || "监视与测量管理台账"}
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span>{unlockedSuccess ? "已解锁" : "已锁定"}</span>
            </div>
          </motion.div>

          {/* Hero Clock */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04, duration: 0.34, ease: EASE_PRECISION }}
            className="relative z-10 text-center mb-8"
          >
            <div className="text-[64px] leading-none font-light tracking-tight font-mono tabular-nums text-zinc-900 dark:text-white">
              {clock}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-3 tracking-[0.14em] font-medium">
              {dateLabel}
            </div>
          </motion.div>

          {/* Frosted Glass Unlock Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.28, ease: EASE_PRECISION }}
            className={cn(
              "relative z-10 w-full max-w-[392px] rounded-2xl overflow-hidden",
              "bg-white/[0.9] dark:bg-[#131318]/[0.86] backdrop-blur-2xl",
              "border border-zinc-200/90 dark:border-white/[0.1]",
              "shadow-[0_24px_70px_-20px_rgba(15,23,42,0.16)] dark:shadow-[0_32px_90px_-20px_rgba(0,0,0,0.85)]",
              shaking && "animate-shake"
            )}
          >
            {/* Specular Top Accent Hairline */}
            <div
              className={cn(
                "absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent to-transparent transition-all duration-300",
                unlockedSuccess
                  ? "via-emerald-500/75 dark:via-emerald-400/75"
                  : "via-indigo-500/45 dark:via-indigo-400/55"
              )}
            />

            <AnimatePresence mode="wait">
              {view === "pin" ? (
                <motion.div
                  key="pin-view"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18 }}
                  className="p-7"
                >
                  <div className="flex flex-col items-center text-center mb-6">
                    <motion.div
                      animate={
                        unlockedSuccess
                          ? { scale: [1, 1.08, 1] }
                          : { scale: 1 }
                      }
                      transition={SPRING_SNAPPY}
                      className={cn(
                        "h-11 w-11 rounded-2xl border flex items-center justify-center mb-3.5 transition-colors duration-300",
                        unlockedSuccess
                          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
                          : "bg-zinc-900/[0.05] dark:bg-white/[0.07] border-zinc-200/90 dark:border-white/[0.1] text-zinc-800 dark:text-zinc-100"
                      )}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {unlockedSuccess ? (
                          <motion.span
                            key="icon-unlocked"
                            initial={{ scale: 0.5, rotate: -18, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={SPRING_SNAPPY}
                            className="flex items-center justify-center"
                          >
                            <Unlock className="h-[18px] w-[18px]" />
                          </motion.span>
                        ) : verifying ? (
                          <motion.span
                            key="icon-verifying"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center"
                          >
                            <Loader2 className="h-[18px] w-[18px] animate-spin text-indigo-500 dark:text-indigo-400" />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="icon-locked"
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                            className="flex items-center justify-center"
                          >
                            <Lock className="h-[18px] w-[18px]" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    <h2 className="text-[15px] font-semibold text-zinc-950 dark:text-white tracking-tight">
                      {unlockedSuccess
                        ? "验证通过"
                        : `输入 ${effectivePinLen} 位 PIN 码`}
                    </h2>
                  </div>

                  <div className="py-1">
                    <PinSlotInput
                      length={effectivePinLen}
                      value={pin}
                      onChange={(next) => {
                        setPin(next);
                        if (error) setError("");
                      }}
                      onComplete={handlePinComplete}
                      disabled={verifying}
                      verified={unlockedSuccess}
                      verifiedLabel="已解锁"
                      hasError={Boolean(error)}
                      autoFocus={locked && view === "pin"}
                      focusNonce={focusNonce}
                      size="lg"
                      inputRef={pinRef}
                    />
                  </div>

                  {/* Reserved status slot to prevent layout shift */}
                  <div className="h-6 mt-2.5 flex items-center justify-center">
                    {unlockedSuccess ? null : verifying ? (
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                        验证中...
                      </span>
                    ) : error ? (
                      <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                        {error}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 pt-4 border-t border-zinc-200/80 dark:border-white/[0.08] flex justify-center">
                    <button
                      type="button"
                      disabled={unlockedSuccess}
                      onClick={() => {
                        setView("recovery");
                        setError("");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-35 transition"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>管理员密码解锁</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key="recovery-view"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleAdminRecovery}
                  className="p-7 space-y-4"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setView("pin");
                      setError("");
                    }}
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>返回</span>
                  </button>

                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[15px] font-semibold text-zinc-950 dark:text-white tracking-tight">
                      管理员解锁
                    </h2>
                    {username && (
                      <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                        {username}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      ref={adminInputRef}
                      type={showAdminPwd ? "text" : "password"}
                      required
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="请输入管理员密码"
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-white/[0.12] bg-zinc-50/70 dark:bg-white/[0.04] text-zinc-900 dark:text-white placeholder-zinc-400 focus:bg-white dark:focus:bg-white/[0.06] focus:outline-none focus:border-zinc-400 dark:focus:border-indigo-400/70 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                    >
                      {showAdminPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Recovery Action Options */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      解锁后操作
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-zinc-100/90 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.07]">
                      {(
                        [
                          { id: "unlock_only", label: "仅解锁" },
                          { id: "reset_pin", label: "重设 PIN" },
                          { id: "disable_lock", label: "关闭应用锁" },
                        ] as const
                      ).map((opt) => {
                        const active = recoveryAction === opt.id;
                        return (
                          <motion.button
                            key={opt.id}
                            type="button"
                            whileTap={TAP_SCALE_SUBTLE}
                            onClick={() => {
                              setRecoveryAction(opt.id);
                              setError("");
                            }}
                            className={cn(
                              "relative py-1.5 px-2 rounded-lg text-[11.5px] font-medium transition-colors",
                              active
                                ? "text-zinc-950 dark:text-white"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                            )}
                          >
                            {active && (
                              <motion.span
                                layoutId="recovery-action-pill"
                                transition={SPRING_SNAPPY}
                                className="absolute inset-0 rounded-lg bg-white dark:bg-white/[0.12] shadow-tactile"
                              />
                            )}
                            <span className="relative z-10">{opt.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {recoveryAction === "reset_pin" && (
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                        新 PIN 码
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={newPin}
                        onChange={(e) => {
                          setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                          if (error) setError("");
                        }}
                        placeholder="4~6 位数字"
                        className="w-full px-3.5 py-2 text-sm font-mono tracking-widest rounded-xl border border-zinc-200 dark:border-white/[0.12] bg-zinc-50/70 dark:bg-white/[0.04] text-zinc-900 dark:text-white placeholder-zinc-400 focus:bg-white dark:focus:bg-white/[0.06] focus:outline-none focus:border-zinc-400 dark:focus:border-indigo-400/70 transition"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3 py-2 text-center">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={verifying || !adminPassword}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-45 text-white dark:text-zinc-950 text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-hairline transition"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    <span>{verifying ? "验证中..." : "解锁"}</span>
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ============================================================================
 * 4. First-Time Close Window Prompt Modal (Tray / Menu Bar vs Exit)
 * ========================================================================== */

interface CloseActionPromptModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (action: "minimize_to_tray" | "exit", remember: boolean) => void;
}

export const CloseActionPromptModal: React.FC<CloseActionPromptModalProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  const mac = useMemo(() => isMacPlatform(), []);
  const [selected, setSelected] = useState<"minimize_to_tray" | "exit">("minimize_to_tray");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected("minimize_to_tray");
    setRemember(true);
    setSubmitting(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(selected, remember);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      zIndexClass="z-[130]"
      panelClassName="w-full max-w-[420px]"
    >
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/55 dark:bg-white/[0.015] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                关闭窗口
              </h2>
              <button
                type="button"
                onClick={onCancel}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {/* Option 1: Minimize to Tray / Menu Bar */}
              <motion.button
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                transition={SPRING_SNAPPY}
                onClick={() => setSelected("minimize_to_tray")}
                className={cn(
                  "w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3",
                  selected === "minimize_to_tray"
                    ? "border-zinc-900 dark:border-white/70 bg-zinc-50/90 dark:bg-white/[0.06] ring-1 ring-zinc-900/10 dark:ring-white/15 shadow-tactile"
                    : "border-zinc-200/95 dark:border-white/[0.08] hover:bg-zinc-50/70 dark:hover:bg-white/[0.03]"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    selected === "minimize_to_tray"
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-hairline"
                      : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  <MonitorDown className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                    {mac ? "最小化到菜单栏" : "最小化到托盘"}
                  </span>
                  <InfoTip
                    content={
                      mac
                        ? "隐藏主窗口并在顶部菜单栏常驻，保持登录与定时提醒；点击菜单栏或 Dock 图标可随时打开。"
                        : "隐藏主窗口并在任务栏右下角常驻，保持登录与定时提醒；点击托盘图标可随时打开。"
                    }
                  />
                </div>
              </motion.button>

              {/* Option 2: Exit Application */}
              <motion.button
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                transition={SPRING_SNAPPY}
                onClick={() => setSelected("exit")}
                className={cn(
                  "w-full text-left px-3.5 py-3 rounded-xl border transition-all flex items-center gap-3",
                  selected === "exit"
                    ? "border-zinc-900 dark:border-white/70 bg-zinc-50/90 dark:bg-white/[0.06] ring-1 ring-zinc-900/10 dark:ring-white/15 shadow-tactile"
                    : "border-zinc-200/95 dark:border-white/[0.08] hover:bg-zinc-50/70 dark:hover:bg-white/[0.03]"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    selected === "exit"
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-hairline"
                      : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  <Power className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                    直接退出
                  </div>
                </div>
              </motion.button>

              {/* Remember Checkbox */}
              <div className="flex items-center gap-2 pt-1.5">
                <PrecisionCheckbox
                  checked={remember}
                  onChange={setRemember}
                  label={
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      记住选择
                    </span>
                  }
                />
                <InfoTip content="下次关闭不再询问，可随时在「设置 → 窗口与托盘」修改。" />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3">
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] shadow-tactile text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                >
                  取消
                </motion.button>
                <motion.button
                  type="button"
                  disabled={submitting}
                  whileTap={submitting ? undefined : TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={handleConfirm}
                  className="btn-sheen px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary transition-colors"
                >
                  确定
                </motion.button>
              </div>
            </div>
    </ModalShell>
  );
};
