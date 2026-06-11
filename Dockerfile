# ── AbhiTrade — Production Multi-Stage Dockerfile ────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
# ci uses lockfile exactly — reproducible installs
RUN npm ci --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# next.config.mjs must have output: 'standalone' for the slim runner below
RUN npm run build

# ── Stage 3: Production runner (standalone, minimal image) ───────────────────
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install wget for the health check probe (wget is lighter than curl on alpine)
RUN apk add --no-cache wget

# Non-root user — security best practice
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone output bundles server + node_modules — nothing else needed
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets (JS/CSS chunks) served directly by Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
# Public directory — ensure it exists even when empty (git doesn't track empty dirs)
RUN mkdir -p public
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# Upload temp dir + bhavcopy/index data dirs — all writable by the app user
RUN mkdir -p tmp/uploads Bhavcopy index && \
    chown -R nextjs:nodejs tmp/uploads Bhavcopy index

USER nextjs
EXPOSE 3000

# standalone mode generates server.js at the workdir root
CMD ["node", "server.js"]
