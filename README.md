# AI Maestro Lite

企业 AI 场景助手。它不是一个通用编排平台，只做固定的 5 个场景：

- `VS Code` 编程开发
- `Claude Code` 编程开发
- `Claude Code` 写 PPT
- `百度 Comate` 编程
- `受控 GitHub 浏览器`

## 设计原则

- 越简单越好，不做通用工作流引擎
- 桌面端只暴露固定场景和固定动作
- 后端只做配置下发、更新检查、探针接收、审计接收
- 后端用 `Express + SQLite`，方便看懂、方便维护
- 所有更新都先展示说明，再由用户确认

## 目录结构

- `apps/desktop`：Electron 桌面端
- `apps/server`：Node.js + Express + SQLite 后端
- `packages/shared`：前后端共享类型
- `docs`：产品背景、设计方案、运行配置、飞书同步说明

## 快速开始

```bash
npm install
npm run build
npm run dev
```

## 运行说明

- 数据默认写入 `data/app-store.sqlite`
- 不需要 PostgreSQL
- 更新信息和包下载地址内置默认值，开箱可用
- 也支持通过配置文件覆盖默认值
- 飞书同步先写本地 SQLite，再由 worker 调用飞书 API 写入多维表格

## 配置方式

### 1. 更新信息和下载地址

支持两层：

- 代码内默认值
- 运行时配置覆盖

优先级如下：

1. 环境变量 `AI_MAESTRO_RUNTIME_CONFIG` 指向的 JSON 文件
2. `data/runtime-config.json`
3. 代码默认值

示例文件：

- `apps/server/config/runtime-config.example.json`

### 2. 飞书同步

飞书相关配置通过环境变量控制，不写死在代码里。

常用变量包括：

- `FEISHU_SYNC_ENABLED`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BITABLE_APP_TOKEN`
- `FEISHU_BITABLE_TABLE_ID`
- `FEISHU_PROBE_TABLE_ID`
- `FEISHU_AUDIT_TABLE_ID`
- `FEISHU_WEBHOOK_URL`

完整说明见文档。

## 文档

- [CLAUDE.md](./CLAUDE.md)
- [docs/product-background.md](./docs/product-background.md)
- [docs/design-solution.md](./docs/design-solution.md)
- [docs/runtime-config.md](./docs/runtime-config.md)
- [docs/feishu-sync.md](./docs/feishu-sync.md)
