// iCloud Shared Album source. Public shared-album web links
// (https://www.icloud.com/sharedalbum/#<token>) are backed by a JSON "webstream" API — no
// auth, no crypto. Flow: POST webstream (following the 330 partition redirect) → list photos
// → POST webasseturls to resolve signed download URLs → download the largest derivative.
import 'dotenv/config';
import type { AlbumImage, Source } from './types';

const UA = 'travel-feed/1.0';

interface Derivative {
  checksum?: string;
  width?: string;
  height?: string;
}
interface IcPhoto {
  photoGuid: string;
  dateCreated?: string;
  caption?: string;
  mediaAssetType?: string; // "video" for videos
  derivatives?: Record<string, Derivative>;
}

function parseToken(shareUrl: string): string {
  const url = new URL(shareUrl.trim());
  if (!/(^|\.)icloud\.com$/.test(url.hostname) || !/\/sharedalbum\/?/.test(url.pathname)) {
    throw new Error('Not an iCloud shared-album link');
  }
  const token = url.hash.replace(/^#/, '').trim();
  if (!token) throw new Error('iCloud share link is missing its album token');
  return token;
}

function post(host: string, token: string, path: string, body: unknown) {
  return fetch(`https://${host}/${token}/sharedstreams/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
    body: JSON.stringify(body),
  });
}

/** POST webstream, following the 330 that names the album's real partition host. */
async function webstream(token: string): Promise<{ host: string; photos: IcPhoto[] }> {
  let host = 'p01-sharedstreams.icloud.com';
  for (let i = 0; i < 4; i++) {
    const res = await post(host, token, 'webstream', { streamCtag: null });
    if (res.status === 330) {
      host = (await res.json())['X-Apple-MMe-Host'];
      if (!host) throw new Error('iCloud redirect did not name a host');
      continue;
    }
    if (res.status === 401) {
      throw new Error('This iCloud album is not public — turn on its "Public Website" link in Photos');
    }
    if (!res.ok) throw new Error(`iCloud webstream failed: HTTP ${res.status}`);
    return { host, photos: (await res.json()).photos ?? [] };
  }
  throw new Error('iCloud partition redirect loop');
}

/** Largest derivative that has a checksum (real photos expose several sizes). */
function bestDerivative(photo: IcPhoto): Derivative | undefined {
  return Object.values(photo.derivatives ?? {})
    .filter((d) => d.checksum)
    .sort((a, b) => Number(b.width) * Number(b.height) - Number(a.width) * Number(a.height))[0];
}

export const icloudSource: Source = {
  name: 'icloud',
  matches(url) {
    try {
      parseToken(url);
      return true;
    } catch {
      return false;
    }
  },
  async list(url) {
    const token = parseToken(url);
    const { host, photos } = await webstream(token);

    const picked = photos
      .map((photo) => ({ photo, deriv: bestDerivative(photo) }))
      .filter((p): p is { photo: IcPhoto; deriv: Derivative } => !!p.deriv);
    if (!picked.length) return [];

    // resolve download URLs for every chosen derivative in one batch
    const res = await post(host, token, 'webasseturls', {
      photoGuids: picked.map((p) => p.photo.photoGuid),
    });
    if (!res.ok) throw new Error(`iCloud webasseturls failed: HTTP ${res.status}`);
    const { items, locations } = (await res.json()) as {
      items: Record<string, { url_location: string; url_path: string }>;
      locations: Record<string, { scheme: string; hosts: string[] }>;
    };
    const urlFor = (checksum: string): string | null => {
      const it = items[checksum];
      const loc = it && locations[it.url_location];
      return loc ? `${loc.scheme}://${loc.hosts[0]}${it.url_path}` : null;
    };

    const out: AlbumImage[] = [];
    for (const { photo, deriv } of picked) {
      const dl = urlFor(deriv.checksum!);
      if (!dl) continue;
      out.push({
        title: `${photo.photoGuid}.jpg`, // iCloud serves JPEG derivatives (no HEIC path needed)
        takenAt: (Date.parse(photo.dateCreated ?? '') || 0) * 1000, // → epoch µs
        // ponytail: video detection via mediaAssetType is best-effort/untested — verify with a
        // shared album that contains a clip before trusting it.
        kind: photo.mediaAssetType === 'video' ? 'video' : 'image',
        download: async () => Buffer.from(await (await fetch(dl, { headers: { 'User-Agent': UA } })).arrayBuffer()),
      });
    }
    // oldest first, by capture time — matches the Ente source
    return out.sort((a, b) => a.takenAt - b.takenAt);
  },
};
