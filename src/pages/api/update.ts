import type { APIRoute } from 'astro';
import { albumToImages, requirePassword } from '../../lib/publish';
import { readPosts, updatePosts, type Post } from '../../lib/store';
import { createJob, finishJob, updateJob } from '../../lib/jobs';

// Like /api/publish, this runs as a background job so a re-sync (which downloads + re-encodes
// the whole album) can't hit a proxy timeout, and the edit form can show a progress bar.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate;

  const id = String(form.get('id') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const country = String(form.get('country') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const caption = String(form.get('caption') ?? '').trim();
  const enteUrl = String(form.get('enteUrl') ?? '').trim();
  const date = String(form.get('date') ?? '').trim();
  const resync = form.get('resync') === 'on';

  const existing = (await readPosts()).find((p) => p.id === id);
  if (!existing) return new Response('Post not found', { status: 404 });

  const jobId = createJob();
  (async () => {
    try {
      // slow album download happens OUTSIDE the store lock, reporting progress
      let images: Post['images'] | null = null;
      let location: { lat: number; lng: number } | undefined;
      if (resync) {
        const sourceUrl = enteUrl || existing.enteUrl;
        if (!sourceUrl) throw new Error('No album link stored for this post — paste one to re-sync');
        ({ images, location } = await albumToImages(sourceUrl, id, (done, total) =>
          updateJob(jobId, { done, total }),
        ));
      }
      await updatePosts((posts) => {
        const post = posts.find((p) => p.id === id);
        if (!post) return; // deleted mid-resync; nothing to update
        post.title = title;
        post.country = country;
        post.author = author;
        post.caption = caption;
        if (enteUrl) post.enteUrl = enteUrl;
        if (date && date !== post.createdAt.slice(0, 10)) {
          // noon UTC so the date can't shift across timezones
          post.createdAt = new Date(`${date}T12:00:00Z`).toISOString();
        }
        if (images) {
          post.images = images;
          post.lat = location?.lat; // refresh (or clear) the pin from the re-synced album
          post.lng = location?.lng;
        }
      });
      finishJob(jobId, { status: 'done' });
    } catch (e) {
      finishJob(jobId, { status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  })();

  return new Response(JSON.stringify({ id: jobId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
