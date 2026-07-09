import type { APIRoute } from 'astro';
import { getJob } from '../../lib/jobs';

export const GET: APIRoute = ({ url }) => {
  const job = getJob(url.searchParams.get('id') ?? '');
  if (!job) return new Response('Unknown job', { status: 404 });
  return new Response(JSON.stringify(job), { headers: { 'Content-Type': 'application/json' } });
};
