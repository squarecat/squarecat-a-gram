import type { APIRoute } from 'astro';
import { addSubscription } from '../../lib/subscriptions';
import { pushEnabled } from '../../lib/push';

// Public — self-subscribe is the point. Body is capped at 64KB by src/middleware.ts.
export const POST: APIRoute = async ({ request }) => {
  if (!pushEnabled()) return new Response('Push not configured', { status: 503 });
  const sub = await request.json().catch(() => null);
  if (
    !sub ||
    typeof sub.endpoint !== 'string' ||
    !sub.endpoint.startsWith('https://') ||
    typeof sub.keys?.p256dh !== 'string' ||
    typeof sub.keys?.auth !== 'string'
  ) {
    return new Response('Invalid subscription', { status: 400 });
  }
  // The server later POSTs to this endpoint (web push) — so it's an SSRF sink. Real push
  // services use public hostnames; reject IP literals / localhost to block internal targets.
  let host: string;
  try {
    host = new URL(sub.endpoint).hostname;
  } catch {
    return new Response('Invalid subscription', { status: 400 });
  }
  if (host === 'localhost' || host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return new Response('Invalid subscription', { status: 400 });
  }
  const name = typeof sub.name === 'string' ? sub.name.trim().slice(0, 50) : undefined;
  const authorId = typeof sub.authorId === 'string' ? sub.authorId.trim().slice(0, 64) : undefined;
  await addSubscription({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    name,
    authorId,
  });
  return new Response(null, { status: 204 });
};
