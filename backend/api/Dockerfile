FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source
COPY . .

# Start with tsx (no separate build step — tsx transpiles at runtime)
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "server.ts"]
