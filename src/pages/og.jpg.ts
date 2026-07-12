import 'dotenv/config';
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';
import site from '../../site.json';
import { readPosts } from '../lib/store';

const MEDIA_DIR = process.env.MEDIA_DIR ?? 'media';
// The handwriting font for site.name — swap the TTF to change the OG look.
// Rendered to SVG paths at runtime because sharp's SVG renderer can't load webfonts
// and system font config differs per OS.
const TITLE_FONT = 'fonts/ButterflyKids-Regular.ttf';
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

let titlePathCached: string | null = null;
async function titlePath(): Promise<string> {
  if (!titlePathCached) {
    const buf = await readFile(TITLE_FONT);
    const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    titlePathCached = font.getPath(site.name, 0, 0, 110).toPathData(1);
  }
  return titlePathCached;
}

// Memoise the rendered image, keyed by the latest post — so hammering /og.jpg (unfurlers,
// HN traffic) can't turn per-request sharp work into a CPU DoS.
let cache: { key: string; buf: Buffer } | null = null;

// 1200x630 unfurl image: latest post's first photo, dark gradient, title text on top.
export const GET: APIRoute = async () => {
  const posts = (await readPosts()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = posts[0];

  const cacheKey = `${latest?.id ?? 'none'}|${latest?.images[0]?.src ?? ''}|${latest?.title ?? ''}`;
  if (cache?.key === cacheKey) {
    return new Response(cache.buf, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  const date = latest
    ? new Date(latest.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const subtitle = latest ? [date, latest.title].filter(Boolean).join(' — ') : site.tagline;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <path transform="translate(60 440)" d="${await titlePath()}" fill="#fff"/>
    <text x="60" y="516" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#fff">${esc(site.subtitle)}</text>
    <text x="60" y="574" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#fff" fill-opacity="0.85">${esc(subtitle)}</text>
  </svg>`;

  const base = latest
    ? sharp(join(MEDIA_DIR, latest.images[0].src.replace('/media/', ''))).resize(1200, 630, { fit: 'cover' })
    : sharp({ create: { width: 1200, height: 630, channels: 3, background: '#171717' } });

  const buf = await base
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toBuffer();

  cache = { key: cacheKey, buf };
  return new Response(buf, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  });
};
