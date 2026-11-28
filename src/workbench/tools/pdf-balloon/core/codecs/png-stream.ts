import { Zlib } from 'fflate';

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function chunk(type: string, data = new Uint8Array(0)): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

export class PNGStreamEncoder {
  private rows = 0;
  private zlib: Zlib;
  constructor(
    private width: number,
    private height: number,
    dpi: number,
    private emit: (bytes: Uint8Array<ArrayBuffer>) => void,
  ) {
    emit(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10));
    const header = new Uint8Array(13), view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8;
    header[9] = 2; // RGB8; PDF export has an opaque white background.
    emit(chunk('IHDR', header));
    emit(chunk('sRGB', Uint8Array.of(0)));
    const density = new Uint8Array(9), densityView = new DataView(density.buffer);
    densityView.setUint32(0, Math.round(dpi / 0.0254));
    densityView.setUint32(4, Math.round(dpi / 0.0254));
    density[8] = 1;
    emit(chunk('pHYs', density));
    this.zlib = new Zlib({ level: 6 }, (bytes) => {
      if (bytes.length) emit(chunk('IDAT', bytes));
    });
  }
  writeRows(image: { width: number; height: number; data: Uint8Array }) {
    if (image.width !== this.width || image.height <= 0 || this.rows + image.height > this.height ||
        image.data.length !== this.width * image.height * 4) throw new Error('Invalid PNG stripe');
    const stride = this.width * 3 + 1;
    const filtered = new Uint8Array(stride * image.height);
    for (let y = 0; y < image.height; y++) {
      filtered[y * stride] = 1; // Sub filter is independent of stripe boundaries.
      for (let x = 0; x < this.width; x++) {
        const source = (y * this.width + x) * 4, target = y * stride + 1 + x * 3;
        for (let c = 0; c < 3; c++)
          filtered[target + c] = image.data[source + c] - (x ? image.data[source - 4 + c] : 0);
      }
    }
    this.zlib.push(filtered, false);
    this.rows += image.height;
  }
  finish() {
    if (this.rows !== this.height) throw new Error('Incomplete PNG image');
    this.zlib.push(new Uint8Array(0), true);
    this.emit(chunk('IEND'));
  }
}
