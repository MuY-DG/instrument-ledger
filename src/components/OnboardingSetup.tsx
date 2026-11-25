import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  SkipForward,
  Sparkles,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthStatus } from "@/types";

interface OnboardingSetupProps {
  defaultDocTitle: string;
  defaultDocCode: string;
  onCompleted: (auth: AuthStatus) => void;
}

type Stage = "intro" | "morph" | "setup" | "complete";

const EASE_PRECISION: [number, number, number, number] = [0.16, 1, 0.3, 1];

function evaluatePasswordStrength(pwd: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!pwd) return { score: 0, label: "", color: "bg-zinc-800" };
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 10) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;
  if (pwd.length >= 6 && score < 2 && (/\d/.test(pwd) || /[A-Za-z]/.test(pwd))) {
    score = 2;
  }
  const map: Record<number, { label: string; color: string }> = {
    1: { label: "较弱", color: "bg-rose-500" },
    2: { label: "标准", color: "bg-amber-400" },
    3: { label: "良好", color: "bg-sky-400" },
    4: { label: "高强度", color: "bg-emerald-400" },
  };
  const hit = map[Math.max(1, Math.min(4, score))];
  return { score: Math.max(1, Math.min(4, score)), ...hit };
}

/** Custom SVG precision vernier gauge emblem that self-draws on first launch */
const PrecisionEmblem: React.FC<{ compact: boolean }> = ({ compact }) => {
  const ticks = useMemo(() => {
    return Array.from({ length: 24 }, (_, idx) => {
      const deg = (idx * 360) / 24;
      const major = idx % 6 === 0;
      return { deg, major, idx };
    });
  }, []);

  return (
    <motion.div
      layout
      transition={{ duration: 0.9, ease: EASE_PRECISION }}
      className={cn(
        "relative flex items-center justify-center shrink-0",
        compact ? "h-14 w-14" : "h-28 w-28"
      )}
    >
      {/* Subtle luminous calibration halo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.65 }}
        animate={{
          opacity: compact ? [0.18, 0.28, 0.18] : [0, 0.45, 0.25],
          scale: compact ? 1 : [0.7, 1.15, 1.0],
        }}
        transition={{
          duration: compact ? 4 : 2.1,
          repeat: compact ? Infinity : 0,
          ease: "easeInOut",
        }}
        className="absolute inset-0 rounded-full bg-indigo-500/25 blur-2xl pointer-events-none"
      />

      {/* Sonar zero-calibration pulse ring */}
      {!compact && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: [0, 0.55, 0], scale: [0.85, 1.48, 1.7] }}
          transition={{ delay: 1.35, duration: 1.1, ease: "easeOut" }}
          className="absolute inset-1 rounded-full border border-indigo-400/50 pointer-events-none"
        />
      )}

      <svg
        viewBox="0 0 120 120"
        className="relative z-10 h-full w-full overflow-visible"
        fill="none"
      >
        <defs>
          <linearGradient id="precisionRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="needleGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#f4f4f5" />
          </linearGradient>
        </defs>

        {/* Outer technical hairline ring */}
        <motion.circle
          cx="60"
          cy="60"
          r="54"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: EASE_PRECISION }}
        />

        {/* Illuminated precision sweep arc */}
        <motion.circle
          cx="60"
          cy="60"
          r="46"
          stroke="url(#precisionRingGrad)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray="289"
          transform="rotate(-90 60 60)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.25, delay: 0.12, ease: EASE_PRECISION }}
        />

        {/* Vernier graduation ticks */}
        {ticks.map((t) => (
          <motion.line
            key={t.idx}
            x1="60"
            y1={t.major ? "15" : "18"}
            x2="60"
            y2="23"
            stroke={t.major ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)"}
            strokeWidth={t.major ? "1.5" : "1"}
            strokeLinecap="round"
            transform={`rotate(${t.deg} 60 60)`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.25 + t.idx * 0.025 }}
          />
        ))}

        {/* Inner reticle circle */}
        <motion.circle
          cx="60"
          cy="60"
          r="26"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="1"
          strokeDasharray="3 3"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.45, ease: EASE_PRECISION }}
        />

        {/* Calibration needle sweeping into 0.00 zero alignment */}
        <motion.g
          style={{ originX: "60px", originY: "60px" }}
          initial={{ rotate: -135, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{
            rotate: { delay: 0.55, type: "spring", stiffness: 76, damping: 14, mass: 1.05 },
            opacity: { delay: 0.5, duration: 0.35 },
          }}
        >
          <line
            x1="60"
            y1="66"
            x2="60"
            y2="24"
            stroke="url(#needleGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="60" cy="24" r="2.2" fill="#38bdf8" />
        </motion.g>

        {/* Precision pivot */}
        <motion.circle
          cx="60"
          cy="60"
          r="4.5"
          fill="#09090b"
          stroke="#e4e4e7"
          strokeWidth="1.8"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.45, type: "spring", stiffness: 220, damping: 18 }}
        />
      </svg>
    </motion.div>
  );
};

