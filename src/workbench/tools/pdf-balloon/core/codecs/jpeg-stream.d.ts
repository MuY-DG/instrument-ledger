export class JPEGStreamEncoder {
  constructor(quality: number, width: number, height: number, dpi: number, emit: (bytes: Uint8Array<ArrayBuffer>) => void);
  writeRows(image: { width: number; height: number; data: Uint8Array }): void;
  finish(): void;
}
