export type SceneId =
  | "vscode-dev"
  | "claude-dev"
  | "claude-ppt"
  | "comate-dev"
  | "github-browser";

export type SceneAction = "install" | "update" | "launch" | "selfcheck";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SceneSummary {
  id: SceneId;
  title: string;
  description: string;
  status: "ready" | "attention" | "preview";
  badges: string[];
}

export interface SceneDetail extends SceneSummary {
  actions: SceneAction[];
  overview: string[];
  faqs: FaqItem[];
  subTargets?: string[];
}

export interface BootstrapResponse {
  clientVersion: string;
  releaseChannel: "stable";
  announcements: string[];
  scenes: SceneSummary[];
}

export interface UpdateCheckResponse {
  target: "client" | "scene";
  sceneId?: SceneId;
  hasUpdate: boolean;
  latestVersion: string;
  publishedAt: string;
  releaseNotes: string[];
  downloadUrl?: string;
  mandatory: boolean;
}

export interface BrowserPolicy {
  proxyUrl: string;
  allowedHosts: string[];
  auditAllRequests: boolean;
}

export interface ClaudeGatewayConfig {
  gatewayUrl: string;
  authMode: "bearer";
  apiKeyMode: "managed";
  availableModels: string[];
  defaultModel: string;
  allowCustomModelInput: true;
}

export interface VsCodeProxyTemplate {
  proxyUrl: string;
  proxySupportMode: "override";
  noProxyDomains: string[];
  syncGitProxy: boolean;
  syncTerminalEnv: boolean;
  extensionMarketplaceProbeUrl: string;
}

export interface DeviceRegistrationRequest {
  deviceId: string;
  employeeId: string;
  hostname: string;
  platform: string;
  arch: string;
  appVersion: string;
}

