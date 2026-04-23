import type { ProbeActionEvent, UrlAuditEvent } from "@ai-maestro-lite/shared";
import type { AppStore } from "./store";

type FeishuKind = "probe" | "audit";

interface FeishuSyncConfig {
  enabled: boolean;
  baseUrl: string;
  tokenPath: string;
  appId: string;
  appSecret: string;
  bitableAppToken: string;
  unifiedTableId?: string;
  probeTableId?: string;
  auditTableId?: string;
  webhookUrl?: string;
  syncIntervalMs: number;
  syncBatchSize: number;
}

type FeishuRecordInput =
  | { kind: "probe"; sourceId: string; payload: ProbeActionEvent }
  | { kind: "audit"; sourceId: string; payload: UrlAuditEvent };

function readFeishuConfig(): FeishuSyncConfig {
  return {
    enabled: process.env.FEISHU_SYNC_ENABLED === "true",
    baseUrl: (process.env.FEISHU_BASE_URL ?? "https://open.feishu.cn").replace(/\/+$/, ""),
    tokenPath: process.env.FEISHU_TOKEN_PATH ?? "/open-apis/auth/v3/tenant_access_token/internal",
    appId: process.env.FEISHU_APP_ID ?? "",
    appSecret: process.env.FEISHU_APP_SECRET ?? "",
    bitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN ?? "",
    unifiedTableId: process.env.FEISHU_BITABLE_TABLE_ID,
    probeTableId: process.env.FEISHU_PROBE_TABLE_ID,
    auditTableId: process.env.FEISHU_AUDIT_TABLE_ID,
    webhookUrl: process.env.FEISHU_WEBHOOK_URL,
    syncIntervalMs: Number(process.env.FEISHU_SYNC_INTERVAL_MS ?? 15_000),
    syncBatchSize: Number(process.env.FEISHU_SYNC_BATCH_SIZE ?? 200)
  };
}

function resolveTableId(config: FeishuSyncConfig, kind: FeishuKind) {
  return kind === "probe" ? config.probeTableId ?? config.unifiedTableId : config.auditTableId ?? config.unifiedTableId;
}

function validateConfig(config: FeishuSyncConfig): string | null {
  if (!config.enabled) {
    return null;
  }
  if (!config.appId || !config.appSecret) {
    return "缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET。";
  }
  if (!config.bitableAppToken) {
    return "缺少 FEISHU_BITABLE_APP_TOKEN。";
  }
  if (!resolveTableId(config, "probe") && !resolveTableId(config, "audit")) {
    return "缺少 FEISHU_BITABLE_TABLE_ID，或未分别设置 FEISHU_PROBE_TABLE_ID / FEISHU_AUDIT_TABLE_ID。";
  }
  return null;
}

function formatProbeFields(record: ProbeActionEvent) {
  return {
    Kind: "probe",
    DeviceID: record.deviceId,
    EmployeeID: record.employeeId,
    ClientVersion: record.clientVersion,
    SceneID: record.sceneId,
    Action: record.action,
    Status: record.status,
    ErrorCode: record.errorCode ?? "",
    ErrorMessage: record.errorMessage ?? "",
    OccurredAt: record.timestamp,
    PayloadJSON: JSON.stringify(record)
  };
}

function formatAuditFields(record: UrlAuditEvent) {
  return {
    Kind: "audit",
    DeviceID: record.deviceId,
    EmployeeID: record.employeeId,
    ClientVersion: record.clientVersion,
    SceneID: record.sceneId,
    RequestType: record.requestType,
    Method: record.method,
    URL: record.url,
    TopLevelURL: record.topLevelUrl,
    Decision: record.decision,
    StatusCode: String(record.statusCode),
    OccurredAt: record.timestamp,
    PayloadJSON: JSON.stringify(record)
  };
}

class FeishuBitableClient {
  private cachedToken?: { value: string; expiresAt: number };

  constructor(private readonly config: FeishuSyncConfig) {}

