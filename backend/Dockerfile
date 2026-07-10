# ===== Builder Stage =====
FROM node:20-alpine AS builder

WORKDIR /app

# Set production mode for build (affects npm install behavior)
ENV NODE_ENV=production

# Copy package files only (for dependency caching)
COPY package.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm install --include=dev --no-audit --no-fund

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Clean any existing dist folder and rebuild
RUN rm -rf dist && npm run build

# Verify built output exists
RUN test -d dist && ls dist/ && echo "=== Build verified: dist/ contains $(ls dist/ | wc -l) items ==="

# Prune dev dependencies — production runtime never needs them
# This removes pino-pretty, typescript, types, vitest, etc.
RUN npm prune --production

# Verify pino-pretty is NOT present in production node_modules
RUN test ! -d node_modules/pino-pretty && echo "=== Verified: pino-pretty NOT in production node_modules ===" || (echo "ERROR: pino-pretty still present after prune!" && exit 1)

# Verify logger is compiled correctly (no transport in production build)
RUN node -e "
  const fs = require('fs');
  const content = fs.readFileSync('dist/services/logger.service.js', 'utf8');
  if (content.includes('pino-pretty')) {
    console.error('ERROR: dist still contains pino-pretty reference!');
    process.exit(1);
  }
  console.log('=== Verified: dist/services/logger.service.js has NO pino-pretty reference ===');
"

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
