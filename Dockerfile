# ═══════════════════════════════════════════════
# AAA (AI All-in Attack) — Production Dockerfile
# Multi-stage build for minimal image size
# ═══════════════════════════════════════════════

# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source code
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm run build

# Stage 2: Production
FROM node:22-slim AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations
COPY --from=builder /app/drizzle ./drizzle

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start server
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "--expose-gc", "--max-old-space-size=512", "dist/index.js"]
