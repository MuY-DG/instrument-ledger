import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  EASE_PRECISION,
  SPRING_GENTLE,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  TAP_SCALE,
} from "@/lib/motion";
import {
  BlurText,
  BorderBeam,
  Collapsible,
} from "@/components/ui/MotionPrimitives";
import { OpticalStartupCanvas } from "@/components/ui/OpticalStartupCanvas";
import type { AuthStatus } from "@/types";

interface OnboardingSetupProps {
  defaultDocTitle: string;
  defaultDocCode: string;
  onCompleted: (auth: AuthStatus) => void;
}

type Stage = "intro" | "welcome" | "setup" | "complete";

function evaluatePasswordStrength(pwd: string): {
  score: number;
  label: string;
  barColor: string;
  textColor: string;
} {
  if (!pwd) {
    return {
      score: 0,
      label: "",
      barColor: "bg-zinc-200",
      textColor: "text-zinc-400",
    };
  }
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 10) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;
  if (pwd.length >= 6 && score < 2 && (/\d/.test(pwd) || /[A-Za-z]/.test(pwd))) {
    score = 2;
  }
  const map: Record<number, { label: string; barColor: string; textColor: string }> = {
    1: { label: "较弱", barColor: "bg-rose-500", textColor: "text-rose-600" },
    2: { label: "标准", barColor: "bg-amber-500", textColor: "text-amber-600" },
    3: { label: "良好", barColor: "bg-sky-500", textColor: "text-sky-600" },
    4: { label: "高强度", barColor: "bg-emerald-500", textColor: "text-emerald-600" },
  };
  const clamped = Math.max(1, Math.min(4, score));
  return { score: clamped, ...map[clamped] };
}

/**
 * Minimalist Sculpted Ceramic Emblem — emerges directly out of the optical convergence flash (t = 1.32s)
 */
