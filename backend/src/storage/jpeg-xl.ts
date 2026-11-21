import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { temporary } from '../common/temporary';

const exec = promisify(execFile);
const codecOptions = { timeout: 60_000, killSignal: 'SIGKILL' as const };
export const maxRecompressedJpegBytes = 16 * 1024 ** 2;
export const jpegHashMetadata = 'nuvex-jpeg-sha256';
export const jpegSizeMetadata = 'nuvex-jpeg-size';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function decode(input: string, output: string, originalSize: number, originalHash: string) {
  await exec('djxl', [input, output, '--num_threads=1'], codecOptions);
  if ((await stat(output)).size !== originalSize) throw new Error('El tamaño del JPEG reconstruido no coincide.');
  const jpeg = await readFile(output);
  if (sha256(jpeg) !== originalHash) throw new Error('La huella del JPEG reconstruido no coincide.');
  return jpeg;
}

export async function recompressJpeg(source: string, dir: string, originalSize: number) {
  if (originalSize <= 0 || originalSize > maxRecompressedJpegBytes || (await stat(source)).size !== originalSize) return;
  const compressed = join(dir, 'original.jxl');
  // Both supported libjxl versions preserve JPEG reconstruction data by default.
  await exec('cjxl', [source, compressed, '--lossless_jpeg=1', '--num_threads=1', '-e', '5'], codecOptions);
  const { size } = await stat(compressed);
  if (size === 0 || size >= originalSize) return;
  const originalHash = sha256(await readFile(source));
  await decode(compressed, join(dir, 'verified.jpg'), originalSize, originalHash);
  return { bytes: await readFile(compressed), originalHash };
}

export async function restoreJpeg(body: Readable, originalSize: number, originalHash: string) {
  if (!Number.isSafeInteger(originalSize) || originalSize <= 0 || originalSize > maxRecompressedJpegBytes || !/^[a-f0-9]{64}$/.test(originalHash)) {
    body.destroy();
    throw new Error('Metadatos de compresión JPEG inválidos.');
  }
  return temporary(async (dir) => {
    const input = join(dir, 'original.jxl');
    let received = 0;
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received >= originalSize) return callback(new Error('El JPEG comprimido supera el tamaño esperado.'));
      callback(null, chunk);
    } });
    await pipeline(body, limit, createWriteStream(input));
    return decode(input, join(dir, 'original.jpg'), originalSize, originalHash);
  }).finally(() => body.destroy());
}

export class InvalidOriginalRange extends Error {}

export function sliceRestoredJpeg(jpeg: Buffer, range?: string) {
  if (!range) return { bytes: jpeg };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) throw new InvalidOriginalRange();
  const start = match[1] ? Number(match[1]) : Math.max(0, jpeg.length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(jpeg.length - 1, Number(match[2])) : jpeg.length - 1;
  if (start > end) throw new InvalidOriginalRange();
  return { bytes: jpeg.subarray(start, end + 1), contentRange: `bytes ${start}-${end}/${jpeg.length}` };
}
