import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Post {
  id: string;
  title?: string; // short location label, e.g. "Bangkok"
  author?: string; // signature under the caption; falls back to site.json defaultAuthor
  caption: string;
  createdAt: string; // ISO
  enteUrl?: string; // kept for re-sync; absent on pre-edit-feature posts
  images: { src: string; w: number; h: number; kind?: 'image' | 'video'; poster?: string }[];
  comments?: { name: string; text: string; createdAt: string }[];
  reactions?: Record<string, number>;
}

export const REACTION_EMOJIS = ['❤️', '😍', '😂', '😮', '😢', '👏'];

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
