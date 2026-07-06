import { defineMiddleware } from 'astro:middleware';

// POST bodies are buffered fully in memory (formData/json), so cap them.
// Chunked POSTs (no Content-Length) are rejected too — every legit client
// (browser forms, fetch) sends a length. Largest real payload is a comment (~1KB).
const MAX_BODY = 64 * 1024;

export const onRequest = defineMiddleware(({ request }, next) => {
  if (request.method === 'POST') {
    const len = Number(request.headers.get('content-length'));
    if (!Number.isFinite(len) || len === 0 || len > MAX_BODY) {
      return new Response('Payload too large', { status: 413 });
    }
  }
  return next();
});
