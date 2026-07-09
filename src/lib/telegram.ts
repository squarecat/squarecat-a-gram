import 'dotenv/config';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

export function telegramEnabled(): boolean {
  return Boolean(TOKEN && CHAT);
}

// Plain text (no parse_mode) so user-supplied name/text can't inject markup.
// Never throws — a ping failure must not break commenting/replying.
async function send(message: string): Promise<void> {
  if (!telegramEnabled()) return;
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
    console.error(`[telegram] request error: ${(e as Error).message}`);
  }
}

const postLink = (postId: string) => {
  const base = (process.env.SITE_URL ?? '').replace(/\/$/, '');
  return base ? `\n${base}/#post-${postId}` : '';
};

export function notifyComment(opts: { postId: string; postLabel: string; name: string; text: string }) {
  const on = opts.postLabel ? ` on “${opts.postLabel}”` : '';
  return send(`💬 New comment${on}\n${opts.name}: ${opts.text}${postLink(opts.postId)}`);
}

export function notifyReplyTelegram(opts: { postId: string; name: string; text: string; toName: string }) {
  return send(`↳ ${opts.name} replied to ${opts.toName}\n${opts.text}${postLink(opts.postId)}`);
}
