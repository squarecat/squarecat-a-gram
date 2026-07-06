import 'dotenv/config';
import type { APIRoute } from 'astro';
import { pushEnabled } from '../../lib/push';

// Public key the client needs to subscribe; 204 when push isn't configured.
export const GET: APIRoute = () => {
  if (!pushEnabled()) return new Response(null, { status: 204 });
  return new Response(process.env.VAPID_PUBLIC_KEY, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
