# syntax = docker/dockerfile:1

# Plain Node.js: the app has no runtime npm dependencies (only node:http,
# node:sqlite and node:fs, all built in), and Node 24 runs TypeScript directly
# via type-stripping, so there's no build step and nothing to bundle. The app
# must serve HTTP on 0.0.0.0:$PORT (fly.toml sets PORT) and publish
# README.md at /readme/ (spec/README.md says what's checked) — both are the
# job of src/server.ts.
FROM docker.io/library/node:24-alpine

WORKDIR /app
COPY src/ ./src/
COPY README.md ./README.md

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.ts"]
