import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Post {
  id: string;
  title?: string; // short location label, e.g. "Bangkok"
  caption: string;
  createdAt: string; // ISO
  enteUrl?: string; // kept for re-sync; absent on pre-edit-feature posts
  images: { src: string; w: number; h: number }[];
  comments?: { name: string; text: string; createdAt: string }[];
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

export async function writePosts(posts: Post[]): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(posts, null, 2));
  await rename(tmp, FILE); // atomic write
}

export async function addPost(post: Post): Promise<void> {
  const posts = await readPosts();
  posts.push(post);
  await writePosts(posts);
}
