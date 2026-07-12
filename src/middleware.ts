import { defineMiddleware } from 'astro:middleware';

// POST bodies are buffered fully in memory (formData/json), so cap them.
// Chunked POSTs (no Content-Length) are rejected too — every legit client
// (browser forms, fetch) sends a length. Largest real payload is a comment (~1KB).
const MAX_BODY = 64 * 1024;

export const onRequest = defineMiddleware(async ({ request }, next) => {
  if (request.method === 'POST') {
    const len = Number(request.headers.get('content-length'));
    if (!Number.isFinite(len) || len === 0 || len > MAX_BODY) {
      return new Response('Payload too large', { status: 413 });
    }
  }
  const res = await next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY'); // no clickjacking
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
});
