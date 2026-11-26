import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  RotateCcw,
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
import {
  OpticalStartupCanvas,
  type OpticalStartupHandle,
} from "@/components/ui/OpticalStartupCanvas";
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
      barColor: "bg-white/10",
      textColor: "text-zinc-500",
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
  const map: Record<
    number,
    { label: string; barColor: string; textColor: string }
  > = {
    1: {
      label: "较弱",
      barColor: "bg-rose-400/85",
      textColor: "text-rose-300",
    },
    2: {
      label: "标准",
      barColor: "bg-amber-300/85",
      textColor: "text-amber-200",
    },
    3: {
      label: "良好",
      barColor: "bg-[#dcd3f2]",
      textColor: "text-[#e5ddf7]",
    },
    4: {
      label: "高强度",
      barColor: "bg-emerald-300/85",
      textColor: "text-emerald-200",
    },
  };
  const clamped = Math.max(1, Math.min(4, score));
  return { score: clamped, ...map[clamped] };
}

/**
 * Sculpted Titanium-Obsidian Emblem with Pearl, Champagne & Misty-Lavender Micro-Prism Arc
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
      initial={{ opacity: 0, scale: 0.62, filter: "blur(12px)" }}
      animate={
        revealed
          ? { opacity: 1, scale: 1, filter: "blur(0px)" }
          : { opacity: 0, scale: 0.62, filter: "blur(12px)" }
      }
      transition={{ duration: 0.82, ease: EASE_PRECISION }}
      className={cn(
        "relative flex items-center justify-center shrink-0 rounded-full",
        compact ? "h-10 w-10" : "h-[92px] w-[92px]"
      )}
    >
      {/* Whisper-soft pearl / champagne / lavender ambient halo */}
      {!compact && (
        <motion.div
          animate={{ opacity: [0.24, 0.44, 0.24], scale: [0.96, 1.04, 0.96] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -inset-4 rounded-full bg-gradient-to-tr from-[#f6e8d5]/20 via-white/15 to-[#e5ddf4]/20 blur-xl pointer-events-none"
        />
      )}

      {/* Brushed Dark Titanium Outer Bezel */}
      <div
        className={cn(
          "relative z-10 h-full w-full rounded-full bg-gradient-to-b from-[#202026] via-[#131317] to-[#0b0b0e] border border-white/[0.14] flex items-center justify-center",
          compact
            ? "shadow-[0_4px_12px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]"
            : "shadow-[0_20px_48px_-12px_rgba(0,0,0,0.82),0_0_28px_-8px_rgba(247,240,230,0.14),inset_0_1.5px_0_rgba(255,255,255,0.22)]"
        )}
      >
        <div
          className={cn(
            "rounded-full bg-gradient-to-b from-[#0d0d10] to-[#15151a] border border-white/[0.07] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] flex items-center justify-center",
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
                id={`prismArc-${compact ? "c" : "h"}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#FAF7F2" stopOpacity="0.95" />
                <stop offset="52%" stopColor="#F5E6D3" stopOpacity="0.88" />
                <stop offset="100%" stopColor="#E3DBF4" stopOpacity="0.82" />
              </linearGradient>
            </defs>

            <motion.circle
              cx="60"
              cy="60"
              r="46"
              stroke={`url(#prismArc-${compact ? "c" : "h"})`}
              strokeWidth={compact ? "2.5" : "1.85"}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={
                revealed
                  ? { pathLength: 0.78, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{ duration: 0.88, delay: 0.08, ease: EASE_PRECISION }}
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
                    t.major
                      ? "rgba(244, 244, 245, 0.72)"
                      : "rgba(161, 161, 170, 0.22)"
                  }
                  strokeWidth={t.major ? "1.6" : "1"}
                  strokeLinecap="round"
                  transform={`rotate(${t.deg} 60 60)`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: revealed ? 1 : 0 }}
                  transition={{ duration: 0.24, delay: 0.12 + t.idx * 0.011 }}
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
                  delay: compact ? 0.04 : 0.18,
                  type: "spring",
                  stiffness: 92,
                  damping: 14,
                  mass: 0.92,
                },
                opacity: { delay: compact ? 0 : 0.12, duration: 0.28 },
              }}
            >
              <line
                x1="60"
                y1="65"
                x2="60"
                y2="26"
                stroke="#FAF9F6"
                strokeWidth={compact ? "3.2" : "2.3"}
                strokeLinecap="round"
              />
              <circle
                cx="60"
                cy="26"
                r={compact ? "3.1" : "2.5"}
                fill="#F3E3CE"
              />
            </motion.g>

            <circle
              cx="60"
              cy="60"
              r={compact ? "5.2" : "4.5"}
              fill="#111115"
              stroke="#F4F4F5"
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
  const canvasRef = useRef<OpticalStartupHandle | null>(null);
  const revealStageRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearIntroTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const scheduleIntroTimeline = useCallback(() => {
    clearIntroTimers();
    const tSkip = window.setTimeout(() => setShowSkip(true), 620);
    // Central vertical slit parts into prism bars -> emblem emerges at center
    const tEmblem = window.setTimeout(() => setEmblemReady(true), 860);
    // Spectral rush settles into serene Gradient Bars -> title focuses in
    const tTitle = window.setTimeout(() => {
      setTitleReady(true);
      setStage((prev) => (prev === "intro" ? "welcome" : prev));
    }, 1680);
    // Primary pearl CTA button floats in
    const tAction = window.setTimeout(() => setActionReady(true), 2180);

    timersRef.current = [tSkip, tEmblem, tTitle, tAction];
  }, [clearIntroTimers]);

  useEffect(() => {
    scheduleIntroTimeline();
    return clearIntroTimers;
  }, [scheduleIntroTimeline, clearIntroTimers]);

  const handleSkipIntro = () => {
    clearIntroTimers();
    if (revealStageRef.current) {
      revealStageRef.current.style.maskImage = "";
      revealStageRef.current.style.webkitMaskImage = "";
    }
    setEmblemReady(true);
    setTitleReady(true);
    setActionReady(true);
    setStage("welcome");
  };

  const handleReplayIntro = () => {
    clearIntroTimers();
    setShowSkip(false);
    setEmblemReady(false);
    setTitleReady(false);
    setActionReady(false);
    setStage("intro");
    canvasRef.current?.replay();
    scheduleIntroTimeline();
  };

  // Gentle harmonic light wave ripple across vertical bars on empty stage click
  const handleStageBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (stage === "setup" || stage === "complete") return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, label, form, a")) return;
    canvasRef.current?.flash(
      e.clientX / Math.max(1, window.innerWidth),
      e.clientY / Math.max(1, window.innerHeight)
    );
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
      }, 1200);
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
      transition={{ duration: 0.55, ease: EASE_PRECISION }}
      onClick={handleStageBackgroundClick}
      className="dark fixed inset-0 z-[120] bg-[#09090b] text-zinc-100 overflow-hidden select-none flex items-center justify-center p-6"
    >
      {/* Pure WebGL Micro-Prism Vertical Slit-Split & Gradient Bars Stage */}
      <OpticalStartupCanvas
        ref={canvasRef}
        phase={stage}
        revealTargetRef={revealStageRef}
      />

      {/* Top-Right Discreet Skip / Replay Controls */}
      <AnimatePresence mode="wait">
        {stage === "intro" && showSkip ? (
          <motion.button
            key="skip-btn"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.78 }}
            whileHover={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            onClick={handleSkipIntro}
            className="fixed top-7 right-7 z-30 px-2.5 py-1 rounded-full bg-[#0c0c0f]/75 backdrop-blur-md border border-white/[0.1] text-xs font-medium text-zinc-300 hover:text-white hover:border-white/[0.22] transition-colors cursor-pointer"
          >
            跳过
          </motion.button>
        ) : stage === "welcome" && actionReady ? (
          <motion.button
            key="replay-btn"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.65 }}
            whileHover={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={handleReplayIntro}
            title="重播开场光幕动画"
            className="fixed top-7 right-7 z-30 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0c0c0f]/75 backdrop-blur-md border border-white/[0.1] text-[11.5px] font-medium text-zinc-300 hover:text-white hover:border-white/[0.22] transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>重播开场</span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Main Centered Stage (Revealed horizontally from center as vertical light bars part) */}
      <div
        ref={revealStageRef}
        className="relative z-10 w-full max-w-[440px] flex items-center justify-center"
      >
        <AnimatePresence mode="wait">
          {stage === "intro" || stage === "welcome" ? (
            /* --- PRISM SLIT INTRO -> MINIMALIST VELVET WELCOME --- */
            <motion.div
              key="minimal-welcome"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
              transition={SPRING_SMOOTH}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ y: 70 }}
                animate={{ y: titleReady ? 0 : 70 }}
                transition={SPRING_GENTLE}
              >
                <LuminousEmblem revealed={emblemReady} />
              </motion.div>

              <div className="h-[152px] flex flex-col items-center justify-start pt-5">
                {titleReady && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, ease: EASE_PRECISION }}
                      className="mb-2 text-[11px] font-mono tracking-[0.22em] text-zinc-400/85 uppercase"
                    >
                      {docCode || "JSSK-MPR-170"}
                    </motion.div>

                    <BlurText
                      as="h1"
                      text={docTitle || "监视与测量管理台账"}
                      delay={0.04}
                      stagger={0.03}
                      className="text-[24px] sm:text-[27px] font-semibold tracking-tight text-[#faf9f6] leading-snug"
                    />
                  </>
                )}

                <AnimatePresence>
                  {actionReady && (
                    <motion.div
                      key="welcome-cta"
                      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.6, ease: EASE_PRECISION }}
                      className="mt-6"
                    >
                      <motion.button
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={TAP_SCALE}
                        transition={SPRING_SNAPPY}
                        onClick={() => setStage("setup")}
                        className="btn-sheen group inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#f7f5f2] hover:bg-white text-zinc-950 text-[13px] font-semibold shadow-[0_0_28px_-6px_rgba(246,232,213,0.28),0_8px_20px_-6px_rgba(0,0,0,0.7)] cursor-pointer"
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
            /* --- SMOKED GLASS ACCOUNT SETUP CARD --- */
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
                  "relative rounded-[24px] bg-[#121216]/86 backdrop-blur-2xl border border-white/[0.11] shadow-[0_28px_70px_-16px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.14)] overflow-hidden",
                  shakeKey > 0 && error && "animate-shake"
                )}
              >
                <BorderBeam
                  duration={11}
                  colorFrom="rgba(246, 232, 213, 0.46)"
                  colorTo="rgba(227, 219, 244, 0.40)"
                />

                <form
                  onSubmit={handleSubmit}
                  className="relative z-10 p-7 space-y-4"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 pb-1">
                    <div className="flex items-center gap-3">
                      <LuminousEmblem revealed compact />
                      <div>
                        <h2 className="text-[16px] font-semibold text-[#faf9f6] tracking-tight">
                          创建管理员账号
                        </h2>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          配置本地台账管理权限与表单标识
                        </p>
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      onClick={() => setStage("welcome")}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.07] transition"
                      title="返回"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </motion.button>
                  </div>

                  {/* Username */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-zinc-300">
                      用户名
                    </label>
                    <div className="relative">
                      <User
                        className={cn(
                          "h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
                          focusedField === "username"
                            ? "text-[#f6e8d5]"
                            : "text-zinc-500"
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
                        className="precision-field w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-[#17171c] border border-white/[0.1] text-zinc-100 placeholder-zinc-500"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-zinc-300">密码</label>
                      <AnimatePresence mode="wait">
                        {password.length > 0 && (
                          <motion.span
                            key={strength.label}
                            initial={{ opacity: 0, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 3 }}
                            transition={{ duration: 0.16 }}
                            className={cn(
                              "text-[11px] font-medium",
                              strength.textColor
                            )}
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
                            ? "text-[#f6e8d5]"
                            : "text-zinc-500"
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
                        className="precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-[#17171c] border border-white/[0.1] text-zinc-100 placeholder-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition p-0.5 rounded-md"
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
                          className="h-1 rounded-full bg-white/[0.08] overflow-hidden"
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
                      <label className="font-medium text-zinc-300">
                        确认密码
                      </label>
                      <AnimatePresence mode="wait">
                        {passwordsMatch ? (
                          <motion.span
                            key="match"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300"
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
                            className="text-[11px] font-medium text-rose-300"
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
                            ? "text-[#f6e8d5]"
                            : "text-zinc-500"
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
                          "precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-[#17171c] border text-zinc-100 placeholder-zinc-500",
                          passwordsMismatch
                            ? "border-rose-400/65"
                            : passwordsMatch
                              ? "border-emerald-300/55"
                              : "border-white/[0.1]"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition p-0.5 rounded-md"
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
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-400 hover:text-zinc-100 transition"
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
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                            台账标题
                          </label>
                          <input
                            type="text"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="precision-field w-full px-3 py-2 text-xs rounded-xl bg-white/[0.04] focus:bg-[#17171c] border border-white/[0.1] text-zinc-100"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                            表单编号
                          </label>
                          <input
                            type="text"
                            value={docCode}
                            onChange={(e) => setDocCode(e.target.value)}
                            className="precision-field w-full px-3 py-2 text-xs font-mono rounded-xl bg-white/[0.04] focus:bg-[#17171c] border border-white/[0.1] text-zinc-100"
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
                        <div className="text-xs text-rose-200 bg-rose-500/12 border border-rose-400/28 rounded-xl px-3.5 py-2.5 font-medium">
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
                      className="btn-sheen group w-full py-2.5 px-4 rounded-xl bg-[#f7f5f2] hover:bg-white disabled:bg-white/[0.08] disabled:text-zinc-500 disabled:shadow-none text-zinc-950 text-[13px] font-semibold shadow-[0_0_24px_-6px_rgba(246,232,213,0.24),0_6px_16px_-4px_rgba(0,0,0,0.65)] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
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
            /* --- PEARL COMPLETION --- */
            <motion.div
              key="complete-stage"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={SPRING_SMOOTH}
              className="flex flex-col items-center text-center"
            >
              <div className="h-[78px] w-[78px] rounded-full bg-[#141418]/90 border border-white/[0.16] shadow-[0_0_36px_-6px_rgba(246,232,213,0.28),inset_0_1px_0_rgba(255,255,255,0.18)] flex items-center justify-center mb-5">
                <svg viewBox="0 0 80 80" className="h-14 w-14" fill="none">
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="33"
                    stroke="#F6E8D5"
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: EASE_PRECISION }}
                  />
                  <motion.path
                    d="M26 41L35.5 50.5L54.5 31"
                    stroke="#FAF9F6"
                    strokeWidth="2.8"
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
                className="text-xl font-semibold tracking-tight text-[#faf9f6]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
