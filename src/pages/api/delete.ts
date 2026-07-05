import 'dotenv/config';
import type { APIRoute } from 'astro';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { requirePassword } from '../../lib/publish';
import { readPosts, writePosts } from '../../lib/store';

const MEDIA_DIR = process.env.MEDIA_DIR ?? 'media';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate;

  const id = String(form.get('id') ?? '');
  const posts = await readPosts();
  if (!posts.some((p) => p.id === id)) return new Response('Post not found', { status: 404 });

  await writePosts(posts.filter((p) => p.id !== id));
  await rm(join(MEDIA_DIR, id), { recursive: true, force: true });
  return redirect('/admin', 303);
};
