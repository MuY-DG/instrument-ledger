import fs from "node:fs";
import path from "node:path";
import { parseJsskExcel, exportJsskExcel } from "../src/lib/excel";
import { calcNextCalDate } from "../src/lib/status";
import type { AppSettings, Instrument } from "../src/types";

async function main() {
  // 1. Verify date calculation rule (+N months - 1 day)
  const cases: Array<[string, number, string]> = [
    ["2026-06-18", 12, "2027-06-17"],
    ["2026-03-19", 12, "2027-03-18"],
    ["2025-12-25", 12, "2026-12-24"],
    ["2026-01-31", 1, "2026-02-27"],
  ];
  for (const [last, cycle, expected] of cases) {
    const got = calcNextCalDate(last, cycle);
    if (got !== expected) {
      throw new Error(`calcNextCalDate(${last}, ${cycle}) = ${got}, expected ${expected}`);
    }
  }
  console.log("✅ Date calculation checks passed");

  // 2. Parse the real JSSK-MPR-170 Excel file if present in workspace
  const xlsxPath = path.resolve(
    process.cwd(),
    "JSSK-MPR-170 监视与测量管理台账.xlsx"
  );
  if (!fs.existsSync(xlsxPath)) {
    console.log("ℹ️ Real Excel file not present, skipping real-file parse check.");
    return;
  }

  const fileBuf = fs.readFileSync(xlsxPath);
  const ab = fileBuf.buffer.slice(
    fileBuf.byteOffset,
    fileBuf.byteOffset + fileBuf.byteLength
  );

  const parsed = await parseJsskExcel(ab);
  console.log(
    `✅ Parsed real JSSK-MPR-170 Excel: total=${parsed.rows.length}, gauges=${parsed.gaugeCount}, fixtures=${parsed.fixtureCount}`
  );

  if (parsed.gaugeCount !== 167 || parsed.fixtureCount !== 23) {
    throw new Error(
      `Expected 167 gauges + 23 fixtures, got ${parsed.gaugeCount} + ${parsed.fixtureCount}`
    );
  }

  // Verify tricky row #2 (date-formatted serialNo 1932-06-24)
  const row2 = parsed.rows[1];
  console.log("  Row #2:", { name: row2.name, serialNo: row2.serialNo, nextCalDate: row2.nextCalDate });
  if (row2.serialNo !== "1932-06-24") {
    throw new Error(`Row #2 serialNo mismatch: got ${row2.serialNo}`);
  }

  // Verify exempt rows (#87, #127, #129)
  const exemptRows = parsed.rows.filter((r) => r.exemptCalibration);
  console.log(
    "  Exempt rows detected:",
    exemptRows.map((r) => `${r.name} (${r.remark})`)
  );
  if (exemptRows.length < 3) {
    throw new Error(`Expected >= 3 exempt rows, got ${exemptRows.length}`);
  }

  // Verify Sheet 2 (检具) first row
  const firstFixture = parsed.rows.find((r) => r.category === "fixture");
  console.log("  First fixture:", {
    dept: firstFixture?.department,
    name: firstFixture?.name,
    serialNo: firstFixture?.serialNo,
    calType: firstFixture?.calibrationType,
    remark: firstFixture?.remark,
  });
  if (!firstFixture || firstFixture.calibrationType !== "internal") {
    throw new Error("Fixture calibration type should be internal");
  }

  // 3. Test round-trip export to Excel and re-parse!
  const fakeSettings: AppSettings = {
    adminUsername: "qa_admin",
    warningDays: 30,
    autoLockMinutes: 0,
    docCode: "JSSK-MPR-170",
    docVersion: "A",
    docTitle: "监视与测量管理台账",
    docSubtitle: "The management record and plan of monitoring and measuring equipment",
    weeklyNotice: "定期核查监视与测量设备校准有效期，确保量值溯源准确可靠",
    githubRepo: "",
    updateProxyUrl: "",
    companyLogoPath: "",
  };

  const instruments: Instrument[] = parsed.rows.map((r, idx) => ({
    id: idx + 1,
    category: r.category,
    seqNo: r.seqNo ?? idx + 1,
    department: r.department,
    name: r.name,
    purchaseDate: r.purchaseDate,
    serialNo: r.serialNo,
    modelSpec: r.modelSpec,
    location: r.location,
    calibrationType: r.calibrationType,
    recordType: r.recordType,
    lastCalDate: r.lastCalDate,
    calCycleMonths: r.calCycleMonths,
    nextCalDate: r.nextCalDate || "",
    exemptCalibration: r.exemptCalibration,
    remark: r.remark,
    supplier: r.supplier,
    contactPerson: r.contactPerson,
    contactPhone: r.contactPhone,
    calAgency: r.calAgency,
    photoPath: "",
    reportCount: 0,
    latestReportId: null,
    latestReportName: null,
    latestReportExt: null,
    createdAt: "",
    updatedAt: "",
  }));

  const exportedBytes = await exportJsskExcel(instruments, fakeSettings, null);
  const roundTrip = await parseJsskExcel(
    exportedBytes.buffer.slice(
      exportedBytes.byteOffset,
      exportedBytes.byteOffset + exportedBytes.byteLength
    )
  );
  console.log(
    `✅ Exported (${exportedBytes.byteLength} bytes) and re-parsed: total=${roundTrip.rows.length}, gauges=${roundTrip.gaugeCount}, fixtures=${roundTrip.fixtureCount}`
  );
  if (roundTrip.gaugeCount !== 167 || roundTrip.fixtureCount !== 23) {
    throw new Error(
      `Round-trip mismatch: got ${roundTrip.gaugeCount} + ${roundTrip.fixtureCount}`
    );
  }
}

main().catch((err) => {
  console.error("❌ Excel test failed:", err);
  process.exit(1);
});
