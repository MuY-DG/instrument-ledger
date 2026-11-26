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
  Palette,
  RotateCcw,
  Shuffle,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  ACCOUNT_BG_PRESETS,
  saveAccountBg,
  type GrainMeshId,
} from "@/lib/accountBackgrounds";
import { cn } from "@/lib/utils";
import {
  EASE_PRECISION,
  POPOVER_MOTION,
  SPRING_GENTLE,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  TAP_SCALE,
  TAP_SCALE_SUBTLE,
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

const GRAIN_MESH_PRESETS = ACCOUNT_BG_PRESETS.filter(
  (p): p is { id: GrainMeshId; name: string; isGrainMesh: true } =>
    p.isGrainMesh
);

// Quick showcase orbs in the bottom-right pill (putting default "1" 霓虹粉紫 first!)
const ONBOARDING_QUICK_IDS: ReadonlyArray<GrainMeshId> = [
  "1",
  "7",
  "2",
  "4",
  "9",
];

// Bright pastel palettes where dark ink hero text reads crisper than white text
const LIGHT_TONE_MESH_IDS = new Set<GrainMeshId>(["3", "5", "8", "9", "11"]);

// Accent stop pairs per palette for subtle emblem / BorderBeam harmony
const PALETTE_ACCENTS: Record<GrainMeshId, { from: string; to: string }> = {
  "1": { from: "#ff3fa6", to: "#6a35ff" },
  "2": { from: "#2b8cff", to: "#5a35ff" },
  "3": { from: "#22d39a", to: "#0a8a8f" },
  "4": { from: "#ff4a5e", to: "#ffb866" },
  "5": { from: "#ffa51f", to: "#ff4a2e" },
  "6": { from: "#1fa8ff", to: "#3a3cff" },
  "7": { from: "#c07bff", to: "#ff4f9a" },
  "8": { from: "#2fe08a", to: "#0a9a6a" },
  "9": { from: "#ff8a6a", to: "#ff3f86" },
  "10": { from: "#5a3cff", to: "#bfa0ff" },
  "11": { from: "#8ae83a", to: "#1fb86a" },
  "12": { from: "#e03cff", to: "#6a2cff" },
};

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
  const map: Record<
    number,
    { label: string; barColor: string; textColor: string }
  > = {
    1: { label: "较弱", barColor: "bg-rose-500", textColor: "text-rose-600" },
    2: { label: "标准", barColor: "bg-amber-500", textColor: "text-amber-600" },
    3: { label: "良好", barColor: "bg-violet-500", textColor: "text-violet-600" },
    4: {
      label: "高强度",
      barColor: "bg-emerald-500",
      textColor: "text-emerald-600",
    },
  };
  const clamped = Math.max(1, Math.min(4, score));
  return { score: clamped, ...map[clamped] };
}

/**
 * Clean Satin-Porcelain Calibration Emblem (zero outer halo rings, crisp over any mesh color)
 */
