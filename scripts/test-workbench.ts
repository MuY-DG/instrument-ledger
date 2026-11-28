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
import {
  IMR_CONSTANTS,
  computeC4,
  getSubgroupConstants,
} from "../src/workbench/tools/spc-cpk/core/constants";
import {
  computeNormalityTest,
  inverseNormalCdf,
  normalCdf,
} from "../src/workbench/tools/spc-cpk/core/statistics";
import { detectNelsonViolations } from "../src/workbench/tools/spc-cpk/core/nelson";
import { runSpcAnalysis } from "../src/workbench/tools/spc-cpk/core/engine";
import {
  parseExcelArrayBuffer,
  parseRawMeasurements,
} from "../src/workbench/tools/spc-cpk/core/parser";
import { SPC_SCENE_PRESETS } from "../src/workbench/tools/spc-cpk/core/presets";
import {
  buildSpcExcelBlob,
  buildSpcSummaryText,
} from "../src/workbench/tools/spc-cpk/core/export";
import {
  evaluateMeasurement,
  lookupIso2768Angular,
  lookupIso2768Geom,
  lookupIso2768Linear,
} from "../src/workbench/tools/iso-tolerance/core/iso2768";
import {
  getItMicrons,
  parseIso286Notation,
  recommendItGradesForTolerance,
  resolveIso286Fit,
  resolveIso286Zone,
} from "../src/workbench/tools/iso-tolerance/core/iso286Engine";
import {
  resolveChecksheetItem,
  summarizeChecksheet,
} from "../src/workbench/tools/iso-tolerance/core/inspector";
import { CHECKSHEET_SCENE_PRESETS } from "../src/workbench/tools/iso-tolerance/core/presets";
import {
  buildChecksheetExcelBlob,
  buildChecksheetSummaryText,
  buildFitSummaryText,
  buildIso2768SummaryText,
  buildToleranceHistoryExcelBlob,
} from "../src/workbench/tools/iso-tolerance/core/export";

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

  // 11. CPK / SPC Process Capability Analysis registry & AIAG constants audit
  const spcTool = getWorkbenchToolById("spc-cpk");
  assert.ok(
    spcTool && spcTool.status === "ready" && spcTool.keepAlive && typeof spcTool.load === "function",
    "spc-cpk tool should be registered as ready with lazy loader"
  );

  // AIAG SPC textbook constant spot checks (n=2, 5, 10, 25)
  const c5 = getSubgroupConstants(5);
  assert.ok(Math.abs(c5.d2 - 2.3259) < 0.0005, `Expected d2(5)≈2.3259, got ${c5.d2}`);
  assert.ok(Math.abs(c5.A2 - 0.5768) < 0.0005, `Expected A2(5)≈0.5768, got ${c5.A2}`);
  assert.equal(c5.D3, 0, "Expected D3(5)=0");
  assert.ok(Math.abs(c5.D4 - 2.1145) < 0.001, `Expected D4(5)≈2.1145, got ${c5.D4}`);
  assert.ok(Math.abs(c5.c4 - 0.9400) < 0.0005, `Expected c4(5)≈0.9400, got ${c5.c4}`);
  assert.ok(Math.abs(c5.A3 - 1.4273) < 0.001, `Expected A3(5)≈1.4273, got ${c5.A3}`);
  assert.ok(Math.abs(c5.B4 - 2.089) < 0.002, `Expected B4(5)≈2.089, got ${c5.B4}`);

  const c10 = getSubgroupConstants(10);
  assert.ok(c10.D3 > 0.22 && c10.D3 < 0.23, `Expected D3(10)≈0.223, got ${c10.D3}`);
  assert.ok(Math.abs(IMR_CONSTANTS.E2 - 2.6587) < 0.002);
  assert.ok(Math.abs(computeC4(2) - 0.79788) < 0.0002);

  // Normal CDF & Acklam Inverse CDF accuracy roundtrip
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-5);
  for (const p of [0.001, 0.025, 0.1, 0.5, 0.9, 0.975, 0.999]) {
    const z = inverseNormalCdf(p);
    assert.ok(Math.abs(normalCdf(z) - p) < 1e-5, `Inverse CDF roundtrip failed for p=${p}`);
  }

  // 12. All 6 SPC engineering presets verification
  const presetResults = new Map(
    SPC_SCENE_PRESETS.map((preset) => [
      preset.id,
      runSpcAnalysis(preset.values, {
        spec: preset.spec,
        subgroupSize: preset.subgroupSize,
        chartMode: preset.chartMode,
        enabledRules: [1, 2, 3, 4, 5, 6, 7, 8],
      }),
    ])
  );

  // CNC shaft stable A+
  const cncRes = presetResults.get("cnc-shaft-stable")!;
  assert.equal(cncRes.valid, true);
  assert.equal(cncRes.effectiveChartType, "xbar_r");
  assert.equal(cncRes.subgroups.length, 25);
  assert.ok((cncRes.capability.cpk ?? 0) >= 1.5, `Expected CNC Cpk >= 1.5, got ${cncRes.capability.cpk}`);
  assert.equal(cncRes.normality.isNormal, true, "CNC shaft data should pass normality test");

  // Mold wall shifted: Cp high, Cpk pulled down by positive Ca shift
  const moldRes = presetResults.get("mold-wall-shifted")!;
  assert.equal(moldRes.valid, true);
  assert.ok((moldRes.capability.cp ?? 0) > 1.4, "Mold Cp should be high");
  assert.ok((moldRes.capability.cpk ?? 99) < 1.15, "Mold Cpk should be reduced by centering shift");
  assert.ok((moldRes.capability.ca ?? 0) > 0.3, "Mold Ca should show positive upper shift");
  assert.ok(
    moldRes.diagnostics.some((d) => d.id === "centering-shift"),
    "Diagnostics should flag centering shift opportunity"
  );

  // Tool wear drift: I-MR out of control (triggers Nelson rules)
  const wearRes = presetResults.get("tool-wear-drift")!;
  assert.equal(wearRes.valid, true);
  assert.equal(wearRes.effectiveChartType, "imr");
  assert.equal(wearRes.isInControl, false, "Tool wear drift should trigger SPC violations");
  assert.ok(
    wearRes.violations.some((v) => v.ruleId === 1 || v.ruleId === 2 || v.ruleId === 3),
    "Tool wear should trigger R1/R2/R3"
  );

  // Dual cavity bimodal: fails Anderson-Darling normality test
  const bimodalRes = presetResults.get("dual-cavity-bimodal")!;
  assert.equal(bimodalRes.valid, true);
  assert.equal(bimodalRes.normality.isNormal, false, "Bimodal data must fail Anderson-Darling normality");
  assert.ok(bimodalRes.normality.pValue < 0.01, `Expected bimodal p < 0.01, got ${bimodalRes.normality.pValue}`);

  // Unilateral upper-only & lower-only specs
  const flatRes = presetResults.get("flatness-upper-only")!;
  assert.equal(flatRes.valid, true);
  assert.equal(flatRes.capability.cp, null);
  assert.equal(flatRes.capability.cpl, null);
  assert.equal(flatRes.capability.cpk, flatRes.capability.cpu);

  const pullRes = presetResults.get("pull-force-lower-only")!;
  assert.equal(pullRes.valid, true);
  assert.equal(pullRes.capability.cp, null);
  assert.equal(pullRes.capability.cpu, null);
  assert.equal(pullRes.capability.cpk, pullRes.capability.cpl);

  // 13. Nelson 8 Rules deterministic unit verification
  const stdLim = { cl: 0, ucl: 3, lcl: -3, sigma: 1 };
  const dummySec = { cl: 1, ucl: 3, lcl: 0, sigma: 0.6 };
  const r1Hits = detectNelsonViolations({
    primarySeries: [0, 0.2, -0.1, 3.4, 0.1],
    primaryLimits: stdLim,
    secondarySeries: [null, 0.5, 0.5, 0.5, 0.5],
    secondaryLimits: dummySec,
    enabledRules: [1],
  });
  assert.equal(r1Hits.length, 1);
  assert.equal(r1Hits[0].ruleId, 1);
  assert.equal(r1Hits[0].triggerIndex, 3);

  const r2Hits = detectNelsonViolations({
    primarySeries: [-0.2, 0.3, 0.4, 0.5, 0.2, 0.6, 0.3, 0.7, 0.5, 0.4],
    primaryLimits: stdLim,
    secondarySeries: new Array(10).fill(0.5),
    secondaryLimits: dummySec,
    enabledRules: [2],
  });
  assert.equal(r2Hits.length, 1);
  assert.equal(r2Hits[0].ruleId, 2);

  const r3Hits = detectNelsonViolations({
    primarySeries: [0, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 0.2],
    primaryLimits: stdLim,
    secondarySeries: new Array(8).fill(0.5),
    secondaryLimits: dummySec,
    enabledRules: [3],
  });
  assert.equal(r3Hits.length, 1);
  assert.equal(r3Hits[0].ruleId, 3);

  const r4Series = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? -0.5 : 0.5));
  const r4Hits = detectNelsonViolations({
    primarySeries: r4Series,
    primaryLimits: stdLim,
    secondarySeries: new Array(14).fill(0.5),
    secondaryLimits: dummySec,
    enabledRules: [4],
  });
  assert.equal(r4Hits.length, 1);
  assert.equal(r4Hits[0].ruleId, 4);

  const r5Hits = detectNelsonViolations({
    primarySeries: [0, 2.2, 0.4, 2.3, 0],
    primaryLimits: stdLim,
    secondarySeries: new Array(5).fill(0.5),
    secondaryLimits: dummySec,
    enabledRules: [5],
  });
  assert.equal(r5Hits.length, 1);
  assert.equal(r5Hits[0].ruleId, 5);

  const r7Hits = detectNelsonViolations({
    primarySeries: new Array(15).fill(0.2),
    primaryLimits: stdLim,
    secondarySeries: new Array(15).fill(0.5),
    secondaryLimits: dummySec,
    enabledRules: [7],
  });
  assert.equal(r7Hits.length, 1);
  assert.equal(r7Hits[0].ruleId, 7);

  const r8Hits = detectNelsonViolations({
    primarySeries: [1.5, -1.5, 1.4, -1.6, 1.3, -1.4, 1.6, -1.3],
    primaryLimits: stdLim,
    secondarySeries: new Array(8).fill(0.5),
    secondaryLimits: dummySec,
    enabledRules: [8],
  });
  assert.equal(r8Hits.length, 1);
  assert.equal(r8Hits[0].ruleId, 8);

  // Anderson-Darling normality check on clean quantiles vs extreme bimodal
  const normalSample = Array.from({ length: 40 }, (_, i) =>
    inverseNormalCdf((i + 0.5) / 40)
  );
  const adNormal = computeNormalityTest(normalSample, 0, 1);
  assert.equal(adNormal.isNormal, true);
  assert.ok(adNormal.pValue > 0.5);

  // 14. Smart text parser, Excel 3-sheet export & Excel re-import roundtrip
  const pasted = `X1\tX2\tX3\tX4\tX5\n20.01\t20.02\t19.99\t20.00\t20.01\n19.98\t20.01\t20.02\t20.00\t19.99`;
  const parsed = parseRawMeasurements(pasted);
  assert.equal(parsed.values.length, 10);
  assert.equal(parsed.detectedSubgroupSize, 5);
  assert.equal(parsed.skippedTokens, 5);

  const spcSummary = buildSpcSummaryText(cncRes, SPC_SCENE_PRESETS[0].meta);
  assert.ok(spcSummary.includes("CPK / SPC 过程能力分析报告"));
  assert.ok(spcSummary.includes("Cpk ="));

  const spcXlsxBlob = await buildSpcExcelBlob(cncRes, SPC_SCENE_PRESETS[0].meta);
  assert.ok(spcXlsxBlob.size > 4000, "Generated 3-sheet SPC Excel workbook should be non-empty");

  const spcXlsxBuf = new Uint8Array(await spcXlsxBlob.arrayBuffer());
  const reimported = await parseExcelArrayBuffer("roundtrip.xlsx", spcXlsxBuf);
  assert.ok(
    reimported.columns.some((c) => c.values.length === cncRes.count),
    "Re-importing exported SPC Excel workbook should recover raw measurements column"
  );
  console.log("✅ CPK / SPC Process Capability (AIAG constants, 6 presets, Nelson 8 rules, AD normality & 3-sheet Excel roundtrip) passed");

  // 15. ISO 2768 & ISO 286 Tolerance / Fits Quick Reference audit
  const isoTool = getWorkbenchToolById("iso-tolerance");
  assert.ok(
    isoTool && isoTool.status === "ready" && isoTool.keepAlive && typeof isoTool.load === "function",
    "iso-tolerance tool should be registered as ready with lazy loader"
  );

  // ISO 2768-1 Linear, Chamfer & Angular golden checks
  const lin25m = lookupIso2768Linear(25, "m", "linear");
  assert.equal(lin25m.toleranceMm, 0.2);
  assert.equal(lin25m.lowerLimitMm, 24.8);
  assert.equal(lin25m.upperLimitMm, 25.2);
  assert.equal(lookupIso2768Linear(2, "v", "linear").toleranceMm, null, "ISO 2768-1 v is undefined for 0.5..3 mm");
  assert.equal(lookupIso2768Linear(2500, "f", "linear").toleranceMm, null, "ISO 2768-1 f is undefined for >2000..4000 mm");
  assert.equal(lookupIso2768Linear(0.3, "m", "linear").toleranceMm, null, "<0.5 mm must not match general table");
  assert.equal(lookupIso2768Linear(5, "c", "chamfer").toleranceMm, 1.0);
  assert.equal(lookupIso2768Linear(8, "m", "chamfer").toleranceMm, 1.0);

  const ang45 = lookupIso2768Angular(45, 30, "m");
  assert.equal(ang45.toleranceArcMin, 30);
  assert.equal(ang45.toleranceDms, "±0°30'");
  assert.equal(ang45.toleranceDeg, 0.5);
  assert.ok(ang45.chordDeviationMm > 0.25 && ang45.chordDeviationMm < 0.27);

  // ISO 2768-2 GD&T & derived circularity / parallelism caps
  const geom150K = lookupIso2768Geom(150, "K", "m");
  assert.equal(geom150K.straightnessFlatness.valueMm, 0.4);
  assert.equal(geom150K.perpendicularity.valueMm, 0.6);
  assert.equal(geom150K.symmetry.valueMm, 0.6);
  assert.equal(geom150K.runout.valueMm, 0.2);
  assert.equal(geom150K.derivedCircularityMaxMm, 0.2, "Circularity capped by circular runout 0.2 mm");
  assert.equal(geom150K.derivedParallelismMaxMm, 1.0, "Parallelism = max(size band 1.0, flatness 0.4)");

  // ISO 286-1 IT grade checks (0..500 & >500..3150 mm)
  assert.equal(getItMicrons(25, "6"), 13);
  assert.equal(getItMicrons(25, "7"), 21);
  assert.equal(getItMicrons(50, "7"), 25);
  assert.equal(getItMicrons(600, "7"), 70);
  assert.equal(getItMicrons(600, "5"), null, "IT5 is not defined above 500 mm in ISO 286-1 Table 1");

  // ISO 286-2 Golden fit checks & Hole-basis <-> Shaft-basis mathematical equivalence (Delta rule proof!)
  const fit25g6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "H", holeGrade: "7", shaftLetter: "g", shaftGrade: "6" });
  assert.equal(fit25g6.valid, true);
  assert.equal(fit25g6.fitNature, "clearance");
  assert.equal(fit25g6.hole.upperDevMicrons, 21);
  assert.equal(fit25g6.hole.lowerDevMicrons, 0);
  assert.equal(fit25g6.shaft.upperDevMicrons, -7);
  assert.equal(fit25g6.shaft.lowerDevMicrons, -20);
  assert.equal(fit25g6.minClearanceMicrons, 7);
  assert.equal(fit25g6.maxClearanceMicrons, 41);

  // H7/k6 vs K7/h6 exact equivalence at Ø25
  const h7k6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "H", holeGrade: "7", shaftLetter: "k", shaftGrade: "6" });
  const k7h6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "K", holeGrade: "7", shaftLetter: "h", shaftGrade: "6" });
  assert.equal(h7k6.fitNature, "transition");
  assert.equal(k7h6.hole.upperDevMicrons, 6);
  assert.equal(k7h6.hole.lowerDevMicrons, -15);
  assert.equal(h7k6.maxClearanceMicrons, k7h6.maxClearanceMicrons);
  assert.equal(h7k6.minClearanceMicrons, k7h6.minClearanceMicrons);

  // H7/m6 vs M7/h6 exact equivalence at Ø25
  const h7m6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "H", holeGrade: "7", shaftLetter: "m", shaftGrade: "6" });
  const m7h6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "M", holeGrade: "7", shaftLetter: "h", shaftGrade: "6" });
  assert.equal(m7h6.hole.upperDevMicrons, 0);
  assert.equal(m7h6.hole.lowerDevMicrons, -21);
  assert.equal(h7m6.maxClearanceMicrons, m7h6.maxClearanceMicrons);
  assert.equal(h7m6.minClearanceMicrons, m7h6.minClearanceMicrons);

  // H7/j6 vs J7/h6 exact equivalence at Ø25
  const h7j6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "H", holeGrade: "7", shaftLetter: "j", shaftGrade: "6" });
  const j7h6 = resolveIso286Fit({ nominalMm: 25, holeLetter: "J", holeGrade: "7", shaftLetter: "h", shaftGrade: "6" });
  assert.equal(h7j6.maxClearanceMicrons, j7h6.maxClearanceMicrons);
  assert.equal(h7j6.minClearanceMicrons, j7h6.minClearanceMicrons);

  // H7/p6 vs P7/h6 exact interference equivalence at Ø40
  const h7p6 = resolveIso286Fit({ nominalMm: 40, holeLetter: "H", holeGrade: "7", shaftLetter: "p", shaftGrade: "6" });
  const p7h6 = resolveIso286Fit({ nominalMm: 40, holeLetter: "P", holeGrade: "7", shaftLetter: "h", shaftGrade: "6" });
  assert.equal(h7p6.fitNature, "interference");
  assert.equal(h7p6.minInterferenceMicrons, 1);
  assert.equal(h7p6.maxInterferenceMicrons, 42);
  assert.equal(p7h6.minInterferenceMicrons, 1);
  assert.equal(p7h6.maxInterferenceMicrons, 42);
  assert.ok(h7p6.shrinkFitThermal && h7p6.shrinkFitThermal.steelMaxDeltaC > 0);

  // ISO 286-1 special rules: js7 half-micron, M6 at 250-315, N9 > 3 vs <= 3, large >500 mm, invalid range guards
  const js7_25 = resolveIso286Zone({ nominalMm: 25, featureType: "shaft", letter: "js", grade: "7" });
  assert.equal(js7_25.upperDevMicrons, 10.5);
  assert.equal(js7_25.lowerDevMicrons, -10.5);

  const m6_280 = resolveIso286Zone({ nominalMm: 280, featureType: "hole", letter: "M", grade: "6" });
  assert.equal(m6_280.upperDevMicrons, -9);
  assert.equal(m6_280.lowerDevMicrons, -41);

  const n9_25 = resolveIso286Zone({ nominalMm: 25, featureType: "hole", letter: "N", grade: "9" });
  assert.equal(n9_25.upperDevMicrons, 0);
  assert.equal(n9_25.lowerDevMicrons, -52);

  const n9_2 = resolveIso286Zone({ nominalMm: 2, featureType: "hole", letter: "N", grade: "9" });
  assert.equal(n9_2.upperDevMicrons, -4);
  assert.equal(n9_2.lowerDevMicrons, -29);

  const fit600 = resolveIso286Fit({ nominalMm: 600, holeLetter: "H", holeGrade: "7", shaftLetter: "g", shaftGrade: "6" });
  assert.equal(fit600.valid, true);
  assert.equal(fit600.hole.upperDevMicrons, 70);
  assert.equal(fit600.shaft.upperDevMicrons, -22);
  assert.equal(fit600.shaft.lowerDevMicrons, -66);

  assert.equal(resolveIso286Zone({ nominalMm: 20, featureType: "shaft", letter: "t", grade: "6" }).valid, false);
  assert.equal(resolveIso286Zone({ nominalMm: 15, featureType: "shaft", letter: "cd", grade: "7" }).valid, false);
  assert.equal(resolveIso286Zone({ nominalMm: 25, featureType: "hole", letter: "J", grade: "5" }).valid, false);

  // Notation parser & reverse IT grade recommender
  const parsedNote = parseIso286Notation("Ø25 H7/g6");
  assert.ok(parsedNote && parsedNote.nominalMm === 25 && parsedNote.hole?.letter === "H" && parsedNote.shaft?.letter === "g");
  const revIt = recommendItGradesForTolerance(25, 0.03);
  assert.ok(revIt.length > 0 && (revIt[0].grade === "7" || revIt[0].grade === "8"));

  // Measurement evaluator (ok / warning / ng)
  assert.equal(evaluateMeasurement({ measured: 25.05, nominal: 25, lowerLimit: 24.8, upperLimit: 25.2 }).verdict, "ok");
  assert.equal(evaluateMeasurement({ measured: 25.18, nominal: 25, lowerLimit: 24.8, upperLimit: 25.2 }).verdict, "warning");
  assert.equal(evaluateMeasurement({ measured: 25.25, nominal: 25, lowerLimit: 24.8, upperLimit: 25.2 }).verdict, "ng");

  // Batch checksheet presets, text summaries & Excel export
  for (const preset of CHECKSHEET_SCENE_PRESETS) {
    const resolved = preset.items.map((it) => resolveChecksheetItem(it));
    assert.ok(resolved.every((r) => r.error === null), `Preset ${preset.id} should resolve cleanly`);
    const sum = summarizeChecksheet(resolved);
    assert.equal(sum.overallVerdict, "PASS", `Preset ${preset.id} should pass`);
  }

  const firstRows = CHECKSHEET_SCENE_PRESETS[0].items.map((it) => resolveChecksheetItem(it));
  assert.ok(buildIso2768SummaryText({ linearClass: "m", geomClass: "K", linearEval: lin25m, geomEval: geom150K }).includes("ISO 2768-mK"));
  assert.ok(buildFitSummaryText({ fit: fit25g6 }).includes("H7/g6"));
  assert.ok(buildChecksheetSummaryText(firstRows, CHECKSHEET_SCENE_PRESETS[0].meta).includes("尺寸公差检核报告"));

  const tolXlsxBlob = await buildChecksheetExcelBlob(firstRows, CHECKSHEET_SCENE_PRESETS[0].meta, fit25g6);
  assert.ok(tolXlsxBlob.size > 3000, "Generated tolerance checksheet Excel should be non-empty");
  const histXlsxBlob = await buildToleranceHistoryExcelBlob([
    {
      id: "hist-1",
      createdAt: "2026-11-28 15:00",
      title: CHECKSHEET_SCENE_PRESETS[0].meta.partName,
      kind: "checksheet",
      meta: CHECKSHEET_SCENE_PRESETS[0].meta,
      items: CHECKSHEET_SCENE_PRESETS[0].items,
      okCount: 6,
      warningCount: 1,
      ngCount: 0,
      pendingCount: 0,
      overallVerdict: "PASS",
    },
  ]);
  assert.ok(histXlsxBlob.size > 3000, "Generated tolerance history Excel should be non-empty");
  console.log("✅ ISO 2768 & ISO 286 Tolerance / Fits (2768-1/2, 286-1/2 Δ-rule equivalence, IT matrix, presets & Excel export) passed");
}

main().catch((err) => {
  console.error("❌ Workbench test failed:", err);
  process.exit(1);
});
