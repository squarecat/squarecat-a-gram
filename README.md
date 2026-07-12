# Squarecat-a-gram

A little self-hosted photo and video blog for sharing your travels — without handing it all to
Instagram.

You write a post by pasting a link to a shared photo album and adding a caption. The server
fetches those photos once, tidies them up, and publishes them as a clean public feed: a mosaic
of images with your words underneath, a small globe showing where you were, and comments,
reactions and (optionally) push notifications when you post. There's no database — everything
lives in a couple of JSON files on disk, and location data is stripped from the photos so you're
not quietly broadcasting where you live.

<img width="2104" height="1666" alt="CleanShot 2026-07-06 at 12 40 00@2x" src="https://github.com/user-attachments/assets/7b60285a-8593-4c0a-8690-b0c0fb5adfef" />

You can see it running at https://feed.squarecat.io.

**Where the photos come from.** Out of the box it can read:

- **[Ente](https://ente.io)** public album links (including a self-hosted Ente), and
- **iCloud Shared Albums** — turn on the album's "Public Website" option in Photos, then paste
  the `icloud.com/sharedalbum/#…` link.

Want to pull from somewhere else, like Google Photos? That's a small plugin — see
[Writing a photo source](#writing-a-photo-source) at the bottom.

## Quick start

You'll need Node 20.19 or newer (22.6+ if you want to run the self-check).

```sh
yarn                 # install dependencies
cp .env.example .env # your settings live here
yarn dev             # now running at http://localhost:2987
```

Open `.env` and fill in what you need. The only one that's actually required is
`ADMIN_PASSWORD` — it's what stops a stranger publishing to your feed. Everything else (your
public URL, push notifications, Telegram alerts) is optional; there's a
[full list further down](#environment-variables).

Then a few things to make it your own:

1. **`site.json`** — the name, subtitle, tagline and default author shown around the site.
2. **`public/assets/icon.png`** and **`icon-256.png`** — the header logo and browser favicon.
   Drop in your own.
3. *Optional:* change the handwriting font. The `<link>` and `.font-hand` rules in
   `src/styles/global.css` / `src/pages/index.astro` set it for the site, and the font file in
   `fonts/` is used for the social-share image (that path lives at the top of
   `src/pages/og.jpg.ts`).
4. Go to `/admin`, enter your password, and publish your first post.

A tip for that first post: start with a **one-photo album** so you can watch the whole process
work before pointing it at a big one. When you're ready for production, `yarn build && yarn
start`.

## Configuration

### `site.json`

The bits of text shown around the site:

| Key | Where it shows up |
|---|---|
| `name` | The `<h1>`, the browser tab title, and the handwritten line on share images |
| `subtitle` | The tab title and the second line of share images |
| `tagline` | The line under the header, and the fallback description for link previews |
| `defaultAuthor` | Prefills the "Posted by" field, and signs older posts that predate it |

It's baked in when the site builds, so run `yarn build` after you change it.

### `about.md`

The `/about` page (linked from the footer) is just the Markdown in **`about.md`** at the repo
root — edit it to say hello and describe your feed. Like `site.json`, it's built in, so rebuild
after editing.

### Environment variables

These live in `.env`, which is loaded automatically. (If you set a variable in the actual
environment — say via a systemd unit — that takes precedence.)

| Variable | Default | What it does |
|---|---|---|
| `ADMIN_PASSWORD` | *(unset — publishing off)* | The password for the `/admin` forms. Required to publish, edit or delete. |
| `SITE_URL` | *(the request's origin)* | Your public address, e.g. `https://feed.example.com`. Set this in production so link previews point to the right place. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | *(unset — push off)* | Turns on push notifications. Generate the key pair once with `npx web-push generate-vapid-keys`; the subject is a contact address like `mailto:you@example.com`. Leave them unset and the "Get notified" button simply doesn't appear. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | *(unset — off)* | Pings a Telegram chat whenever someone comments or replies. Get a token from [@BotFather](https://t.me/BotFather), add the bot to your chat, and use that chat's id (negative for groups/channels). |
| `ENTE_API_BASE` | `https://photos.squarecat.io/api` | Which Ente server to talk to. Use `https://api.ente.io` for a regular ente.io account. |
| `DATA_FILE` | `data/posts.json` | Where posts are stored. |
| `SUBS_FILE` | `data/subscriptions.json` | Where push subscriptions are stored. |
| `MEDIA_DIR` | `media` | Where processed photos and videos are written. |
| `HOST` / `PORT` | `0.0.0.0` / `2987` | What the server binds to (`yarn start` sets these for you). |

## The location globe

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
in the background with a progress bar, so it won't trip a proxy timeout, but *re-syncing* an
existing post still happens in one request, so give your proxy a generous read timeout (say
600s) if you re-sync big or video-heavy albums.

The `data/` and `media/` folders are the only state, so mount them as volumes and back them up.

Videos are converted with `ffmpeg`, which the Docker image already includes. You can also run
it without Docker — `yarn && yarn build`, then `node dist/server/entry.mjs` with your env vars
set — but you'll need `ffmpeg` on the `PATH` for videos (`apt install ffmpeg`), Node 20.19+, and
`heic-convert` handles iPhone HEIC photos if your `sharp` build can't.

## What's intentionally left out

To keep things simple, a few things aren't here (and would all be easy to add later): live
photos (they're skipped with a note), heavier spam protection on reactions beyond a honeypot,
and more than one album per post.

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
  title: string;               // original filename (used to spot HEIC files)
  takenAt: number;             // epoch µs, for ordering
  kind: 'image' | 'video';
  lat?: number;                // capture location, if the source exposes it (for the globe)
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
