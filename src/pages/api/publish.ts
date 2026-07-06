import type { APIRoute } from 'astro';
import { albumToImages, requirePassword } from '../../lib/publish';
import { addPost, type Post } from '../../lib/store';
import { notifyNewPost } from '../../lib/push';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate;

  const enteUrl = String(form.get('enteUrl') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const caption = String(form.get('caption') ?? '').trim();
  const date = String(form.get('date') ?? '').trim(); // yyyy-mm-dd or empty
  try {
    const id = Date.now().toString(36);
    const images = await albumToImages(enteUrl, id);
    // noon UTC so the date can't shift across timezones
    const createdAt = date ? new Date(`${date}T12:00:00Z`).toISOString() : new Date().toISOString();
    const post: Post = { id, title, author, caption, createdAt, enteUrl, images };
    await addPost(post);
    await notifyNewPost(post).catch(() => {}); // never let a push failure break publishing
    return redirect('/', 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Publish failed: ${msg}\n\nGo back and try again.`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
