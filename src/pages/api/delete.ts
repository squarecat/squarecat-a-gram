import 'dotenv/config';
import type { APIRoute } from 'astro';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { requireAuth } from '../../lib/auth';
import { updatePosts } from '../../lib/store';

const MEDIA_DIR = process.env.MEDIA_DIR ?? 'media';

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const gate = requireAuth(cookies);
  if (gate) return gate;

  const id = String(form.get('id') ?? '');
  const found = await updatePosts((posts) => {
    const i = posts.findIndex((p) => p.id === id);
    if (i < 0) return false;
    posts.splice(i, 1);
    return true;
  });
  if (!found) return new Response('Post not found', { status: 404 });

  // id is verified against the store above, so this can't escape MEDIA_DIR
  await rm(join(MEDIA_DIR, id), { recursive: true, force: true });
  return redirect('/admin', 303);
};
