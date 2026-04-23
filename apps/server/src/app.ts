import Fastify from "fastify";
import cors from "@fastify/cors";
import type { DeviceRegistrationRequest, ProbeActionEvent, SceneId, UrlAuditEvent } from "@ai-maestro-lite/shared";
import { browserPolicy, claudeGatewayConfig, getBootstrap, getScene, getUpdate, mockGatewayModels, vscodeProxyTemplate } from "./data";
import type { AppStore } from "./store";

interface BuildAppOptions {
  store: AppStore;
}

function isSceneId(value: string): value is SceneId {
  return ["vscode-dev", "claude-dev", "claude-ppt", "comate-dev", "github-browser"].includes(value);
}

export async function buildApp({ store }: BuildAppOptions) {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, { origin: true });

  app.get("/health", async () => ({
    ok: true,
    timestamp: new Date().toISOString()
  }));

  app.get("/api/bootstrap", async () => getBootstrap());

  app.get("/api/scenes/:sceneId", async (request, reply) => {
    const sceneId = (request.params as { sceneId: string }).sceneId;
    if (!isSceneId(sceneId)) {
      return reply.code(404).send({ message: "Unknown scene" });
    }
    return getScene(sceneId);
  });

  app.get("/api/updates/check", async (request) => {
    const query = request.query as { target?: "client" | "scene"; sceneId?: string };
    const target = query.target === "scene" ? "scene" : "client";
    const sceneId = query.sceneId && isSceneId(query.sceneId) ? query.sceneId : undefined;
    return getUpdate(target, sceneId);
  });

  app.get("/api/browser/policy", async () => browserPolicy);
  app.get("/api/claude/gateway-config", async () => claudeGatewayConfig);
  app.get("/api/vscode/proxy-template", async () => vscodeProxyTemplate);

  app.post("/api/device/register", async (request) => {
    const payload = request.body as DeviceRegistrationRequest;
    await store.registerDevice(payload);
    return { ok: true };
  });

  app.post("/api/probe/actions/batch", async (request) => {
    const payload = request.body as { events?: ProbeActionEvent[] };
    const count = await store.appendProbes(payload.events ?? []);
    return { ok: true, count };
  });

  app.post("/api/audit/urls/batch", async (request) => {
    const payload = request.body as { events?: UrlAuditEvent[] };
    const count = await store.appendAudits(payload.events ?? []);
    return { ok: true, count };
  });

  app.get("/mock/claude-gateway/health", async () => ({
    ok: true,
    gateway: "mock-enterprise-router",
    models: [...mockGatewayModels]
  }));

  app.get("/mock/claude-gateway/models/:modelId", async (request, reply) => {
    const modelId = (request.params as { modelId: string }).modelId;
    if (!modelId.match(/^[a-zA-Z0-9._:-]+$/)) {
      return reply.code(400).send({
        ok: false,
        model: modelId,
        reason: "invalid-model-id"
      });
    }

    return {
      ok: mockGatewayModels.has(modelId),
      model: modelId,
      reason: mockGatewayModels.has(modelId) ? "available" : "not-found"
    };
  });

  return app;
}
