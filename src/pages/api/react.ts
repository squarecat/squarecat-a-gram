import type { APIRoute } from 'astro';
import { REACTION_EMOJIS, readPosts, writePosts } from '../../lib/store';

// Public, increment-only. ponytail: one-reaction-per-post is enforced client-side
// (localStorage) only; add per-IP tracking if reaction spam ever matters.
export const POST: APIRoute = async ({ request }) => {
  const { id, emoji } = await request.json().catch(() => ({}) as Record<string, string>);
  if (!REACTION_EMOJIS.includes(emoji)) return new Response('Bad emoji', { status: 400 });

  const posts = await readPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) return new Response('Post not found', { status: 404 });

  post.reactions ??= {};
  post.reactions[emoji] = (post.reactions[emoji] ?? 0) + 1;
  await writePosts(posts);
  return new Response(JSON.stringify(post.reactions), {
    headers: { 'Content-Type': 'application/json' },
  });
};