const LuminousEmblem: React.FC<{
  revealed: boolean;
  compact?: boolean;
}> = ({ revealed, compact = false }) => {
  const ticks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, idx) => ({
        idx,
        deg: (idx * 360) / 24,
        major: idx % 6 === 0,
      })),
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.42, filter: "blur(14px)" }}
      animate={
        revealed
          ? { opacity: 1, scale: 1, filter: "blur(0px)" }
          : { opacity: 0, scale: 0.42, filter: "blur(14px)" }
      }
      transition={{ duration: 0.85, ease: EASE_PRECISION }}
      className={cn(
        "relative flex items-center justify-center shrink-0 rounded-full",
        compact ? "h-10 w-10" : "h-[92px] w-[92px]"
      )}
    >
      {/* Subtle porcelain rim aura */}
      {!compact && (
        <motion.div
          animate={{ opacity: [0.35, 0.58, 0.35], scale: [0.96, 1.04, 0.96] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -inset-4 rounded-full bg-gradient-to-tr from-indigo-200/45 via-white/80 to-sky-200/40 blur-xl pointer-events-none"
        />
      )}

      {/* Ceramic Satin Disc */}
      <div
        className={cn(
          "relative z-10 h-full w-full rounded-full bg-gradient-to-b from-white via-[#fafbfd] to-[#eef1f6] border border-zinc-200/90 flex items-center justify-center",
          compact
            ? "shadow-[0_3px_10px_-3px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,1)]"
            : "shadow-[0_14px_36px_-14px_rgba(15,23,42,0.16),0_2px_6px_rgba(15,23,42,0.04),inset_0_2px_0_rgba(255,255,255,1)]"
        )}
      >
        <div
          className={cn(
            "rounded-full bg-gradient-to-b from-[#f8f9fb] to-white border border-zinc-200/65 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] flex items-center justify-center",
            compact ? "h-[32px] w-[32px]" : "h-[76px] w-[76px]"
          )}
        >
          <svg
            viewBox="0 0 120 120"
            className="h-full w-full overflow-visible"
            fill="none"
          >
            <defs>
              <linearGradient
                id={`luminousRing-${compact ? "c" : "h"}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#18181b" stopOpacity="0.82" />
                <stop offset="55%" stopColor="#4f46e5" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            <motion.circle
              cx="60"
              cy="60"
              r="46"
              stroke={`url(#luminousRing-${compact ? "c" : "h"})`}
              strokeWidth={compact ? "2.4" : "1.8"}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={
                revealed
                  ? { pathLength: 0.78, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{ duration: 0.9, delay: 0.1, ease: EASE_PRECISION }}
            />

            {!compact &&
              ticks.map((t) => (
                <motion.line
                  key={t.idx}
                  x1="60"
                  y1={t.major ? "17" : "21"}
                  x2="60"
                  y2="25"
                  stroke={
                    t.major ? "rgba(24,24,27,0.62)" : "rgba(24,24,27,0.16)"
                  }
                  strokeWidth={t.major ? "1.6" : "1"}
                  strokeLinecap="round"
                  transform={`rotate(${t.deg} 60 60)`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: revealed ? 1 : 0 }}
                  transition={{ duration: 0.25, delay: 0.15 + t.idx * 0.012 }}
                />
              ))}

            {/* Spring-damped calibration pointer */}
            <motion.g
              style={{ originX: "60px", originY: "60px" }}
              initial={{ rotate: -125, opacity: 0 }}
              animate={
                revealed
                  ? { rotate: 0, opacity: 1 }
                  : { rotate: -125, opacity: 0 }
              }
              transition={{
                rotate: {
                  delay: compact ? 0.05 : 0.22,
                  type: "spring",
                  stiffness: 88,
                  damping: 14,
                  mass: 0.95,
                },
                opacity: { delay: compact ? 0 : 0.15, duration: 0.3 },
              }}
            >
              <line
                x1="60"
                y1="65"
                x2="60"
                y2="26"
                stroke="#18181b"
                strokeWidth={compact ? "3.2" : "2.3"}
                strokeLinecap="round"
              />
              <circle cx="60" cy="26" r={compact ? "3" : "2.4"} fill="#4f46e5" />
            </motion.g>

            <circle
              cx="60"
              cy="60"
              r={compact ? "5.2" : "4.4"}
              fill="#ffffff"
              stroke="#18181b"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>
    </motion.div>
  );
};

export const OnboardingSetup: React.FC<OnboardingSetupProps> = ({
  defaultDocTitle,
  defaultDocCode,
  onCompleted,
}) => {
  const [stage, setStage] = useState<Stage>("intro");
  // Progressive choreographed beats during intro -> welcome
  const [emblemReady, setEmblemReady] = useState(false);
  const [titleReady, setTitleReady] = useState(false);
  const [actionReady, setActionReady] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  // Account setup form state (strictly empty — zero default credentials)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [docTitle, setDocTitle] = useState(
    defaultDocTitle || "监视与测量管理台账"
  );
  const [docCode, setDocCode] = useState(defaultDocCode || "JSSK-MPR-170");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [createdUser, setCreatedUser] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const usernameRef = useRef<HTMLInputElement | null>(null);

  // Pure-emptiness -> Optical VFX -> Minimalist Welcome timeline
  useEffect(() => {
    const tSkip = window.setTimeout(() => setShowSkip(true), 850);
    // Optical ribbons converge at t = 1.35s -> emblem crystallizes out of light
    const tEmblem = window.setTimeout(() => setEmblemReady(true), 1320);
    // VFX ripples settle -> minimalist title gently focuses in
    const tTitle = window.setTimeout(() => {
      setTitleReady(true);
      setStage((prev) => (prev === "intro" ? "welcome" : prev));
    }, 2280);
    // Understated action button floats in gracefully
    const tAction = window.setTimeout(() => setActionReady(true), 2820);

    return () => {
      window.clearTimeout(tSkip);
      window.clearTimeout(tEmblem);
      window.clearTimeout(tTitle);
      window.clearTimeout(tAction);
    };
  }, []);

  const handleSkipIntro = () => {
    setEmblemReady(true);
    setTitleReady(true);
    setActionReady(true);
    setStage("welcome");
  };

  // Enter shortcut once welcome CTA is ready
  useEffect(() => {
    if (stage !== "welcome" || !actionReady) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setStage("setup");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, actionReady]);

  useEffect(() => {
    if (stage !== "setup") return;
    const t = window.setTimeout(() => {
      usernameRef.current?.focus();
    }, 260);
    return () => window.clearTimeout(t);
  }, [stage]);

  const strength = useMemo(
    () => evaluatePasswordStrength(password),
    [password]
  );
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const canSubmit =
    username.trim().length >= 2 &&
    password.length >= 6 &&
    password === confirmPassword &&
    !submitting;

  const triggerError = (msg: string) => {
    setError(msg);
    setShakeKey((k) => k + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanUser = username.trim();
    if (cleanUser.length < 2) {
      triggerError("管理员用户名至少需要 2 个字符");
      return;
    }
    if (password.length < 6) {
      triggerError("管理员密码长度不能少于 6 位");
      return;
    }
    if (password !== confirmPassword) {
      triggerError("两次输入的密码不一致，请核对");
      return;
    }

    setSubmitting(true);
    try {
      const authStatus = await api.setupInitialAdmin(
        cleanUser,
        password,
        docTitle.trim() || undefined,
        docCode.trim() || undefined
      );
      setCreatedUser(authStatus.username);
      setStage("complete");
      window.setTimeout(() => {
        onCompleted(authStatus);
      }, 1150);
    } catch (err) {
      triggerError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.015, filter: "blur(10px)" }}
      transition={{ duration: 0.5, ease: EASE_PRECISION }}
      className="fixed inset-0 z-[120] bg-[#fbfbfa] text-zinc-900 overflow-hidden select-none flex items-center justify-center p-6"
    >
      {/* 60fps Light-Mode Optical Prism VFX Canvas (starts from pure nothingness) */}
      <OpticalStartupCanvas phase={stage} />

      {/* Whisper-quiet Skip control during opening VFX only */}
      <AnimatePresence>
        {stage === "intro" && showSkip && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            whileHover={{ opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={handleSkipIntro}
            className="fixed top-6 right-7 z-30 text-xs font-medium text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer"
          >
            跳过
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Centered Stage */}
      <div className="relative z-10 w-full max-w-[440px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {stage === "intro" || stage === "welcome" ? (
            /* --- PURE VFX INTRO -> SEAMLESS ULTRA-MINIMALIST WELCOME --- */
            <motion.div
              key="minimal-welcome"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
              transition={SPRING_SMOOTH}
              className="flex flex-col items-center text-center"
            >
              {/* Emblem crystallizes at exact screen center (y=66 offsets half the 132px bottom slot) and gently glides up to y=0 */}
              <motion.div
                initial={{ y: 66 }}
                animate={{ y: titleReady ? 0 : 66 }}
                transition={SPRING_GENTLE}
              >
                <LuminousEmblem revealed={emblemReady} />
              </motion.div>

              {/* Reserved minimalist title + CTA area (fixed height keeps emblem motion pure) */}
              <div className="h-[132px] flex flex-col items-center justify-start pt-5">
                {titleReady && (
                  <BlurText
                    as="h1"
                    text="监视与测量管理台账"
                    delay={0.04}
                    stagger={0.032}
                    className="text-[24px] sm:text-[26px] font-semibold tracking-tight text-zinc-900 leading-snug"
                  />
                )}

                <AnimatePresence>
                  {actionReady && (
                    <motion.div
                      key="welcome-cta"
                      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.65, ease: EASE_PRECISION }}
                      className="mt-7"
                    >
                      <motion.button
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={TAP_SCALE}
                        transition={SPRING_SNAPPY}
                        onClick={() => setStage("setup")}
                        className="btn-sheen group inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-medium shadow-tactile-primary cursor-pointer"
                      >
                        <span>开始使用</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : stage === "setup" ? (
            /* --- MINIMALIST PORCELAIN ACCOUNT SETUP CARD --- */
            <motion.div
              key="setup-card-stage"
              initial={{ opacity: 0, y: 20, scale: 0.98, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              transition={SPRING_SMOOTH}
              className="w-full"
            >
              <div
                key={shakeKey}
                className={cn(
                  "relative rounded-[24px] bg-white border border-zinc-200/90 shadow-ceramic overflow-hidden",
                  shakeKey > 0 && error && "animate-shake"
                )}
              >
                <BorderBeam
                  duration={11}
                  colorFrom="rgba(79, 70, 229, 0.36)"
                  colorTo="rgba(14, 165, 233, 0.3)"
                />

                <form onSubmit={handleSubmit} className="relative z-10 p-7 space-y-4">
                  {/* Minimal Header */}
                  <div className="flex items-center justify-between gap-3 pb-1">
                    <div className="flex items-center gap-3">
                      <LuminousEmblem revealed compact />
                      <h2 className="text-[16px] font-semibold text-zinc-950 tracking-tight">
                        创建管理员账号
                      </h2>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      onClick={() => setStage("welcome")}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition"
                      title="返回"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </motion.button>
                  </div>

                  {/* Username */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-zinc-600">
                      用户名
                    </label>
                    <div className="relative">
                      <User
                        className={cn(
                          "h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
                          focusedField === "username"
                            ? "text-zinc-900"
                            : "text-zinc-400"
                        )}
                      />
                      <input
                        ref={usernameRef}
                        type="text"
                        required
                        minLength={2}
                        maxLength={32}
                        autoComplete="username"
                        value={username}
                        onFocus={() => setFocusedField("username")}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          setError("");
                        }}
                        placeholder="2–32 个字符"
                        className="precision-field w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-[#fafafa] hover:bg-white focus:bg-white border border-zinc-200/95 text-zinc-900 placeholder-zinc-400"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-zinc-600">密码</label>
                      <AnimatePresence mode="wait">
                        {password.length > 0 && (
                          <motion.span
                            key={strength.label}
                            initial={{ opacity: 0, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 3 }}
                            transition={{ duration: 0.16 }}
                            className={cn("text-[11px] font-medium", strength.textColor)}
                          >
                            {strength.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="relative">
                      <Lock
                        className={cn(
                          "h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
                          focusedField === "password"
                            ? "text-zinc-900"
                            : "text-zinc-400"
                        )}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        placeholder="至少 6 位"
                        className="precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-[#fafafa] hover:bg-white focus:bg-white border border-zinc-200/95 text-zinc-900 placeholder-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-800 transition p-0.5 rounded-md"
                        tabIndex={-1}
                        aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {[1, 2, 3, 4].map((seg) => (
                        <div
                          key={seg}
                          className="h-1 rounded-full bg-zinc-200/80 overflow-hidden"
                        >
                          <motion.div
                            initial={false}
                            animate={{
                              scaleX:
                                password.length > 0 && seg <= strength.score
                                  ? 1
                                  : 0,
                            }}
                            transition={SPRING_SNAPPY}
                            style={{ originX: 0 }}
                            className={cn(
                              "h-full w-full rounded-full transition-colors duration-200",
                              strength.barColor
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-zinc-600">确认密码</label>
                      <AnimatePresence mode="wait">
                        {passwordsMatch ? (
                          <motion.span
                            key="match"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"
                          >
                            <Check className="h-3 w-3" />
                            一致
                          </motion.span>
                        ) : passwordsMismatch ? (
                          <motion.span
                            key="mismatch"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="text-[11px] font-medium text-rose-600"
                          >
                            不一致
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </div>
                    <div className="relative">
                      <Lock
                        className={cn(
                          "h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
                          focusedField === "confirm"
                            ? "text-zinc-900"
                            : "text-zinc-400"
                        )}
                      />
                      <input
                        type={showConfirm ? "text" : "password"}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onFocus={() => setFocusedField("confirm")}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError("");
                        }}
                        placeholder="再次输入密码"
                        className={cn(
                          "precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-[#fafafa] hover:bg-white focus:bg-white border text-zinc-900 placeholder-zinc-400",
                          passwordsMismatch
                            ? "border-rose-400/80"
                            : passwordsMatch
                              ? "border-emerald-400/80"
                              : "border-zinc-200/95"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-800 transition p-0.5 rounded-md"
                        tabIndex={-1}
                        aria-label={showConfirm ? "隐藏确认密码" : "显示确认密码"}
                      >
                        {showConfirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Optional Ledger Identity */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-400 hover:text-zinc-800 transition"
                    >
                      <motion.span
                        animate={{ rotate: showAdvanced ? 180 : 0 }}
                        transition={SPRING_SNAPPY}
                        className="flex items-center"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </motion.span>
                      <span>台账信息（可选）</span>
                    </button>

                    <Collapsible open={showAdvanced}>
                      <div className="grid grid-cols-5 gap-2.5 pt-3">
                        <div className="col-span-3">
                          <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                            台账标题
                          </label>
                          <input
                            type="text"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="precision-field w-full px-3 py-2 text-xs rounded-xl bg-[#fafafa] focus:bg-white border border-zinc-200/90 text-zinc-900"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                            表单编号
                          </label>
                          <input
                            type="text"
                            value={docCode}
                            onChange={(e) => setDocCode(e.target.value)}
                            className="precision-field w-full px-3 py-2 text-xs font-mono rounded-xl bg-[#fafafa] focus:bg-white border border-zinc-200/90 text-zinc-900"
                          />
                        </div>
                      </div>
                    </Collapsible>
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        transition={SPRING_SNAPPY}
                        className="overflow-hidden"
                      >
                        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200/90 rounded-xl px-3.5 py-2.5 font-medium">
                          {error}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <div className="pt-1">
                    <motion.button
                      type="submit"
                      disabled={!canSubmit}
                      whileHover={canSubmit ? { y: -1 } : undefined}
                      whileTap={canSubmit ? TAP_SCALE : undefined}
                      transition={SPRING_SNAPPY}
                      className="btn-sheen group w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none text-white text-[13px] font-semibold shadow-tactile-primary inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>{submitting ? "正在初始化..." : "完成并进入"}</span>
                      {!submitting && (
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      )}
                    </motion.button>
                  </div>
                </form>
              </div>
            </motion.div>
          ) : (
            /* --- MINIMALIST COMPLETION --- */
            <motion.div
              key="complete-stage"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={SPRING_SMOOTH}
              className="flex flex-col items-center text-center"
            >
              <div className="h-[76px] w-[76px] rounded-full bg-white border border-emerald-200/90 shadow-ceramic flex items-center justify-center mb-5">
                <svg viewBox="0 0 80 80" className="h-14 w-14" fill="none">
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="33"
                    stroke="#10b981"
                    strokeWidth="2.2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: EASE_PRECISION }}
                  />
                  <motion.path
                    d="M26 41L35.5 50.5L54.5 31"
                    stroke="#059669"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      delay: 0.22,
                      duration: 0.34,
                      ease: EASE_PRECISION,
                    }}
                  />
                </svg>
              </div>

              <BlurText
                as="h2"
                text={`你好，${createdUser}`}
                delay={0.14}
                stagger={0.035}
                className="text-xl font-semibold tracking-tight text-zinc-900"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
