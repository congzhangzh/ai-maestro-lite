# 飞书同步

## 目标

系统中的动作探针和 GitHub URL 审计，需要满足两个要求：

- 本地先落库，避免数据丢失
- 再同步到飞书多维表格，方便中台查看

## 同步流程

固定流程如下：

1. 客户端上报 `probes` 或 `audits`
2. 后端先写入 `data/app-store.sqlite`
3. Feishu worker 按批读取未同步记录
4. worker 调用飞书开放 API 写入多维表格
5. 写入成功后，把同步结果写回 `bitable_rows`
6. 原始记录再标记为已同步

这意味着：

- 飞书短时失败不会影响客户端上报
- 数据库里始终保留原始记录

## 相关环境变量

参考：

- [`.env.example`](../.env.example)

常用变量：

- `FEISHU_SYNC_ENABLED=true`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BASE_URL`
- `FEISHU_TOKEN_PATH`
- `FEISHU_BITABLE_APP_TOKEN`
- `FEISHU_BITABLE_TABLE_ID`
- `FEISHU_PROBE_TABLE_ID`
- `FEISHU_AUDIT_TABLE_ID`
- `FEISHU_WEBHOOK_URL`
- `FEISHU_SYNC_INTERVAL_MS`
- `FEISHU_SYNC_BATCH_SIZE`

## 表格字段建议

### 动作探针

建议包含这些列：

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

### URL 审计

建议包含这些列：

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

## 单表和分表

支持两种写法：

- 单表模式：`probe` 和 `audit` 都写到同一个表
- 分表模式：`probe` 和 `audit` 分别写到不同表

优先级如下：

1. `FEISHU_PROBE_TABLE_ID` / `FEISHU_AUDIT_TABLE_ID`
2. `FEISHU_BITABLE_TABLE_ID`

## 失败处理

- 飞书写入失败时，不会把原始记录标记为已同步
- 失败信息会写入数据库
- 如果配置了 `FEISHU_WEBHOOK_URL`，还会推送失败告警
