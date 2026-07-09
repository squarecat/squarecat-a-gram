import 'dotenv/config';
import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { findSource } from '../sources';
import type { AlbumImage } from '../sources/types';
import type { Post } from './store';

const run = promisify(execFile);
const MEDIA_DIR = process.env.MEDIA_DIR ?? 'media';

/** 401 Response if the form's password is missing/wrong, null if OK. */
export function requirePassword(form: FormData): Response | null {
  const expected = process.env.ADMIN_PASSWORD;
  const given = Buffer.from(String(form.get('password') ?? ''));
  if (expected && given.length === Buffer.from(expected).length && timingSafeEqual(given, Buffer.from(expected))) {
    return null;
  }
  const msg = expected
    ? 'Wrong password.'
    : 'Publishing is disabled: ADMIN_PASSWORD is not set on the server.';
  return new Response(msg, { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// EXIF (incl. GPS/home coordinates) is stripped by sharp by default — this feed is
// fully public, so never add .withMetadata() here.
function toWebp(buf: Buffer) {
  return sharp(buf)
    .rotate() // bake in EXIF orientation before EXIF is stripped
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
}

/**
 * Transcode a video to web-safe H.264/AAC MP4 (phones shoot HEVC, which Firefox and older
 * Chrome can't play) and extract a poster frame. Needs ffmpeg on PATH (in the Docker image).
 * ponytail: always re-encode + synchronous in the publish request; fine at family scale, a
 * long 4K clip will be slow — move to a background job if that ever bites.
 */
async function videoToMp4(buf: Buffer, dir: string, postId: string, name: string) {
  const input = join(dir, `.in-${name}`);
  const posterJpg = join(dir, `.poster-${name}.jpg`);
  const mp4 = `${name}.mp4`;
  const poster = `${name}.webp`;
  await writeFile(input, buf);
  try {
    await run('ffmpeg', ['-y', '-i', input,
      '-vf', "scale='min(1280,iw)':-2", // cap width at 1280, keep even height
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-c:a', 'aac', '-movflags', '+faststart', // faststart = playable while downloading
      join(dir, mp4)], { maxBuffer: 1 << 26 });
    await run('ffmpeg', ['-y', '-i', join(dir, mp4), '-frames:v', '1', '-q:v', '3', posterJpg]);
    const out = await toWebp(await sharp(posterJpg).toBuffer());
    await writeFile(join(dir, poster), out.data);
    return {
      src: `/media/${postId}/${mp4}`,
      poster: `/media/${postId}/${poster}`,
      w: out.info.width,
      h: out.info.height,
      kind: 'video' as const,
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') throw new Error('ffmpeg is not installed — required to publish videos');
    throw new Error(`Video processing failed: ${String(err?.stderr ?? err?.message).slice(-200)}`);
  } finally {
    await rm(input, { force: true });
    await rm(posterJpg, { force: true });
  }
}

async function imageToWebp(item: AlbumImage, dir: string, postId: string, name: string) {
  let buf = await item.download();
  let out;
  try {
    out = await toWebp(buf);
  } catch (err) {
    if (!/\.hei[cf]$/i.test(item.title)) throw err;
    // sharp built without libheif — convert HEIC → JPEG first
    const convert = (await import('heic-convert')).default;
    buf = Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.9 }));
    out = await toWebp(buf);
  }
  const file = `${name}.webp`;
  await writeFile(join(dir, file), out.data);
  return { src: `/media/${postId}/${file}`, w: out.info.width, h: out.info.height };
}

/**
 * Download + decrypt + optimise every image in the album into media/<postId>/,
 * replacing whatever was there. Filenames carry a stamp because /media is served
 * with immutable caching — a re-sync must produce new URLs.
 */
export interface AlbumResult {
  images: Post['images'];
  location?: { lat: number; lng: number }; // first photo's GPS, rounded ~11km for privacy
}

export async function albumToImages(
  albumUrl: string,
  postId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<AlbumResult> {
  const album = await findSource(albumUrl).list(albumUrl); // sorted by takenAt
  onProgress?.(0, album.length);

  const dir = join(MEDIA_DIR, postId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const stamp = Date.now().toString(36);
  const images: Post['images'] = [];
  for (const item of album) {
    const name = `${stamp}-${images.length + 1}`;
    images.push(
      item.kind === 'video'
        ? await videoToMp4(await item.download(), dir, postId, name)
        : await imageToWebp(item, dir, postId, name),
    );
    onProgress?.(images.length, album.length);
  }

  if (!images.length) throw new Error('No media found in that album (live photos are skipped)');

  // globe pin from the earliest photo that has GPS; round to ~11km so the exact spot
  // (e.g. a home) is never stored or shown — consistent with stripping EXIF off the images
  const geo = album.find((i) => typeof i.lat === 'number' && typeof i.lng === 'number');
  const round = (n: number) => Math.round(n * 10) / 10;
  const location = geo ? { lat: round(geo.lat!), lng: round(geo.lng!) } : undefined;
  return { images, location };
}
