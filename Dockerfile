# ── Stage 1: Build backend ─────────────────────────────────────
FROM node:22-alpine AS backend-builder

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Build frontend ───────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts

COPY frontend/ ./
RUN npm run build

# ── Stage 3: Production ───────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Non-root user for security
RUN addgroup -S mcp && adduser -S mcp -G mcp

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled backend from builder
COPY --from=backend-builder /app/dist ./dist

# Copy frontend build artifacts
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Switch to non-root user
USER mcp

# Container runs HTTP transport (not stdio)
ENV TRANSPORT=http
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
