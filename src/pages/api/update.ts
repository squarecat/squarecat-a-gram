import type { APIRoute } from 'astro';
import { albumToImages, requirePassword } from '../../lib/publish';
import { readPosts, updatePosts, type Post } from '../../lib/store';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate;

  const id = String(form.get('id') ?? '');
  const caption = String(form.get('caption') ?? '').trim();
  const enteUrl = String(form.get('enteUrl') ?? '').trim();
  const resync = form.get('resync') === 'on';
  try {
    const existing = (await readPosts()).find((p) => p.id === id);
    if (!existing) return new Response('Post not found', { status: 404 });

    // slow album download happens OUTSIDE the store lock
    let images: Post['images'] | null = null;
    if (resync) {
      const sourceUrl = enteUrl || existing.enteUrl;
      if (!sourceUrl) throw new Error('No album link stored for this post — paste one to re-sync');
      images = await albumToImages(sourceUrl, id);
    }

    await updatePosts((posts) => {
      const post = posts.find((p) => p.id === id);
      if (!post) return; // deleted mid-resync; nothing to update
      post.title = String(form.get('title') ?? '').trim();
      post.author = String(form.get('author') ?? '').trim();
      post.caption = caption;
      if (enteUrl) post.enteUrl = enteUrl;
      const date = String(form.get('date') ?? '').trim();
      if (date && date !== post.createdAt.slice(0, 10)) {
        // noon UTC so the date can't shift across timezones
        post.createdAt = new Date(`${date}T12:00:00Z`).toISOString();
      }
      if (images) post.images = images;
    });
    return redirect('/', 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Update failed: ${msg}\n\nGo back and try again.`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
