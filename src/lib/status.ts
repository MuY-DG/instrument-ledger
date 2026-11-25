import type { CalibrationStatus, Instrument, WarningThreshold } from "@/types";
import {
  DEFAULT_WARNING_THRESHOLDS,
  sortThresholdsAsc,
} from "@/lib/thresholdColors";

export function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseYmd(dateStr: string): Date | null {
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

/**
 * Standard metrology next calibration date calculation:
 * last_cal_date + cycle_months - 1 day
 * Example: 2026-06-18 + 12 months => 2027-06-17
 */
export function calcNextCalDate(lastCalDate: string, cycleMonths: number): string {
  if (!lastCalDate || !cycleMonths || cycleMonths <= 0) return "";
  const base = parseYmd(lastCalDate);
  if (!base) return "";

  const targetMonthTotal = base.getFullYear() * 12 + base.getMonth() + cycleMonths;
  const targetYear = Math.floor(targetMonthTotal / 12);
  const targetMonth = targetMonthTotal % 12;
  const maxDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(base.getDate(), maxDayInMonth);

  const added = new Date(targetYear, targetMonth, clampedDay);
  added.setDate(added.getDate() - 1);

  const y = added.getFullYear();
  const m = String(added.getMonth() + 1).padStart(2, "0");
  const d = String(added.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function diffDaysFromToday(targetDateStr: string): number | null {
  const target = parseYmd(targetDateStr);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

export interface InstrumentStatusInfo {
  status: CalibrationStatus;
  daysRemaining: number | null;
  label: string;
  detailText: string;
  isDueThisWeek: boolean;
  matchedThreshold: WarningThreshold | null;
}

export function getInstrumentStatus(
  inst: Pick<Instrument, "exemptCalibration" | "nextCalDate" | "remark">,
  thresholdsOrWarningDays: WarningThreshold[] | number = DEFAULT_WARNING_THRESHOLDS
): InstrumentStatusInfo {
  if (inst.exemptCalibration || !inst.nextCalDate.trim()) {
    return {
      status: "exempt",
      daysRemaining: null,
      label: "免校",
      detailText: inst.remark?.includes("无法校验")
        ? "无法校验"
        : inst.remark?.includes("无需校验")
          ? "无需校验"
          : "未设效期",
      isDueThisWeek: false,
      matchedThreshold: null,
    };
  }

  const diff = diffDaysFromToday(inst.nextCalDate);
  if (diff === null) {
    return {
      status: "exempt",
      daysRemaining: null,
      label: "待核对",
      detailText: inst.nextCalDate,
      isDueThisWeek: false,
      matchedThreshold: null,
    };
  }

  const isDueThisWeek = diff >= 0 && diff <= 7;

  if (diff < 0) {
    return {
      status: "expired",
      daysRemaining: diff,
      label: "已超期",
      detailText: `超期 ${Math.abs(diff)} 天`,
      isDueThisWeek: false,
      matchedThreshold: null,
    };
  }

  const ascThresholds: WarningThreshold[] =
    typeof thresholdsOrWarningDays === "number"
      ? [
          {
            id: `tier-${thresholdsOrWarningDays}`,
            days: thresholdsOrWarningDays,
            color: "#f59e0b",
            label: "即将到期",
          },
        ]
      : sortThresholdsAsc(thresholdsOrWarningDays);

  // Match the tightest (smallest days) threshold that covers daysRemaining
  const matched = ascThresholds.find((t) => diff <= t.days) ?? null;
  if (matched) {
    return {
      status: "warning",
      daysRemaining: diff,
      label: matched.label || `${matched.days}天预警`,
      detailText: diff === 0 ? "今日到期" : `剩 ${diff} 天`,
      isDueThisWeek,
      matchedThreshold: matched,
    };
  }

  return {
    status: "valid",
    daysRemaining: diff,
    label: "正常有效",
    detailText: `剩 ${diff} 天`,
    isDueThisWeek,
    matchedThreshold: null,
  };
}

export interface ExpiryAlertTierGroup {
  threshold: WarningThreshold;
  items: Array<{ instrument: Instrument; statusInfo: InstrumentStatusInfo }>;
}

export interface ExpiryAlertSummary {
  expired: Array<{ instrument: Instrument; statusInfo: InstrumentStatusInfo }>;
  tiers: ExpiryAlertTierGroup[];
  allAlertItems: Array<{ instrument: Instrument; statusInfo: InstrumentStatusInfo }>;
  totalAlertCount: number;
  highestSeverityColor: string | null;
}

export function summarizeExpiryAlerts(
  instruments: Instrument[],
  thresholds: WarningThreshold[]
): ExpiryAlertSummary {
  const asc = sortThresholdsAsc(thresholds);
  const expired: Array<{ instrument: Instrument; statusInfo: InstrumentStatusInfo }> = [];
  const tierMap = new Map<string, ExpiryAlertTierGroup>();

  for (const t of asc) {
    tierMap.set(t.id, { threshold: t, items: [] });
  }

  for (const inst of instruments) {
    const statusInfo = getInstrumentStatus(inst, asc);
    if (statusInfo.status === "expired") {
      expired.push({ instrument: inst, statusInfo });
    } else if (statusInfo.status === "warning" && statusInfo.matchedThreshold) {
      const bucket = tierMap.get(statusInfo.matchedThreshold.id);
      if (bucket) {
        bucket.items.push({ instrument: inst, statusInfo });
      }
    }
  }

  const byDaysAsc = (
    a: { statusInfo: InstrumentStatusInfo },
    b: { statusInfo: InstrumentStatusInfo }
  ) =>
    (a.statusInfo.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
    (b.statusInfo.daysRemaining ?? Number.MAX_SAFE_INTEGER);

  expired.sort(byDaysAsc);
  const tiers = asc.map((t) => {
    const group = tierMap.get(t.id)!;
    group.items.sort(byDaysAsc);
    return group;
  });

  const allAlertItems = [...expired, ...tiers.flatMap((g) => g.items)];
  const totalAlertCount = allAlertItems.length;

  let highestSeverityColor: string | null = null;
  if (expired.length > 0) {
    highestSeverityColor = "#f43f5e";
  } else {
    const firstNonEmpty = tiers.find((g) => g.items.length > 0);
    if (firstNonEmpty) {
      highestSeverityColor = firstNonEmpty.threshold.color;
    }
  }

  return {
    expired,
    tiers,
    allAlertItems,
    totalAlertCount,
    highestSeverityColor,
  };
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function formatShortDateTime(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function calTypeLabel(calType: string): string {
  switch (calType) {
    case "internal":
      return "内校";
    case "external":
      return "外校";
    case "exempt":
      return "免校";
    default:
      return calType || "-";
  }
}
