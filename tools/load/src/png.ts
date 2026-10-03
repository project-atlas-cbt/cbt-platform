import { randomBytes } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

/** A valid, deliberately incompressible RGB PNG of roughly `kb` kilobytes. */
export function makePng(kb: number): Buffer {
  const side = Math.max(8, Math.round(Math.sqrt((kb * 1024) / 3)));
  const row = 1 + side * 3;
  const raw = Buffer.alloc(row * side);
  for (let y = 0; y < side; y++) {
    raw[y * row] = 0;
    randomBytes(side * 3).copy(raw, y * row + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
