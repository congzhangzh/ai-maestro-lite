# AI Maestro Lite

An Electron + React desktop assistant and Fastify backend for five fixed enterprise AI work scenes:

- VS Code development
- Claude Code development
- Claude Code for PPT
- Baidu Comate development
- Controlled GitHub browser

## Workspace layout

- `apps/desktop`: Electron desktop app with React and Ant Design UI
- `apps/server`: Fastify API server with SQLite persistence
- `packages/shared`: shared types and default scene metadata
- `docs`: product background, design, and runtime config docs

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Runtime notes

- The backend stays on Node.js and persists data into SQLite at `data/app-store.sqlite`.
- No PostgreSQL is required.
- Update metadata and package download links support both built-in defaults and file-based overrides.
- Runtime config can be supplied through `data/runtime-config.json` or `AI_MAESTRO_RUNTIME_CONFIG`.
- Feishu sync is modeled as an async worker that mirrors full probe and URL audit data into SQLite sync tables and optionally posts webhook notifications when credentials are configured.

## Documentation

- [CLAUDE.md](./CLAUDE.md)
- [docs/product-background.md](./docs/product-background.md)
- [docs/design-solution.md](./docs/design-solution.md)
- [docs/runtime-config.md](./docs/runtime-config.md)
