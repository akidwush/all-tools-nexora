// JPEG/PNG decoding stays in the Edge process; never send a full-resolution URL to AI.
import decodeJpeg, {
  init as initJpegDecoder,
} from "npm:@jsquash/jpeg@1.6.0/decode.js";
import encodeJpeg, {
  init as initJpegEncoder,
} from "npm:@jsquash/jpeg@1.6.0/encode.js";
import { jpegDecoder, jpegEncoder } from "./jpeg-wasm.ts";
import pngSync from "npm:pngjs@7.0.0/lib/png-sync.js";
import { Buffer } from "node:buffer";
import decodeWebp, {
  init as initWebp,
} from "npm:@jsquash/webp@1.5.0/decode.js";
import { webpWasm } from "./webp-wasm.ts";
export type Pixels = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};
let webpReady: Promise<void> | undefined,
  jpegDecodeReady: Promise<void> | undefined,
  jpegEncodeReady: Promise<void> | undefined;
async function compiled(value: string) {
  return await WebAssembly.compile(
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
  );
}
export async function decode(bytes: Uint8Array): Promise<Pixels> {
  if (bytes[0] === 137) {
    return pngSync.read(Buffer.from(bytes), { checkCRC: true });
  }
  if (bytes[0] === 255) {
    if (!jpegDecodeReady) {
      jpegDecodeReady = compiled(jpegDecoder).then((m) => initJpegDecoder(m));
    }
    await jpegDecodeReady;
    return decodeJpeg(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      { preserveOrientation: true },
    );
  }
  if (!webpReady) {
    webpReady = (async () => {
      const bytes = Uint8Array.from(atob(webpWasm), (c) => c.charCodeAt(0));
      await initWebp(await WebAssembly.compile(bytes));
    })();
  }
  await webpReady;
  return decodeWebp(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );
}
export function tile(
  image: Pixels,
  y: number,
  h: number,
  maximum = 2048,
): Pixels {
  const scale = Math.min(1, maximum / Math.max(image.width, h));
  const width = Math.max(1, Math.round(image.width * scale)),
    height = Math.max(1, Math.round(h * scale));
  const data = new Uint8Array(width * height * 4);
  // Bilinear sampling retains narrow glyph strokes better than nearest-neighbor.
  for (let dy = 0; dy < height; dy++) {
    const sy = Math.min(h - 1, (dy + .5) / scale - .5),
      y0 = Math.max(0, Math.floor(sy)),
      y1 = Math.min(h - 1, y0 + 1),
      fy = Math.max(0, sy - y0);
    for (let dx = 0; dx < width; dx++) {
      const sx = Math.min(image.width - 1, (dx + .5) / scale - .5),
        x0 = Math.max(0, Math.floor(sx)),
        x1 = Math.min(image.width - 1, x0 + 1),
        fx = Math.max(0, sx - x0);
      const a = ((y + y0) * image.width + x0) * 4,
        b = ((y + y0) * image.width + x1) * 4,
        c = ((y + y1) * image.width + x0) * 4,
        d = ((y + y1) * image.width + x1) * 4,
        p = (dy * width + dx) * 4;
      for (let k = 0; k < 3; k++) {
        const rgb =
          (image.data[a + k] * (1 - fx) + image.data[b + k] * fx) * (1 - fy) +
          (image.data[c + k] * (1 - fx) + image.data[d + k] * fx) * fy;
        const alpha =
          (image.data[a + 3] * (1 - fx) + image.data[b + 3] * fx) * (1 - fy) +
          (image.data[c + 3] * (1 - fx) + image.data[d + 3] * fx) * fy;
        data[p + k] = Math.round(rgb * alpha / 255 + 255 - alpha);
      }
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}
export async function encode(image: Pixels) {
  if (!jpegEncodeReady) {
    jpegEncodeReady = compiled(jpegEncoder).then((m) => initJpegEncoder(m));
  }
  await jpegEncodeReady;
  return new Uint8Array(await encodeJpeg(image as ImageData, { quality: 85 }));
}
