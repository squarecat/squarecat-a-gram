---
title: Ente-backed photo feed (wife's photo blog)
status: done
created: 2026-07-05
project: standalone   # NOT an LMA repo — personal project, no /handoff target
---

# Goal

A public web feed where my wife publishes a "post" by pasting an Ente **public album share link**
plus a caption; each post renders as a masonry of that album's photos with the caption beneath,
newest first. She self-serves entirely — no terminal, no involvement from me per post.

## Context

Personal project, **outside the LMA project map** — so no `/handoff`, no LMA docker infra unless we
choose to add it. New standalone repo (name TBD; e.g. `feed`).

Decisions locked with James (2026-07-05):
- **Mechanism:** she pastes an Ente *public album* link → the site opens/decrypts the album itself.
- **Post = one album**, captioned as a whole (Ente has no album-level description, so the caption is
  written by her in the compose form, not in Ente).
- **Layout:** masonry of images, caption beneath. A photo blog, *not* an Instagram clone.
- **Publishing:** she self-publishes via a password-gated compose form. Feed itself is **fully public**.
- **Hosting:** a DigitalOcean droplet (nginx in front of a Node server).
- **Decrypt happens once, server-side, at publish time** — not client-side per visit. So visitors get
  fast, pre-optimised images and the site ships no crypto to the browser.

**Stack:** Astro SSR (`@astrojs/node`) — matches the LMA ecosystem and gives feed pages + the compose
form + the publish API endpoint in one app.

**Store:** a JSON file `data/posts.json` (single author, ~monthly cadence — a DB is not warranted).
`ponytail:` JSON store; move to SQLite (`better-sqlite3`) only if it ever grows/concurrent-writes.

### Ente decryption — grounded spec (already researched, do not re-derive)

Reference impl: `github.com/ente-io/ente`, web app `web/apps/albums/`.

**API base = `https://photos.squarecat.io/api` (James's SELF-HOSTED museum) — NOT `api.ente.io`.**
Take it as config (`ENTE_API_BASE`). The share domain `photos-public.squarecat.io` is the albums web
app and is a *different host* from the API. Self-hosted has **no** `public-albums.ente.io` download
proxy — file/thumb bytes come straight from `<API>/public-collection/files/download|preview/<id>`.
*(Verified live 2026-07-05 against the real album — see Notes.)*

Every call sends `X-Auth-Access-Token: <t>`, `X-Client-Package: io.ente.albums.web`, and a **stable
User-Agent** (device-limit counts UA+IP+token as one device).

- **URL** `https://albums.ente.io/?t=<TOKEN>#<FRAGMENT>`:
  - `t` (query) = API access token → the `X-Auth-Access-Token` header.
  - `#fragment` = the collection key, **base58 (Bitcoin alphabet, `bs58` pkg), NOT base64** →
    decode to raw 32 bytes. *(Legacy links ≥50 chars are hex; ignore for v1.)* **This base58 vs
    base64 mixup is the #1 failure mode — every *other* encrypted field below is standard base64.**
- **Endpoints:**
  - `GET /public-collection/info` → `{collection}`. Check `publicURLs[].validTill` (µs, 0=never),
    `enableDownload`; bail with a clear error if download disabled or link expired.
  - `GET /public-collection/diff?sinceTime=<µs>` → `{diff:[file], hasMore}`. Page: start `sinceTime=0`,
    after each page set `sinceTime = max(updationTime)`, loop while `hasMore`. **Skip `isDeleted`.**
  - `GET /public-collection/files/download/<fileID>` (full) / `/files/preview/<fileID>` (thumb) —
    307-redirects to presigned S3; **HTTP client must follow redirects**.
- **Crypto (libsodium-wrappers), per file** — two schemes, don't cross them:
  1. **File key** (SecretBox, needs nonce):
     `crypto_secretbox_open_easy(b64(encryptedKey), b64(keyDecryptionNonce), collectionKey)`.
  2. **Metadata JSON** (SecretStream): `init_pull(b64(metadata.decryptionHeader), fileKey)` then
     `pull(b64(metadata.encryptedData))` → JSON (`fileType` 0=image/1=video/2=live, `title`,
     `creationTime`). All times epoch **microseconds**.
  3. **Full image bytes** (SecretStream, **chunked**): download all ciphertext, `init_pull(
     b64(file.decryptionHeader), fileKey)`, loop reading `4*1024*1024 + 17`-byte chunks via `pull`
     until `TAG_FINAL`. Header is a separate API field, **not** prepended to the S3 object.
- **Ordering:** sort files by `updationTime` (the only "added to album" signal). Sort *posts* by
  publish time (our `createdAt`) so a throwback album posted today lands on top.

Full spec with exact source paths is in this session's research (agent `acb47cd45c3a9bac1`) if needed.

## Architecture

```
Astro SSR app (on droplet, behind nginx; nginx serves /media/* statically)
├─ GET  /                → read posts.json, render feed (masonry + caption), newest first   [public]
├─ GET  /admin           → compose form: [ente url] [caption] [publish]                      [pw-gated]
├─ POST /api/publish      → the publish job below                                            [pw-gated]
└─ src/lib/ente.ts        → the decrypt port (URL parse → info → diff → per-file decrypt)
data/posts.json           → [{ id, caption, createdAt, images:[{file,w,h}] }]
media/<postId>/           → optimised webp written at publish time — a standalone dir served
                            directly by nginx. NOT Astro's `public/` (that's copied at build
                            time; an SSR server writing there at runtime 404s in prod).
```

**Publish job (`POST /api/publish`, server-side):**
1. Parse `enteUrl` → token + base58 collection key.
2. `GET /info` (validate downloadable/unexpired).
3. Page `/diff`, collect non-deleted `fileType===0` (images) files, sort by `updationTime`.
   `ponytail:` images only for v1; skip video/livePhoto (note in UI), add later if wanted.
4. Per file: derive file key → download+decrypt full bytes → **image processing** →
   write `media/<postId>/<n>.webp`, capture `{w,h}`.
   - **HEIC:** Ente keeps iPhone originals as HEIC and prebuilt `sharp`/libvips usually can't decode
     HEVC. Detect `.heic`/`.heif` from the decrypted `metadata.title` and route those buffers through
     `heic-convert` → JPEG buffer *before* sharp. (Verify on the droplet whether sharp already has
     libheif; if so, drop `heic-convert`.)
   - **sharp:** `.rotate()` (no args — bakes in EXIF orientation so phone photos aren't sideways),
     resize to ~1400px, `.webp()`. **Do NOT call `.withMetadata()`** — sharp strips EXIF by default,
     which scrubs GPS/home coordinates off originals before they hit a *fully public* feed. Leave a
     comment saying so, so nobody "helpfully" re-adds metadata later.
5. Append `{id, caption, createdAt: <now>, images}` to `data/posts.json`.
6. Redirect to `/`.

**Auth:** single password in env (`FEED_ADMIN_PASSWORD`). Laziest: nginx HTTP Basic auth on `/admin`
and `/api/` locations — zero app code. (App-level signed-cookie login is the fallback if she wants a
prettier gate.)

**Masonry:** CSS `columns` (`column-count` responsive via media queries) — no JS, no dep. Use stored
`{w,h}` as `aspect-ratio` on each image box to prevent layout shift.

## Tasks

- [x] Scaffold a new standalone Astro SSR project (`@astrojs/node`, standalone mode); add `package.json`
      deps `libsodium-wrappers`, `bs58`, `sharp` (installed with James's OK; needs Node ≥ 20.19).
- [x] Write `src/lib/ente.ts`: `parseShareUrl`, `getInfo`, `listFiles` (paged diff, skip deleted,
      sort by updationTime), `decryptFileKey`, `decryptMetadata`, `downloadAndDecryptImage` — per the
      grounded spec above. Self-check: `yarn selfcheck [shareUrl]` (crypto vectors + optional live album).
- [x] `POST /api/publish` route: run the publish job (parse → info → diff → per-file decrypt → sharp →
      write media → append posts.json). Validate the URL and surface Ente errors (expired/download-off).
- [x] `GET /admin` compose form (ente url + caption + publish button); minimal styling.
- [x] `GET /` feed page: read posts.json, render each post as CSS-columns masonry + caption beneath,
      newest first; use stored aspect ratios (img width/height attrs).
- [x] `data/posts.json` read/write helpers (atomic write: temp file + rename).
- [x] Deployment notes in README: nginx site config (reverse-proxy to node, serve `/media` static,
      HTTP Basic auth on `/admin` + `/api/`), systemd service for the node server, required env vars.
- [x] Update this plan to `status: done`.

### Build findings (2026-07-05)

- Verified end-to-end locally: self-check vectors pass; fixture album published through the real
  `POST /api/publish` → 3 upright 1400px webps, no EXIF/GPS in output, feed renders masonry +
  caption + date. Test post deleted afterwards.
- `libsodium-wrappers` ESM entry is broken upstream — loaded via `createRequire` (CJS) in ente.ts.
- Astro's `checkOrigin` CSRF check is disabled: the node adapter normalizes request URLs to
  `http://localhost` unless `allowedDomains` is configured, so it 403s every form post even in
  prod. nginx basic auth on `/api/` covers CSRF.
- Added `src/pages/media/[...path].ts` as a dev/no-nginx fallback for serving `/media/*`.

## Notes

- **Deps to install (James runs, not me):** in the new project dir —
  `yarn add libsodium-wrappers bs58 sharp heic-convert` and the Astro/node deps from the scaffold.
  (`heic-convert` only needed if the droplet's sharp lacks libheif — check first.)
- **Live test fixture (verified 2026-07-05):** self-hosted API `https://photos.squarecat.io/api`,
  share link `https://photos-public.squarecat.io/?t=CGCWJFDPDS#BSdZr5CjdL6XZXftoLDBSiHqC9vxpUZp2n3CRPw2aJCd`
  → 3 images, no password, never expires, downloads enabled. `/info` + `/diff` confirmed returning
  `encryptedKey`/`keyDecryptionNonce` + `metadata:{decryptionHeader,encryptedData}` per the spec.
  Point `src/lib/ente.ts` at this to prove the base58→file-key→SecretStream chain before wiring the UI.
- **nginx:** bump `proxy_read_timeout` (default 60s) — one publish decrypts+encodes ~10 full-res photos
  synchronously in the POST and can exceed it. First manual publish should use a **1-photo** album to
  shake out the crypto/HEIC path before trusting a full album.
- **Verify (manual, James — not a task):** paste the fixture link + a caption into `/admin`, confirm the
  post renders as a masonry with images upright and caption beneath; publish a second album to check
  newest-first ordering. (Per LMA convention, no automated-test task in-plan.)
- **Deliberately out of v1:** videos/live photos, delete/reorder posts, per-photo captions,
  password-protected Ente links, multiple albums per post. All are additive later.
  *(Edit was added post-v1: `/admin/edit/<id>` — caption update + full re-sync from the album.)*
- Open item: repo name + where the droplet + nginx vhost live (new subdomain?). James to pick.

