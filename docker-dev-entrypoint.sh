#!/bin/sh
set -e

echo "Starting dev environment with hot reload..."

# Install dependencies into the named volumes (which shadow the build-time
# node_modules layers). This runs every startup but is fast when node_modules
# are already populated (npm install is a no-op when up to date).
echo "Installing dependencies..."
# npm ci at the workspace root installs all workspace packages via npm workspaces
# hoisting into /app/node_modules. Per-package npm install is not needed and fails
# with EROFS because /app/package-lock.json is mounted read-only.
cd /app && npm ci
echo "Dependencies ready."

# Start vite dev server (web) - expose on all interfaces
echo "Starting Vite dev server on :5173..."
cd /app/packages/web && npm run dev -- --host 0.0.0.0 &
VITE_PID=$!

# Start backend server with hot reload using nodemon
echo "Starting backend server on :3000..."
cd /app/packages/server && npx nodemon --watch src --ext ts --exec "npx tsx src/index.ts" &
SERVER_PID=$!

echo "Services started. Vite PID: $VITE_PID, Server PID: $SERVER_PID"

# Handle shutdown
trap "echo 'Shutting down...'; kill $VITE_PID $SERVER_PID 2>/dev/null" TERM INT

# Wait for any process to exit
wait
