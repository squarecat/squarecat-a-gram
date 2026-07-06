#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

HOST=colin@139.59.136.162
DIR=/var/www/feed

# .env goes too — it's the config. node_modules is rebuilt on the server.
ssh "$HOST" "mkdir -p $DIR"
echo "copying..."
rsync -az --delete --exclude node_modules --exclude data --exclude media --exclude .git . "$HOST:$DIR/"
echo "yarning..."
# .bashrc early-returns for non-interactive shells, so load nvm directly
ssh "$HOST" "source ~/.nvm/nvm.sh; cd $DIR && npm install --omit=dev \
  && npm run build \
  && (pm2 restart feed --update-env 2>/dev/null || pm2 start dist/server/entry.mjs --name feed) \
  && pm2 save"

echo "deployed. logs: ssh $HOST pm2 logs feed"
