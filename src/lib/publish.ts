import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  decryptFileKey,
  decryptMetadata,
  downloadAndDecryptImage,
  getInfo,
  listFiles,
  parseShareUrl,
} from './ente';
import type { Post } from './store';

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
 * Download + decrypt + optimise every image in the album into media/<postId>/,
 * replacing whatever was there. Filenames carry a stamp because /media is served
 * with immutable caching — a re-sync must produce new URLs.
 */
export async function albumToImages(enteUrl: string, postId: string): Promise<Post['images']> {
  const { token, collectionKey } = parseShareUrl(enteUrl);
  await getInfo(token); // throws if expired / downloads disabled
  const files = await listFiles(token);

  const dir = join(MEDIA_DIR, postId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const stamp = Date.now().toString(36);
  const images: Post['images'] = [];
  for (const f of files) {
    const fileKey = await decryptFileKey(f, collectionKey);
    const meta = await decryptMetadata(f, fileKey);
    if (meta.fileType !== 0) continue; // ponytail: images only in v1; skip video/live photo
    let buf = await downloadAndDecryptImage(token, f, fileKey);
    let out;
    try {
      out = await toWebp(buf);
    } catch (err) {
      if (!/\.hei[cf]$/i.test(meta.title ?? '')) throw err;
      // sharp built without libheif — convert HEIC → JPEG first
      const convert = (await import('heic-convert')).default;
      buf = Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.9 }));
      out = await toWebp(buf);
    }
    const name = `${stamp}-${images.length + 1}.webp`;
    await writeFile(join(dir, name), out.data);
    images.push({ src: `/media/${postId}/${name}`, w: out.info.width, h: out.info.height });
  }

  if (!images.length) throw new Error('No images found in that album (videos/live photos are skipped)');
  return images;
}
