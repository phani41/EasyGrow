# ===== Builder Stage =====
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (lockfile may not exist — use npm install instead of ci)
COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies — safe because production code never references them
RUN npm prune --production

# Verify built output exists
RUN test -d dist && ls dist/ && echo "Build verified successfully"

# ===== Production Stage =====
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 expressjs

# Create required directories
RUN mkdir -p /app/uploads /app/logs && \
    chown expressjs:nodejs /app/uploads /app/logs

# Copy built assets from builder (only what's needed at runtime)
COPY --from=builder --chown=expressjs:nodejs /app/dist ./dist
COPY --from=builder --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER expressjs

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
