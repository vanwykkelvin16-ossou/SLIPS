# Slipsy — production image.
#
# One long-running Node server: the app, in-process OCR and the background
# export worker all live here. Point it at a Postgres database and a writable
# volume and it needs nothing else.

FROM node:20-bookworm-slim AS base
# openssl is required by Prisma; the rest are sharp's and tesseract's runtime
# libraries. Installed in the base layer so builder and runner agree.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The schema must be generated before the build; next build then compiles the
# app. No database connection is needed for either.
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    STORAGE_DRIVER=local \
    STORAGE_LOCAL_PATH=/data/storage \
    OCR_CACHE_PATH=/data/tesseract-cache

# `prisma` (migrations) and `tsx` (the admin seed and the export worker) are
# dev dependencies but are needed at run time, so the whole tree is carried
# over rather than a pruned production install.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /data/storage /data/tesseract-cache \
  && chown -R node:node /data /app

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
