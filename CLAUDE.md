# AI Maestro Lite Context

## Product background

AI Maestro Lite is an enterprise desktop assistant for internal AI tooling.

The product is intentionally **scene-driven**, not a generic workflow engine. The current fixed scenes are:

- VS Code 编程开发
- Claude Code 编程开发
- Claude Code 写 PPT
- 百度 Comate 编程
- 受控 GitHub 浏览器

The product goal is to reduce enterprise setup noise around AI tools, proxies, model routing, package updates, controlled browsing, self-check, and audit.

## Architecture summary

- Desktop client: Electron + React + Ant Design
- Backend service: Node.js + Fastify + SQLite
- Shared contracts: `packages/shared`
- Audit model:
  - action probes for install/update/launch/self-check/scene enter
  - URL audit for the controlled GitHub browser

## Key design choices

- Fixed scenes instead of a general orchestrator
- All updates require explicit user confirmation
- GitHub access goes through a controlled in-app browser with allowlist enforcement
- Claude model selection supports both server-suggested values and user manual override
- VS Code supports a managed internal acceleration proxy template
- Backend persists locally to SQLite and does not require PostgreSQL

## Runtime configuration

Update metadata and package download links have:

- built-in defaults in code
- optional file-based overrides from `data/runtime-config.json`
- optional custom config path via `AI_MAESTRO_RUNTIME_CONFIG`

Example config lives at:

- `apps/server/config/runtime-config.example.json`

## Important paths

- Desktop shell: `apps/desktop`
- Backend API: `apps/server`
- Shared types: `packages/shared`
- Product docs: `docs`

## Current implementation boundary

The current repo implements a working product skeleton and core flows.

Still intended for later enterprise integration:

- real software distribution / silent install integration
- real Feishu bitable writeback
- real enterprise package repository and release publishing chain
