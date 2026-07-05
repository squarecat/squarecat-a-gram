import type { APIRoute } from 'astro';
import { albumToImages, requirePassword } from '../../lib/publish';
import { readPosts, writePosts } from '../../lib/store';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate;

  const id = String(form.get('id') ?? '');
  const caption = String(form.get('caption') ?? '').trim();
  const enteUrl = String(form.get('enteUrl') ?? '').trim();
  const resync = form.get('resync') === 'on';
  try {
    const posts = await readPosts();
    const post = posts.find((p) => p.id === id);
    if (!post) return new Response('Post not found', { status: 404 });

    post.title = String(form.get('title') ?? '').trim();
    post.caption = caption;
    if (enteUrl) post.enteUrl = enteUrl;
    const date = String(form.get('date') ?? '').trim();
    if (date && date !== post.createdAt.slice(0, 10)) {
      // noon UTC so the date can't shift across timezones
      post.createdAt = new Date(`${date}T12:00:00Z`).toISOString();
    }
    if (resync) {
      if (!post.enteUrl) throw new Error('No album link stored for this post — paste one to re-sync');
      post.images = await albumToImages(post.enteUrl, post.id);
    }
    await writePosts(posts);
    return redirect('/', 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Update failed: ${msg}\n\nGo back and try again.`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
