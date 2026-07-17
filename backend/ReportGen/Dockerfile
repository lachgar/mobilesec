# syntax=docker/dockerfile:1.4
# ReportGen Dockerfile (Debian-based for Puppeteer compatibility)

# Builder stage (with dev deps to compile TypeScript)
FROM node:18-bullseye-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:18-bullseye-slim

# Install dependencies required by Chromium/Puppeteer + Chromium itself
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
  set -eux; \
  apt_opts='-o Acquire::Retries=8 -o Acquire::http::Timeout=120 -o Acquire::https::Timeout=120 -o Acquire::http::No-Cache=True'; \
  apt-get $apt_opts update; \
  for attempt in 1 2 3 4 5; do \
    apt-get $apt_opts install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libgdk-pixbuf2.0-0 \
      libgtk-3-0 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxss1 \
      libnss3 \
      libgbm1 \
      libpangocairo-1.0-0 \
      fonts-noto-color-emoji \
      chromium \
      wget \
      gnupg \
      && break; \
    if [ "$attempt" = 5 ]; then exit 1; fi; \
    apt-get $apt_opts update; \
    sleep 15; \
  done; \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only production deps
COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci --omit=dev

# Copy built artifacts and templates from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/templates ./src/templates
COPY --from=builder /app/src/templates/assets ./src/templates/assets
COPY --from=builder /app/package.json ./package.json

# Create tmp and reports directories (owned by node user)
RUN mkdir -p /app/tmp /app/reports && chown -R node:node /app/tmp /app/reports

# Puppeteer: skip bundled Chromium download - use system chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=3005
EXPOSE ${PORT}

USER node
CMD ["node", "dist/app.js"]
