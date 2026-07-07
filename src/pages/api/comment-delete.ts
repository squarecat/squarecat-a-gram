import type { APIRoute } from 'astro';
import { requirePassword } from '../../lib/publish';
import { updatePosts } from '../../lib/store';

// Password-gated (admin edit form). Deletes a comment by its index in the post.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const gate = requirePassword(form);
  if (gate) return gate;

  const id = String(form.get('id') ?? '');
  const ci = Number(form.get('ci'));
  const ok = await updatePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post?.comments || !Number.isInteger(ci) || ci < 0 || ci >= post.comments.length) return false;
    post.comments.splice(ci, 1);
    return true;
  });
  if (!ok) return new Response('Comment not found', { status: 404 });
  return redirect(`/admin/edit/${id}`, 303);
};
