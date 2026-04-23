import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import type { DeviceRegistrationRequest, ProbeActionEvent, SceneId, UrlAuditEvent } from "@ai-maestro-lite/shared";
import { browserPolicy, claudeGatewayConfig, getBootstrap, getScene, getUpdate, mockGatewayModels, vscodeProxyTemplate } from "./data";
import type { AppStore } from "./store";

interface BuildAppOptions {
  store: AppStore;
}

function isSceneId(value: string): value is SceneId {
  return ["vscode-dev", "claude-dev", "claude-ppt", "comate-dev", "github-browser"].includes(value);
}

export async function buildApp({ store }: BuildAppOptions): Promise<Express> {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/bootstrap", (_request: Request, response: Response) => {
    response.json(getBootstrap());
  });

  app.get("/api/scenes/:sceneId", (request: Request<{ sceneId: string }>, response: Response) => {
    const { sceneId } = request.params;
    if (!isSceneId(sceneId)) {
      response.status(404).json({ message: "Unknown scene" });
      return;
    }
    response.json(getScene(sceneId));
  });

  app.get(
    "/api/updates/check",
    (
      request: Request<unknown, unknown, unknown, { target?: "client" | "scene"; sceneId?: string }>,
      response: Response
    ) => {
      const target = request.query.target === "scene" ? "scene" : "client";
      const sceneId = request.query.sceneId && isSceneId(request.query.sceneId) ? request.query.sceneId : undefined;
      response.json(getUpdate(target, sceneId));
    }
  );

  app.get("/api/browser/policy", (_request: Request, response: Response) => {
    response.json(browserPolicy);
  });

  app.get("/api/claude/gateway-config", (_request: Request, response: Response) => {
    response.json(claudeGatewayConfig);
  });

  app.get("/api/vscode/proxy-template", (_request: Request, response: Response) => {
    response.json(vscodeProxyTemplate);
  });

  app.post("/api/device/register", async (request: Request<unknown, unknown, DeviceRegistrationRequest>, response: Response) => {
    await store.registerDevice(request.body);
    response.json({ ok: true });
  });

  app.post(
    "/api/probe/actions/batch",
    async (request: Request<unknown, unknown, { events?: ProbeActionEvent[] }>, response: Response) => {
      const count = await store.appendProbes(request.body.events ?? []);
      response.json({ ok: true, count });
    }
  );

  app.post(
    "/api/audit/urls/batch",
    async (request: Request<unknown, unknown, { events?: UrlAuditEvent[] }>, response: Response) => {
      const count = await store.appendAudits(request.body.events ?? []);
      response.json({ ok: true, count });
    }
  );

  app.get("/mock/claude-gateway/health", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      gateway: "mock-enterprise-router",
      models: [...mockGatewayModels]
    });
  });

  app.get("/mock/claude-gateway/models/:modelId", (request: Request<{ modelId: string }>, response: Response) => {
    const { modelId } = request.params;
    if (!modelId.match(/^[a-zA-Z0-9._:-]+$/)) {
      response.status(400).json({
        ok: false,
        model: modelId,
        reason: "invalid-model-id"
      });
      return;
    }

    response.json({
      ok: mockGatewayModels.has(modelId),
      model: modelId,
      reason: mockGatewayModels.has(modelId) ? "available" : "not-found"
    });
  });

  return app;
}
