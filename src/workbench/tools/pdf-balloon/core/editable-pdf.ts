import {
  PDFDocument, PDFDict, PDFArray, PDFName, PDFString, PDFHexString, PDFRef, PDFStream,
  StandardFonts, degrees, rgb, drawEllipse, drawText,
  type PDFFont, type PDFOperator, type PDFObject,
} from 'pdf-lib';
import { EDITABLE_PDF_KEY, type PdfMarker, type PdfSaveOptions, type PdfWorkerResult } from './pdf-format';

const workspaceKey = PDFName.of('FolioWorkspace');
const markerKey = PDFName.of('FolioMarker');
const invalid = () => new Error('PDF 的 Folio 编辑数据不完整或版本不受支持，已停止打开以保护原标注。请使用原始文件或本机草稿。');
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const colorValue = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const nullableColor = (value: unknown) => value === null || colorValue(value);
function parseData(value: unknown): Record<string, unknown> {
  if (!(value instanceof PDFString || value instanceof PDFHexString)) throw invalid();
  let data: unknown;
  try { data = JSON.parse(value.decodeText()); } catch { throw invalid(); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid();
  return data as Record<string, unknown>;
}
function readMarker(value: unknown): PdfMarker {
  const data = parseData(value);
  if (data.version !== 1 || typeof data.id !== 'string' || !data.id ||
      !Number.isSafeInteger(data.number) || (data.number as number) < 0 ||
      !['x', 'y', 'pdfX', 'pdfY', 'size', 'textSize', 'borderWidth', 'pdfScale', 'rotation'].every((key) => finite(data[key])) ||
      (data.size as number) <= 0 || (data.textSize as number) <= 0 || (data.pdfScale as number) <= 0 ||
      (data.borderWidth as number) < 0 || !nullableColor(data.borderColor) ||
      !nullableColor(data.fillColor) || !colorValue(data.textColor)) throw invalid();
  // Page and center come from the actual annotation, not stale JSON coordinates.
  return {
    id: data.id, page: 1, number: data.number as number,
    x: data.x as number, y: data.y as number,
    pdfX: data.pdfX as number, pdfY: data.pdfY as number,
    pdfScale: data.pdfScale as number, rotation: data.rotation as number,
    size: data.size as number, textSize: data.textSize as number,
    borderWidth: data.borderWidth as number, borderColor: data.borderColor as string | null,
    fillColor: data.fillColor as string | null, textColor: data.textColor,
  };
}

function discardUnreferenced(doc: PDFDocument, candidates: Set<PDFRef>) {
  // Remove our detached appearances/fonts, so every import/save does not append
  // another generation. Shared resources still reachable from the PDF are kept.
  const reachable = new Set<PDFRef>(), seen = new Set<PDFObject>();
  const pending: (PDFObject | undefined)[] = Object.values(doc.context.trailerInfo);
  while (pending.length) {
    let object = pending.pop();
    if (!object || seen.has(object)) continue;
    seen.add(object);
    if (object instanceof PDFRef) {
      reachable.add(object);
      object = doc.context.lookup(object);
    }
    if (object instanceof PDFStream) object = object.dict;
    if (object instanceof PDFDict) pending.push(...object.values());
    else if (object instanceof PDFArray) pending.push(...object.asArray());
  }
  for (const ref of candidates) if (!reachable.has(ref)) doc.context.delete(ref);
}

const color = (hex: string) => rgb(
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
);
function operators(a: PdfMarker, font: PDFFont, fontName: PDFName, x: number, y: number): PDFOperator[] {
  const size = a.size / a.pdfScale, fs = a.textSize / a.pdfScale;
  const bw = a.borderColor ? a.borderWidth / a.pdfScale : 0;
  const text = String(a.number), dx = -font.widthOfTextAtSize(text, fs) / 2, dy = -fs * 0.358;
  const theta = a.rotation * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
  return [
    ...(a.fillColor || bw ? drawEllipse({
      x, y, xScale: Math.max(0, (size - bw) / 2), yScale: Math.max(0, (size - bw) / 2),
      color: a.fillColor ? color(a.fillColor) : undefined,
      borderColor: bw && a.borderColor ? color(a.borderColor) : undefined, borderWidth: bw,
    }) : []),
    ...drawText(font.encodeText(text), {
      x: x + dx * c - dy * s, y: y + dx * s + dy * c,
      size: fs, font: fontName, color: color(a.textColor), rotate: degrees(a.rotation),
      xSkew: degrees(0), ySkew: degrees(0),
    }),
  ];
}

export async function writePdf(bytes: Uint8Array, markers: PdfMarker[], options: PdfSaveOptions = {}) {
  const editable = options.editable === true;
  if (!markers.length && !editable) return bytes;
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const font = markers.length ? await doc.embedFont(StandardFonts.HelveticaBold) : undefined;
  for (const a of markers) {
    const page = pages[a.page - 1];
    if (!editable) {
      const fontName = page.node.newFontDictionary('Folio', font!.ref);
      page.pushOperators(...operators(a, font!, fontName, a.pdfX, a.pdfY));
      continue;
    }
    const fs = a.textSize / a.pdfScale;
    // Include oversized text, descenders, and all page rotations in the appearance bounds.
    const side = Math.max(a.size / a.pdfScale,
      Math.hypot(font!.widthOfTextAtSize(String(a.number), fs), fs * 1.5)) + 2 / a.pdfScale;
    const appearance = doc.context.register(doc.context.formXObject(
      operators(a, font!, PDFName.of('F0'), side / 2, side / 2), {
        BBox: [0, 0, side, side], Resources: { Font: { F0: font!.ref } },
      },
    ));
    page.node.addAnnot(doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Stamp', P: page.ref,
      Rect: [a.pdfX - side / 2, a.pdfY - side / 2, a.pdfX + side / 2, a.pdfY + side / 2],
      // Reader engines use T/Contents for hover notes. Keep editor data only
      // in the private field so the vector marker has no popup note text.
      F: 4, NM: PDFHexString.fromText(`folio:${a.id}`),
      AP: { N: appearance }, FolioMarker: PDFHexString.fromText(JSON.stringify({ ...a, version: 1 })),
    })));
  }
  if (editable) {
    const nextNumber = options.nextNumber ?? (markers.reduce((max, a) => Math.max(max, a.number), 0) + 1);
    doc.catalog.set(workspaceKey, PDFHexString.fromText(JSON.stringify({ version: 1, nextNumber, markerIds: markers.map((a) => a.id) })));
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
    info.set(PDFName.of(EDITABLE_PDF_KEY), PDFString.of('1'));
  }
  return doc.save();
}

