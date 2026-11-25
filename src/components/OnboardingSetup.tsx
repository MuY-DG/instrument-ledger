import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileCheck2,
  Lock,
  ShieldCheck,
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
import { InfoTip } from "@/components/InfoTip";
import {
  BlurText,
  BorderBeam,
  Collapsible,
  SpotlightSurface,
} from "@/components/ui/MotionPrimitives";
import type { AuthStatus } from "@/types";

interface OnboardingSetupProps {
  defaultDocTitle: string;
  defaultDocCode: string;
  onCompleted: (auth: AuthStatus) => void;
}

type Stage = "welcome" | "setup" | "complete";

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
 * Ceramic Swiss-Metrology Dial Medallion (Luminous Porcelain Light Aesthetic)
 * Crisp machined bezel, engraved ticks, and spring-damped sapphire calibration needle.
 */
const CeramicPrecisionMedallion: React.FC<{ size?: "hero" | "mini" }> = ({
  size = "hero",
}) => {
  const ticks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, idx) => ({
        idx,
        deg: (idx * 360) / 24,
        major: idx % 6 === 0,
      })),
    []
  );

  const isHero = size === "hero";

  return (
    <motion.div
      initial={isHero ? { opacity: 0, scale: 0.86 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING_GENTLE}
      className={cn(
        "relative flex items-center justify-center shrink-0 rounded-full",
        isHero ? "h-[108px] w-[108px]" : "h-11 w-11"
      )}
    >
      {/* Soft optical daylight aura */}
      {isHero && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 0.7, 0.45], scale: [0.85, 1.12, 1] }}
            transition={{ duration: 1.4, ease: EASE_PRECISION }}
            className="absolute -inset-5 rounded-full bg-gradient-to-tr from-indigo-200/50 via-white/80 to-sky-200/45 blur-2xl pointer-events-none"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: [0, 0.5, 0], scale: [0.95, 1.42, 1.62] }}
            transition={{ delay: 0.72, duration: 1.05, ease: "easeOut" }}
            className="absolute inset-0 rounded-full border border-indigo-400/35 pointer-events-none"
          />
        </>
      )}

      {/* Sculpted Porcelain Bezel */}
      <div
        className={cn(
          "relative z-10 h-full w-full rounded-full bg-gradient-to-b from-white via-[#fafbfd] to-[#eef1f6] border border-zinc-200/90 flex items-center justify-center",
          isHero
            ? "shadow-[0_14px_34px_-12px_rgba(15,23,42,0.16),0_2px_6px_rgba(15,23,42,0.05),inset_0_2px_0_rgba(255,255,255,1)]"
            : "shadow-[0_4px_12px_-4px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,1)]"
        )}
      >
        {/* Subtle inner machined recess */}
        <div
          className={cn(
            "rounded-full bg-gradient-to-b from-[#f8f9fb] to-white border border-zinc-200/70 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)] flex items-center justify-center",
            isHero ? "h-[90px] w-[90px]" : "h-[36px] w-[36px]"
          )}
        >
          <svg
            viewBox="0 0 120 120"
            className="h-full w-full overflow-visible"
            fill="none"
          >
            <defs>
              <linearGradient
                id={`ceramicRing-${size}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#18181b" stopOpacity="0.82" />
                <stop offset="55%" stopColor="#4f46e5" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.82" />
              </linearGradient>
              <linearGradient
                id={`ceramicNeedle-${size}`}
                x1="0%"
                y1="100%"
                x2="0%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#18181b" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
            </defs>

            {/* Hairline outer calibration track */}
            <motion.circle
              cx="60"
              cy="60"
              r="50"
              stroke="rgba(24,24,27,0.08)"
              strokeWidth="1"
              initial={isHero ? { pathLength: 0, opacity: 0 } : false}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.65, ease: EASE_PRECISION }}
            />

            {/* Precision sweep arc */}
            <motion.circle
              cx="60"
              cy="60"
              r="45"
              stroke={`url(#ceramicRing-${size})`}
              strokeWidth={isHero ? "1.8" : "2.4"}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              initial={isHero ? { pathLength: 0, opacity: 0 } : false}
              animate={{ pathLength: isHero ? 0.82 : 0.78, opacity: 1 }}
              transition={{ duration: 0.85, delay: 0.08, ease: EASE_PRECISION }}
            />

            {/* Etched Vernier Graduation Ticks */}
            {ticks.map((t) => (
              <motion.line
                key={t.idx}
                x1="60"
                y1={t.major ? "16" : "20"}
                x2="60"
                y2="25"
                stroke={
                  t.major ? "rgba(24,24,27,0.68)" : "rgba(24,24,27,0.18)"
                }
                strokeWidth={t.major ? (isHero ? "1.6" : "2.2") : "1"}
                strokeLinecap="round"
                transform={`rotate(${t.deg} 60 60)`}
                initial={isHero ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.28, delay: 0.14 + t.idx * 0.015 }}
              />
            ))}

            {/* Inner hairline reticle */}
            <circle
              cx="60"
              cy="60"
              r="25"
              stroke="rgba(24,24,27,0.07)"
              strokeWidth="1"
              strokeDasharray="2.5 3"
            />

            {/* Spring-damped calibration pointer */}
            <motion.g
              style={{ originX: "60px", originY: "60px" }}
              initial={isHero ? { rotate: -115, opacity: 0 } : { rotate: -35 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{
                rotate: {
                  delay: isHero ? 0.28 : 0.05,
                  type: "spring",
                  stiffness: 92,
                  damping: 14,
                  mass: 0.95,
                },
                opacity: { delay: 0.22, duration: 0.3 },
              }}
            >
              <line
                x1="60"
                y1="66"
                x2="60"
                y2="25"
                stroke={`url(#ceramicNeedle-${size})`}
                strokeWidth={isHero ? "2.4" : "3.2"}
                strokeLinecap="round"
              />
              <circle cx="60" cy="25" r={isHero ? "2.4" : "3"} fill="#4f46e5" />
            </motion.g>

            {/* Center jewel pivot */}
            <motion.circle
              cx="60"
              cy="60"
              r={isHero ? "4.6" : "5.5"}
              fill="#ffffff"
              stroke="#18181b"
              strokeWidth="2"
              initial={isHero ? { scale: 0 } : false}
              animate={{ scale: 1 }}
              transition={{ delay: 0.24, ...SPRING_SNAPPY }}
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
  const [stage, setStage] = useState<Stage>("welcome");

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

  // Field focus highlights
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  // Enter shortcut on Welcome screen for immediate keyboard flow
  useEffect(() => {
    if (stage !== "welcome") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setStage("setup");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

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
      }, 1050);
    } catch (err) {
      triggerError(String(err));
      setSubmitting(false);
    }
  };

  const rulerTicks = useMemo(() => Array.from({ length: 49 }, (_, i) => i), []);

  const features = [
    {
      icon: ShieldCheck,
      title: "离线安全架构",
      desc: "数据与报告本机加密保存",
    },
    {
      icon: BellRing,
      title: "多级效期智算",
      desc: "自定义天数阈值自动提醒",
    },
    {
      icon: FileCheck2,
      title: "标准台账溯源",
      desc: "双表导入导出与 PDF 预览",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.015, filter: "blur(10px)" }}
      transition={{ duration: 0.48, ease: EASE_PRECISION }}
      className="fixed inset-0 z-[120] bg-gradient-to-b from-[#fafaf8] via-[#f4f5f7] to-[#eef1f5] text-zinc-900 overflow-hidden select-none flex flex-col items-center justify-between p-6 sm:p-8"
    >
      {/* Architectural Millimeter Drafting Grid (soft edge vignette) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-precision-grid-fine-light pointer-events-none"
        style={{
          maskImage:
            "radial-gradient(ellipse 78% 72% at 50% 48%, black 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 78% 72% at 50% 48%, black 35%, transparent 100%)",
        }}
      />

      {/* Luminous Daylight Optical Washes (Pearl + Glacier Sky — Zero Dark Neon) */}
      <motion.div
        aria-hidden="true"
        animate={{
          x: [-18, 22, -18],
          y: [-10, 14, -10],
          opacity: [0.65, 0.85, 0.65],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[340px] rounded-full bg-gradient-to-r from-indigo-200/40 via-white/80 to-sky-200/40 blur-[90px] pointer-events-none"
      />
      <motion.div
        aria-hidden="true"
        animate={{
          x: [14, -16, 14],
          opacity: [0.35, 0.55, 0.35],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-36 right-[12%] w-[440px] h-[280px] rounded-full bg-gradient-to-tr from-amber-100/50 via-white/60 to-indigo-100/35 blur-[96px] pointer-events-none"
      />

      {/* Top Subtle Vernier Scale + Step Indicator */}
      <div className="relative z-10 w-full max-w-[540px] flex flex-col items-center gap-3.5 pt-1">
        {/* Delicate Vernier Calibration Rule */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0.7 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.7, ease: EASE_PRECISION }}
          className="flex items-end justify-center gap-[6px] sm:gap-[8px] h-3 overflow-hidden opacity-60 pointer-events-none"
        >
          {rulerTicks.map((i) => {
            const center = i === 24;
            const major = i % 8 === 0;
            return (
              <span
                key={i}
                className={cn(
                  "block w-px rounded-full",
                  center
                    ? "h-3 bg-indigo-500"
                    : major
                      ? "h-2 bg-zinc-400/80"
                      : "h-1 bg-zinc-300/80"
                )}
              />
            );
          })}
        </motion.div>

        {/* Minimalist Step Pill */}
        {stage !== "complete" && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: EASE_PRECISION }}
            className="inline-flex items-center gap-1 p-1 rounded-full bg-white/80 backdrop-blur-md border border-zinc-200/85 shadow-tactile"
          >
            {(
              [
                { id: "welcome", num: "01", label: "欢迎" },
                { id: "setup", num: "02", label: "管理员初始化" },
              ] as const
            ).map((step) => {
              const active = stage === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setStage(step.id)}
                  className={cn(
                    "relative px-3 py-1 rounded-full text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors",
                    active
                      ? "text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-700"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="onboarding-step-pill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-full bg-zinc-900/[0.06] border border-zinc-900/[0.08]"
                    />
                  )}
                  <span className="relative z-10 font-mono text-[10px] text-indigo-600/80">
                    {step.num}
                  </span>
                  <span className="relative z-10">{step.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Main Centered Stage (Consistent geometry — zero vertical jump) */}
      <div className="relative z-10 w-full max-w-[520px] flex items-center justify-center my-auto py-4">
        <AnimatePresence mode="wait">
          {stage === "welcome" && (
            <motion.div
              key="welcome-stage"
              initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -24, filter: "blur(6px)" }}
              transition={SPRING_SMOOTH}
              className="w-full flex flex-col items-center text-center"
            >
              <CeramicPrecisionMedallion size="hero" />

              <div className="mt-7 space-y-2.5">
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.16, duration: 0.45, ease: EASE_PRECISION }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/85 border border-zinc-200/85 shadow-hairline text-[10.5px] font-mono tracking-[0.14em] text-zinc-500 uppercase"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span>PRECISION METROLOGY LEDGER</span>
                </motion.div>

                <BlurText
                  as="h1"
                  text="监视与测量设备管理台账"
                  delay={0.22}
                  stagger={0.025}
                  className="text-[26px] sm:text-[28px] font-semibold tracking-tight text-zinc-950 leading-snug"
                />

                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42, duration: 0.5, ease: EASE_PRECISION }}
                  className="text-[13px] text-zinc-500 max-w-sm mx-auto leading-relaxed"
                >
                  专为量具与检具全生命周期打造的本地桌面台账工作台，清晰掌控校准效期与报告溯源。
                </motion.p>
              </div>

              {/* Three Ceramic Feature Cards with subtle daylight cursor sheen */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.52, duration: 0.5, ease: EASE_PRECISION }}
                className="grid grid-cols-3 gap-2.5 w-full mt-7"
              >
                {features.map((f) => {
                  const Icon = f.icon;
                  return (
                    <SpotlightSurface
                      key={f.title}
                      spotlightColor="rgba(79, 70, 229, 0.08)"
                      radius={150}
                      className="rounded-2xl bg-white border border-zinc-200/85 shadow-tactile px-3 py-3.5 text-left transition-colors hover:border-zinc-300/90"
                    >
                      <div className="h-7 w-7 rounded-xl bg-zinc-900/[0.045] border border-zinc-200/80 flex items-center justify-center text-zinc-700 mb-2.5">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="text-xs font-semibold text-zinc-900 tracking-tight">
                        {f.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                        {f.desc}
                      </div>
                    </SpotlightSurface>
                  );
                })}
              </motion.div>

              {/* Primary CTA */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.64, duration: 0.45, ease: EASE_PRECISION }}
                className="mt-8 flex flex-col items-center gap-2.5"
              >
                <motion.button
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={() => setStage("setup")}
                  className="btn-sheen group inline-flex items-center gap-2.5 px-7 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-semibold shadow-tactile-primary cursor-pointer"
                >
                  <span>开始初始化配置</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </motion.button>
                <span className="text-[11px] text-zinc-400">
                  按 <kbd className="px-1.5 py-0.5 mx-0.5 rounded bg-white border border-zinc-200/90 font-mono text-[10px] text-zinc-500 shadow-hairline">Enter</kbd> 快速继续
                </span>
              </motion.div>
            </motion.div>
          )}

          {stage === "setup" && (
            <motion.div
              key="setup-stage"
              initial={{ opacity: 0, x: 26, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              transition={SPRING_SMOOTH}
              className="w-full max-w-[464px]"
            >
              <div
                key={shakeKey}
                className={cn(
                  "relative rounded-[24px] bg-white border border-zinc-200/90 shadow-ceramic overflow-hidden",
                  shakeKey > 0 && error && "animate-shake"
                )}
              >
                {/* Delicate Light-Mode Optical Rim Beam */}
                <BorderBeam
                  duration={10}
                  colorFrom="rgba(79, 70, 229, 0.42)"
                  colorTo="rgba(14, 165, 233, 0.35)"
                />

                {/* Top Porcelain Specular Highlight */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white to-transparent z-10"
                />

                <form onSubmit={handleSubmit} className="relative z-10 p-7 space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 pb-1">
                    <div className="flex items-center gap-3">
                      <CeramicPrecisionMedallion size="mini" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-[16px] font-semibold text-zinc-950 tracking-tight">
                            创建管理员账号
                          </h2>
                          <InfoTip content="系统不预设默认账号或密码，请创建本机专属管理员凭据用于台账管理、报告归档与系统配置。" />
                        </div>
                        <p className="text-[11.5px] text-zinc-500 mt-0.5">
                          凭据仅加密存储在当前设备本地
                        </p>
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      onClick={() => setStage("welcome")}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100/90 transition shrink-0"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      <span>返回</span>
                    </motion.button>
                  </div>

                  {/* Field 1: Username */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-medium text-zinc-700">
                      <span>管理员用户名</span>
                      <span className="text-[11px] text-zinc-400 font-normal">
                        2–32 个字符
                      </span>
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
                        placeholder="例如：admin、qa_lead 或您的姓名"
                        className="precision-field w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-zinc-50/75 hover:bg-white focus:bg-white border border-zinc-200/95 text-zinc-900 placeholder-zinc-400"
                      />
                    </div>
                  </div>

                  {/* Field 2: Password + Strength Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-zinc-700">
                        设置登录密码
                      </label>
                      <AnimatePresence mode="wait">
                        {password.length > 0 && (
                          <motion.span
                            key={strength.label}
                            initial={{ opacity: 0, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 3 }}
                            transition={{ duration: 0.16 }}
                            className="text-[11px] text-zinc-400"
                          >
                            强度：
                            <span className={cn("font-semibold", strength.textColor)}>
                              {strength.label}
                            </span>
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
                        placeholder="至少 6 位，建议包含字母与数字"
                        className="precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-zinc-50/75 hover:bg-white focus:bg-white border border-zinc-200/95 text-zinc-900 placeholder-zinc-400"
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

                    {/* 4-segment optical strength bar */}
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

                  {/* Field 3: Confirm Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-medium text-zinc-700">确认密码</label>
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
                            密码一致
                          </motion.span>
                        ) : passwordsMismatch ? (
                          <motion.span
                            key="mismatch"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="text-[11px] font-medium text-rose-600"
                          >
                            两次输入不一致
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
                        placeholder="再次输入登录密码"
                        className={cn(
                          "precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-zinc-50/75 hover:bg-white focus:bg-white border text-zinc-900 placeholder-zinc-400",
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

                  {/* Optional Ledger Identity Accordion */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-500 hover:text-zinc-900 transition"
                    >
                      <motion.span
                        animate={{ rotate: showAdvanced ? 180 : 0 }}
                        transition={SPRING_SNAPPY}
                        className="flex items-center"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </motion.span>
                      <span>自定义台账抬头与编号（可选）</span>
                    </button>

                    <Collapsible open={showAdvanced}>
                      <div className="grid grid-cols-5 gap-2.5 pt-3">
                        <div className="col-span-3">
                          <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                            台账主标题
                          </label>
                          <input
                            type="text"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="precision-field w-full px-3 py-2 text-xs rounded-xl bg-zinc-50/80 focus:bg-white border border-zinc-200/90 text-zinc-900"
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
                            className="precision-field w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50/80 focus:bg-white border border-zinc-200/90 text-zinc-900"
                          />
                        </div>
                      </div>
                    </Collapsible>
                  </div>

                  {/* Error Banner */}
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

                  {/* Submit Action */}
                  <div className="pt-1">
                    <motion.button
                      type="submit"
                      disabled={!canSubmit}
                      whileHover={canSubmit ? { y: -1 } : undefined}
                      whileTap={canSubmit ? TAP_SCALE : undefined}
                      transition={SPRING_SNAPPY}
                      className="btn-sheen group w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none text-white text-[13px] font-semibold shadow-tactile-primary inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>
                        {submitting ? "正在安全初始化..." : "完成初始化并进入台账"}
                      </span>
                      {!submitting && (
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      )}
                    </motion.button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {stage === "complete" && (
            <motion.div
              key="complete-stage"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={SPRING_SMOOTH}
              className="flex flex-col items-center text-center py-8"
            >
              <div className="relative h-24 w-24 flex items-center justify-center mb-6">
                <motion.div
                  initial={{ scale: 0.65, opacity: 0 }}
                  animate={{ scale: 1.4, opacity: [0, 0.5, 0] }}
                  transition={{ duration: 0.95, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full bg-emerald-300/45 blur-xl"
                />
                <div className="relative h-20 w-20 rounded-full bg-white border border-emerald-200/90 shadow-ceramic flex items-center justify-center">
                  <svg viewBox="0 0 80 80" className="h-16 w-16" fill="none">
                    <motion.circle
                      cx="40"
                      cy="40"
                      r="33"
                      stroke="#10b981"
                      strokeWidth="2.2"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.48, ease: EASE_PRECISION }}
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
                        delay: 0.24,
                        duration: 0.36,
                        ease: EASE_PRECISION,
                      }}
                    />
                  </svg>
                </div>
              </div>

              <BlurText
                as="h2"
                text={`欢迎使用，${createdUser}`}
                delay={0.18}
                stagger={0.03}
                className="text-xl font-semibold tracking-tight text-zinc-950"
              />
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36, duration: 0.4 }}
                className="text-xs text-zinc-500 mt-2 tracking-wide"
              >
                本地加密台账空间已就绪，正在进入工作台...
              </motion.p>

              {/* Smooth entering progress bar */}
              <div className="mt-6 h-1 w-36 rounded-full bg-zinc-200/90 overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.95, ease: EASE_PRECISION }}
                  style={{ originX: 0 }}
                  className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Subtle Bottom Footer Meta */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.6 }}
        className="relative z-10 w-full max-w-[540px] flex items-center justify-between text-[10.5px] font-mono text-zinc-400/90 px-1"
      >
        <span>OFFLINE LOCAL VAULT · ARGON2ID</span>
        <span>STD // {docCode || "JSSK-MPR-170"}</span>
      </motion.div>
    </motion.div>
  );
};
