# 飞书同步

## 同步目标

系统中的动作探针和 GitHub URL 审计需要：

- 先落到后端 SQLite
- 再由服务端 worker 调用飞书开放 API
- 最终写入飞书多维表格

## 数据流

1. 客户端上报 `probes` 或 `audits`
2. 后端先写入 `data/app-store.sqlite`
3. Feishu worker 按批次读取未同步记录
4. 通过飞书 access token 调用多维表格 `batch_create`
5. 写入成功后，把同步结果写入 `bitable_rows`
6. 原始记录标记为已同步

## 环境变量

参考：

- [`.env.example`](../.env.example)

关键变量：

- `FEISHU_SYNC_ENABLED=true`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BITABLE_APP_TOKEN`
- `FEISHU_BITABLE_TABLE_ID` 或分表配置

## 表格字段约定

当前写入字段采用固定名称，建议在飞书多维表格中预先创建这些列。

动作探针常用字段：

- `Kind`
- `DeviceID`
- `EmployeeID`
- `ClientVersion`
- `SceneID`
- `Action`
- `Status`
- `ErrorCode`
- `ErrorMessage`
- `OccurredAt`
- `PayloadJSON`

URL 审计常用字段：

- `Kind`
- `DeviceID`
- `EmployeeID`
- `ClientVersion`
- `SceneID`
- `RequestType`
- `Method`
- `URL`
- `TopLevelURL`
- `Decision`
- `StatusCode`
- `OccurredAt`
- `PayloadJSON`

## 统一表与分表

支持两种模式：

- 统一表：`probe` 和 `audit` 都写进同一个 table id
- 分表：分别写到独立 table id

优先级：

1. `FEISHU_PROBE_TABLE_ID` / `FEISHU_AUDIT_TABLE_ID`
2. `FEISHU_BITABLE_TABLE_ID`

## 失败行为

- 飞书写入失败时，不会把原始记录标记成已同步
- 错误会写入 `notifications`
- 如果配置了 `FEISHU_WEBHOOK_URL`，会把失败或拦截汇总推送到飞书机器人
