import 'dotenv/config';
import { createECDH } from 'node:crypto';
import webpush from 'web-push';
import site from '../../site.json';
import { readSubscriptions, removeByEndpoint } from './subscriptions';
import type { Post } from './store';

const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT;

export function pushEnabled(): boolean {
  return Boolean(PUB && PRIV && SUBJECT);
}

/** Fail loudly at startup if the VAPID keypair is malformed or mismatched — a bad public
 *  key makes the browser reject pushManager.subscribe() with an opaque "push service error". */
function validateVapid(): void {
  try {
    const pub = Buffer.from(PUB!, 'base64url');
    if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('public key is not a 65-byte P-256 point');
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(PRIV!, 'base64url'));
    if (!ecdh.getPublicKey().equals(pub)) throw new Error('public key does not match private key');
  } catch (e) {
    console.error(`[push] VAPID keys invalid — notifications will fail: ${(e as Error).message}`);
  }
}

if (pushEnabled()) {
  webpush.setVapidDetails(SUBJECT!, PUB!, PRIV!);
  validateVapid();
}

/** Fire a push to every subscriber; prune subscriptions the push service reports gone. */
export async function notifyNewPost(post: Post): Promise<void> {
  if (!pushEnabled()) return;
  const subs = await readSubscriptions();
  if (!subs.length) return;

  const url = (process.env.SITE_URL ?? '/').replace(/\/$/, '') || '/';
  const body = [post.title, post.caption].map((s) => s?.trim()).find(Boolean)?.slice(0, 120) ?? 'New photos';
  const payload = JSON.stringify({ title: `New post — ${site.name}`, body, url });

  await Promise.all(
    subs.map((sub) =>
      webpush.sendNotification(sub, payload).catch((err) => {
        // 404/410 = subscription expired/unsubscribed → drop it
        if (err?.statusCode === 404 || err?.statusCode === 410) return removeByEndpoint(sub.endpoint);
      }),
    ),
  );
}
