import type { APIRoute } from 'astro';
import { login, passwordOk } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  if (!passwordOk(String(form.get('password') ?? ''))) {
    return redirect('/admin?error=1', 303);
  }
  // set a Secure cookie only when the browser reached us over HTTPS (works on plain-http/localhost too)
  login(cookies, request.headers.get('x-forwarded-proto') === 'https');
  return redirect('/admin', 303);
};

export const GET: APIRoute = () => new Response(null, { status: 405 });
