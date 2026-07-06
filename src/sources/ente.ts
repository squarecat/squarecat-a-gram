// Ente public-album source: parse share URL → info → diff → per-file decrypt.
// Spec grounded against github.com/ente-io/ente web/apps/albums — see plan.md.
//
// Self-check (crypto vectors + optional live album):
//   yarn selfcheck [shareUrl]
import 'dotenv/config';
import type { AlbumImage, Source } from './types';
import { createRequire } from 'node:module';
import type _sodiumT from 'libsodium-wrappers';
import bs58 from 'bs58';

// CJS build: the package's ESM entry references a file that doesn't exist (upstream bug)
const _sodium: typeof _sodiumT = createRequire(import.meta.url)('libsodium-wrappers');

const API = process.env.ENTE_API_BASE ?? 'https://photos.squarecat.io/api';

export interface EnteFile {
  id: number;
  encryptedKey: string;
  keyDecryptionNonce: string;
  metadata: { decryptionHeader: string; encryptedData: string };
  file: { decryptionHeader: string };
  updationTime: number; // epoch µs
  isDeleted?: boolean;
}

export interface FileMetadata {
  fileType: number; // 0=image, 1=video, 2=live photo
  title: string;
  creationTime?: number; // epoch µs
}

// Every encrypted field is standard base64 — only the URL fragment is base58.
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

async function sodium() {
  await _sodium.ready;
  return _sodium;
}

function headers(token: string) {
  return {
    'X-Auth-Access-Token': token,
    'X-Client-Package': 'io.ente.albums.web',
    // Stable UA: Ente counts UA+IP+token as one device against the link's device limit.
    'User-Agent': 'travel-feed/1.0',
  };
}

async function api(path: string, token: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, { headers: headers(token), redirect: 'follow' });
  if (!res.ok) throw new Error(`Ente API ${path} failed: HTTP ${res.status}`);
  return res;
}

export function parseShareUrl(raw: string): { token: string; collectionKey: Uint8Array } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('That is not a valid URL');
  }
  const token = url.searchParams.get('t');
  const frag = url.hash.slice(1);
  if (!token || !frag) throw new Error('Not an Ente share link (expected ?t=<token>#<key>)');
  if (frag.length >= 50) throw new Error('Legacy hex share links are not supported');
  // Fragment is base58 (Bitcoin alphabet) — the ONE field that is not base64.
  const collectionKey = bs58.decode(frag);
  if (collectionKey.length !== 32) throw new Error('Share link key is malformed');
  return { token, collectionKey };
}

/** Validates the link is still usable; throws a human-readable error if not. */
export async function getInfo(token: string): Promise<unknown> {
  const { collection } = await (await api('/public-collection/info', token)).json();
  const pub = collection?.publicURLs?.[0];
  if (pub?.validTill && pub.validTill < Date.now() * 1000) {
    throw new Error('This share link has expired');
  }
  if (pub && pub.enableDownload === false) {
    throw new Error('Downloads are disabled on this share link — enable them in Ente and retry');
  }
  return collection;
}

/** All non-deleted files, oldest-added first (updationTime is the only "added" signal). */
export async function listFiles(token: string): Promise<EnteFile[]> {
  const files = new Map<number, EnteFile>();
  let sinceTime = 0;
  while (true) {
    const { diff, hasMore } = await (
      await api(`/public-collection/diff?sinceTime=${sinceTime}`, token)
    ).json();
    for (const f of diff as EnteFile[]) {
      sinceTime = Math.max(sinceTime, f.updationTime);
      if (f.isDeleted) files.delete(f.id);
      else files.set(f.id, f);
    }
    if (!hasMore) break;
  }
  return [...files.values()].sort((a, b) => a.updationTime - b.updationTime);
}

/** SecretBox: unwrap the per-file key with the collection key. */
export async function decryptFileKey(
  file: Pick<EnteFile, 'encryptedKey' | 'keyDecryptionNonce'>,
  collectionKey: Uint8Array,
): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_secretbox_open_easy(b64(file.encryptedKey), b64(file.keyDecryptionNonce), collectionKey);
}

/** SecretStream, single pull: the file's metadata JSON. */
export async function decryptMetadata(file: EnteFile, fileKey: Uint8Array): Promise<FileMetadata> {
  const s = await sodium();
  const state = s.crypto_secretstream_xchacha20poly1305_init_pull(
    b64(file.metadata.decryptionHeader),
    fileKey,
  );
  const { message } = s.crypto_secretstream_xchacha20poly1305_pull(state, b64(file.metadata.encryptedData));
  return JSON.parse(s.to_string(message));
}

