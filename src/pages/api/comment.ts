import type { APIRoute } from 'astro';
import { updatePosts } from '../../lib/store';
import { notifyComment } from '../../lib/telegram';

// Public endpoint — no password. Honeypot + length caps as the spam gate.
// ponytail: no rate limiting; add per-IP throttling if spam ever gets past the honeypot.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  if (String(form.get('website') ?? '') !== '') return redirect('/', 303); // honeypot hit

  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '').trim().slice(0, 50);
  const text = String(form.get('text') ?? '').trim().slice(0, 1000);
  if (!name || !text) {
    return new Response('Name and comment are both required.', { status: 400 });
  }

  let label = '';
  const fail = await updatePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return new Response('Post not found', { status: 404 });
    if ((post.comments?.length ?? 0) >= 500) {
      // hard cap so scripted spam can't grow posts.json without bound
      return new Response('This post has reached its comment limit.', { status: 429 });
    }
    (post.comments ??= []).push({ name, text, createdAt: new Date().toISOString() });
    label = post.title || post.caption || '';
    return null;
  });
  if (fail) return fail;
  notifyComment({ postId: id, postLabel: label, name, text }).catch(() => {});
  return redirect(`/#post-${id}`, 303);
};
