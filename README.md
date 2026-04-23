# AI Maestro Lite

An Electron + React desktop assistant and Fastify backend for five fixed enterprise AI work scenes:

- VS Code development
- Claude Code development
- Claude Code for PPT
- Baidu Comate development
- Controlled GitHub browser

## Workspace layout

- `apps/desktop`: Electron desktop app with React and Ant Design UI
- `apps/server`: Fastify API server with optional PostgreSQL persistence
- `packages/shared`: shared types and default scene metadata

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Runtime notes

- The server uses PostgreSQL when `DATABASE_URL` is set.
- Without `DATABASE_URL`, the server falls back to JSON files under `apps/server/data`.
- Feishu sync is modeled as an async worker that mirrors full probe and URL audit data into local sync files and optionally posts webhook notifications when credentials are configured.
