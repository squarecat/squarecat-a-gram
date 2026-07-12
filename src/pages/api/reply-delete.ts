import type { APIRoute } from 'astro';
import { requireAuth } from '../../lib/auth';
import { updatePosts } from '../../lib/store';

// Password-gated (admin edit form). `ref` = "<commentId>:<replyIndex>".
export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  const form = await request.formData();
  const gate = requireAuth(cookies);
  if (gate) return gate;

  const postId = String(form.get('id') ?? '');
  // ref = "<comment.createdAt>|<replyIndex>" (createdAt contains ':', so split on '|')
  const ref = String(form.get('ref') ?? '');
  const bar = ref.lastIndexOf('|');
  const commentKey = ref.slice(0, bar);
  const ri = Number(ref.slice(bar + 1));

  const ok = await updatePosts((posts) => {
    const comment = posts.find((p) => p.id === postId)?.comments?.find((c) => c.createdAt === commentKey);
    if (!comment?.replies || !Number.isInteger(ri) || ri < 0 || ri >= comment.replies.length) return false;
    comment.replies.splice(ri, 1);
    return true;
  });
  if (!ok) return new Response('Reply not found', { status: 404 });
  return redirect(`/admin/edit/${postId}`, 303);
};
