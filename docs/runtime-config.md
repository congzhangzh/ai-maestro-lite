# 运行时配置

## 目的

更新信息和包下载地址既要有默认值，也要支持企业环境覆盖。

因此这里采用两层设计：

- 代码内默认值
- 运行时配置文件覆盖

## 读取优先级

后端按下面顺序读取配置：

1. 环境变量 `AI_MAESTRO_RUNTIME_CONFIG` 指向的 JSON 文件
2. 默认文件 `data/runtime-config.json`
3. 代码内默认值

如果上面的文件都不存在，系统仍然可以正常启动，只是使用默认值。

## 适合放到运行时配置里的内容

- 客户端版本号
- 公告
- 客户端更新说明
- 场景更新说明
- 包下载地址
- 是否强制更新

## 示例

参考文件：

- `apps/server/config/runtime-config.example.json`

示例结构：

```json
{
  "clientVersion": "0.1.4",
  "downloadBaseUrl": "https://downloads.corp.internal/ai-maestro-lite",
  "announcements": [
    "欢迎使用企业 AI 场景助手"
  ],
  "clientUpdate": {
    "hasUpdate": true,
    "latestVersion": "0.1.4",
    "publishedAt": "2026-04-23T12:00:00.000Z",
    "releaseNotes": [
      "修复 VS Code 代理配置",
      "补充 Claude Code 模型切换"
    ],
    "downloadUrl": "https://downloads.corp.internal/ai-maestro-lite/client-0.1.4",
    "mandatory": false
  },
  "sceneUpdates": {
    "vscode-dev": {
      "latestVersion": "2026.04.24",
      "releaseNotes": [
        "更新内部代理模板"
      ],
      "downloadUrl": "https://downloads.corp.internal/ai-maestro-lite/scenes/vscode-dev"
    }
  }
}
```

## 合并规则

- 没有配置的字段继续使用默认值
- 已配置字段覆盖默认值
- `releaseNotes` 这种数组字段整体覆盖，不做逐条合并

## 飞书配置不放这里

飞书同步不走 `runtime-config.json`，而是统一用环境变量控制。

常用环境变量：

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

- 单表模式：只设置 `FEISHU_BITABLE_TABLE_ID`
- 分表模式：分别设置 `FEISHU_PROBE_TABLE_ID` 和 `FEISHU_AUDIT_TABLE_ID`
