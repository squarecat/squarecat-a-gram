# Squarecat-a-gram

**A tiny self-hosted photo blog. Think personal, private Instagram, without the brain rot**

Supports [iCloud Photos](https://www.icloud.com/photos) & [Ente](https://ente.com/).

<img width="2452" height="1666" alt="CleanShot 2026-07-12 at 14 14 15@2x" src="https://github.com/user-attachments/assets/25ca42f3-66b8-4cb5-9ee4-c966223df8a2" />

You can see it running at https://feed.squarecat.io

## How?

Each photo album you make becomes a post on your feed that visitors can comment on or react to!

- Add photos to an album in iCloud or Ente
- Share it to get a public link
- Paste that link into Squarecat-a-gram via the `/admin` screen with your password
- It does a bit of processing, then a new post appears on your feed!
- Any subscribers are sent a web notification

## Quick start

```sh
yarn                 # Node ≥ 22
cp .env.example .env
yarn dev             # dev server runs on :2987
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

The bits of text shown around the site:

| Key             | Used for                                                                  |
| --------------- | ------------------------------------------------------------------------- |
| `name`          | `<h1>`, `<title>`, OG title, handwritten line of the OG image             |
| `subtitle`      | `<title>`, second line of the OG image                                    |
| `tagline`       | Header subheading, OG description fallback                                |
| `defaultAuthor` | Prefill for the "Posted by" form field + signature fallback for old posts |

### `about.md`

The `/about` page is rendered from **`about.md`**.

### Environment variables

| Var                                                        | Default                           |                                                                                                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`                                           | _(unset — publishing disabled)_   | Required in the `/admin` forms to publish/edit/delete                                                                                                                                                   |
| `SITE_URL`                                                 | _(request origin)_                | Public origin, e.g. `https://feed.example.com` — required in prod for correct unfurl URLs                                                                                                               |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | _(unset — push disabled)_         | Web push. Generate the keypair once with `npx web-push generate-vapid-keys`; subject is `mailto:you@example.com`. All three unset → the "Get notified" button hides and publishing skips notifications. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`                  | _(unset — off)_                   | Ping a Telegram chat on each new comment or reply. Token from [@BotFather](https://t.me/BotFather); add the bot to the chat and use its id (negative for channels/groups).                              |
| `ENTE_API_BASE`                                            | `https://photos.squarecat.io/api` | Ente museum API (set to `https://api.ente.io` for ente.io accounts)                                                                                                                                     |
| `DATA_FILE`                                                | `data/posts.json`                 | Post store                                                                                                                                                                                              |
| `SUBS_FILE`                                                | `data/subscriptions.json`         | Push subscription store                                                                                                                                                                                 |
| `MEDIA_DIR`                                                | `media`                           | Optimised images, written at publish time                                                                                                                                                               |
| `HOST` / `PORT`                                            | `0.0.0.0` / `2987`                | Node server bind (`yarn start` sets these)                                                                                                                                                              |

### Self-check

```sh
yarn selfcheck                      # crypto vectors (base58 / SecretBox / SecretStream)
yarn selfcheck "https://…?t=…#…"    # + live Ente album round-trip
```

## Location globe

Every post shows a little globe with a pin on where it was taken. It figures out the spot like
this:

1. **From the first photo's GPS**, read straight from the album — nothing for you to do. Before
   it's saved, the coordinate is rounded to roughly the nearest 11 km, so the exact spot (your
   home, say) is never stored or shown.
2. **From a country picker** on the publish form, as a fallback for photos that have no location
   (screenshots, or a camera with location turned off). iCloud albums don't include GPS, so
   iCloud posts always use this — the form nudges you to pick a country.

If there's neither, the post just doesn't get a globe. The globe itself is a small SVG drawn on
the server with real continents (using `d3-geo` and a bundled map file in `src/geo/`), so there
are no map tiles, no third-party requests, and no JavaScript needed to render it.

## Deploying

The simplest option is Docker:

```sh
cp .env.example .env          # fill in ADMIN_PASSWORD, SITE_URL, and any keys you want
docker compose up -d          # reads your .env at runtime
```

Or with plain Docker:

```sh
docker build -t squarecat-a-gram .
docker run -d -p 2987:2987 --env-file .env \
  -v ./data:/app/data -v ./media:/app/media \
  squarecat-a-gram
```

`.env` is kept out of both Git and the image, so your secrets are handed in at runtime rather
than baked in.

The app serves everything itself on port `2987` — the pages, the photos, the admin — so you can
put whatever reverse proxy and HTTPS you like in front of it. One thing to know: publishing runs
in the background with a progress bar, so it won't trip a proxy timeout, but _re-syncing_ an
existing post still happens in one request, so give your proxy a generous read timeout (say
600s) if you re-sync big or video-heavy albums.

The `data/` and `media/` folders are the only state, so mount them as volumes and back them up.

Videos are converted with `ffmpeg`, which the Docker image already includes. You can also run
it without Docker — `yarn && yarn build`, then `node dist/server/entry.mjs` with your env vars
set — but you'll need `ffmpeg` on the `PATH` for videos (`apt install ffmpeg`), Node 20.19+, and
`heic-convert` handles iPhone HEIC photos if your `sharp` build can't.

## Contributing

### Self-check

This checks the fiddliest, most fragile part — decrypting Ente albums — without you having to
publish anything. It's handy after updating dependencies, or if publishing suddenly starts
producing garbled images.

```sh
yarn selfcheck                      # just the crypto round-trips
yarn selfcheck "https://…?t=…#…"    # also runs against a real Ente album
```

On its own, it confirms the encryption building blocks work correctly against known values, so a
broken crypto library fails loudly instead of subtly. Give it an Ente share link and it goes the
whole way — reads the album, decrypts the file list and metadata, and downloads and decrypts the
first image — so you know the real pipeline works before trusting it with a live post.

### Writing a photo source

A "source" is the bit that turns a shared-album link into a list of downloadable photos. The
entire contract is in `src/sources/types.ts`:

```ts
export interface AlbumImage {
  title: string; // original filename (used to spot HEIC files)
  takenAt: number; // epoch µs, for ordering
  kind: "image" | "video";
  lat?: number; // capture location, if the source exposes it (for the globe)
  lng?: number;
  download(): Promise<Buffer>; // the original bytes, already decrypted/decoded
}

export interface Source {
  name: string;
  matches(shareUrl: string): boolean;
  /** Validate and list the album's items, sorted by takenAt. Throw friendly errors. */
  list(shareUrl: string): Promise<AlbumImage[]>;
}
```

Write a module in `src/sources/` and add it to the list in `src/sources/index.ts`:

```ts
export const sources: Source[] = [enteSource, icloudSource, googlePhotosSource];
```

That's really all you have to do — everything after `download()` is handled for you: converting
HEIC, transcoding video to a web-friendly format, stripping location data, resizing, and saving.
Your source just fetches the items and tags each one's `kind` (and `lat`/`lng` if it has them).
Two very different reference implementations are in the box: `src/sources/ente.ts` (fully
encrypted) and `src/sources/icloud.ts` (a plain JSON API).

## License

[MIT](LICENSE) — use it, change it, host it, whatever you like. Just keep the `LICENSE` file so
the original work stays credited.
