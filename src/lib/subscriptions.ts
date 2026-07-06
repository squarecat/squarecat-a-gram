import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// A browser PushSubscription as serialised by the client.
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ponytail: JSON file store, mirrors lib/store.ts. Separate file from posts.
const FILE = process.env.SUBS_FILE ?? 'data/subscriptions.json';
const MAX = 10000; // hard cap so public POSTs can't grow the file unbounded

export async function readSubscriptions(): Promise<PushSub[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function write(subs: PushSub[]): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(subs, null, 2));
  await rename(tmp, FILE); // atomic write
}

// in-process promise-chain mutex (same pattern as lib/store.ts)
let queue: Promise<unknown> = Promise.resolve();
export function updateSubscriptions<T>(fn: (subs: PushSub[]) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const subs = await readSubscriptions();
    const result = await fn(subs);
    await write(subs);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function addSubscription(sub: PushSub): Promise<void> {
  return updateSubscriptions((subs) => {
    if (subs.some((s) => s.endpoint === sub.endpoint)) return; // dedupe
    if (subs.length >= MAX) return; // full — drop silently
    subs.push(sub);
  });
}

export function removeByEndpoint(endpoint: string): Promise<void> {
  return updateSubscriptions((subs) => {
    const i = subs.findIndex((s) => s.endpoint === endpoint);
    if (i >= 0) subs.splice(i, 1);
  });
}
