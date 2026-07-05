# travel-feed

Public photo blog backed by Ente. A post = one Ente **public album share link** + a caption,
published via a password-gated form at `/admin`. Photos are downloaded, decrypted, and optimised
**once, server-side, at publish time** — visitors get plain webp files, no crypto in the browser.

## Install

Needs **Node ≥ 20.19** to run (Astro dep engines), **≥ 22.6** for `yarn selfcheck`
(`--experimental-strip-types`).

```sh
yarn add libsodium-wrappers bs58 sharp heic-convert astro @astrojs/node
yarn add -D @types/libsodium-wrappers @types/node
```

(Or just `yarn` — everything is already in `package.json`.)

`heic-convert` is a fallback used only if sharp's libvips lacks HEIF support (iPhone HEIC
originals). The publish route tries sharp first and falls back automatically, so it's safe to
leave installed either way.

## Run

```sh
yarn dev          # dev server on :4321
yarn selfcheck    # crypto vectors (base58 / SecretBox / SecretStream round-trips)
yarn selfcheck "https://photos-public.squarecat.io/?t=…#…"   # + live album check
yarn build && yarn start   # production
```

First publish: use a **1-photo album** to shake out the crypto/HEIC path before trusting a
full album.

## Env vars

| Var | Default | |
|---|---|---|
| `ADMIN_PASSWORD` | *(unset — publishing disabled)* | Required in the `/admin` form to publish |
| `ENTE_API_BASE` | `https://photos.squarecat.io/api` | Self-hosted museum API (not the share-page host) |
| `DATA_FILE` | `data/posts.json` | Post store |
| `MEDIA_DIR` | `media` | Optimised images, written at publish time |
| `HOST` / `PORT` | `0.0.0.0` / `4321` | Node server bind |

Paths are relative to the working directory. A `.env` file in the working directory is loaded
automatically (dotenv) — handy locally; on the droplet the systemd `Environment=` lines win
(dotenv never overrides already-set vars).

## Deploy (DigitalOcean droplet)

Build on the droplet (sharp has native binaries):

```sh
cd /opt/travel-feed
yarn && yarn build
```

### systemd — `/etc/systemd/system/travel-feed.service`

```ini
[Unit]
Description=travel-feed
After=network.target

[Service]
WorkingDirectory=/opt/travel-feed
ExecStart=/usr/bin/node dist/server/entry.mjs
Environment=HOST=127.0.0.1
Environment=PORT=4321
Environment=ADMIN_PASSWORD=change-me
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

`/opt/travel-feed/data` and `/opt/travel-feed/media` must be writable by `www-data`.

### nginx — auth + static media

```sh
apt install apache2-utils
htpasswd -c /etc/nginx/.htpasswd-feed <username>
```

```nginx
server {
    server_name feed.squarecat.io;

    # publish-time media, served statically (the app has a fallback route for dev)
    location /media/ {
        alias /opt/travel-feed/media/;
        expires max;
        add_header Cache-Control "public, immutable";
    }

    location /admin {
        auth_basic "feed admin";
        auth_basic_user_file /etc/nginx/.htpasswd-feed;
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
    }

    location /api/ {
        auth_basic "feed admin";
        auth_basic_user_file /etc/nginx/.htpasswd-feed;
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        # publish decrypts + re-encodes a whole album synchronously in the POST
        proxy_read_timeout 600s;
    }

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
    }
}
```

Then certbot as usual.

## Out of v1 (deliberately)

Videos/live photos (skipped with a note), edit/delete/reorder posts, per-photo captions,
password-protected Ente links, multiple albums per post.
