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
  const server = app.listen(port, host, () => {
    console.log(`AI Maestro server listening on http://${host}:${port}`);
  });

  const close = async () => {
    if (worker) {
      clearInterval(worker);
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
