import { getInstrumentStatus, summarizeExpiryAlerts } from "../src/lib/status";
import {
  DEFAULT_WARNING_THRESHOLDS,
  getThresholdVisuals,
  normalizeThresholds,
} from "../src/lib/thresholdColors";
import type { Instrument, WarningThreshold } from "../src/types";

function dateOffset(daysFromToday: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysFromToday);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeInstrument(id: number, name: string, offsetDays: number | null): Instrument {
  return {
    id,
    category: "gauge",
    seqNo: id,
    department: "品质部",
    name,
    purchaseDate: "",
    serialNo: `SN-${id}`,
    modelSpec: "",
    location: "",
    calibrationType: offsetDays === null ? "exempt" : "external",
    recordType: "校准报告",
    lastCalDate: "",
    calCycleMonths: 12,
    nextCalDate: offsetDays === null ? "" : dateOffset(offsetDays),
    exemptCalibration: offsetDays === null,
    remark: "",
    supplier: "",
    contactPerson: "",
    contactPhone: "",
    calAgency: "",
    photoPath: "",
    reportCount: 0,
    latestReportId: null,
    latestReportName: null,
    latestReportExt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// 1. Default 60/30/15 tier matching (tightest threshold wins)
const instExpired = makeInstrument(1, "卡尺A", -3);
const instToday = makeInstrument(2, "卡尺B", 0);
const inst10d = makeInstrument(3, "卡尺C", 10);
const inst15d = makeInstrument(4, "卡尺D", 15);
const inst16d = makeInstrument(5, "卡尺E", 16);
const inst30d = makeInstrument(6, "卡尺F", 30);
const inst45d = makeInstrument(7, "卡尺G", 45);
const inst60d = makeInstrument(8, "卡尺H", 60);
const inst61d = makeInstrument(9, "卡尺I", 61);
const instExempt = makeInstrument(10, "工具J", null);

assert(getInstrumentStatus(instExpired, DEFAULT_WARNING_THRESHOLDS).status === "expired", "expired failed");
assert(getInstrumentStatus(instToday, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 15, "0d should match 15d");
assert(getInstrumentStatus(inst10d, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 15, "10d should match 15d");
assert(getInstrumentStatus(inst15d, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 15, "15d should match 15d");
assert(getInstrumentStatus(inst16d, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 30, "16d should match 30d");
assert(getInstrumentStatus(inst30d, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 30, "30d should match 30d");
assert(getInstrumentStatus(inst45d, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 60, "45d should match 60d");
assert(getInstrumentStatus(inst60d, DEFAULT_WARNING_THRESHOLDS).matchedThreshold?.days === 60, "60d should match 60d");
assert(getInstrumentStatus(inst61d, DEFAULT_WARNING_THRESHOLDS).status === "valid", "61d should be valid");
assert(getInstrumentStatus(instExempt, DEFAULT_WARNING_THRESHOLDS).status === "exempt", "exempt failed");

// 2. Custom thresholds normalization & deduplication
const custom: WarningThreshold[] = normalizeThresholds([
  { id: "c7", days: 7, color: "#EF4444", label: "一周急件" },
  { id: "c90", days: 90, color: "#8b5cf6", label: "季度关注" },
  { id: "c7dup", days: 7, color: "#000000", label: "重复项" },
]);
assert(custom.length === 2, "deduplication failed");
assert(custom[0].days === 90 && custom[1].days === 7, "descending sort failed");
assert(custom[1].color === "#ef4444", "hex normalization failed");

// 3. Alert summary grouping without double-counting
const summary = summarizeExpiryAlerts(
  [instExpired, instToday, inst10d, inst15d, inst16d, inst30d, inst45d, inst60d, inst61d, instExempt],
  DEFAULT_WARNING_THRESHOLDS
);
assert(summary.expired.length === 1, `expected 1 expired, got ${summary.expired.length}`);
assert(summary.tiers.length === 3, "expected 3 tiers");
assert(summary.tiers[0].threshold.days === 15 && summary.tiers[0].items.length === 3, "15d tier should have 3 items (0,10,15)");
assert(summary.tiers[1].threshold.days === 30 && summary.tiers[1].items.length === 2, "30d tier should have 2 items (16,30)");
assert(summary.tiers[2].threshold.days === 60 && summary.tiers[2].items.length === 2, "60d tier should have 2 items (45,60)");
assert(summary.totalAlertCount === 8, `expected 8 total alerts, got ${summary.totalAlertCount}`);
assert(summary.highestSeverityColor === "#f43f5e", "expired should set rose highest severity");

// 4. Color visual adaptation (bright yellow must darken for light mode)
const yellowVisuals = getThresholdVisuals("#eab308");
assert(yellowVisuals.textLight !== "#eab308", "yellow textLight should be darkened for contrast");
assert(yellowVisuals.excelFillArgb.length === 8 && yellowVisuals.excelFillArgb.startsWith("FF"), "valid Excel ARGB");

console.log("✅ All multi-tier expiry threshold & alert summary tests passed!");