/** SecretStream, chunked: full file bytes. Header is a separate API field, NOT prepended to the ciphertext. */
export async function decryptStream(cipher: Uint8Array, headerB64: string, fileKey: Uint8Array): Promise<Buffer> {
  const s = await sodium();
  const state = s.crypto_secretstream_xchacha20poly1305_init_pull(b64(headerB64), fileKey);
  const chunkSize = 4 * 1024 * 1024 + s.crypto_secretstream_xchacha20poly1305_ABYTES;
  const out: Uint8Array[] = [];
  for (let i = 0; i < cipher.length; i += chunkSize) {
    const res = s.crypto_secretstream_xchacha20poly1305_pull(state, cipher.subarray(i, i + chunkSize));
    if (!res) throw new Error('File decryption failed (wrong key?)');
    out.push(res.message);
    if (res.tag === s.crypto_secretstream_xchacha20poly1305_TAG_FINAL) break;
  }
  return Buffer.concat(out);
}

export async function downloadAndDecryptImage(
  token: string,
  file: EnteFile,
  fileKey: Uint8Array,
): Promise<Buffer> {
  // 307-redirects to presigned S3; fetch follows it.
  const res = await api(`/public-collection/files/download/${file.id}`, token);
  const cipher = new Uint8Array(await res.arrayBuffer());
  return decryptStream(cipher, file.file.decryptionHeader, fileKey);
}

export const enteSource: Source = {
  name: 'ente',
  matches(url) {
    try {
      parseShareUrl(url);
      return true;
    } catch {
      return false;
    }
  },
  async list(url) {
    const { token, collectionKey } = parseShareUrl(url);
    await getInfo(token); // throws if expired / downloads disabled
    const files = await listFiles(token);
    const images: AlbumImage[] = [];
    for (const f of files) {
      const fileKey = await decryptFileKey(f, collectionKey);
      const meta = await decryptMetadata(f, fileKey);
      if (meta.fileType !== 0) continue; // ponytail: images only; skip video/live photo
      images.push({
        title: meta.title ?? '',
        takenAt: meta.creationTime ?? 0,
        download: () => downloadAndDecryptImage(token, f, fileKey),
      });
    }
    // order by when the photo was taken, not when it was added to the album
    return images.sort((a, b) => a.takenAt - b.takenAt);
  },
};

// __main__ self-check: fails loudly if the crypto path is broken.
if (process.argv[1]?.endsWith('ente.ts')) {
  const { strict: assert } = await import('node:assert');
  const s = await sodium();

  // base58 round-trip (the #1 failure mode is treating the fragment as base64)
  const collectionKey = s.randombytes_buf(32);
  assert.deepEqual(bs58.decode(bs58.encode(collectionKey)), collectionKey);

  // SecretBox: wrap a file key the way Ente does, unwrap via our path
  const fileKey = s.randombytes_buf(32);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const wrapped = s.crypto_secretbox_easy(fileKey, nonce, collectionKey);
  const unwrapped = await decryptFileKey(
    {
      encryptedKey: Buffer.from(wrapped).toString('base64'),
      keyDecryptionNonce: Buffer.from(nonce).toString('base64'),
    },
    collectionKey,
  );
  assert.deepEqual(unwrapped, fileKey);

  // SecretStream: two-chunk encrypt (4MB + tail) → our chunked decryptStream
  const plain = s.randombytes_buf(4 * 1024 * 1024 + 4096);
  const push = s.crypto_secretstream_xchacha20poly1305_init_push(fileKey);
  const c1 = s.crypto_secretstream_xchacha20poly1305_push(
    push.state, plain.subarray(0, 4 * 1024 * 1024), null,
    s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE,
  );
  const c2 = s.crypto_secretstream_xchacha20poly1305_push(
    push.state, plain.subarray(4 * 1024 * 1024), null,
    s.crypto_secretstream_xchacha20poly1305_TAG_FINAL,
  );
  const roundTripped = await decryptStream(
    Buffer.concat([c1, c2]),
    Buffer.from(push.header).toString('base64'),
    fileKey,
  );
  assert.deepEqual(new Uint8Array(roundTripped), plain);
  console.log('crypto self-check OK');

  // Optional live check against a real share link
  const liveUrl = process.argv[2];
  if (liveUrl) {
    const parsed = parseShareUrl(liveUrl);
    await getInfo(parsed.token);
    const files = await listFiles(parsed.token);
    console.log(`album OK: ${files.length} file(s)`);
    for (const f of files) {
      const key = await decryptFileKey(f, parsed.collectionKey);
      const meta = await decryptMetadata(f, key);
      console.log(` - ${meta.title} (fileType ${meta.fileType})`);
    }
    if (files[0]) {
      const key = await decryptFileKey(files[0], parsed.collectionKey);
      const bytes = await downloadAndDecryptImage(parsed.token, files[0], key);
      console.log(
        `downloaded+decrypted first file: ${bytes.length} bytes, magic ${bytes.subarray(0, 8).toString('hex')}`,
      );
    }
  }
}
