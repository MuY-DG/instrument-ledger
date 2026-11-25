import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AuthStatus } from "@/types";

interface AdminLoginModalProps {
  open: boolean;
  defaultUsername: string;
  onClose: () => void;
  onSuccess: (status: AuthStatus) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  open,
  defaultUsername,
  onClose,
  onSuccess,
}) => {
  const [username, setUsername] = useState(defaultUsername || "");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setUsername(defaultUsername || "");
      setPassword("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, defaultUsername]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const status = await api.adminLogin(username, password);
      onSuccess(status);
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
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md bg-white dark:bg-[#121216] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4.5 w-4.5" />
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

interface AppLockOverlayProps {
  locked: boolean;
  username: string;
  docTitle: string;
  onUnlocked: (status: AuthStatus) => void;
}

export const AppLockOverlay: React.FC<AppLockOverlayProps> = ({
  locked,
  username,
  docTitle,
  onUnlocked,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!locked) return;
    setPassword("");
    setError("");
    setTimeout(() => inputRef.current?.focus(), 100);

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

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const status = await api.unlockApp(password);
      setPassword("");
      onUnlocked(status);
    } catch (err) {
      setError(String(err));
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(24px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] bg-[#09090b]/92 bg-precision-grid flex flex-col items-center justify-center p-6 select-none no-print"
        >
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.35 }}
            className="text-center mb-9 text-white"
          >
            <div className="text-6xl font-light tracking-tight font-mono tabular-nums">
              {clock}
            </div>
            <div className="text-xs text-zinc-400 mt-2.5 tracking-wider">
              {dateLabel}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full max-w-sm rounded-2xl bg-zinc-900/75 border border-white/[0.1] backdrop-blur-2xl p-7 shadow-2xl text-white ${
              shaking ? "animate-shake" : ""
            }`}
          >
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-12 w-12 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center mb-3.5">
                <Lock className="h-5 w-5 text-zinc-200" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">
                {docTitle || "监视与测量管理台账"}
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                应用已锁定保护 · 管理员 {username}
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-3.5">
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入管理员密码解锁..."
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-indigo-400/70 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20 transition"
              />

              {error && (
                <p className="text-xs text-rose-400 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 text-sm font-semibold inline-flex items-center justify-center gap-2 transition"
              >
                <Unlock className="h-4 w-4" />
                <span>{loading ? "正在验证..." : "验证解锁"}</span>
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