const LuminousEmblem: React.FC<{
  revealed: boolean;
  compact?: boolean;
  accentFrom: string;
  accentTo: string;
}> = ({ revealed, compact = false, accentFrom, accentTo }) => {
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
        compact ? "h-10 w-10" : "h-[94px] w-[94px]"
      )}
    >
      <div
        className={cn(
          "relative z-10 h-full w-full rounded-full bg-white/95 border border-white/80 flex items-center justify-center",
          compact
            ? "shadow-[0_3px_10px_-3px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,1)]"
            : "shadow-[0_18px_42px_-12px_rgba(15,23,42,0.28),0_4px_12px_rgba(15,23,42,0.08),inset_0_2px_0_rgba(255,255,255,1)]"
        )}
      >
        <div
          className={cn(
            "rounded-full bg-gradient-to-b from-[#f8f9fb] to-white border border-zinc-200/75 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)] flex items-center justify-center",
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
                id={`meshEmblemArc-${compact ? "c" : "h"}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#18181b" stopOpacity="0.86" />
                <stop offset="52%" stopColor={accentFrom} stopOpacity="0.95" />
                <stop offset="100%" stopColor={accentTo} stopOpacity="0.92" />
              </linearGradient>
            </defs>

            <motion.circle
              cx="60"
              cy="60"
              r="46"
              stroke={`url(#meshEmblemArc-${compact ? "c" : "h"})`}
              strokeWidth={compact ? "2.5" : "2"}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={
                revealed
                  ? { pathLength: 0.78, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{ duration: 0.88, delay: 0.06, ease: EASE_PRECISION }}
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
                      ? "rgba(24, 24, 27, 0.65)"
                      : "rgba(24, 24, 27, 0.18)"
                  }
                  strokeWidth={t.major ? "1.6" : "1"}
                  strokeLinecap="round"
                  transform={`rotate(${t.deg} 60 60)`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: revealed ? 1 : 0 }}
                  transition={{ duration: 0.22, delay: 0.1 + t.idx * 0.01 }}
                />
              ))}

            <motion.g
              style={{ originX: "60px", originY: "60px" }}
              initial={{ rotate: -130, opacity: 0 }}
              animate={
                revealed
                  ? { rotate: 0, opacity: 1 }
                  : { rotate: -130, opacity: 0 }
              }
              transition={{
                rotate: {
                  delay: compact ? 0.04 : 0.16,
                  type: "spring",
                  stiffness: 92,
                  damping: 13.5,
                  mass: 0.92,
                },
                opacity: { delay: compact ? 0 : 0.1, duration: 0.28 },
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
              <circle
                cx="60"
                cy="26"
                r={compact ? "3.1" : "2.6"}
                fill={accentFrom}
              />
            </motion.g>

            <circle
              cx="60"
              cy="60"
              r={compact ? "5.2" : "4.5"}
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
  const [emblemReady, setEmblemReady] = useState(false);
  const [titleReady, setTitleReady] = useState(false);
  const [actionReady, setActionReady] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  // Active fluid mesh background — defaults to "1" (霓虹粉紫) as requested!
  const [bgId, setBgId] = useState<GrainMeshId>("1");
  const [showBgPicker, setShowBgPicker] = useState(false);

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
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const isLightMesh = LIGHT_TONE_MESH_IDS.has(bgId);
  const activeAccent = PALETTE_ACCENTS[bgId] || PALETTE_ACCENTS["1"];
  const activePresetName =
    GRAIN_MESH_PRESETS.find((p) => p.id === bgId)?.name || "霓虹粉紫";

  const handleSelectBg = useCallback((nextId: GrainMeshId) => {
    setBgId(nextId);
    saveAccountBg(nextId);
  }, []);

  // Persist initial default ("1" 霓虹粉紫) so account cover matches upon entering app
  useEffect(() => {
    saveAccountBg("1");
  }, []);

  // Close background popover when clicking outside
  useEffect(() => {
    if (!showBgPicker) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerWrapRef.current?.contains(e.target as Node)) {
        setShowBgPicker(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showBgPicker]);

  const clearIntroTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const scheduleIntroTimeline = useCallback(() => {
    clearIntroTimers();
    const tSkip = window.setTimeout(() => setShowSkip(true), 520);
    // Spectra ribbons part from center -> unveiling fluid mesh & emblem
    const tEmblem = window.setTimeout(() => setEmblemReady(true), 1580);
    // Fluid mesh blossoms full-screen -> title focuses in
    const tTitle = window.setTimeout(() => {
      setTitleReady(true);
      setStage((prev) => (prev === "intro" ? "welcome" : prev));
    }, 2080);
    // CTA button & background switcher dock appear
    const tAction = window.setTimeout(() => setActionReady(true), 2480);

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
    setShowBgPicker(false);
    setShowSkip(false);
    setEmblemReady(false);
    setTitleReady(false);
    setActionReady(false);
    setStage("intro");
    canvasRef.current?.replay();
    scheduleIntroTimeline();
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
      saveAccountBg(bgId);
      const authStatus = await api.setupInitialAdmin(
        cleanUser,
        password,
        docTitle.trim() || undefined,
        docCode.trim() || undefined
      );
      setCreatedUser(authStatus.username);
      setShowBgPicker(false);
      setStage("complete");
      window.setTimeout(() => {
        onCompleted(authStatus);
      }, 1250);
    } catch (err) {
      triggerError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: "blur(10px)" }}
      transition={{ duration: 0.5, ease: EASE_PRECISION }}
      className="fixed inset-0 z-[120] bg-black text-zinc-900 overflow-hidden select-none flex items-center justify-center p-6"
    >
      {/* 1:1 Netflix Intro -> Autonomous 21st.dev Silk Background */}
      <OpticalStartupCanvas
        ref={canvasRef}
        phase={stage}
        paletteId={bgId}
        revealTargetRef={revealStageRef}
      />

      {/* Subtle depth-of-field scrim during account setup so the form pops cleanly */}
      <AnimatePresence>
        {stage === "setup" && (
          <motion.div
            key="setup-scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_PRECISION }}
            className="pointer-events-none fixed inset-0 z-[1] bg-slate-950/[0.22] backdrop-blur-[4px]"
          />
        )}
      </AnimatePresence>

      {/* Top-Right Skip / Replay Pill */}
      <AnimatePresence mode="wait">
        {stage === "intro" && showSkip ? (
          <motion.button
            key="skip-btn"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            whileHover={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleSkipIntro}
            className="fixed top-6 right-7 z-30 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-xs font-medium text-white hover:bg-black/80 transition-colors cursor-pointer"
          >
            跳过
          </motion.button>
        ) : (stage === "welcome" || stage === "setup") && actionReady ? (
          <motion.button
            key="replay-btn"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            whileHover={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={handleReplayIntro}
            title="重播奈飞开场动画"
            className="fixed top-6 right-7 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/85 backdrop-blur-md border border-white/70 shadow-tactile text-[11.5px] font-medium text-zinc-800 hover:bg-white hover:text-zinc-950 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>重播开场</span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      {/* Bottom-Right Interactive Background Switcher Pill & 12-Color Popover (matching Account Cover UI!) */}
      <AnimatePresence>
        {(stage === "welcome" || stage === "setup") && actionReady && (
          <motion.div
            ref={pickerWrapRef}
            data-bg-dock="true"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.45, ease: EASE_PRECISION }}
            className="fixed bottom-6 right-7 z-30 flex flex-col items-end"
          >
            {/* Expandable 12-Palette Popover */}
            <AnimatePresence>
              {showBgPicker && (
                <motion.div
                  {...POPOVER_MOTION}
                  className="mb-2.5 w-[296px] p-3.5 rounded-2xl bg-white/92 backdrop-blur-2xl border border-white/80 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)]"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-zinc-200/75">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                      <Palette className="h-3.5 w-3.5 text-pink-500" />
                      <span>流体背景色</span>
                      <span className="text-[11px] font-normal text-zinc-500">
                        · {activePresetName}
                      </span>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      transition={SPRING_SNAPPY}
                      onClick={() => {
                        const pool = GRAIN_MESH_PRESETS.filter(
                          (p) => p.id !== bgId
                        );
                        const pick =
                          pool[Math.floor(Math.random() * pool.length)];
                        if (pick) handleSelectBg(pick.id);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium text-zinc-600 hover:text-zinc-950 hover:bg-zinc-900/[0.06] transition-colors cursor-pointer"
                    >
                      <Shuffle className="h-3 w-3" />
                      <span>随机</span>
                    </motion.button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {GRAIN_MESH_PRESETS.map((preset) => {
                      const active = bgId === preset.id;
                      return (
                        <motion.button
                          key={preset.id}
                          type="button"
                          whileHover={{ y: -1.5, scale: 1.03 }}
                          whileTap={{ scale: 0.95 }}
                          transition={SPRING_SNAPPY}
                          onClick={() => handleSelectBg(preset.id)}
                          className="group relative flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-zinc-900/[0.045] transition-colors focus:outline-none cursor-pointer"
                        >
                          <div className="relative h-8 w-8 rounded-full p-[2px]">
                            {active && (
                              <motion.span
                                layoutId="onboarding-bg-active-ring"
                                transition={SPRING_SNAPPY}
                                className="absolute inset-0 rounded-full ring-2 ring-zinc-900"
                              />
                            )}
                            <span
                              data-av={preset.id}
                              className="relative flex h-full w-full rounded-full items-center justify-center shadow-sm"
                            >
                              {active && (
                                <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] stroke-[2.6]" />
                              )}
                            </span>
                          </div>
                          <span
                            className={cn(
                              "text-[10px] leading-none truncate max-w-full",
                              active
                                ? "font-semibold text-zinc-950"
                                : "text-zinc-600"
                            )}
                          >
                            {preset.name}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick Grainy-Orb Switcher Pill (1:1 match with Account Cover Pill!) */}
            <div className="inline-flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-full bg-white/88 backdrop-blur-xl border border-white/75 shadow-[0_8px_28px_-6px_rgba(15,23,42,0.22)]">
              <div className="flex items-center -space-x-1.5">
                {ONBOARDING_QUICK_IDS.map((presetId) => {
                  const active = bgId === presetId;
                  const meta = GRAIN_MESH_PRESETS.find((p) => p.id === presetId);
                  return (
                    <motion.button
                      key={presetId}
                      type="button"
                      whileHover={{ scale: 1.18, zIndex: 20 }}
                      whileTap={{ scale: 0.92 }}
                      transition={SPRING_SNAPPY}
                      onClick={() => handleSelectBg(presetId)}
                      title={meta ? `切换背景：${meta.name}` : "切换背景"}
                      aria-label={meta ? `切换背景：${meta.name}` : "切换背景"}
                      className={cn(
                        "relative h-5 w-5 rounded-full p-[1.5px] bg-white shadow-sm focus:outline-none cursor-pointer",
                        active && "ring-2 ring-zinc-900 z-10"
                      )}
                    >
                      <span
                        data-av={presetId}
                        className="block h-full w-full rounded-full"
                      />
                    </motion.button>
                  );
                })}
              </div>

              <motion.button
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                transition={SPRING_SNAPPY}
                onClick={() => setShowBgPicker((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
                  showBgPicker
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-900/90 text-white hover:bg-zinc-950"
                )}
                title="展开全部 12 款流体背景颜色"
              >
                <Palette className="h-3 w-3" />
                <span>背景</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Centered Stage */}
      <div
        ref={revealStageRef}
        className="relative z-10 w-full max-w-[460px] flex items-center justify-center"
      >
        <AnimatePresence mode="wait">
          {stage === "intro" || stage === "welcome" ? (
            /* --- CLEAN WELCOME STAGE OVER FLUID MESH --- */
            <motion.div
              key="minimal-welcome"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98, filter: "blur(8px)" }}
              transition={SPRING_SMOOTH}
              className="relative flex flex-col items-center text-center w-full"
            >
              <div className="relative z-10 flex flex-col items-center px-8 py-9">
                <motion.div
                  initial={{ y: 74 }}
                  animate={{ y: titleReady ? 0 : 74 }}
                  transition={SPRING_GENTLE}
                >
                  <LuminousEmblem
                    revealed={emblemReady}
                    accentFrom={activeAccent.from}
                    accentTo={activeAccent.to}
                  />
                </motion.div>

                <div className="h-[172px] flex flex-col items-center justify-start pt-6">
                  {titleReady && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: EASE_PRECISION }}
                        className="mb-2.5 inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-white/85 backdrop-blur-md border border-white/75 shadow-hairline text-[10.5px] font-mono tracking-[0.2em] text-zinc-700 uppercase"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: activeAccent.from }}
                        />
                        <span>{docCode || "JSSK-MPR-170"}</span>
                      </motion.div>

                      <BlurText
                        as="h1"
                        text={docTitle || "监视与测量管理台账"}
                        delay={0.03}
                        stagger={0.028}
                        className={cn(
                          "text-[26px] sm:text-[30px] font-semibold tracking-tight leading-snug transition-colors duration-300",
                          isLightMesh
                            ? "text-zinc-900"
                            : "text-white drop-shadow-[0_2px_16px_rgba(15,23,42,0.22)]"
                        )}
                      />

                      <motion.p
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: 0.22,
                          duration: 0.5,
                          ease: EASE_PRECISION,
                        }}
                        className={cn(
                          "mt-1.5 text-[12.5px] tracking-wide transition-colors duration-300",
                          isLightMesh
                            ? "text-zinc-700"
                            : "text-white/85 drop-shadow-[0_1px_8px_rgba(15,23,42,0.18)]"
                        )}
                      >
                        仪器量具与尺寸检具全生命周期校准溯源
                      </motion.p>
                    </>
                  )}

                  <AnimatePresence>
                    {actionReady && (
                      <motion.div
                        key="welcome-cta"
                        initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.58, ease: EASE_PRECISION }}
                        className="mt-6"
                      >
                        <motion.button
                          type="button"
                          whileHover={{ y: -1.5, scale: 1.015 }}
                          whileTap={TAP_SCALE}
                          transition={SPRING_SNAPPY}
                          onClick={() => setStage("setup")}
                          className={cn(
                            "btn-sheen group inline-flex items-center gap-2.5 pl-6 pr-5 py-2.5 rounded-full text-[13.5px] font-semibold shadow-[0_12px_28px_-6px_rgba(15,23,42,0.26)] transition-colors cursor-pointer",
                            isLightMesh
                              ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                              : "bg-white hover:bg-zinc-50 text-zinc-950"
                          )}
                        >
                          <span>开始使用</span>
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : stage === "setup" ? (
            /* --- ELEVATED DOUBLE-BEZEL SOLID PORCELAIN ACCOUNT SETUP CARD --- */
            <motion.div
              key="setup-card-stage"
              initial={{ opacity: 0, y: 20, scale: 0.98, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              transition={SPRING_SMOOTH}
              className="w-full max-w-[448px]"
            >
              {/* Outer translucent frosted crystal rim */}
              <div
                key={shakeKey}
                className={cn(
                  "p-2 rounded-[30px] bg-white/35 backdrop-blur-2xl border border-white/65 shadow-[0_32px_80px_-12px_rgba(9,9,11,0.45),0_12px_28px_-8px_rgba(9,9,11,0.22),0_0_0_1px_rgba(9,9,11,0.08)]",
                  shakeKey > 0 && error && "animate-shake"
                )}
              >
                {/* Inner 100% solid pure-white card (zero background color bleed) */}
                <div className="relative rounded-[22px] bg-white border border-zinc-900/[0.08] shadow-[0_4px_16px_rgba(9,9,11,0.08)] overflow-hidden">
                  <BorderBeam
                    duration={9}
                    colorFrom={activeAccent.from}
                    colorTo={activeAccent.to}
                  />

                  <form
                    onSubmit={handleSubmit}
                    className="relative z-10 p-7 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                      <div className="flex items-center gap-3">
                        <LuminousEmblem
                          revealed
                          compact
                          accentFrom={activeAccent.from}
                          accentTo={activeAccent.to}
                        />
                        <div>
                          <h2 className="text-[16.5px] font-semibold text-zinc-950 tracking-tight">
                            创建管理员账号
                          </h2>
                          <p className="text-[11.5px] text-zinc-500 mt-0.5">
                            配置本地台账管理权限与表单标识
                          </p>
                        </div>
                      </div>

                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE}
                        onClick={() => setStage("welcome")}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition"
                        title="返回"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </motion.button>
                    </div>

                    {/* Username */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-zinc-800">
                        用户名
                      </label>
                      <div className="relative">
                        <User
                          className={cn(
                            "h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150",
                            focusedField === "username"
                              ? "text-zinc-950"
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
                          className="precision-field w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-zinc-100/75 hover:bg-zinc-100/45 focus:bg-white border border-zinc-300/90 text-zinc-950 placeholder-zinc-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-zinc-800">
                          密码
                        </label>
                        <AnimatePresence mode="wait">
                          {password.length > 0 && (
                            <motion.span
                              key={strength.label}
                              initial={{ opacity: 0, y: -3 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 3 }}
                              transition={{ duration: 0.16 }}
                              className={cn(
                                "text-[11px] font-semibold",
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
                              ? "text-zinc-950"
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
                          className="precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-zinc-100/75 hover:bg-zinc-100/45 focus:bg-white border border-zinc-300/90 text-zinc-950 placeholder-zinc-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900 transition p-0.5 rounded-md"
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
                            className="h-1.5 rounded-full bg-zinc-200/90 overflow-hidden"
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
                        <label className="font-semibold text-zinc-800">
                          确认密码
                        </label>
                        <AnimatePresence mode="wait">
                          {passwordsMatch ? (
                            <motion.span
                              key="match"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"
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
                              className="text-[11px] font-semibold text-rose-600"
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
                              ? "text-zinc-950"
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
                            "precision-field w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-zinc-100/75 hover:bg-zinc-100/45 focus:bg-white border text-zinc-950 placeholder-zinc-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]",
                            passwordsMismatch
                              ? "border-rose-400"
                              : passwordsMatch
                                ? "border-emerald-500"
                                : "border-zinc-300/90"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900 transition p-0.5 rounded-md"
                          tabIndex={-1}
                          aria-label={
                            showConfirm ? "隐藏确认密码" : "显示确认密码"
                          }
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
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-600 hover:text-zinc-950 transition"
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
                            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                              台账标题
                            </label>
                            <input
                              type="text"
                              value={docTitle}
                              onChange={(e) => setDocTitle(e.target.value)}
                              className="precision-field w-full px-3 py-2 text-xs rounded-xl bg-zinc-100/75 focus:bg-white border border-zinc-300/90 text-zinc-950"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                              表单编号
                            </label>
                            <input
                              type="text"
                              value={docCode}
                              onChange={(e) => setDocCode(e.target.value)}
                              className="precision-field w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-100/75 focus:bg-white border border-zinc-300/90 text-zinc-950"
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
                        className="btn-sheen group w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:bg-zinc-900/[0.08] disabled:text-zinc-500 disabled:border disabled:border-zinc-200/90 disabled:shadow-none text-white text-[13px] font-semibold shadow-[0_10px_24px_-6px_rgba(9,9,11,0.38)] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>
                          {submitting ? "正在初始化..." : "完成并进入"}
                        </span>
                        {!submitting && (
                          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        )}
                      </motion.button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : (
            /* --- COMPLETION --- */
            <motion.div
              key="complete-stage"
              initial={{ opacity: 0, scale: 0.92, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.05, filter: "blur(8px)" }}
              transition={SPRING_SMOOTH}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative h-[84px] w-[84px] rounded-full bg-white/95 border border-white/85 shadow-[0_20px_48px_-10px_rgba(15,23,42,0.28)] flex items-center justify-center mb-6">
                <svg viewBox="0 0 80 80" className="h-14 w-14" fill="none">
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke={activeAccent.from}
                    strokeWidth="2.4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.48, ease: EASE_PRECISION }}
                  />
                  <motion.path
                    d="M26 41L35.5 50.5L54.5 31"
                    stroke="#18181b"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      delay: 0.22,
                      duration: 0.36,
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
                className={cn(
                  "text-[22px] font-semibold tracking-tight",
                  isLightMesh
                    ? "text-zinc-900"
                    : "text-white drop-shadow-[0_2px_16px_rgba(15,23,42,0.24)]"
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
