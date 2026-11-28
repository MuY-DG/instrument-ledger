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
}

main().catch((err) => {
  console.error("❌ Workbench test failed:", err);
  process.exit(1);
});
