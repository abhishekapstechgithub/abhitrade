# ── AbhiTrade Backend API — Production Dockerfile ────────────────────────────
# Uses tsx (esbuild-based) to run TypeScript directly — no separate compile step.
# tsx is a devDependency so a full npm ci is required (not --omit=dev).

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat wget
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── Production runner ─────────────────────────────────────────────────────────
FROM base AS runner

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nodeapp

WORKDIR /app

COPY --from=deps --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --chown=nodeapp:nodejs . .

# Runtime directories
RUN mkdir -p tmp/uploads Bhavcopy index && \
    chown -R nodeapp:nodejs tmp/uploads Bhavcopy index

ENV NODE_ENV=production
ENV PORT=3001

USER nodeapp
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node_modules/.bin/tsx", "server.ts"]
