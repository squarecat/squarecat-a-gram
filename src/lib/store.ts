import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Post {
  id: string;
  title?: string; // short location label, e.g. "Bangkok"
  country?: string; // ISO code; globe fallback when the album has no GPS
  lat?: number; // globe pin from the first photo's GPS (rounded ~11km for privacy)
  lng?: number;
  author?: string; // signature under the caption; falls back to site.json defaultAuthor
  caption: string;
  createdAt: string; // ISO
  enteUrl?: string; // kept for re-sync; absent on pre-edit-feature posts
  images: { src: string; w: number; h: number; kind?: 'image' | 'video'; poster?: string }[];
  comments?: Comment[];
  reactions?: Record<string, number>;
}

export interface Reply {
  name: string;
  text: string;
  createdAt: string; // ISO
  authorId?: string; // replier's stable per-browser id
}

export interface Comment {
  name: string;
  text: string;
  createdAt: string; // ISO — also the reply-target key (unique enough at this scale)
  authorId?: string; // commenter's stable per-browser id (matches their push subscription)
  replies?: Reply[];
  reactions?: Record<string, number>;
}

export const REACTION_EMOJIS = ['❤️', '😍', '😂', '😮', '😢', '👏'];
export const REACTION_EMOJIS_REPLY = ['👍', '👎', ...REACTION_EMOJIS];

/** Add a reaction, removing the reactor's previous one (so a click overrides, not stacks). */
export function applyReaction(reactions: Record<string, number>, emoji: string, prev?: string): void {
  // hasOwn (not `reactions[prev]`) so a crafted prev like "constructor"/"__proto__" can't
  // match an inherited property and inject a junk key into the stored reactions.
  if (prev && prev !== emoji && Object.hasOwn(reactions, prev)) {
    reactions[prev]--;
    if (reactions[prev] <= 0) delete reactions[prev];
  }
  reactions[emoji] = (reactions[emoji] ?? 0) + 1;
}

// ponytail: JSON file store; move to SQLite only if it ever grows/concurrent-writes.
const FILE = process.env.DATA_FILE ?? 'data/posts.json';

export async function readPosts(): Promise<Post[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writePosts(posts: Post[]): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(posts, null, 2));
  await rename(tmp, FILE); // atomic write
}

// ponytail: in-process promise-chain mutex — fine while this is a single Node process.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Serialised read-modify-write: `fn` mutates the array in place; it is always
 * written back afterwards. Concurrent callers queue up instead of clobbering
 * each other's changes. Keep `fn` fast — slow work (downloads) goes outside.
 */
export function updatePosts<T>(fn: (posts: Post[]) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const posts = await readPosts();
    const result = await fn(posts);
    await writePosts(posts);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export function addPost(post: Post): Promise<void> {
  return updatePosts((posts) => {
    posts.push(post);
  });
}
