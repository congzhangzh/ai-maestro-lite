import type { AppStore } from "./store";

export function startFeishuWorker(store: AppStore): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const unsynced = await store.getUnsynced(200);
      const rows = [
        ...unsynced.probes.map((probe) => ({ kind: "probe" as const, payload: probe })),
        ...unsynced.audits.map((audit) => ({ kind: "audit" as const, payload: audit }))
      ];

      if (!rows.length) {
        return;
      }

      await store.appendBitableRows(rows);
      await Promise.all([
        store.markSynced("probe", unsynced.probes.map((item) => item.id)),
        store.markSynced("audit", unsynced.audits.map((item) => item.id))
      ]);

      const failureCount =
        unsynced.probes.filter((item) => item.status === "error").length +
        unsynced.audits.filter((item) => item.decision === "blocked").length;

      if (failureCount > 0) {
        const body = `本轮同步包含 ${failureCount} 条失败或拦截记录。`;
        await store.appendNotification("warning", "AI Maestro 审计告警", body);
        if (process.env.FEISHU_WEBHOOK_URL) {
          await fetch(process.env.FEISHU_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              msg_type: "text",
              content: {
                text: `AI Maestro 审计告警\n${body}`
              }
            })
          }).catch(() => undefined);
        }
      }
    } catch (error) {
      await store.appendNotification(
        "error",
        "Feishu worker 执行失败",
        error instanceof Error ? error.message : "未知错误"
      );
    }
  }, 15_000);

  return timer;
}
