#!/bin/sh
set -e

# Start Fastify server in background
# Container path overrides for MCP server and agent prompts
PORT=3000 \
GANTT_PROJECT_ROOT=/app \
GANTT_MCP_SERVER_PATH=/app/mcp/dist/index.js \
GANTT_MCP_PROMPTS_DIR=/app/mcp/agent/prompts \
node /app/server/dist/bootstrap.js &

# Start Nginx in foreground
nginx -g "daemon off;"
