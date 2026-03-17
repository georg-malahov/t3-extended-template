FROM node:24-alpine AS base

RUN apk add --no-cache bash libc6-compat

WORKDIR /app

FROM base AS deps

COPY package.json yarn.lock .yarnrc ./
RUN yarn install --frozen-lockfile

# Dev stage: Debian-based with Playwright Chromium for E2E tests
FROM node:24-bookworm-slim AS dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash git make procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock .yarnrc ./
RUN yarn install --frozen-lockfile
RUN npx playwright install --with-deps chromium

FROM deps AS builder

COPY . .
RUN yarn db:generate && yarn build

FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