export async function readEditablePdf(bytes: Uint8Array): Promise<PdfWorkerResult> {
  const doc = await PDFDocument.load(bytes);
  const state = parseData(doc.catalog.get(workspaceKey));
  if (state.version !== 1 || !Number.isSafeInteger(state.nextNumber) ||
      (state.nextNumber as number) < 0 || !Array.isArray(state.markerIds) ||
      !state.markerIds.every((id) => typeof id === 'string')) throw invalid();
  const markers: PdfMarker[] = [], ids = new Set<string>(), discarded = new Set<PDFRef>();
  // Validate every owned annotation before removing anything. Foreign annotations stay untouched.
  doc.getPages().forEach((page, index) => {
    const annots = page.node.Annots();
    if (!annots) return;
    const retained = doc.context.obj([]);
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i), annot = doc.context.lookup(ref);
      if (!(annot instanceof PDFDict) || !annot.has(markerKey)) {
        retained.push(ref);
        continue;
      }
      const marker = readMarker(annot.get(markerKey));
      if (ref instanceof PDFRef) discarded.add(ref);
      const normal = annot.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N'));
      if (normal instanceof PDFRef) {
        discarded.add(normal);
        const appearance = doc.context.lookup(normal);
        if (appearance instanceof PDFStream) {
          const fonts = appearance.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
            ?.lookupMaybe(PDFName.of('Font'), PDFDict);
          for (const font of fonts?.values() ?? []) if (font instanceof PDFRef) discarded.add(font);
        }
      }
      if (ids.has(marker.id)) throw invalid();
      const rect = annot.lookup(PDFName.of('Rect'), PDFArray).asArray().map((n) => Number(n.toString()));
      if (rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]) throw invalid();
      ids.add(marker.id);
      markers.push({ ...marker, page: index + 1, pdfX: (rect[0] + rect[2]) / 2, pdfY: (rect[1] + rect[3]) / 2 });
    }
    if (retained.size()) page.node.set(PDFName.of('Annots'), retained);
    else page.node.delete(PDFName.of('Annots'));
  });
  if (state.markerIds.length !== markers.length || new Set(state.markerIds).size !== markers.length ||
      state.markerIds.some((id) => !ids.has(id))) throw invalid();
  const byId = new Map(markers.map((a) => [a.id, a]));
  const ordered = state.markerIds.map((id) => byId.get(id)!);
  doc.catalog.delete(workspaceKey);
  doc.context.lookup(doc.context.trailerInfo.Info, PDFDict).delete(PDFName.of(EDITABLE_PDF_KEY));
  discardUnreferenced(doc, discarded);
  return { bytes: (await doc.save()).slice(), markers: ordered, nextNumber: state.nextNumber as number };
}