export const OnboardingSetup: React.FC<OnboardingSetupProps> = ({
  defaultDocTitle,
  defaultDocCode,
  onCompleted,
}) => {
  const [stage, setStage] = useState<Stage>("intro");
  const [showSkip, setShowSkip] = useState(false);

  // Account setup form state (strictly empty — no default account!)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [docTitle, setDocTitle] = useState(defaultDocTitle || "监视与测量管理台账");
  const [docCode, setDocCode] = useState(defaultDocCode || "JSSK-MPR-170");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdUser, setCreatedUser] = useState("");

  const usernameRef = useRef<HTMLInputElement | null>(null);

  // Orchestrated 3-Act Opening Timeline
  useEffect(() => {
    const skipTimer = window.setTimeout(() => setShowSkip(true), 650);
    const morphTimer = window.setTimeout(() => {
      setStage((prev) => (prev === "intro" ? "morph" : prev));
    }, 2500);
    const setupTimer = window.setTimeout(() => {
      setStage((prev) => (prev === "intro" || prev === "morph" ? "setup" : prev));
    }, 3250);

    return () => {
      window.clearTimeout(skipTimer);
      window.clearTimeout(morphTimer);
      window.clearTimeout(setupTimer);
    };
  }, []);

  useEffect(() => {
    if (stage === "setup") {
      const focusTimer = window.setTimeout(() => {
        usernameRef.current?.focus();
      }, 850);
      return () => window.clearTimeout(focusTimer);
    }
  }, [stage]);

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const canSubmit =
    username.trim().length >= 2 &&
    password.length >= 6 &&
    password === confirmPassword &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanUser = username.trim();
    if (cleanUser.length < 2) {
      setError("管理员用户名至少需要 2 个字符");
      return;
    }
    if (password.length < 6) {
      setError("管理员密码长度不能少于 6 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致，请核对");
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
      setError(String(err));
      setSubmitting(false);
    }
  };

  const isHeaderDocked = stage === "morph" || stage === "setup";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.025, filter: "blur(12px)" }}
      transition={{ duration: 0.65, ease: EASE_PRECISION }}
      className="fixed inset-0 z-[120] bg-[#09090b] text-zinc-100 overflow-hidden select-none flex flex-col items-center justify-center p-6"
    >
      {/* Precision Architectural Background */}
      <div className="absolute inset-0 bg-precision-grid-fine pointer-events-none" />
      <div className="absolute inset-0 bg-precision-grid pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 72% 58% at 50% 42%, rgba(99, 102, 241, 0.14) 0%, rgba(56, 189, 248, 0.04) 40%, rgba(9, 9, 11, 0.92) 78%)",
        }}
      />

      {/* Ambient slow-drifting aurora highlight */}
      <motion.div
        animate={{
          x: [-24, 24, -24],
          y: [-16, 18, -16],
          opacity: [0.35, 0.55, 0.35],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[340px] rounded-full bg-indigo-500/15 blur-[120px] pointer-events-none"
      />

      {/* Subtle Corner Technical Coordinates */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.9 }}
        className="absolute top-6 left-7 font-mono text-[10px] tracking-[0.18em] text-zinc-500/80 uppercase hidden sm:block"
      >
        <div>INSTRUMENT.LEDGER // v1.1.0</div>
        <div className="text-zinc-600 mt-0.5">LOCAL VAULT · ARGON2ID + SQLITE</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.9 }}
        className="absolute bottom-6 left-7 font-mono text-[10px] tracking-[0.16em] text-zinc-600 hidden sm:block"
      >
        ZERO DEFAULT CREDENTIALS · OFFLINE FIRST
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.9 }}
        className="absolute bottom-6 right-7 font-mono text-[10px] tracking-[0.16em] text-zinc-600 hidden sm:block"
      >
        STD // {docCode || "JSSK-MPR-170"}
      </motion.div>

      {/* Skip Intro Shortcut */}
      <AnimatePresence>
        {stage === "intro" && showSkip && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            onClick={() => setStage("setup")}
            className="absolute top-6 right-7 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[11px] text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
          >
            <span>跳过开场</span>
            <SkipForward className="h-3 w-3" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Center Stage Content */}
      <div className="relative z-10 w-full max-w-[460px] flex flex-col items-center">
        <AnimatePresence mode="wait">
          {stage === "complete" ? (
            /* --- ACT 4: COMPLETION MORPH --- */
            <motion.div
              key="complete-stage"
              initial={{ opacity: 0, scale: 0.92, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.55, ease: EASE_PRECISION }}
              className="flex flex-col items-center text-center py-10"
            >
              <div className="relative h-20 w-20 flex items-center justify-center mb-6">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1.35, opacity: [0, 0.4, 0] }}
                  transition={{ duration: 1.0, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full bg-emerald-400/30 blur-xl"
                />
                <svg viewBox="0 0 80 80" className="h-20 w-20" fill="none">
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="35"
                    stroke="#34d399"
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.55, ease: EASE_PRECISION }}
                  />
                  <motion.path
                    d="M25 41.5L35.5 51.5L56 30"
                    stroke="#34d399"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.28, duration: 0.42, ease: EASE_PRECISION }}
                  />
                </svg>
              </div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.45 }}
                className="text-xl font-semibold tracking-tight text-white"
              >
                初始化完成，欢迎 {createdUser}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.45 }}
                className="text-xs text-zinc-400 mt-2 tracking-wide"
              >
                本地安全库已就绪，正在进入监视与测量台账工作台...
              </motion.p>
            </motion.div>
          ) : (
            /* --- ACTS 1 -> 2 -> 3: INTRO + SPATIAL MORPH + GRADUAL ACCOUNT SETUP --- */
            <motion.div
              key="onboarding-stage"
              layout
              className="w-full flex flex-col items-center"
            >
              {/* Brand Emblem + Headline (Smoothly morphs from hero center to compact header) */}
              <motion.div
                layout
                transition={{ duration: 0.95, ease: EASE_PRECISION }}
                className={cn(
                  "flex items-center",
                  isHeaderDocked
                    ? "flex-row gap-3.5 mb-7"
                    : "flex-col text-center gap-5"
                )}
              >
                <PrecisionEmblem compact={isHeaderDocked} />

                <motion.div
                  layout
                  transition={{ duration: 0.9, ease: EASE_PRECISION }}
                  className={cn(isHeaderDocked ? "text-left" : "text-center")}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ delay: 0.42, duration: 0.75, ease: EASE_PRECISION }}
                    className={cn(
                      "inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.22em] text-indigo-300/90",
                      isHeaderDocked ? "text-[10px]" : "text-[11px] mb-2"
                    )}
                  >
                    <Sparkles className="h-3 w-3 text-indigo-400" />
                    <span>PRECISION METROLOGY SUITE</span>
                  </motion.div>

                  <motion.h1
                    layout="position"
                    initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ delay: 0.62, duration: 0.85, ease: EASE_PRECISION }}
                    className={cn(
                      "font-semibold tracking-tight text-white transition-all",
                      isHeaderDocked ? "text-lg mt-0.5" : "text-[28px] leading-tight"
                    )}
                  >
                    监视与测量设备管理台账
                  </motion.h1>

                  <AnimatePresence>
                    {!isHeaderDocked && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
                        transition={{ delay: 1.05, duration: 0.75, ease: EASE_PRECISION }}
                        className="mt-3 flex flex-col items-center"
                      >
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ delay: 1.15, duration: 0.8, ease: EASE_PRECISION }}
                          className="h-px w-36 bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent mb-3.5"
                        />
                        <p className="text-xs text-zinc-400 tracking-[0.14em]">
                          精密计量 · 本地离线 · 效期智算 · 报告溯源
                        </p>

                        {/* Subtle calibration boot status pill */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.55, duration: 0.6 }}
                          className="mt-8 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-[11px] text-zinc-400"
                        >
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-400" />
                          </span>
                          <span>安装验证完成，正在准备账号初始化...</span>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>

              {/* ACT 3: Gradual Frosted Glass Account Initialization Card */}
              <AnimatePresence>
                {stage === "setup" && (
                  <motion.div
                    key="setup-card"
                    initial={{ opacity: 0, y: 30, scale: 0.965, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ duration: 0.95, ease: EASE_PRECISION }}
                    className="relative w-full rounded-2xl bg-zinc-900/70 backdrop-blur-2xl border border-white/[0.1] shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)] overflow-hidden"
                  >
                    {/* Animated Top Specular Beam */}
                    <motion.div
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ delay: 0.25, duration: 1.1, ease: EASE_PRECISION }}
                      className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-400/75 to-transparent"
                    />

                    <form onSubmit={handleSubmit} className="p-7 space-y-5">
                      {/* Card Header */}
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18, duration: 0.6, ease: EASE_PRECISION }}
                        className="space-y-1.5"
                      >
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-300">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>首次启动安全向导</span>
                        </div>
                        <h2 className="text-lg font-semibold text-white tracking-tight">
                          初始化本地管理员账号
                        </h2>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          系统不预设默认账号或初始密码。请为您本机创建专属管理员凭据，用于台账录入、报告归档、锁屏解锁及数据备份。
                        </p>
                      </motion.div>

                      {/* Field 1: Username */}
                      <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.34, duration: 0.6, ease: EASE_PRECISION }}
                        className="space-y-1.5"
                      >
                        <label className="flex items-center justify-between text-xs font-medium text-zinc-300">
                          <span>管理员用户名</span>
                          <span className="text-[11px] text-zinc-500 font-normal">
                            2–32 个字符
                          </span>
                        </label>
                        <div className="relative">
                          <User className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            ref={usernameRef}
                            type="text"
                            required
                            minLength={2}
                            maxLength={32}
                            autoComplete="username"
                            value={username}
                            onChange={(e) => {
                              setUsername(e.target.value);
                              setError("");
                            }}
                            placeholder="例如：admin、qa_lead 或您的姓名"
                            className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-white/[0.04] border border-white/[0.1] text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-400/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-indigo-500/20 transition"
                          />
                        </div>
                      </motion.div>

                      {/* Field 2: Password + Strength Bar */}
                      <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.48, duration: 0.6, ease: EASE_PRECISION }}
                        className="space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-medium text-zinc-300">设置登录密码</label>
                          {password.length > 0 && (
                            <span className="text-[11px] text-zinc-400">
                              强度：
                              <span className="text-zinc-200 font-medium">
                                {strength.label}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              setError("");
                            }}
                            placeholder="至少 6 位，建议包含字母与数字"
                            className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white/[0.04] border border-white/[0.1] text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-400/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-indigo-500/20 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition p-0.5"
                            tabIndex={-1}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {/* 4-segment precision strength indicator */}
                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          {[1, 2, 3, 4].map((seg) => (
                            <div
                              key={seg}
                              className="h-1 rounded-full bg-white/[0.07] overflow-hidden"
                            >
                              <motion.div
                                initial={false}
                                animate={{
                                  scaleX: password.length > 0 && seg <= strength.score ? 1 : 0,
                                }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                style={{ originX: 0 }}
                                className={cn("h-full w-full rounded-full", strength.color)}
                              />
                            </div>
                          ))}
                        </div>
                      </motion.div>

                      {/* Field 3: Confirm Password */}
                      <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.62, duration: 0.6, ease: EASE_PRECISION }}
                        className="space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-medium text-zinc-300">确认密码</label>
                          {passwordsMatch && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                              <Check className="h-3 w-3" />
                              密码一致
                            </span>
                          )}
                          {passwordsMismatch && (
                            <span className="text-[11px] text-rose-400">
                              两次输入不一致
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type={showConfirm ? "text" : "password"}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => {
                              setConfirmPassword(e.target.value);
                              setError("");
                            }}
                            placeholder="再次输入登录密码"
                            className={cn(
                              "w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white/[0.04] border text-white placeholder-zinc-500 focus:outline-none focus:bg-white/[0.06] focus:ring-2 transition",
                              passwordsMismatch
                                ? "border-rose-500/50 focus:border-rose-400 focus:ring-rose-500/20"
                                : passwordsMatch
                                  ? "border-emerald-500/40 focus:border-emerald-400 focus:ring-emerald-500/20"
                                  : "border-white/[0.1] focus:border-indigo-400/70 focus:ring-indigo-500/20"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition p-0.5"
                            tabIndex={-1}
                          >
                            {showConfirm ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </motion.div>

                      {/* Optional Ledger Identity Accordion */}
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.74, duration: 0.55, ease: EASE_PRECISION }}
                        className="pt-0.5"
                      >
                        <button
                          type="button"
                          onClick={() => setShowAdvanced((v) => !v)}
                          className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-200",
                              showAdvanced && "rotate-180"
                            )}
                          />
                          <span>自定义台账标题与文件编号（可选）</span>
                        </button>

                        <AnimatePresence initial={false}>
                          {showAdvanced && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: EASE_PRECISION }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-5 gap-2.5 pt-3">
                                <div className="col-span-3">
                                  <label className="block text-[11px] text-zinc-400 mb-1">
                                    台账主标题
                                  </label>
                                  <input
                                    type="text"
                                    value={docTitle}
                                    onChange={(e) => setDocTitle(e.target.value)}
                                    className="w-full px-3 py-2 text-xs rounded-lg bg-white/[0.04] border border-white/[0.09] text-zinc-100 focus:outline-none focus:border-indigo-400/70"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[11px] text-zinc-400 mb-1">
                                    表单编号
                                  </label>
                                  <input
                                    type="text"
                                    value={docCode}
                                    onChange={(e) => setDocCode(e.target.value)}
                                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white/[0.04] border border-white/[0.09] text-zinc-100 focus:outline-none focus:border-indigo-400/70"
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>

                      {/* Error Banner */}
                      <AnimatePresence>
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
                          >
                            {error}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Submit CTA */}
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.86, duration: 0.6, ease: EASE_PRECISION }}
                        className="pt-1"
                      >
                        <motion.button
                          type="submit"
                          disabled={!canSubmit}
                          whileHover={canSubmit ? { scale: 1.01 } : undefined}
                          whileTap={canSubmit ? { scale: 0.985 } : undefined}
                          className="group w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_8px_24px_-6px_rgba(255,255,255,0.28)] disabled:shadow-none transition"
                        >
                          <span>
                            {submitting ? "正在安全加密并初始化..." : "完成初始化并进入工作台"}
                          </span>
                          {!submitting && (
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          )}
                        </motion.button>
                      </motion.div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
