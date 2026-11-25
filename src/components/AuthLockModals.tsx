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
import type { AuthStatus } from "@/types";

const EASE_PRECISION: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/* ============================================================================
 * Shared Tactile N-Slot PIN Input
 * ========================================================================== */

interface PinSlotInputProps {
  length: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  showDigits?: boolean;
  autoFocus?: boolean;
  focusNonce?: number;
  size?: "md" | "lg";
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
}

const PinSlotInput: React.FC<PinSlotInputProps> = ({
  length,
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  showDigits = false,
  autoFocus = false,
  focusNonce = 0,
  size = "lg",
  inputRef: externalRef,
}) => {
  const internalRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalRef ?? internalRef;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [autoFocus, disabled, focusNonce, length, inputRef]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const digits = e.target.value.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length && onComplete) {
      onComplete(digits);
    }
  };

  const slots = useMemo(() => Array.from({ length }, (_, idx) => idx), [length]);
  const activeIdx = Math.min(value.length, length - 1);

  return (
    <div
      className="relative flex items-center justify-center gap-2.5 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={`输入 ${length} 位数字 PIN 码`}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10"
      />

      {slots.map((idx) => {
        const char = value[idx] || "";
        const filled = char !== "";
        const isCurrent = focused && !disabled && idx === activeIdx && value.length < length;

        return (
          <div
            key={idx}
            className={cn(
              "relative rounded-xl border flex items-center justify-center font-mono transition-all duration-150 select-none",
              size === "lg" ? "h-[54px] w-12 text-lg" : "h-11 w-10 text-base",
              hasError
                ? "border-rose-500/70 bg-rose-500/[0.06] dark:bg-rose-500/[0.1] ring-2 ring-rose-500/15"
                : isCurrent
                  ? "border-zinc-900 dark:border-indigo-400 bg-white dark:bg-white/[0.08] ring-2 ring-zinc-900/10 dark:ring-indigo-400/20 shadow-sm"
                  : filled
                    ? "border-zinc-300 dark:border-white/[0.2] bg-white dark:bg-white/[0.06]"
                    : "border-zinc-200/90 dark:border-white/[0.1] bg-zinc-50/90 dark:bg-white/[0.03]",
              disabled && "opacity-60"
            )}
          >
            {filled ? (
              showDigits ? (
                <motion.span
                  key={`d-${idx}-${char}`}
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.14 }}
                  className="font-semibold text-zinc-900 dark:text-white"
                >
                  {char}
                </motion.span>
              ) : (
                <motion.span
                  key={`dot-${idx}`}
                  initial={{ scale: 0.35, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 520, damping: 28 }}
                  className={cn(
                    "rounded-full bg-zinc-900 dark:bg-white",
                    size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2"
                  )}
                />
              )
            ) : isCurrent ? (
              <span className="h-5 w-0.5 rounded-full bg-zinc-900/75 dark:bg-indigo-300 animate-pulse" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/* ============================================================================
 * 1. Admin Login Modal (with Persistent Session Toggle)
 * ========================================================================== */

interface AdminLoginModalProps {
  open: boolean;
  defaultUsername: string;
  defaultKeepSession?: boolean;
  onClose: () => void;
  onSuccess: (status: AuthStatus, keepSession: boolean) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  open,
  defaultUsername,
  defaultKeepSession = true,
  onClose,
  onSuccess,
}) => {
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
      const status = await api.adminLogin(username, password, remember);
      onSuccess(status, remember);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-zinc-950/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: EASE_PRECISION }}
            className="w-full max-w-md bg-white dark:bg-[#121216] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                    管理员身份验证
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    解锁设备编辑、报告上传、备份还原与系统配置
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07] transition"
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
                  placeholder="请输入初始化时设置的管理员用户名"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-white/[0.05] focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition"
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
                    placeholder="请输入管理员密码"
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:bg-white dark:focus:bg-white/[0.05] focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition"
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

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.07] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-white"
                />
                <div className="text-xs leading-relaxed">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    保持管理员登录状态（个人电脑推荐）
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    关闭或重启软件后自动保持登录，无需每次重输密码；可随时在侧边栏手动退出
                  </div>
                </div>
              </label>

              {error && (
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition"
                >
                  保持只读浏览
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>{loading ? "验证中..." : "验证登录"}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] bg-zinc-950/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: EASE_PRECISION }}
            className="w-full max-w-md bg-white dark:bg-[#121216] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-indigo-500/12 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Lock className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                    {mode === "change" ? "修改应用锁 PIN 码" : "开启独立应用锁"}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    独立于管理员密码 · 输完位数自动秒开，忘记可用管理员密码兜底
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* PIN Length Selector */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  选择 PIN 码位数
                </span>
                <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08]">
                  {([4, 5, 6] as const).map((len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => handleChangeLength(len)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium transition",
                        pinLength === len
                          ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-hairline"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                      )}
                    >
                      {len} 位{len === 4 ? "（推荐）" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 1: Enter PIN */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    设置 {pinLength} 位数字 PIN 码
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDigits((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  >
                    {showDigits ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showDigits ? "隐藏数字" : "显示数字"}</span>
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
                    再次输入确认 PIN 码
                  </label>
                  {pinsMatch && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="h-3 w-3" />
                      PIN 码一致
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
                  <div className="text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-200">
                    触发时机（后续可随时在「设置 → 账号与锁屏」调整）
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      无操作自动锁定
                    </span>
                    <select
                      value={autoLockMinutes}
                      onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#16161b] text-zinc-800 dark:text-zinc-200 focus:outline-none"
                    >
                      <option value={0}>关闭（仅手动锁定）</option>
                      <option value={5}>5 分钟无操作</option>
                      <option value={10}>10 分钟无操作</option>
                      <option value={15}>15 分钟无操作</option>
                      <option value={30}>30 分钟无操作</option>
                    </select>
                  </div>

                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      隐藏到{mac ? "顶部菜单栏" : "系统托盘"}时自动锁定
                    </span>
                    <input
                      type="checkbox"
                      checked={lockOnHide}
                      onChange={(e) => setLockOnHide(e.target.checked)}
                      className="h-3.5 w-3.5 accent-zinc-900 dark:accent-white"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      每次启动程序时自动锁定
                    </span>
                    <input
                      type="checkbox"
                      checked={lockOnStartup}
                      onChange={(e) => setLockOnStartup(e.target.checked)}
                      className="h-3.5 w-3.5 accent-zinc-900 dark:accent-white"
                    />
                  </label>
                </div>
              )}

              {error && (
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/[0.08] border border-rose-500/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving || !pinsMatch}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-45 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>
                    {saving
                      ? "保存中..."
                      : mode === "change"
                        ? "更新 PIN 码"
                        : lockAfterSave
                          ? "设置并立即锁定"
                          : "保存并启用应用锁"}
                  </span>
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const [clock, setClock] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  // Admin recovery state
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [recoveryAction, setRecoveryAction] = useState<RecoveryAction>("unlock_only");
  const [newPin, setNewPin] = useState("");

  const pinRef = useRef<HTMLInputElement | null>(null);
  const adminInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!locked) return;
    setView("pin");
    setPin("");
    setAdminPassword("");
    setNewPin("");
    setRecoveryAction("unlock_only");
    setError("");
    setVerifying(false);

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
    if (verifying) return;
    setVerifying(true);
    setError("");
    try {
      const status = await api.unlockApp(completedPin);
      setPin("");
      onUnlocked(status, false);
    } catch (err) {
      setError(String(err));
      triggerShake();
      setPin("");
      window.setTimeout(() => pinRef.current?.focus(), 60);
    } finally {
      setVerifying(false);
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

  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE_PRECISION }}
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
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-white/[0.05] border border-zinc-200/90 dark:border-white/[0.09] shadow-hairline text-[11.5px] text-zinc-600 dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {docTitle || "监视与测量管理台账"}
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span>应用锁保护中</span>
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
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/45 dark:via-indigo-400/55 to-transparent" />

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
                    <div className="h-11 w-11 rounded-2xl bg-zinc-900/[0.05] dark:bg-white/[0.07] border border-zinc-200/90 dark:border-white/[0.1] flex items-center justify-center mb-3.5 text-zinc-800 dark:text-zinc-100">
                      {verifying ? (
                        <Loader2 className="h-[18px] w-[18px] animate-spin text-indigo-500 dark:text-indigo-400" />
                      ) : (
                        <Lock className="h-[18px] w-[18px]" />
                      )}
                    </div>
                    <h2 className="text-[15px] font-semibold text-zinc-950 dark:text-white tracking-tight">
                      输入应用锁 PIN 码
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      输入 {effectivePinLen} 位数字后自动解锁，无需按回车
                    </p>
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
                      hasError={Boolean(error)}
                      autoFocus={locked && view === "pin"}
                      focusNonce={focusNonce}
                      size="lg"
                      inputRef={pinRef}
                    />
                  </div>

                  {/* Reserved status slot to prevent layout shift */}
                  <div className="h-7 mt-3 flex items-center justify-center">
                    {verifying ? (
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                        正在验证 PIN 码...
                      </span>
                    ) : error ? (
                      <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                        {error}
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        请直接通过数字键盘输入
                      </span>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-white/[0.08] flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setView("recovery");
                        setError("");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>忘记 PIN 码？使用管理员密码解锁</span>
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
                    <span>返回 PIN 码解锁</span>
                  </button>

                  <div>
                    <h2 className="text-[15px] font-semibold text-zinc-950 dark:text-white tracking-tight">
                      管理员密码验证解锁
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      验证管理员 <span className="font-medium text-zinc-700 dark:text-zinc-200">{username}</span> 密码以解除锁定，防止锁死
                    </p>
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
                      placeholder="请输入管理员密码..."
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
                          { id: "unlock_only", label: "仅本次解锁" },
                          { id: "reset_pin", label: "重设 PIN 码" },
                          { id: "disable_lock", label: "关闭应用锁" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setRecoveryAction(opt.id);
                            setError("");
                          }}
                          className={cn(
                            "py-1.5 px-2 rounded-lg text-[11.5px] font-medium transition",
                            recoveryAction === opt.id
                              ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-hairline"
                              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {recoveryAction === "reset_pin" && (
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                        输入新的 4~6 位数字 PIN 码
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
                        placeholder="请输入 4 到 6 位数字"
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
                    <span>{verifying ? "正在验证..." : "验证管理员密码并解锁"}</span>
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[130] bg-zinc-950/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: EASE_PRECISION }}
            className="w-full max-w-[420px] bg-white dark:bg-[#121216] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                  关闭主窗口时
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  请选择点击关闭按钮后的默认行为
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {/* Option 1: Minimize to Tray / Menu Bar */}
              <button
                type="button"
                onClick={() => setSelected("minimize_to_tray")}
                className={cn(
                  "w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3",
                  selected === "minimize_to_tray"
                    ? "border-zinc-900 dark:border-white/70 bg-zinc-50 dark:bg-white/[0.06] ring-1 ring-zinc-900/10 dark:ring-white/15"
                    : "border-zinc-200/90 dark:border-white/[0.08] hover:bg-zinc-50/70 dark:hover:bg-white/[0.03]"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    selected === "minimize_to_tray"
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950"
                      : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  <MonitorDown className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                      {mac ? "最小化到顶部菜单栏（后台运行）" : "最小化到右下角托盘（后台运行）"}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                      推荐
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    {mac
                      ? "仅隐藏主窗口并在顶部菜单栏常驻，保持登录与定时提醒；点击菜单栏或 Dock 图标随时秒开。"
                      : "仅隐藏主窗口并在任务栏右下角常驻，保持登录与定时提醒；点击托盘图标即可秒开。"}
                  </p>
                </div>
              </button>

              {/* Option 2: Exit Application */}
              <button
                type="button"
                onClick={() => setSelected("exit")}
                className={cn(
                  "w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3",
                  selected === "exit"
                    ? "border-zinc-900 dark:border-white/70 bg-zinc-50 dark:bg-white/[0.06] ring-1 ring-zinc-900/10 dark:ring-white/15"
                    : "border-zinc-200/90 dark:border-white/[0.08] hover:bg-zinc-50/70 dark:hover:bg-white/[0.03]"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    selected === "exit"
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950"
                      : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400"
                  )}
                >
                  <Power className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                    直接退出程序
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    立即关闭窗口并完全结束程序进程，不保留后台托盘图标。
                  </p>
                </div>
              </button>

              {/* Remember Checkbox */}
              <label className="flex items-center gap-2 pt-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 accent-zinc-900 dark:accent-white"
                />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  记住我的选择，下次不再询问（可在「设置 → 窗口与托盘」修改）
                </span>
              </label>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirm}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 disabled:opacity-50 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                >
                  {selected === "minimize_to_tray" ? "隐藏到后台" : "退出程序"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
