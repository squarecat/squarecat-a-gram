import type { APIRoute } from 'astro';
import { REACTION_EMOJIS, updatePosts } from '../../lib/store';

// Public, increment-only. ponytail: one-reaction-per-post is enforced client-side
// (localStorage) only; add per-IP tracking if reaction spam ever matters.
export const POST: APIRoute = async ({ request }) => {
  const { id, emoji } = await request.json().catch(() => ({}) as Record<string, string>);
  if (!REACTION_EMOJIS.includes(emoji)) return new Response('Bad emoji', { status: 400 });

  const reactions = await updatePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return null;
    post.reactions ??= {};
    post.reactions[emoji] = (post.reactions[emoji] ?? 0) + 1;
    return post.reactions;
  });
  if (!reactions) return new Response('Post not found', { status: 404 });
  return new Response(JSON.stringify(reactions), {
    headers: { 'Content-Type': 'application/json' },
  });
};
