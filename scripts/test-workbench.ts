import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { WORKBENCH_TOOLS, getWorkbenchToolById } from "../src/workbench/registry";
import { readEditablePdf, writePdf } from "../src/workbench/tools/pdf-balloon/core/editable-pdf";
import {
  DEFAULT_PAGE_SPACING,
  nearestPage,
  pageLayout,
  parseRange,
  visiblePages,
} from "../src/workbench/tools/pdf-balloon/core/geometry";
import { historyReducer } from "../src/workbench/tools/pdf-balloon/core/history";
import { resizeStyle } from "../src/workbench/tools/pdf-balloon/core/marker-size";
import { normalizePreferences } from "../src/workbench/tools/pdf-balloon/core/preferences";
import { IMAGE_BUDGETS } from "../src/workbench/tools/pdf-balloon/core/image-budget";
import { imageDpiLimit, imagePlan } from "../src/workbench/tools/pdf-balloon/core/image-plan";
import { PNGStreamEncoder } from "../src/workbench/tools/pdf-balloon/core/codecs/png-stream";
import { DEFAULT_CACHE_LIMIT_MB } from "../src/workbench/tools/pdf-balloon/core/drafts";
import { DEFAULT_STYLE } from "../src/workbench/tools/pdf-balloon/types";
import {
  PRIMARY_CODE_LETTERS,
  STANDARD_AQL_VALUES,
} from "../src/workbench/tools/aql-sampling/core/tables";
import {
  compareAllSeverities,
  evaluateDefectCount,
  evaluateMultiClassLot,
  resolveSamplingPlan,
} from "../src/workbench/tools/aql-sampling/core/engine";
import {
  binomialCdf,
  computeAcceptanceProbability,
  computeOcAnalytics,
} from "../src/workbench/tools/aql-sampling/core/statistics";
import {
  createInitialSwitchingTracker,
  recordSwitchingLot,
} from "../src/workbench/tools/aql-sampling/core/switching";
import {
  buildAqlExcelBlob,
  buildInspectionSummaryText,
} from "../src/workbench/tools/aql-sampling/core/export";
import { createDefaultDefectClasses } from "../src/workbench/tools/aql-sampling/core/presets";

