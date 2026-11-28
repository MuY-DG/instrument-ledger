import type { Marker } from '../types';

export const EDITABLE_PDF_KEY = 'FolioEditable';
export interface PdfMarker extends Marker {
  pdfX: number;
  pdfY: number;
  pdfScale: number;
  rotation: number;
}
export interface PdfSaveOptions {
  editable?: boolean;
  nextNumber?: number;
}
export type PdfWorkerRequest =
  | { action: 'export'; bytes: Uint8Array; markers: PdfMarker[]; options: PdfSaveOptions }
  | { action: 'import'; bytes: Uint8Array };
export interface PdfWorkerResult {
  bytes: Uint8Array<ArrayBuffer>;
  markers?: PdfMarker[];
  nextNumber?: number;
}
