import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Entry } from '../../prisma/generated/client';
import { log } from '../common/logging';
import { temporary } from '../common/temporary';
import { recompressJpeg } from '../storage/jpeg-xl';
import { materialize, saveFile } from './temporary-files';
import type { WorkerContext } from './worker-context';

const exec = promisify(execFile);
const ffInput = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,avi,mpeg,mpegts,flv,ogg,asf'];
// File-backed libvips cache entries can retain handles after a temporary job completes on Windows.
sharp.cache({ files: 0 });

async function ffmpeg(args: string[]) {
  await exec('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-threads', '1', '-filter_threads', '1', ...args], { timeout: 45 * 60_000 });
}

async function renderVideo(source: string, output: string, tag?: string) {
  const filter = 'scale=-2:trunc(min(ih\\,720)/2)*2'
    + (tag ? ",drawtext=text='Nuvex " + tag + "':fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:x=16:y=h-th-16" : '');
  await ffmpeg([...ffInput, '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-vf', filter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', '-c:a', 'aac', '-movflags', '+faststart', output]);
}

export async function renderMedia({ database, storage }: Pick<WorkerContext, 'database' | 'storage'>, row: Entry, transcode: boolean) {
  if (!row.objectKey) return;
  const original = row.objectKey;
  await temporary(async (dir) => {
    const source = join(dir, row.mime === 'image/jpeg' ? 'source.jpg' : 'source');
    const { etag, compressed } = await materialize(storage, original, source);
    const prefix = 'media/' + row.id + '/';
    if (row.mime.startsWith('video/')) {
      if (transcode) {
        const output = join(dir, 'preview.mp4');
        await renderVideo(source, output);
        await saveFile(storage, prefix + 'preview.mp4', output);
        await database.entry.update({ where: { id: row.id }, data: { videoKey: prefix + 'preview.mp4', mediaStatus: 'ready' } });
        return;
      }
      const { stdout } = await exec('ffprobe', ['-v', 'error', ...ffInput, '-show_streams', '-show_format', '-of', 'json', source], { timeout: 30_000 });
      const info = JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; pix_fmt?: string }[]; format: { format_name: string } };
      const video = info.streams.find((stream) => stream.codec_type === 'video');
      const audio = info.streams.find((stream) => stream.codec_type === 'audio');
      if (!video) throw new Error('El archivo no contiene video.');
      const compatible = (row.mime === 'video/mp4' && info.format.format_name.split(',').includes('mp4') &&
        video.codec_name === 'h264' && video.pix_fmt === 'yuv420p' && (!audio || audio.codec_name === 'aac')) ||
        (row.mime === 'video/webm' && info.format.format_name.split(',').includes('webm') &&
        ['vp8', 'vp9', 'av1'].includes(video.codec_name) && (!audio || ['opus', 'vorbis'].includes(audio.codec_name)));
      const poster = join(dir, 'poster.webp');
      await ffmpeg([...ffInput, '-i', source, '-frames:v', '1', '-vf', 'scale=480:-2', '-c:v', 'libwebp', poster]);
      await saveFile(storage, prefix + 'poster.webp', poster);
      await database.entry.update({
        where: { id: row.id },
        data: { posterKey: prefix + 'poster.webp', ...(compatible ? { videoKey: original } : {}), mediaStatus: compatible || row.videoKey ? 'ready' : 'needs-transcode' },
      });
      return;
    }
    const image = sharp(source, { limitInputPixels: 40_000_000 });
    const info = await image.metadata();
    if (!info.format || !['jpeg', 'png', 'webp', 'gif', 'heif'].includes(info.format)) throw new Error('El formato de imagen no está admitido.');
    const preview = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const thumb = await sharp(preview).resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    await storage.put(prefix + 'preview.webp', preview, preview.length);
    await storage.put(prefix + 'poster.webp', thumb, thumb.length);
    if (info.format === 'jpeg' && row.mime === 'image/jpeg' && etag && !compressed) {
      try {
        const originalSize = Number(row.size);
        const result = await recompressJpeg(source, dir, originalSize);
        if (result) {
          await storage.replaceWithJpegXl(original, etag, result.bytes, originalSize, result.originalHash);
          log('info', 'JPEG comprimido', { id: row.id, originalBytes: originalSize, storedBytes: result.bytes.length });
        }
      } catch {
        log('warn', 'No se pudo comprimir el JPEG', { id: row.id });
      }
    }
    await database.entry.update({ where: { id: row.id }, data: {
      previewKey: prefix + 'preview.webp', posterKey: prefix + 'poster.webp', mediaStatus: 'ready',
    } });
  });
}

export async function watermark({ database, storage }: Pick<WorkerContext, 'database' | 'storage'>, id: string, guestId: string) {
  const guest = await database.guestSession.findUnique({ where: { id: guestId } });
  if (!guest || guest.expiresAt <= new Date()) return;
  const share = await database.share.findUnique({ where: { id: guest.shareId } });
  if (!share || share.revokedAt) return;
  const row = await database.entry.findUnique({ where: { id } });
  if (!row || !row.objectKey || row.trashedAt || row.ownerId !== share.ownerId) return;
  const object = 'guest/' + guestId + '/' + id;
  if (await storage.head(object).catch(() => null)) return;
  const tag = guestId.replaceAll('-', '').slice(0, 12);
  await temporary(async (dir) => {
    const source = join(dir, 'source');
    if (row.mime.startsWith('video/') && (row.videoKey || row.posterKey)) {
      await materialize(storage, row.videoKey ?? row.objectKey!, source);
      await renderVideo(source, join(dir, 'guest.mp4'), tag);
      await saveFile(storage, object, join(dir, 'guest.mp4'));
    } else if (row.previewKey) {
      await materialize(storage, row.previewKey, source);
      const scaled = await sharp(source).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).toBuffer();
      const { width = 1, height = 1 } = await sharp(scaled).metadata();
      const image = '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">'
        + '<text x="50%" y="90%" text-anchor="middle" font-size="' + Math.max(4, Math.min(32, width / 10))
        + '" font-family="sans-serif" fill="white" stroke="#111" stroke-width="0.65">Nuvex ' + tag + '</text></svg>';
      const marked = await sharp(scaled).composite([{ input: Buffer.from(image) }]).webp().toBuffer();
      await storage.put(object, marked, marked.length);
    }
  });
}
