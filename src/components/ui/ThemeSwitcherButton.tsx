import React, { useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { MorphTooltip } from "@/components/ui/MorphTooltip";
import { useI18n } from "@/lib/i18n";
import { EASE_PRECISION, SPRING_SNAPPY, TAP_SCALE_ICON } from "@/lib/motion";
import {
  getNextThemePreference,
  type ThemePreference,
} from "@/lib/themeTransition";
import { cn } from "@/lib/utils";

const PREFERENCE_META: Record<
  ThemePreference,
  {
    labelZh: string;
    labelEn: string;
    Icon: React.FC<{ className?: string }>;
    iconTint: string;
  }
> = {
  system: {
    labelZh: "跟随系统",
    labelEn: "System",
    Icon: Monitor,
    iconTint: "text-sky-500 dark:text-sky-400",
  },
  light: {
    labelZh: "浅色",
    labelEn: "Light",
    Icon: Sun,
    iconTint: "text-amber-500",
  },
  dark: {
    labelZh: "深色",
    labelEn: "Dark",
    Icon: Moon,
    iconTint: "text-indigo-500 dark:text-indigo-400",
  },
};

interface ThemeSwitcherButtonProps {
  preference: ThemePreference;
  collapsed: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  onCycleTheme: (triggerEl?: HTMLElement | null) => void;
}

/**
 * Direct single-click theme cycle trigger in the bottom-left sidebar rail.
 * Cycles: System -> Light -> Dark -> System.
 */
export const ThemeSwitcherButton: React.FC<ThemeSwitcherButtonProps> = ({
  preference,
  collapsed,
  buttonRef,
  onCycleTheme,
}) => {
  const { isEn } = useI18n();
  const currentMeta = PREFERENCE_META[preference];
  const nextMeta = PREFERENCE_META[getNextThemePreference(preference)];
  const currentLabel = isEn ? currentMeta.labelEn : currentMeta.labelZh;
  const nextLabel = isEn ? nextMeta.labelEn : nextMeta.labelZh;
  const ActiveIcon = currentMeta.Icon;

  const setBtnRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (buttonRef) {
        (
          buttonRef as React.MutableRefObject<HTMLButtonElement | null>
        ).current = node;
      }
    },
    [buttonRef]
  );

  return (
    <MorphTooltip
      placement={collapsed ? "right" : "top"}
      className={collapsed ? undefined : "w-full"}
      content={
        isEn
          ? `Theme: ${currentLabel} (click for ${nextLabel})`
          : `主题：${currentLabel}（点击切换${nextLabel}）`
      }
    >
      <motion.button
        ref={setBtnRef}
        type="button"
        whileTap={TAP_SCALE_ICON}
        transition={SPRING_SNAPPY}
        onClick={(e) => onCycleTheme(e.currentTarget)}
        aria-label={
          isEn
            ? `Current theme: ${currentLabel}, switch to ${nextLabel}`
            : `当前主题：${currentLabel}，点击切换至${nextLabel}`
        }
        className={cn(
          "relative rounded-lg flex items-center justify-center transition-colors overflow-hidden",
          collapsed ? "h-8 w-9" : "w-full py-1.5",
          "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/65 dark:hover:bg-white/[0.06]"
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={preference}
            initial={{ opacity: 0, rotate: -75, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 75, scale: 0.5 }}
            transition={SPRING_SNAPPY}
            className="flex items-center justify-center"
          >
            <ActiveIcon className="h-3.5 w-3.5" />
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </MorphTooltip>
  );
};

interface ThemeStatusCapsuleProps {
  visible: boolean;
  preference: ThemePreference;
}

/**
 * Floating bottom-center capsule toast announcing active theme switches.
 */
export const ThemeStatusCapsule: React.FC<ThemeStatusCapsuleProps> = ({
  visible,
  preference,
}) => {
  const { isEn } = useI18n();
  const meta = PREFERENCE_META[preference];
  const label = isEn ? meta.labelEn : meta.labelZh;
  const Icon = meta.Icon;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[230] flex justify-center no-print select-none"
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 16, scale: 0.9, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, scale: 0.94, filter: "blur(3px)" }}
            transition={SPRING_SNAPPY}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full",
              "bg-white/95 dark:bg-[#15151a]/95 backdrop-blur-2xl",
              "border border-zinc-200/90 dark:border-white/[0.12]",
              "shadow-modal-light dark:shadow-popover text-xs font-medium text-zinc-800 dark:text-zinc-100"
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={preference}
                initial={{ opacity: 0, rotate: -65, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 65, scale: 0.5 }}
                transition={SPRING_SNAPPY}
                className="flex items-center justify-center shrink-0"
              >
                <Icon className={cn("h-3.5 w-3.5", meta.iconTint)} />
              </motion.span>
            </AnimatePresence>

            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${preference}-${isEn ? "en" : "zh"}`}
                initial={{ opacity: 0, y: 5, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -5, filter: "blur(2px)" }}
                transition={{ duration: 0.16, ease: EASE_PRECISION }}
                className="whitespace-nowrap tracking-tight"
              >
                {isEn ? `Theme: ${label}` : `主题：${label}`}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
