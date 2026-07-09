import type { APIRoute } from 'astro';
import { REACTION_EMOJIS_REPLY, applyReaction, updatePosts } from '../../lib/store';

// Public — mirrors /api/react but targets a comment (by createdAt) and allows thumbs up/down.
// One-per-comment-per-browser client-side; `prev` overrides the reactor's previous reaction.
export const POST: APIRoute = async ({ request }) => {
  const { id, key, emoji, prev } = await request.json().catch(() => ({}) as Record<string, string>);
  if (!REACTION_EMOJIS_REPLY.includes(emoji)) return new Response('Bad emoji', { status: 400 });

  const reactions = await updatePosts((posts) => {
    const comment = posts.find((p) => p.id === id)?.comments?.find((c) => c.createdAt === key);
    if (!comment) return null;
    comment.reactions ??= {};
    applyReaction(comment.reactions, emoji, prev);
    return comment.reactions;
  });
  if (!reactions) return new Response('Comment not found', { status: 404 });
  return new Response(JSON.stringify(reactions), { headers: { 'Content-Type': 'application/json' } });
};