  async syncRecords(kind: FeishuKind, records: FeishuRecordInput[]) {
    if (!records.length) {
      return [];
    }

    const tableId = resolveTableId(this.config, kind);
    if (!tableId) {
      throw new Error(`未配置 ${kind} 对应的飞书多维表格 table id。`);
    }

    const token = await this.getAccessToken();
    const response = await fetch(
      `${this.config.baseUrl}/open-apis/bitable/v1/apps/${this.config.bitableAppToken}/tables/${tableId}/records/batch_create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          records: records.map((record) => ({
            fields: record.kind === "probe" ? formatProbeFields(record.payload) : formatAuditFields(record.payload)
          }))
        })
      }
    );

    const payload = (await response.json()) as {
      code?: number;
      msg?: string;
      data?: {
        records?: Array<{ record_id?: string }>;
      };
    };

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || `飞书多维表格写入失败: ${response.status}`);
    }

    return records.map((record, index) => ({
      sourceId: record.sourceId,
      tableId,
      externalRecordId: payload.data?.records?.[index]?.record_id
    }));
  }

  async sendWebhookMessage(title: string, body: string) {
    if (!this.config.webhookUrl) {
      return;
    }
    await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text: `${title}\n${body}`
        }
      })
    });
  }

  private async getAccessToken() {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }

    const response = await fetch(`${this.config.baseUrl}${this.config.tokenPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret
      })
    });

    const payload = (await response.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
      app_access_token?: string;
      expire?: number;
      expire_in?: number;
    };

    const token = payload.tenant_access_token ?? payload.app_access_token;
    if (!response.ok || payload.code !== 0 || !token) {
      throw new Error(payload.msg || `飞书 access token 获取失败: ${response.status}`);
    }

    const expiresInSeconds = payload.expire ?? payload.expire_in ?? 7200;
    this.cachedToken = {
      value: token,
      expiresAt: Date.now() + expiresInSeconds * 1000
    };
    return token;
  }
}

async function syncKind(
  store: AppStore,
  client: FeishuBitableClient,
  kind: FeishuKind,
  records: FeishuRecordInput[]
) {
  if (!records.length) {
    return;
  }

  const syncedAt = new Date().toISOString();
  const result = await client.syncRecords(kind, records);

  await store.appendBitableRows(
    records.map((record, index) => ({
      kind,
      sourceId: record.sourceId,
      tableId: result[index]?.tableId ?? "",
      payload: record.payload,
      externalRecordId: result[index]?.externalRecordId,
      syncedAt
    }))
  );

  await store.markSynced(
    kind,
    records.map((record) => record.sourceId)
  );
}

export function startFeishuWorker(store: AppStore): NodeJS.Timeout | null {
  const config = readFeishuConfig();
  const validationError = validateConfig(config);

  if (!config.enabled) {
    return null;
  }

  if (validationError) {
    void store.appendNotification("warning", "Feishu 同步未启动", validationError);
    return null;
  }

  const client = new FeishuBitableClient(config);

  const timer = setInterval(async () => {
    try {
      const unsynced = await store.getUnsynced(config.syncBatchSize);
      const probeRecords: FeishuRecordInput[] = unsynced.probes.map((probe) => ({
        kind: "probe",
        sourceId: probe.id,
        payload: probe
      }));
      const auditRecords: FeishuRecordInput[] = unsynced.audits.map((audit) => ({
        kind: "audit",
        sourceId: audit.id,
        payload: audit
      }));

      if (!probeRecords.length && !auditRecords.length) {
        return;
      }

      if (probeRecords.length) {
        await syncKind(store, client, "probe", probeRecords);
      }

      if (auditRecords.length) {
        await syncKind(store, client, "audit", auditRecords);
      }

      const failureCount =
        unsynced.probes.filter((item) => item.status === "error").length +
        unsynced.audits.filter((item) => item.decision === "blocked").length;

      if (failureCount > 0) {
        const body = `本轮同步包含 ${failureCount} 条失败或拦截记录。`;
        await store.appendNotification("warning", "AI Maestro 审计告警", body);
        await client.sendWebhookMessage("AI Maestro 审计告警", body).catch(() => undefined);
      }
    } catch (error) {
      await store.appendNotification(
        "error",
        "Feishu worker 执行失败",
        error instanceof Error ? error.message : "未知错误"
      );
    }
  }, config.syncIntervalMs);

  return timer;
}
