# Squarecat-a-gram

A tiny self-hosted photo blog fed by shared photo albums. The author publishes a post by
pasting an album share link + a caption into a password-gated form; the server downloads the
photos **once at publish time**, strips EXIF (including GPS), resizes them to webp, and serves
a fully public feed of masonry/scroller photo (and video) posts with comments, emoji reactions,
and a little globe pinned to where each post was taken. No database — posts live in a JSON file.
Optional web push notifies subscribers of new posts.

<img width="2104" height="1666" alt="CleanShot 2026-07-06 at 12 40 00@2x" src="https://github.com/user-attachments/assets/7b60285a-8593-4c0a-8690-b0c0fb5adfef" />

Example at https://feed.squarecat.io

Built-in photo source: **[Ente](https://ente.io)** public album links (including self-hosted
Ente). Other sources (Google Photos, …) can be added — see [Writing a photo source](#writing-a-photo-source).

## Quick start

```sh
yarn                 # Node ≥ 20.19 (≥ 22.6 for yarn selfcheck)
yarn dev             # dev server on :2987
yarn build && yarn start
```

Then make it yours:

1. Edit **`site.json`** — site name, subtitle, tagline, default author.
2. Replace **`public/assets/icon.png`** and **`icon-256.png`** (favicon + header icon).
3. Optional: swap the handwriting font — the Google Fonts `<link>` and `.font-hand` family in
   `src/styles/global.css` / `src/pages/index.astro` control the site; the TTF in `fonts/`
   controls the social-preview image (path configured at the top of `src/pages/og.jpg.ts`).
4. Set `ADMIN_PASSWORD` (see env vars) and publish your first post at `/admin`.

First publish: use a **1-photo album** to shake out the pipeline before trusting a full album.

## Configuration

### `site.json`

| Key | Used for |
|---|---|
| `name` | `<h1>`, `<title>`, OG title, handwritten line of the OG image |
| `subtitle` | `<title>`, second line of the OG image |
| `tagline` | Header subheading, OG description fallback |
| `defaultAuthor` | Prefill for the "Posted by" form field + signature fallback for old posts |

Rebuild after changing it (`yarn build`) — it's bundled at build time.

### Environment variables

A `.env` file in the working directory is loaded automatically (dotenv); already-set vars
(e.g. systemd `Environment=`) win.

| Var | Default | |
|---|---|---|
| `ADMIN_PASSWORD` | *(unset — publishing disabled)* | Required in the `/admin` forms to publish/edit/delete |
| `SITE_URL` | *(request origin)* | Public origin, e.g. `https://feed.example.com` — required in prod for correct unfurl URLs |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | *(unset — push disabled)* | Web push. Generate the keypair once with `npx web-push generate-vapid-keys`; subject is `mailto:you@example.com`. All three unset → the "Get notified" button hides and publishing skips notifications. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | *(unset — off)* | Ping a Telegram chat on each new comment. Token from [@BotFather](https://t.me/BotFather); add the bot to the chat and use its id (negative for channels/groups). |
| `ENTE_API_BASE` | `https://photos.squarecat.io/api` | Ente museum API (set to `https://api.ente.io` for ente.io accounts) |
| `DATA_FILE` | `data/posts.json` | Post store |
| `SUBS_FILE` | `data/subscriptions.json` | Push subscription store |
| `MEDIA_DIR` | `media` | Optimised images, written at publish time |
| `HOST` / `PORT` | `0.0.0.0` / `2987` | Node server bind (`yarn start` sets these) |

### Self-check

```sh
yarn selfcheck                      # crypto vectors (base58 / SecretBox / SecretStream)
yarn selfcheck "https://…?t=…#…"    # + live Ente album round-trip
```

## Location globe

Each post shows a small globe pinned to where it was taken. The pin location is resolved in
this order:

1. **The first photo's GPS**, read from the album metadata at publish time — automatic, nothing
   to fill in. The coordinate is **rounded to ~11 km before it's stored**, so the exact spot
   (e.g. a home) is never saved or shown — consistent with stripping EXIF off the public images.
2. **A country picker** (optional field on the compose/edit form) — the fallback when the photos
   have no GPS (screenshots, cameras with location off).

If neither is available, the post simply has no globe. The globe is server-rendered SVG with
real continents (via `d3-geo` + a bundled Natural Earth land file in `src/geo/`) — no client JS,
no map tiles, no network calls. Country centroids live in `src/geo/countries.json`.

## Writing a photo source

A source turns a share URL into a list of downloadable original images. The whole contract is
in `src/sources/types.ts`:

```ts
export interface AlbumImage {
  title: string;               // original filename (drives HEIC handling)
  takenAt: number;             // epoch µs, for ordering
  download(): Promise<Buffer>; // original image bytes, decrypted/decoded
}

export interface Source {
  name: string;
  matches(shareUrl: string): boolean;
  /** Validate + list album images, sorted by takenAt. Throw human-readable errors. */
  list(shareUrl: string): Promise<AlbumImage[]>;
}
```

Add a module in `src/sources/` and register it in `src/sources/index.ts`:

```ts
export const sources: Source[] = [enteSource, googlePhotosSource];
```

The publish pipeline (`src/lib/publish.ts`) handles everything after `download()`: HEIC
fallback, EXIF stripping, resizing, webp encoding, and the post store. Sources should filter
out non-images (videos etc.) themselves. `src/sources/ente.ts` is the reference
implementation, including end-to-end decryption of Ente's public albums.

## Deploy (Docker)

```sh
cp .env.example .env          # fill in ADMIN_PASSWORD, SITE_URL, VAPID keys, …
docker compose up -d          # reads .env at runtime
# or plain docker:
docker build -t squarecat-a-gram .
docker run -d -p 2987:2987 --env-file .env \
  -v ./data:/app/data -v ./media:/app/media \
  squarecat-a-gram
```

`.env` is gitignored and dockerignored, so secrets are injected at runtime and never baked
into the image.

The app listens on `:2987` and serves everything itself (pages, `/media/*` with immutable
cache headers, the admin). Put whatever TLS/proxy you like in front — one note if you do:
publishing processes a whole album synchronously in the POST, so give the proxy a generous
read timeout (e.g. 600s).

`data/` and `media/` are the only state — mount them as volumes and back them up.

Non-Docker deploys work too: `yarn && yarn build`, then run `node dist/server/entry.mjs` with
the env vars set (Node ≥ 20.19; `heic-convert` covers HEIC if the host's sharp lacks libheif).

## Deliberately not included

Videos/live photos (skipped at publish with a note), comment moderation UI (edit
`data/posts.json`), reaction rate-limiting beyond a honeypot + localStorage, multiple albums
per post. All additive.
