import type { APIRoute } from 'astro';
import { updatePosts, type Reply } from '../../lib/store';
import { notifyReply } from '../../lib/push';
import { notifyReplyTelegram } from '../../lib/telegram';

// Public — same spam gate as comments (honeypot + length caps + the 64KB body middleware).
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  if (String(form.get('website') ?? '') !== '') return redirect('/', 303); // honeypot hit

  const postId = String(form.get('id') ?? '');
  const commentKey = String(form.get('commentId') ?? ''); // the comment's createdAt
  const name = String(form.get('name') ?? '').trim().slice(0, 50);
  const text = String(form.get('text') ?? '').trim().slice(0, 1000);
  const authorId = String(form.get('authorId') ?? '').trim().slice(0, 64) || undefined;
  if (!name || !text) return new Response('Name and reply are both required.', { status: 400 });

  // capture what we need for notifications while under the lock
  let parentAuthorId: string | undefined;
  let parentName = '';
  let postLabel = '';
  const fail = await updatePosts((posts) => {
    const post = posts.find((p) => p.id === postId);
    const comment = post?.comments?.find((c) => c.createdAt === commentKey);
    if (!post || !comment) return new Response('Comment not found', { status: 404 });
    if ((comment.replies?.length ?? 0) >= 200) {
      return new Response('This comment has reached its reply limit.', { status: 429 });
    }
    const reply: Reply = { name, text, createdAt: new Date().toISOString(), authorId };
    (comment.replies ??= []).push(reply);
    parentAuthorId = comment.authorId;
    parentName = comment.name;
    postLabel = post.title || post.caption || '';
    return null;
  });
  if (fail) return fail;

  notifyReply({ toAuthorId: parentAuthorId, fromAuthorId: authorId, replierName: name, postId }).catch(() => {});
  notifyReplyTelegram({ postId, name, text, toName: parentName }).catch(() => {});
  return redirect(`/#post-${postId}`, 303);
};
