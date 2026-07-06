import type { APIRoute } from 'astro';
import site from '../../site.json';

// Served at /manifest.webmanifest — name from site.json so the PWA install label is correct.
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: `${site.name} — ${site.subtitle}`,
      short_name: site.name,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/assets/icon-256.png', sizes: '256x256', type: 'image/png' },
        { src: '/assets/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
