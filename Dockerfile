FROM node:20.19-alpine AS base

RUN apk add --no-cache bash libc6-compat
RUN npm install -g yarn@1.22.22

WORKDIR /app

FROM base AS deps

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM deps AS builder

COPY . .
RUN yarn db:generate
RUN yarn build

FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
