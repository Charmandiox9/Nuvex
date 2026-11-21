FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update -qq && apt-get install -qq -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:server

FROM build AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_UPSTREAM=http://api:3001
RUN pnpm --filter @nuvex/web build

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=web-build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
USER node
CMD ["node", "frontend/server.js"]

FROM build AS media-runtime
RUN apt-get update -qq && apt-get install -qq -y --no-install-recommends libjxl-tools && rm -rf /var/lib/apt/lists/*
RUN install -d -m 0700 -o node -g node /work
ENV TMPDIR=/work

FROM media-runtime AS api
WORKDIR /app/backend
ENV NODE_ENV=production
USER node
CMD ["node", "dist/src/main.js"]

FROM media-runtime AS worker
RUN apt-get update -qq && apt-get install -qq -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production
USER node
CMD ["node", "dist/src/worker/main.js"]