async function main() {
  // 1. Registry checks
  const ids = new Set(WORKBENCH_TOOLS.map((t) => t.id));
  assert.equal(ids.size, WORKBENCH_TOOLS.length, "Duplicate workbench tool IDs");
  const pdfTool = getWorkbenchToolById("pdf-balloon");
  assert.ok(pdfTool && pdfTool.status === "ready" && typeof pdfTool.load === "function");
  assert.equal(DEFAULT_CACHE_LIMIT_MB, 1024, "Default workbench cache cap should be 1 GB (1024 MB)");
  console.log("✅ Workbench registry & 1 GB default cache cap checks passed");

  // 2. Editable & flattened PDF vector roundtrip
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const baseBytes = await doc.save();

  const sampleMarkers = [
    {
      ...DEFAULT_STYLE,
      id: "m-1",
      page: 1,
      x: 120,
      y: 240,
      number: 1,
      pdfX: 120,
      pdfY: 602,
      pdfScale: 1,
      rotation: 0,
    },
    {
      ...DEFAULT_STYLE,
      id: "m-2",
      page: 1,
      x: 310,
      y: 410,
      number: 2,
      borderColor: "#2563eb",
      textColor: "#2563eb",
      fillColor: null,
      pdfX: 310,
      pdfY: 432,
      pdfScale: 1,
      rotation: 0,
    },
  ];

  const flatBytes = await writePdf(baseBytes, sampleMarkers, { editable: false });
  assert.ok(flatBytes.byteLength > baseBytes.byteLength, "Flattened PDF should contain drawn balloons");

  const editableBytes = await writePdf(baseBytes, sampleMarkers, {
    editable: true,
    nextNumber: 3,
  });
  const recovered = await readEditablePdf(editableBytes);
  assert.equal(recovered.nextNumber, 3);
  assert.equal(recovered.markers?.length, 2);
  assert.equal(recovered.markers?.[0].number, 1);
  assert.equal(recovered.markers?.[1].borderColor, "#2563eb");
  assert.equal(recovered.markers?.[1].fillColor, null);
  console.log("✅ Editable & flattened vector PDF roundtrip passed");

  // 3. Geometry & pagination
  const pages = [
    { number: 1, width: 600, height: 800, rotation: 0 },
    { number: 2, width: 600, height: 800, rotation: 0 },
    { number: 3, width: 600, height: 800, rotation: 0 },
  ];
  const layout = pageLayout(pages, 1, DEFAULT_PAGE_SPACING);
  assert.equal(layout.offsets.length, 3);
  assert.deepEqual(visiblePages(layout.offsets, pages, 1, 0, 700, 100), [0]);
  assert.equal(nearestPage(layout.offsets, pages, 1, 1200), 1);
  assert.deepEqual(parseRange("1-2,3", 3), [1, 2, 3]);
  console.log("✅ PDF geometry & range parser checks passed");

  // 4. Grouped undo/redo history & linked resize
  const group = {};
  let hist = historyReducer(
    { items: [], defaults: DEFAULT_STYLE, past: [], future: [] },
    {
      type: "commit",
      group,
      update: (s) => ({
        ...s,
        defaults: resizeStyle(s.defaults, s.defaults, 4, true),
      }),
    }
  );
  hist = historyReducer(hist, {
    type: "commit",
    group,
    update: (s, base) => ({
      ...s,
      defaults: resizeStyle(s.defaults, base.defaults, 4, true),
    }),
  });
  assert.equal(hist.past.length, 1, "Grouped resize should collapse into a single undo step");
  assert.equal(hist.defaults.size, 36);
  hist = historyReducer(hist, { type: "undo" });
  assert.equal(hist.defaults.size, DEFAULT_STYLE.size);
  console.log("✅ Grouped undo/redo and linked marker resize checks passed");

  // 5. Preferences & high-DPI streaming PNG encoder
  const prefs = normalizePreferences({ inspectorPlacement: "sidebar", editablePdf: true });
  assert.equal(prefs.inspectorPlacement, "sidebar");
  assert.equal(prefs.editablePdf, true);

  const dpiLimit = imageDpiLimit(pages[0], "png", IMAGE_BUDGETS.high);
  assert.ok(dpiLimit >= 600);
  const plan = imagePlan(pages[0], 10, "png", IMAGE_BUDGETS.safe);
  assert.equal(plan.tiled, true, "Large scale export should activate tiled streaming");

  const chunks: Uint8Array[] = [];
  const encoder = new PNGStreamEncoder(4, 2, 300, (b) => chunks.push(b));
  encoder.writeRows({ width: 4, height: 2, data: new Uint8Array(4 * 2 * 4).fill(255) });
  encoder.finish();
  const totalBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  assert.ok(totalBytes > 40, "PNG stream output should be non-empty");
  assert.equal(chunks[0][0], 137);
  assert.equal(chunks[0][1], 80); // 'P'
  assert.equal(chunks[0][2], 78); // 'N'
  assert.equal(chunks[0][3], 71); // 'G'
  console.log("✅ Preferences, tiled image plan, and streaming PNG codec checks passed");

  // 6. Strict CSS isolation audit
  const cssPath = path.resolve(
    process.cwd(),
    "src/workbench/tools/pdf-balloon/folio.css"
  );
  const css = fs.readFileSync(cssPath, "utf8");
  const badGlobalRules = css
    .split("\n")
    .filter((line) => /^(body|:root|html|button|input|select|kbd|fieldset)\s*[{,]/.test(line.trim()));
  assert.equal(
    badGlobalRules.length,
    0,
    `Found unscoped global CSS selectors in folio.css: ${badGlobalRules.join("; ")}`
  );
  console.log("✅ Strict CSS isolation audit passed (0 leaked global selectors)");

  // 7. AQL Sampling Calculator registry & exhaustive 2,496-cell master table audit
  const aqlTool = getWorkbenchToolById("aql-sampling");
  assert.ok(
    aqlTool && aqlTool.status === "ready" && aqlTool.keepAlive && typeof aqlTool.load === "function",
    "aql-sampling tool should be registered as ready with lazy loader"
  );

  let verifiedCells = 0;
  for (const standard of ["gbt2828", "ansi_z14"] as const) {
    for (const severity of ["normal", "tightened", "reduced"] as const) {
      for (const code of PRIMARY_CODE_LETTERS) {
        for (const aql of STANDARD_AQL_VALUES) {
          const res = resolveSamplingPlan({
            standard,
            lotSize: null,
            level: "II",
            severity,
            aql,
            directCodeLetter: code,
          });
          assert.ok(res.sampleSize >= 2, `Invalid sample size for ${standard}/${severity}/${code}/${aql}`);
          assert.ok(res.ac >= 0 && res.re > res.ac, `Invalid Ac/Re for ${standard}/${severity}/${code}/${aql}`);
          if (standard === "gbt2828" || severity !== "reduced") {
            assert.equal(
              res.re,
              res.ac + 1,
              `Expected Re = Ac + 1 for ${standard}/${severity}/${code}/${aql}`
            );
          }
          verifiedCells += 1;
        }
      }
    }
  }
  assert.equal(verifiedCells, 2 * 3 * 16 * 26, "All 2,496 master table lookups must succeed");

  // 8. Golden textbook spot checks (GB/T 2828.1-2012 & ANSI/ASQ Z1.4)
  // Lot 2000, Level II -> Code K
  const kNorm10 = resolveSamplingPlan({ standard: "gbt2828", lotSize: 2000, level: "II", severity: "normal", aql: 1.0 });
  assert.equal(kNorm10.originalCode, "K");
  assert.equal(kNorm10.effectiveCode, "K");
  assert.equal(kNorm10.sampleSize, 125);
  assert.equal(kNorm10.ac, 3);
  assert.equal(kNorm10.re, 4);

  // Arrow up (K, AQL 0.15 -> J, n=80, 0/1) & Arrow down (K, AQL 0.25 -> L, n=200, 1/2)
  const kNorm015 = resolveSamplingPlan({ standard: "gbt2828", lotSize: 2000, level: "II", severity: "normal", aql: 0.15 });
  assert.equal(kNorm015.effectiveCode, "J");
  assert.equal(kNorm015.arrowFollowed, "up");
  assert.equal(kNorm015.sampleSize, 80);
  assert.equal(kNorm015.ac, 0);
  assert.equal(kNorm015.re, 1);

  const kNorm025 = resolveSamplingPlan({ standard: "gbt2828", lotSize: 2000, level: "II", severity: "normal", aql: 0.25 });
  assert.equal(kNorm025.effectiveCode, "L");
  assert.equal(kNorm025.arrowFollowed, "down");
  assert.equal(kNorm025.sampleSize, 200);
  assert.equal(kNorm025.ac, 1);
  assert.equal(kNorm025.re, 2);

  // Tightened Code K, AQL 4.0 -> 8/9; Code R, AQL 0.025 -> S (n=3150, 1/2)
  const kTight40 = resolveSamplingPlan({ standard: "gbt2828", lotSize: 2000, level: "II", severity: "tightened", aql: 4.0 });
  assert.equal(kTight40.sampleSize, 125);
  assert.equal(kTight40.ac, 8);
  assert.equal(kTight40.re, 9);

  const rTight0025 = resolveSamplingPlan({ standard: "gbt2828", lotSize: 600000, level: "III", severity: "tightened", aql: 0.025 });
  assert.equal(rTight0025.originalCode, "R");
  assert.equal(rTight0025.effectiveCode, "S");
  assert.equal(rTight0025.sampleSize, 3150);
  assert.equal(rTight0025.ac, 1);
  assert.equal(rTight0025.re, 2);

  // Reduced comparison: GB/T 2828.1-2012 (gap-free) vs ANSI Z1.4 (gap 1/4) at K, AQL 1.0
  const kRedGbt = resolveSamplingPlan({ standard: "gbt2828", lotSize: 2000, level: "II", severity: "reduced", aql: 1.0 });
  assert.equal(kRedGbt.sampleSize, 50);
  assert.equal(kRedGbt.ac, 2);
  assert.equal(kRedGbt.re, 3);
  assert.equal(kRedGbt.hasReducedGap, false);

  const kRedAnsi = resolveSamplingPlan({ standard: "ansi_z14", lotSize: 2000, level: "II", severity: "reduced", aql: 1.0 });
  assert.equal(kRedAnsi.sampleSize, 50);
  assert.equal(kRedAnsi.ac, 1);
  assert.equal(kRedAnsi.re, 4);
  assert.equal(kRedAnsi.hasReducedGap, true);
  assert.equal(evaluateDefectCount(kRedAnsi, 1), "accept");
  assert.equal(evaluateDefectCount(kRedAnsi, 2), "accept_revert_normal");
  assert.equal(evaluateDefectCount(kRedAnsi, 3), "accept_revert_normal");
  assert.equal(evaluateDefectCount(kRedAnsi, 4), "reject");

  // 100% full inspection cap when tableSampleSize >= lotSize
  const capped = resolveSamplingPlan({ standard: "gbt2828", lotSize: 10, level: "II", severity: "normal", aql: 0.65 });
  assert.equal(capped.tableSampleSize, 20);
  assert.equal(capped.sampleSize, 10);
  assert.equal(capped.isFullInspection, true);
  assert.equal(capped.ac, 0);
  assert.equal(capped.re, 1);

  // Multi-class lot evaluation with mixed sample sizes (Lot=500, Level II -> H=50, MAJ=0.65 -> J=80)
  const defaultClasses = createDefaultDefectClasses();
  const multi = evaluateMultiClassLot({
    standard: "gbt2828",
    lotSize: 500,
    level: "II",
    severity: "normal",
    classes: defaultClasses,
  });
  assert.equal(multi.recommendedTotalSample, 80);
  assert.equal(multi.hasMixedSampleSizes, true);
  assert.equal(multi.overallVerdict, "accept");

  // 9. OC Curve statistics & Switching Rules state machine
  assert.equal(binomialCdf(125, 3, 0), 1);
  assert.equal(binomialCdf(125, 3, 1), 0);
  const sevSet = compareAllSeverities({ standard: "gbt2828", lotSize: 2000, level: "II", aql: 1.0 });
  const paRed = computeAcceptanceProbability(sevSet.reduced, 1.0);
  const paNorm = computeAcceptanceProbability(sevSet.normal, 1.0);
  const paTight = computeAcceptanceProbability(sevSet.tightened, 1.0);
  assert.ok(paRed > paNorm && paNorm > paTight, "Reduced Pa > Normal Pa > Tightened Pa at AQL");

  const oc = computeOcAnalytics(sevSet.normal);
  assert.ok(oc.paAtAql > 0.95 && oc.paAtAql < 0.98, `Unexpected Pa at AQL: ${oc.paAtAql}`);
  assert.ok(oc.lq10Percent > oc.iqlPercent && oc.iqlPercent > 1.0);
  assert.ok(oc.aoqlPercent > 0);

  // Switching tracker: Normal -> Tightened (2/5 rejects) -> Normal (5 accepts) -> Reduced (30 pts)
  let sw = createInitialSwitchingTracker("gbt2828", "normal");
  sw = recordSwitchingLot(sw, "reject", 3);
  sw = recordSwitchingLot(sw, "accept", 3);
  sw = recordSwitchingLot(sw, "reject", 3);
  assert.equal(sw.currentState, "tightened");
  for (let i = 0; i < 5; i++) sw = recordSwitchingLot(sw, "accept", 2);
  assert.equal(sw.currentState, "normal");
  for (let i = 0; i < 10; i++) sw = recordSwitchingLot(sw, "accept_strict", 3);
  assert.equal(sw.currentState, "reduced");

  // 10. Summary text & ExcelJS export
  const summaryText = buildInspectionSummaryText({
    standard: "gbt2828",
    lotSize: 500,
    level: "II",
    severity: "normal",
    meta: { partName: "壳体", lotNo: "LOT-01", supplier: "A厂", stage: "IQC", inspector: "张工", notes: "" },
    summary: multi,
  });
  assert.ok(summaryText.includes("综合判定结论：允收 (ACCEPT)"));

  const xlsxBlob = await buildAqlExcelBlob([
    {
      id: "test-1",
      createdAt: "2026-11-28 14:20",
      standard: "gbt2828",
      lotSize: 500,
      level: "II",
      severity: "normal",
      meta: { partName: "壳体", lotNo: "LOT-01", supplier: "A厂", stage: "IQC", inspector: "张工", notes: "" },
      classes: multi.evaluations.map((e) => ({
        id: e.config.id,
        label: e.config.label,
        aql: e.config.aql,
        effectiveCode: e.plan.effectiveCode,
        sampleSize: e.plan.sampleSize,
        ac: e.plan.ac,
        re: e.plan.re,
        defectsFound: e.config.defectsFound,
        verdict: e.verdict,
      })),
      recommendedTotalSample: multi.recommendedTotalSample,
      overallVerdict: multi.overallVerdict,
    },
  ]);
  assert.ok(xlsxBlob.size > 2000, "Generated AQL Excel workbook should be non-empty");
  console.log("✅ AQL Sampling Calculator (2,496-cell matrix, OC stats, switching rules & Excel export) passed");
}

main().catch((err) => {
  console.error("❌ Workbench test failed:", err);
  process.exit(1);
});
