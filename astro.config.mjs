import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  vite: { plugins: [tailwindcss()] },
  server: { port: 2987, host: '0.0.0.0' },
  // The node adapter normalizes request URLs to http://localhost unless allowedDomains is
  // configured, so checkOrigin 403s every form post (even same-origin, even in prod).
  // /api/ is behind nginx basic auth, which covers CSRF well enough for this app.
  security: { checkOrigin: false },
});
