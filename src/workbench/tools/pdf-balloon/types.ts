import type { PDFDocumentProxy } from 'pdfjs-dist';
export interface MarkerStyle {
  size: number;
  textSize: number;
  borderWidth: number;
  borderColor: string | null;
  fillColor: string | null;
  textColor: string;
}
export interface Marker extends MarkerStyle {
  id: string;
  page: number;
  x: number;
  y: number;
  number: number;
}
export interface PageInfo {
  number: number;
  width: number;
  height: number;
  rotation: number;
}
export interface PdfSession {
  id: string;
  draftId?: string;
  draftRevision?: number;
  draftBaseline?: string;
  doc: PDFDocumentProxy;
  bytes: Uint8Array;
  name: string;
  pages: PageInfo[];
  compatibility: boolean;
  resourceErrors: Set<string>;
  password?: string;
  importedMarkers?: Marker[];
  importedNextNumber?: number;
}
export type Tool = 'select' | 'marker' | 'hand';
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const DEFAULT_STYLE: MarkerStyle = {
  size: 28,
  textSize: 14,
  borderWidth: 1.5,
  borderColor: '#dc4c3e',
  fillColor: '#ffffff',
  textColor: '#dc4c3e',
};

export interface DocumentView {
  page: number;
  scale: number;
  zoomMode: 'fit' | 'custom';
  x?: number;
  y?: number;
}
