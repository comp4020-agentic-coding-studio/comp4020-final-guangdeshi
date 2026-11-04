# syntax = docker/dockerfile:1

# Plain Node.js: TypeScript runs directly via Node 24's built-in type-
# stripping, so there's no build step or bundler. Two small runtime
# dependencies (sharp for image processing, busboy for multipart parsing)
# were added for Buy or Pass's upload-validation needs (see
# docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md) — the prior Bug Relay
# product had none, which is why this Dockerfile now needs a real
# `npm install` stage where it previously didn't. The app serves HTTP on
# 0.0.0.0:$PORT (fly.toml sets PORT), publishes README.md at /readme/
# (spec/README.md says what's checked), and persists its SQLite file plus
# uploaded images under /data (fly.toml's volume mount) — see src/server.ts
# and src/db.ts/src/images.ts respectively.
FROM docker.io/library/node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate \
  && pnpm install --prod --frozen-lockfile

FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./package.json
COPY src/ ./src/
# The admin "seed demo content" action (POST /admin/demo/seed) imports the
# seeding script, and the script reads its licensed source photos at runtime,
# so both ship in the image. Without the script the server fails to start
# (ERR_MODULE_NOT_FOUND) — CI caught this on the v2.0 merge (run
# 41562150309); local runs never exercised the built image.
COPY scripts/seed-demo-content.ts ./scripts/seed-demo-content.ts
COPY docs/assets/demo-source-images/ ./docs/assets/demo-source-images/
COPY README.md ./README.md

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.ts"]
