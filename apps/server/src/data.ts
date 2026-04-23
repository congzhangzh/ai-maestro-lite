import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  BootstrapResponse,
  BrowserPolicy,
  ClaudeGatewayConfig,
  SceneDetail,
  SceneId,
  UpdateCheckResponse,
  VsCodeProxyTemplate
} from "@ai-maestro-lite/shared";
import { DEFAULT_SCENES, GITHUB_ALLOWED_HOSTS } from "@ai-maestro-lite/shared";

type UpdateOverride = Partial<Omit<UpdateCheckResponse, "target" | "sceneId">>;

type RuntimeConfig = {
  clientVersion?: string;
  announcements?: string[];
  downloadBaseUrl?: string;
  clientUpdate?: UpdateOverride;
  sceneUpdates?: Partial<Record<SceneId, UpdateOverride>>;
};

const DEFAULT_CLIENT_VERSION = "0.1.4";
const DEFAULT_DOWNLOAD_BASE_URL = "https://downloads.corp.internal/ai-maestro-lite";
const DEFAULT_PUBLISHED_AT = "2026-04-23T12:00:00.000Z";

const DEFAULT_ANNOUNCEMENTS = [
  "所有更新都需要人工确认，不会静默安装。",
  "GitHub 浏览器会记录每一个网络请求 URL 并同步到中台。",
  "Claude Code 模型既支持推荐项，也支持用户手动输入覆盖。"
];

const DEFAULT_CLIENT_RELEASE_NOTES = [
  "新增 5 个固定场景工作台。",
  "新增 VS Code 内部代理模板。",
  "新增 Claude 模型切换与自定义模型输入。",
  "新增 GitHub 浏览器 URL 审计与受控访问。"
];

export const sceneMap = DEFAULT_SCENES.reduce<Record<SceneId, SceneDetail>>((acc, scene) => {
  acc[scene.id] = scene;
  return acc;
}, {} as Record<SceneId, SceneDetail>);

export const browserPolicy: BrowserPolicy = {
  proxyUrl: "http://proxy.corp.internal:7890",
  allowedHosts: [...GITHUB_ALLOWED_HOSTS],
  auditAllRequests: true
};

export const claudeGatewayConfig: ClaudeGatewayConfig = {
  gatewayUrl: "http://127.0.0.1:8787/mock/claude-gateway",
  authMode: "bearer",
  apiKeyMode: "managed",
  availableModels: ["minimax", "glm"],
  defaultModel: "minimax",
  allowCustomModelInput: true
};

export const vscodeProxyTemplate: VsCodeProxyTemplate = {
  proxyUrl: browserPolicy.proxyUrl,
  proxySupportMode: "override",
  noProxyDomains: ["localhost", "127.0.0.1", "*.corp.internal"],
  syncGitProxy: true,
  syncTerminalEnv: true,
  extensionMarketplaceProbeUrl: "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery"
};

export const mockGatewayModels = new Set([
  "minimax",
  "glm",
  "glm-4",
  "minimax-pro",
  "claude-compatible-router"
]);

function getRuntimeConfigPath() {
  return process.env.AI_MAESTRO_RUNTIME_CONFIG ?? path.resolve(process.cwd(), "data", "runtime-config.json");
}

function readRuntimeConfig(): RuntimeConfig {
  const filePath = getRuntimeConfigPath();
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as RuntimeConfig;
  } catch {
    return {};
  }
}

function getClientVersion(config: RuntimeConfig) {
  return config.clientVersion ?? DEFAULT_CLIENT_VERSION;
}

function getDownloadBaseUrl(config: RuntimeConfig) {
  return (config.downloadBaseUrl ?? DEFAULT_DOWNLOAD_BASE_URL).replace(/\/+$/, "");
}

function mergeUpdate(
  defaults: Omit<UpdateCheckResponse, "target" | "sceneId">,
  overrides?: UpdateOverride
): Omit<UpdateCheckResponse, "target" | "sceneId"> {
  return {
    ...defaults,
    ...overrides,
    releaseNotes: overrides?.releaseNotes ?? defaults.releaseNotes
  };
}

export function getBootstrap(): BootstrapResponse {
  const config = readRuntimeConfig();
  return {
    clientVersion: getClientVersion(config),
    releaseChannel: "stable",
    announcements: config.announcements ?? DEFAULT_ANNOUNCEMENTS,
    scenes: DEFAULT_SCENES.map(({ faqs: _faqs, overview: _overview, actions: _actions, subTargets: _subTargets, ...summary }) => summary)
  };
}

export function getScene(sceneId: SceneId): SceneDetail | undefined {
  return sceneMap[sceneId];
}

export function getUpdate(target: "client" | "scene", sceneId?: SceneId): UpdateCheckResponse {
  const config = readRuntimeConfig();
  const clientVersion = getClientVersion(config);
  const downloadBaseUrl = getDownloadBaseUrl(config);

  if (target === "client") {
    const merged = mergeUpdate(
      {
        hasUpdate: true,
        latestVersion: clientVersion,
        publishedAt: DEFAULT_PUBLISHED_AT,
        releaseNotes: DEFAULT_CLIENT_RELEASE_NOTES,
        downloadUrl: `${downloadBaseUrl}/client-${clientVersion}`,
        mandatory: false
      },
      config.clientUpdate
    );

    return {
      target,
      ...merged
    };
  }

  const resolvedSceneId = sceneId ?? "vscode-dev";
  const sceneTitle = sceneMap[resolvedSceneId]?.title ?? "场景";
  const merged = mergeUpdate(
    {
      hasUpdate: true,
      latestVersion: "2026.04.23",
      publishedAt: DEFAULT_PUBLISHED_AT,
      releaseNotes: [
        `${sceneTitle} 的规则包已更新。`,
        "变更会在用户确认后才应用。"
      ],
      downloadUrl: `${downloadBaseUrl}/scenes/${resolvedSceneId}`,
      mandatory: false
    },
    config.sceneUpdates?.[resolvedSceneId]
  );

  return {
    target,
    sceneId: resolvedSceneId,
    ...merged
  };
}
