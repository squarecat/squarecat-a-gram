import type { APIRoute } from 'astro';
import { albumToImages, requirePassword } from '../../lib/publish';
import { addPost, type Post } from '../../lib/store';
import { notifyNewPost } from '../../lib/push';
import { createJob, finishJob, updateJob } from '../../lib/jobs';

// Publishing (download + decrypt + transcode + encode a whole album) can take minutes and
// blow past a proxy timeout, so run it as a background job: return a job id immediately, and
// the client polls /api/publish-status while a progress bar fills.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate; // wrong/no password → 401 synchronously, no job

  const enteUrl = String(form.get('enteUrl') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const country = String(form.get('country') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const caption = String(form.get('caption') ?? '').trim();
  const date = String(form.get('date') ?? '').trim(); // yyyy-mm-dd or empty

  const jobId = createJob();
  (async () => {
    try {
      const id = Date.now().toString(36);
      const { images, location } = await albumToImages(enteUrl, id, (done, total) =>
        updateJob(jobId, { done, total }),
      );
      // noon UTC so the date can't shift across timezones
      const createdAt = date ? new Date(`${date}T12:00:00Z`).toISOString() : new Date().toISOString();
      const post: Post = { id, title, country, author, caption, createdAt, enteUrl, images, ...location };
      await addPost(post);
      await notifyNewPost(post).catch(() => {}); // never let a push failure break publishing
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
