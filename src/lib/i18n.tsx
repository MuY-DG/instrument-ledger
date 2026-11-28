import React, { createContext, useContext, useEffect, useMemo } from "react";
import type { ResolvedLocale, UiLanguage } from "@/types";

export const UI_LANGUAGE_STORAGE_KEY = "instrument_ledger_ui_language";

let currentResolvedLocale: ResolvedLocale = "zh-CN";

export function detectSystemLocale(): ResolvedLocale {
  if (typeof navigator === "undefined") return "zh-CN";
  const lang = (navigator.language || navigator.languages?.[0] || "zh-CN").toLowerCase();
  return lang.startsWith("zh") ? "zh-CN" : "en";
}

export function resolveLocale(pref: UiLanguage): ResolvedLocale {
  if (pref === "en") return "en";
  if (pref === "zh-CN") return "zh-CN";
  return detectSystemLocale();
}

export function getStoredUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (raw === "zh-CN" || raw === "en" || raw === "system") return raw;
  } catch {
    // ignore storage errors
  }
  return "system";
}

export function saveStoredUiLanguage(pref: UiLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, pref);
  } catch {
    // ignore
  }
}

export function getActiveLocale(): ResolvedLocale {
  return currentResolvedLocale;
}

export function tr(zh: string, en: string, locale: ResolvedLocale = currentResolvedLocale): string {
  return locale === "en" ? en : zh;
}

export interface I18nContextValue {
  language: UiLanguage;
  locale: ResolvedLocale;
  isEn: boolean;
  t: (zh: string, en: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: "system",
  locale: "zh-CN",
  isEn: false,
  t: (zh) => zh,
});

export const I18nProvider: React.FC<{
  language: UiLanguage;
  children: React.ReactNode;
}> = ({ language, children }) => {
  const locale = resolveLocale(language);
  currentResolvedLocale = locale;

  useEffect(() => {
    currentResolvedLocale = locale;
    saveStoredUiLanguage(language);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [language, locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale,
      isEn: locale === "en",
      t: (zh: string, en: string) => (locale === "en" ? en : zh),
    }),
    [language, locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
