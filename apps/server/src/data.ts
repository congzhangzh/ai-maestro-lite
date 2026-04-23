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

export const CLIENT_VERSION = "0.1.4";

export const announcements = [
  "所有更新都需要人工确认，不会静默安装。",
  "GitHub 浏览器会记录每一个网络请求 URL 并同步到中台。",
  "Claude Code 模型既支持推荐项，也支持用户手动输入覆盖。"
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

export function getBootstrap(): BootstrapResponse {
  return {
    clientVersion: CLIENT_VERSION,
    releaseChannel: "stable",
    announcements,
    scenes: DEFAULT_SCENES.map(({ faqs: _faqs, overview: _overview, actions: _actions, subTargets: _subTargets, ...summary }) => summary)
  };
}

export function getScene(sceneId: SceneId): SceneDetail | undefined {
  return sceneMap[sceneId];
}

export function getUpdate(target: "client" | "scene", sceneId?: SceneId): UpdateCheckResponse {
  if (target === "client") {
    return {
      target,
      hasUpdate: true,
      latestVersion: CLIENT_VERSION,
      publishedAt: "2026-04-23T12:00:00.000Z",
      releaseNotes: [
        "新增 5 个固定场景工作台。",
        "新增 VS Code 内部代理模板。",
        "新增 Claude 模型切换与自定义模型输入。",
        "新增 GitHub 浏览器 URL 审计与受控访问。"
      ],
      downloadUrl: "https://downloads.corp.internal/ai-maestro-lite/client-0.1.4",
      mandatory: false
    };
  }

  return {
    target,
    sceneId,
    hasUpdate: true,
    latestVersion: "2026.04.23",
    publishedAt: "2026-04-23T12:00:00.000Z",
    releaseNotes: [
      `${sceneMap[sceneId ?? "vscode-dev"]?.title ?? "场景"} 的规则包已更新。`,
      "变更会在用户确认后才应用。"
    ],
    downloadUrl: `https://downloads.corp.internal/ai-maestro-lite/scenes/${sceneId ?? "vscode-dev"}`,
    mandatory: false
  };
}
