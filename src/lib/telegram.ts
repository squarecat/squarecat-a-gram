import 'dotenv/config';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

export function telegramEnabled(): boolean {
  return Boolean(TOKEN && CHAT);
}

/** Fire-and-forget Telegram ping on a new comment. Plain text (no parse_mode) so
 *  user-supplied name/text can't inject markup. Never throws — commenting must not break. */
export async function notifyComment(opts: {
  postId: string;
  postLabel: string;
  name: string;
  text: string;
}): Promise<void> {
  if (!telegramEnabled()) return;
  const base = (process.env.SITE_URL ?? '').replace(/\/$/, '');
  const link = base ? `\n${base}/#post-${opts.postId}` : '';
  const on = opts.postLabel ? ` on “${opts.postLabel}”` : '';
  const message = `💬 New comment${on}\n${opts.name}: ${opts.text}${link}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: message }),
    });
    // Telegram returns HTTP 200 with {ok:false,description} for logical errors
    // (bot not in chat, wrong chat_id, …) — log those so misconfig is visible.
    const body = await res.json().catch(() => ({}));
    if (!body?.ok) console.error(`[telegram] send failed: ${body?.description ?? res.status}`);
  } catch (e) {
    // never let a ping failure affect the comment, but do log it
    console.error(`[telegram] request error: ${(e as Error).message}`);
  }
}
