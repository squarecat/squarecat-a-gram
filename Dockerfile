FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile
COPY . .
RUN yarn build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2987
RUN apk add --no-cache ffmpeg
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile --production && yarn cache clean
COPY --from=build /app/dist ./dist
COPY fonts ./fonts
RUN mkdir -p data media && chown node:node data media
USER node
EXPOSE 2987
VOLUME ["/app/data", "/app/media"]
CMD ["node", "dist/server/entry.mjs"]
