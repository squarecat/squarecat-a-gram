import 'dotenv/config';
import type { AstroCookies } from 'astro';
import { createHash, timingSafeEqual } from 'node:crypto';

// Admin session: after the password form is submitted correctly we set an httpOnly cookie
// holding a hash of the password. Every admin page + mutating endpoint checks it, so the
// password is entered once (not on every action). Changing ADMIN_PASSWORD invalidates old
// cookies for free.
const COOKIE = 'sq_admin';

export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function expectedToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash('sha256').update(`sq-admin\0${pw}`).digest('hex') : null;
}

function eq(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function passwordOk(given: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && eq(given, pw);
}

export function isAuthed(cookies: AstroCookies): boolean {
  const expected = expectedToken();
  const got = cookies.get(COOKIE)?.value;
  return !!expected && !!got && eq(got, expected);
}

/** Set the session cookie. `secure` should be true when the browser reached us over HTTPS. */
export function login(cookies: AstroCookies, secure: boolean): void {
  const token = expectedToken();
  if (!token) return;
  cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function logout(cookies: AstroCookies): void {
  cookies.delete(COOKIE, { path: '/' });
}

/** 401 for API routes when the session cookie is missing/invalid, null if OK. */
export function requireAuth(cookies: AstroCookies): Response | null {
  if (isAuthed(cookies)) return null;
  return new Response('Not signed in', { status: 401 });
}
