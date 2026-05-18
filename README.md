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

### Build And Push Deployment Image

Build and push the exact image used by CapRover:

```bash
npm run deploy:image
```

Build, push, and immediately deploy to CapRover using values from `.env`:

```bash
npm run deploy:caprover
```

Build and deploy the fact frontend to the `gantt-fact` CapRover app:

```bash
npm run deploy:fact-caprover
```

By default it pushes:
- `reg.volobuev.keenetic.pro/getgantt:latest`
- `reg.volobuev.keenetic.pro/getgantt:sha-<git-sha>`

You can override the target with environment variables:

```bash
DEPLOY_REGISTRY=reg.example.com DEPLOY_IMAGE=myapp npm run deploy:image
```

For the fact frontend, the script also supports:

```bash
FACT_DEPLOY_REGISTRY=reg.example.com FACT_DEPLOY_IMAGE=gantt-fact FACT_CAPROVER_APP_NAME=gantt-fact npm run deploy:fact-caprover
```

For `deploy:fact-caprover`, `FACT_CAPROVER_APP_NAME` and `FACT_CAPROVER_APP_TOKEN` are required explicitly. There is no fallback to `CAPROVER_APP_NAME` or `CAPROVER_APP_TOKEN`.

PowerShell wrapper:

```powershell
.\deploy-image.ps1
.\deploy-image.ps1 -CapRover
```

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
npx prisma migrate deploy --schema packages/runtime-core/prisma/schema.prisma
```

Recommended production order:

1. Deploy the new application code.
2. Verify `DATABASE_URL` points to the target server database.
3. Run `npm run dump:db`.
4. Run `npx prisma migrate deploy --schema packages/runtime-core/prisma/schema.prisma`.
5. Restart the server if your deployment process does not already do that.

## Project Structure

```
packages/
├── web/      # React + Vite frontend
├── server/   # Fastify backend
└── mcp/      # MCP server implementation
```
