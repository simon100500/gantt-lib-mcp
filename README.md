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
DATABASE_URL=postgresql://user:password@host:5432/dbname
PORT=3000
```

### Database Backup And Migrations

For a Prisma-managed PostgreSQL database, make a backup before applying server migrations.

Create a dump from the root of the repo:

```bash
npm run dump:db
```

The dump script uses Docker by default and writes a custom-format backup file like `backup-YYYYMMDD-HHMMSS.dump` to the repo root.

Apply pending Prisma migrations:

```bash
npx prisma migrate deploy --schema packages/mcp/prisma/schema.prisma
```

Recommended production order:

1. Deploy the new application code.
2. Verify `DATABASE_URL` points to the target server database.
3. Run `npm run dump:db`.
4. Run `npx prisma migrate deploy --schema packages/mcp/prisma/schema.prisma`.
5. Restart the server if your deployment process does not already do that.

## Project Structure

```
packages/
├── web/      # React + Vite frontend
├── server/   # Fastify backend
└── mcp/      # MCP server implementation
```
