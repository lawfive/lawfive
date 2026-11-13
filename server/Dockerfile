# The LawFive server image: the API plus the web UI. Build from the repo root (it needs schema/
# and web/ too):
#   docker build -f server/Dockerfile -t lawfive-server .
# Node runs the server's TypeScript directly; only the web UI has a build step.

FROM node:24-alpine AS base
RUN npm install --global pnpm@12.11.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY schema/package.json schema/
COPY server/package.json server/
COPY web/package.json web/

# The web UI, built to web/dist. The files are the same on every platform, so a multi-platform
# build makes them once, natively, rather than under emulation.
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
RUN npm install --global pnpm@12.11.2
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY schema/package.json schema/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @lawfive/web...
COPY schema/src schema/src
COPY schema/misconduct schema/misconduct
COPY schema/quiz schema/quiz
COPY web web
RUN pnpm --filter @lawfive/web build

FROM base
RUN pnpm install --frozen-lockfile --prod --filter @lawfive/server...
COPY schema/src schema/src
COPY schema/misconduct schema/misconduct
COPY schema/quiz schema/quiz
COPY server/src server/src
COPY server/drizzle server/drizzle
COPY --from=web /app/web/dist web/dist

# Uploaded photos (FILE-4), unless S3_URL puts them in a bucket: mount a volume here to keep them.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
ENV NODE_ENV=production PORT=3000 UPLOADS_DIR=/data/uploads
# VER-1: the version (tools/version.sh server), passed in by CI: --build-arg LAWFIVE_VERSION=... --build-arg LAWFIVE_COMMIT=...
ARG LAWFIVE_VERSION=dev
ARG LAWFIVE_COMMIT=unknown
ENV LAWFIVE_VERSION=$LAWFIVE_VERSION LAWFIVE_COMMIT=$LAWFIVE_COMMIT
EXPOSE 3000
USER node
# ADM-7: checked every 2 s while starting (Docker 25 and later; older ones wait the 30 s), so a proxy
# that waits for healthy (Traefik) routes to it a moment after it's ready rather than half a minute.
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --start-interval=2s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server/src/main.ts"]
