# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────
# BlinkGo Production Dockerfile
# Multi-stage build for optimal image size and security
# ─────────────────────────────────────────────────────────

# 1. Dependencies stage
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# 2. Builder stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env (only public vars)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_BUILD_TIME=${BUILD_TIME:-unknown}
ENV NEXT_COMMIT_SHA=${COMMIT_SHA:-unknown}

RUN npm run build

# 3. Runner stage (minimal, secure)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 blinkgo

# Copy only what's needed
COPY --from=builder /app/public ./public
COPY --from=builder --chown=blinkgo:nodejs /app/.next/standalone ./
COPY --from=builder --chown=blinkgo:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=blinko:nodejs /app/.next/server ./.next/server

USER blinkgo

EXPOSE 3000

# Health check (built-in Docker healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start with Node directly
CMD ["node", "server.js"]

# Build metadata
ARG BUILD_TIME
ARG COMMIT_SHA
ARG VERSION
LABEL org.opencontainers.image.title="blinkgo-web" \
      org.opencontainers.image.description="BlinkGo food delivery platform" \
      org.opencontainers.image.source="https://github.com/blinkgo/web" \
      org.opencontainers.image.created=$BUILD_TIME \
      org.opencontainers.image.revision=$COMMIT_SHA \
      org.opencontainers.image.version=$VERSION
