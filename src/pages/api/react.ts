import type { APIRoute } from 'astro';
import { REACTION_EMOJIS, applyReaction, updatePosts } from '../../lib/store';

// Public. One-reaction-per-post enforced client-side (localStorage); `prev` lets a new click
// override the reactor's previous reaction rather than stack.
export const POST: APIRoute = async ({ request }) => {
  const { id, emoji, prev } = await request.json().catch(() => ({}) as Record<string, string>);
  if (!REACTION_EMOJIS.includes(emoji)) return new Response('Bad emoji', { status: 400 });

  const reactions = await updatePosts((posts) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return null;
    post.reactions ??= {};
    applyReaction(post.reactions, emoji, prev);
    return post.reactions;
  });
  if (!reactions) return new Response('Post not found', { status: 404 });
  return new Response(JSON.stringify(reactions), {
    headers: { 'Content-Type': 'application/json' },
  });
};
