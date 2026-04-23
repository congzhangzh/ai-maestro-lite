import { buildApp } from "./app";
import { startFeishuWorker } from "./feishu-worker";
import { createStore } from "./store";

async function main() {
  const store = createStore();
  await store.init();

  const app = await buildApp({ store });
  const worker = startFeishuWorker(store);

  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";

  const close = async () => {
    clearInterval(worker);
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  await app.listen({ port, host });
  app.log.info(`AI Maestro server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