export interface ProbeActionEvent {
  deviceId: string;
  employeeId: string;
  clientVersion: string;
  sceneId: SceneId;
  action: SceneAction | "scene_enter";
  status: "success" | "warning" | "error" | "info";
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export interface UrlAuditEvent {
  deviceId: string;
  employeeId: string;
  clientVersion: string;
  sceneId: "github-browser";
  requestType: string;
  method: string;
  url: string;
  topLevelUrl: string;
  decision: "allowed" | "blocked";
  statusCode: number;
  timestamp: string;
}

export interface DesktopSettings {
  deviceId: string;
  employeeId: string;
  apiBaseUrl: string;
  claude: {
    serverSuggestedModel: string;
    userSelectedModel?: string;
    skipOptions: {
      proxy: boolean;
      ideExtension: boolean;
      workspace: boolean;
      sampleConfig: boolean;
    };
  };
  vscodeProxy: {
    template?: VsCodeProxyTemplate;
    syncGitProxy: boolean;
    syncTerminalEnv: boolean;
    lastAppliedAt?: string;
  };
}

export interface DesktopContext {
  settings: DesktopSettings;
  platform: string;
  arch: string;
  hostname: string;
  appVersion: string;
}

export interface SaveClaudeSettingsInput {
  serverSuggestedModel: string;
  userSelectedModel?: string;
  skipOptions: DesktopSettings["claude"]["skipOptions"];
  gatewayConfig: ClaudeGatewayConfig;
}

export interface ApplyVsCodeProxyInput {
  template: VsCodeProxyTemplate;
  syncGitProxy: boolean;
  syncTerminalEnv: boolean;
}

export interface ActionRunRequest {
  sceneId: SceneId;
  action: SceneAction;
  updateInfo?: UpdateCheckResponse;
}

export interface ActionRunResult {
  sceneId: SceneId;
  action: SceneAction;
  status: "success" | "warning" | "error" | "manual";
  title: string;
  message: string;
  detailLines?: string[];
  checks?: CheckResult[];
}

export const GITHUB_ALLOWED_HOSTS = [
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "gist.github.com",
  "objects.githubusercontent.com",
  "github.githubassets.com",
  "avatars.githubusercontent.com",
  "camo.githubusercontent.com",
  "release-assets.githubusercontent.com"
] as const;

export const DEFAULT_SCENES: SceneDetail[] = [
  {
    id: "vscode-dev",
    title: "VS Code 编程开发",
    description: "准备 VS Code、uv、镜像源和内部加速代理。",
    status: "ready",
    badges: ["VS Code", "uv", "内部代理"],
    actions: ["install", "update", "launch", "selfcheck"],
    overview: [
      "面向企业内 VS Code 开发环境准备。",
      "支持内部加速代理模板写入、Git 代理同步和终端环境同步。",
      "自检关注 VS Code、本地 uv、扩展和代理模板。"
    ],
    faqs: [
      {
        question: "为什么代理模板默认写入用户级配置？",
        answer: "这样不会污染单个工作区配置，同时更适合企业统一发放。"
      },
      {
        question: "自检通过后还需要手动检查什么？",
        answer: "建议额外确认扩展市场访问和公司镜像源访问是否符合内部规范。"
      }
    ]
  },
  {
    id: "claude-dev",
    title: "Claude Code 编程开发",
    description: "准备 Claude Code、企业模型网关和可选跳过项。",
    status: "ready",
    badges: ["Claude Code", "模型切换", "企业网关"],
    actions: ["install", "update", "launch", "selfcheck"],
    overview: [
      "支持企业模型网关下发推荐模型。",
      "支持用户手动输入模型名并覆盖服务器建议值。",
      "支持跳过代理、IDE 扩展、工作目录和示例配置等可选步骤。"
    ],
    faqs: [
      {
        question: "手动输入的模型名什么时候生效？",
        answer: "保存后会覆盖服务器推荐项，并在启动和自检时优先生效。"
      },
      {
        question: "为什么不能跳过企业网关配置？",
        answer: "这是企业模型接入和审计链路的基础要求。"
      }
    ]
  },
  {
    id: "claude-ppt",
    title: "Claude Code 写 PPT",
    description: "在 Claude Code 基础上补充 PPT 模板、导出工具和输出目录。",
    status: "ready",
    badges: ["Claude Code", "PPT", "模板"],
    actions: ["install", "update", "launch", "selfcheck"],
    overview: [
      "继承 Claude Code 的模型切换和跳过配置能力。",
      "自检覆盖模板目录、导出工具和输出目录可写性。",
      "适合企业内部的文稿和汇报材料产出。"
    ],
    faqs: [
      {
        question: "写 PPT 场景和 Claude Code 编程场景有什么区别？",
        answer: "它额外检查模板资产、导出工具和输出目录，适配演示文稿交付。"
      }
    ]
  },
  {
    id: "comate-dev",
    title: "百度 Comate 编程",
    description: "区分 VS Code 插件版和 Visual Studio 2022 插件版。",
    status: "ready",
    badges: ["Baidu Comate", "VS Code", "VS 2022"],
    actions: ["install", "update", "launch", "selfcheck"],
    overview: [
      "Windows 支持 VS Code 与 Visual Studio 2022 双形态。",
      "macOS 首版只覆盖 VS Code 插件版。",
      "自检覆盖 IDE 安装、插件状态、License 或登录状态提示。"
    ],
    faqs: [
      {
        question: "Linux 支持 Comate 吗？",
        answer: "第一版不承诺 Linux 的 Comate 支持，界面会明确提示。"
      }
    ],
    subTargets: ["VS Code 插件版", "Visual Studio 2022 插件版"]
  },
  {
    id: "github-browser",
    title: "受控 GitHub 浏览器",
    description: "只允许通过公司代理访问 GitHub 白名单域名，并审计每个请求 URL。",
    status: "ready",
    badges: ["GitHub", "代理", "URL 审计"],
    actions: ["install", "update", "launch", "selfcheck"],
    overview: [
      "内置浏览器不拉起系统浏览器。",
      "仅允许 GitHub 白名单域名访问。",
      "会记录所有放行和拦截的网络请求 URL。"
    ],
    faqs: [
      {
        question: "为什么要记录每一个请求 URL？",
        answer: "企业审计要求需要保留完整访问轨迹，用于后续合规和故障定位。"
      }
    ]
  }
];
