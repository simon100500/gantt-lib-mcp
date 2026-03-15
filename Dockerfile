# ── Stage 1: Build web (React + Vite) ──────────────────────────────────────
FROM node:22-alpine AS build-web
WORKDIR /build

# Copy all workspace package manifests for npm ci (workspaces require all package.json files)
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/server/package.json ./packages/server/

# Install all workspace deps (needed for dhtmlx-gantt, vite, etc.)
RUN npm ci --ignore-scripts

# Copy web source (only what we need for the web build)
COPY packages/web ./packages/web

# Build web
RUN npm run build -w packages/web


# ── Stage 2: Build server + mcp ────────────────────────────────────────────
FROM node:22-alpine AS build-server
WORKDIR /build

# Copy all workspace package manifests (npm ci validates the full workspace structure)
COPY package.json package-lock.json ./
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

RUN npm ci --ignore-scripts

COPY packages/mcp ./packages/mcp
COPY packages/server ./packages/server

# Generate Prisma client for linux-musl (the Alpine runtime target)
RUN npx prisma generate --schema=packages/mcp/prisma/schema.prisma

# Build mcp first (server depends on it)
RUN npm run build:mcp
RUN npm run build:server


# ── Stage 3: Runtime (Nginx + Node) ────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Add Node.js runtime (for Fastify server)
RUN apk add --no-cache nodejs npm

WORKDIR /app

# Copy static web build
COPY --from=build-web /build/packages/web/dist /usr/share/nginx/html

# Copy compiled server
COPY --from=build-server /build/packages/server/dist ./server/dist

# Copy MCP package dist to both locations:
#   ./mcp/dist  — direct path used by docker-entrypoint.sh (GANTT_MCP_SERVER_PATH)
#   ./packages/mcp/dist  — workspace symlink target (node_modules/@gantt/mcp -> packages/mcp)
COPY --from=build-server /build/packages/mcp/dist ./mcp/dist
COPY --from=build-server /build/packages/mcp/dist ./packages/mcp/dist
COPY --from=build-server /build/packages/mcp/package.json ./packages/mcp/package.json

# Copy production node_modules (all hoisted to root by npm workspaces)
COPY --from=build-server /build/node_modules ./node_modules

# Copy MCP agent prompts (needed by agent runner)
# Stored in ./mcp/agent/prompts (referenced by GANTT_MCP_PROMPTS_DIR=/app/mcp/agent/prompts)
COPY --from=build-server /build/packages/mcp/agent/prompts ./mcp/agent/prompts

# CapRover / Docker environment variables
ARG OPENAI_API_KEY
ARG OPENAI_BASE_URL=https://api.z.ai/api/paas/v4/
ARG OPENAI_MODEL=glm-4.7
ARG DB_PATH=/data/gantt.db
ARG PORT=3000

ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV OPENAI_BASE_URL=${OPENAI_BASE_URL}
ENV OPENAI_MODEL=${OPENAI_MODEL}
ENV DB_PATH=${DB_PATH}
ENV PORT=${PORT}

# Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Persistent data directory (mount CapRover Persistent Directory here)
VOLUME /data

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
