# Gantt MCP Server

MCP server for Gantt chart management using gantt-lib.

## Development

### Hot Reload Mode

Run with live reloading of frontend and backend:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

- `http://localhost:5173` — web UI (Vite dev server with HMR)
- `http://localhost:3000` — backend API
- Frontend changes in `packages/web/*` auto-reload browser
- Backend changes in `packages/server/*` auto-restart server

### Stopping Dev Mode

```bash
docker-compose -f docker-compose.dev.yml down
```

## Production

### Production Build

```bash
docker-compose up --build
```

This runs optimized builds:
- Static web build served via nginx
- Compiled TypeScript server
- No hot reload, optimized for performance

### Environment Variables

Create `.env` file:

```env
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.z.ai/api/paas/v4/
OPENAI_MODEL=glm-4.7
DB_PATH=/data/gantt.db
PORT=3000
```

## Project Structure

```
packages/
├── web/      # React + Vite frontend
├── server/   # Fastify backend
└── mcp/      # MCP server implementation
```

## Streamlit Admin

Simple admin dashboard for users and their projects:

```bash
pip install -r packages/dashboard/requirements.txt
streamlit run packages/dashboard/streamlit_admin.py
```

The dashboard reads `DATABASE_URL` from the root `.env` file and shows:
- total users
- total projects
- users with project counts
- projects grouped by user
