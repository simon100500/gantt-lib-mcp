#!/bin/sh
set -e

# Start Fastify server in background.
DB_PATH="${DB_PATH:-/data/gantt.db}" \
PORT=3000 \
GANTT_PROJECT_ROOT=/app \
GANTT_MCP_SERVER_PATH=/app/mcp/dist/index.js \
GANTT_MCP_PROMPTS_DIR=/app/mcp/agent/prompts \
node /app/server/dist/index.js &
NODE_PID=$!

# Start nginx alongside Node and fail the container if either process dies.
nginx -g "daemon off;" &
NGINX_PID=$!

terminate() {
  kill "$NODE_PID" "$NGINX_PID" 2>/dev/null || true
}

trap terminate INT TERM

while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

terminate
wait "$NODE_PID" 2>/dev/null || true
wait "$NGINX_PID" 2>/dev/null || true
exit 1
