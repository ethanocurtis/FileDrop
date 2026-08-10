# Override with --build-arg NODE_BASE_IMAGE=... if your build environment
# needs to pull from a mirror/private registry instead of Docker Hub.
ARG NODE_BASE_IMAGE=node:20-bookworm-slim

# ---- deps: install everything needed to build (incl. devDependencies) ----
FROM ${NODE_BASE_IMAGE} AS deps
WORKDIR /app
# Prisma's CLI pings npmjs.org to check for a newer version on every
# generate/migrate invocation by default. That's an unnecessary external
# dependency during a build (and breaks outright on restricted-network
# build hosts / firewalled CI runners) — disable it everywhere Prisma runs.
ENV CHECKPOINT_DISABLE=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: compile the Next.js production build ----
FROM ${NODE_BASE_IMAGE} AS builder
WORKDIR /app
ENV CHECKPOINT_DISABLE=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# None of these are used for anything at build time — no DB/storage access
# or real requests happen during `next build`. But Next.js statically
# imports every route module (even fully dynamic ones) to collect page
# data, which pulls in src/lib/env.ts, and that validates all required
# vars eagerly at module-load time. Without placeholders here, the build
# fails before it ever reaches a real request. Real values are supplied at
# container *runtime* via docker-compose.yml / --env-file, not baked in
# here.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
    S3_ENDPOINT="http://localhost:9000" \
    S3_BUCKET="build-placeholder" \
    S3_ACCESS_KEY_ID="build-placeholder" \
    S3_SECRET_ACCESS_KEY="build-placeholder" \
    DOWNLOAD_TOKEN_SECRET="build-placeholder-not-a-real-secret-0000000000" \
    CLEANUP_SECRET="build-placeholder-not-a-real-secret-00000000000000"
RUN npx prisma generate
RUN npm run build

# ---- runner: production image, non-root user ----
# Deliberately reuses builder's node_modules and generated Prisma client
# as-is (rather than a fresh `npm ci --omit=dev` here) so the exact code
# and native query-engine binary that `npm run build` already succeeded
# against is what actually runs — no risk of a second install subtly
# resolving something differently.
FROM ${NODE_BASE_IMAGE} AS runner
WORKDIR /app
ENV CHECKPOINT_DISABLE=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 filedrop \
    && adduser --system --uid 1001 --ingroup filedrop filedrop

COPY --from=builder --chown=filedrop:filedrop /app/node_modules ./node_modules
COPY --from=builder --chown=filedrop:filedrop /app/.next ./.next
COPY --from=builder --chown=filedrop:filedrop /app/public ./public
COPY --from=builder --chown=filedrop:filedrop /app/package.json ./package.json
COPY --from=builder --chown=filedrop:filedrop /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=filedrop:filedrop /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=filedrop:filedrop /app/prisma ./prisma
COPY --from=builder --chown=filedrop:filedrop /app/scripts ./scripts
# `npm run cleanup` (used by the `cleanup` compose service) runs
# scripts/cleanup.ts directly against this TypeScript source via `tsx`
# rather than the compiled .next bundle, so the full src/ tree — including
# the generated Prisma client under src/generated — needs to be here too,
# along with tsconfig.json for its "@/*" path-alias resolution.
COPY --from=builder --chown=filedrop:filedrop /app/src ./src
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER filedrop
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["entrypoint.sh"]
CMD ["npm", "run", "start"]
