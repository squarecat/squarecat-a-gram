import 'dotenv/config';
import type { APIRoute } from 'astro';
import { join } from 'node:path';
import sharp from 'sharp';
import { readPosts } from '../lib/store';
// "Squarecat-a-gram" pre-rendered to SVG paths (Butterfly Kids, 110px, baseline y=0) —
// sharp's SVG renderer can't load webfonts, and system font config differs per OS.
// Regenerate with opentype.js from fonts/ButterflyKids-Regular.ttf if the text changes.
import titlePath from '../assets/og-title-path.txt?raw';

const MEDIA_DIR = process.env.MEDIA_DIR ?? 'media';
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

// 1200x630 unfurl image: latest post's first photo, dark gradient, title text on top.
export const GET: APIRoute = async () => {
  const posts = (await readPosts()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = posts[0];
  const date = latest
    ? new Date(latest.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const subtitle = latest ? [date, latest.title].filter(Boolean).join(' — ') : 'Travel photos';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <path transform="translate(60 440)" d="${titlePath}" fill="#fff"/>
    <text x="60" y="516" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#fff">Travel Feed</text>
    <text x="60" y="574" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#fff" fill-opacity="0.85">${esc(subtitle)}</text>
  </svg>`;

  const base = latest
    ? sharp(join(MEDIA_DIR, latest.images[0].src.replace('/media/', ''))).resize(1200, 630, { fit: 'cover' })
    : sharp({ create: { width: 1200, height: 630, channels: 3, background: '#171717' } });

  const buf = await base
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toBuffer();

  return new Response(buf, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  });
};
