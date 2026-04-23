# 运行时配置

## 目标

更新信息和包下载地址既有默认值，也支持企业配置覆盖。

## 默认行为

如果没有额外配置，后端会直接返回代码中的默认值，包括：

- 客户端版本号
- 公告
- 客户端更新说明
- 场景更新说明
- 默认下载地址

## 覆盖方式

优先读取：

1. 环境变量 `AI_MAESTRO_RUNTIME_CONFIG` 指定的 JSON 文件
2. 默认文件 `data/runtime-config.json`
3. 若都没有，则回退到代码默认值

## 示例文件

参考：

- `apps/server/config/runtime-config.example.json`

## 支持的字段

```json
{
  "clientVersion": "0.1.4",
  "downloadBaseUrl": "https://downloads.corp.internal/ai-maestro-lite",
  "announcements": ["..."],
  "clientUpdate": {
    "hasUpdate": true,
    "latestVersion": "0.1.4",
    "publishedAt": "2026-04-23T12:00:00.000Z",
    "releaseNotes": ["..."],
    "downloadUrl": "https://downloads.corp.internal/ai-maestro-lite/client-0.1.4",
    "mandatory": false
  },
  "sceneUpdates": {
    "vscode-dev": {
      "latestVersion": "2026.04.24",
      "releaseNotes": ["..."],
      "downloadUrl": "https://downloads.corp.internal/ai-maestro-lite/scenes/vscode-dev"
    }
  }
}
```

## 合并规则

- 未配置的字段继续使用默认值
- 已配置的字段覆盖默认值
- `releaseNotes` 按整段数组覆盖，不做逐条合并

## 飞书环境变量

飞书同步不走 `runtime-config.json`，而是通过环境变量控制。

主要变量包括：

- `FEISHU_SYNC_ENABLED`
- `FEISHU_BASE_URL`
- `FEISHU_TOKEN_PATH`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BITABLE_APP_TOKEN`
- `FEISHU_BITABLE_TABLE_ID`
- `FEISHU_PROBE_TABLE_ID`
- `FEISHU_AUDIT_TABLE_ID`
- `FEISHU_WEBHOOK_URL`
- `FEISHU_SYNC_INTERVAL_MS`
- `FEISHU_SYNC_BATCH_SIZE`

推荐做法：

- 一个统一表：只设置 `FEISHU_BITABLE_TABLE_ID`
- 分表写入：设置 `FEISHU_PROBE_TABLE_ID` 和 `FEISHU_AUDIT_TABLE_ID`

如果统一表和分表都没配，飞书 worker 不会启动。
