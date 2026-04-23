import { randomUUID } from "node:crypto";
import { exec as execCallback, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, ipcMain, session, webContents } from "electron";
import type {
  ActionRunRequest,
  ActionRunResult,
  ApplyVsCodeProxyInput,
  BrowserPolicy,
  CheckResult,
  ClaudeGatewayConfig,
  DesktopContext,
  DesktopSettings,
  SaveClaudeSettingsInput,
  SceneId,
  UrlAuditEvent
} from "@ai-maestro-lite/shared";
import { GITHUB_ALLOWED_HOSTS } from "@ai-maestro-lite/shared";

const exec = promisify(execCallback);
const GITHUB_PARTITION = "persist:github-browser";
const DEFAULT_API_BASE_URL = process.env.AI_MAESTRO_API_BASE_URL ?? "http://127.0.0.1:8787";
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_VERSION = "0.1.4";
const REQUIRED_VSCODE_EXTENSIONS = ["ms-python.python", "esbenp.prettier-vscode"];
const PROXY_MARKER_START = "# AI_MAESTRO_PROXY_START";
const PROXY_MARKER_END = "# AI_MAESTRO_PROXY_END";

let mainWindow: BrowserWindow | null = null;
let browserHooksRegistered = false;
let cachedBrowserPolicy: BrowserPolicy = {
  proxyUrl: "http://proxy.corp.internal:7890",
  allowedHosts: [...GITHUB_ALLOWED_HOSTS],
  auditAllRequests: true
};
let recentAudits: UrlAuditEvent[] = [];
let auditQueue: UrlAuditEvent[] = [];

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getPptTemplateDir() {
  return path.join(os.homedir(), "Documents", "AI Maestro PPT", "templates");
}

function getPptOutputDir() {
  return path.join(os.homedir(), "Documents", "AI Maestro PPT", "output");
}

function getPptToolMarkerPath() {
  return path.join(app.getPath("userData"), "ppt-tooling.json");
}

function getVsCodeSettingsPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Code", "User", "settings.json");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json");
  }
  return path.join(os.homedir(), ".config", "Code", "User", "settings.json");
}

function getUvConfigPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "uv", "uv.toml");
  }
  return path.join(os.homedir(), ".config", "uv", "uv.toml");
}

function getClaudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function getComateConfigPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Baidu", "Comate");
  }
  return path.join(os.homedir(), ".config", "comate");
}

function getShellProfilePaths() {
  if (process.platform === "win32") {
    return [
      path.join(os.homedir(), "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
      path.join(os.homedir(), "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
    ];
  }
  return [path.join(os.homedir(), ".zshrc"), path.join(os.homedir(), ".bashrc")];
}

function getDefaultSettings(): DesktopSettings {
  return {
    deviceId: randomUUID(),
    employeeId: "",
    apiBaseUrl: DEFAULT_API_BASE_URL,
    claude: {
      serverSuggestedModel: "minimax",
      skipOptions: {
        proxy: false,
        ideExtension: false,
        workspace: false,
        sampleConfig: false
      }
    },
    vscodeProxy: {
      syncGitProxy: true,
      syncTerminalEnv: true
    }
  };
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJsonObject(filePath: string, value: Record<string, unknown>) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function readSettings(): Promise<DesktopSettings> {
  const filePath = getSettingsPath();
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as DesktopSettings;
    return {
      ...getDefaultSettings(),
      ...parsed,
      claude: {
        ...getDefaultSettings().claude,
        ...parsed.claude
      },
      vscodeProxy: {
        ...getDefaultSettings().vscodeProxy,
        ...parsed.vscodeProxy
      }
    };
  } catch {
    const defaults = getDefaultSettings();
    await saveSettings(defaults);
    return defaults;
  }
}

async function saveSettings(settings: DesktopSettings) {
  await mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

async function getDesktopContext(): Promise<DesktopContext> {
  return {
    settings: await readSettings(),
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    appVersion: APP_VERSION
  };
}

function isValidModelName(model: string) {
  return /^[a-zA-Z0-9._:-]+$/.test(model);
}

function getEffectiveClaudeModel(settings: DesktopSettings) {
  return settings.claude.userSelectedModel || settings.claude.serverSuggestedModel || "minimax";
}

function applyManagedBlock(existing: string, content: string) {
  const block = `${PROXY_MARKER_START}\n${content}\n${PROXY_MARKER_END}`;
  const pattern = new RegExp(`${PROXY_MARKER_START}[\\s\\S]*?${PROXY_MARKER_END}\\n?`, "g");
  const stripped = existing.replace(pattern, "").trimEnd();
  return `${stripped ? `${stripped}\n\n` : ""}${block}\n`;
}

function removeManagedBlock(existing: string) {
  const pattern = new RegExp(`${PROXY_MARKER_START}[\\s\\S]*?${PROXY_MARKER_END}\\n?`, "g");
  return existing.replace(pattern, "").trim();
}

async function upsertProfileProxyBlock(proxyUrl: string, noProxy: string[]) {
  const noProxyValue = noProxy.join(",");
  for (const profilePath of getShellProfilePaths()) {
    await mkdir(path.dirname(profilePath), { recursive: true });
    const existing = existsSync(profilePath) ? await readFile(profilePath, "utf8") : "";
    const content =
      process.platform === "win32"
        ? `$env:HTTP_PROXY = "${proxyUrl}"\n$env:HTTPS_PROXY = "${proxyUrl}"\n$env:NO_PROXY = "${noProxyValue}"`
        : `export HTTP_PROXY="${proxyUrl}"\nexport HTTPS_PROXY="${proxyUrl}"\nexport NO_PROXY="${noProxyValue}"`;
    await writeFile(profilePath, applyManagedBlock(existing, content), "utf8");
  }
}

async function removeProfileProxyBlock() {
  for (const profilePath of getShellProfilePaths()) {
    if (!existsSync(profilePath)) {
      continue;
    }
    const existing = await readFile(profilePath, "utf8");
    await writeFile(profilePath, `${removeManagedBlock(existing)}\n`, "utf8");
  }
}

async function runShell(command: string) {
  return exec(command, {
    timeout: 10_000,
    windowsHide: true
  });
}

async function commandExists(command: string) {
  try {
    await runShell(process.platform === "win32" ? `where ${command}` : `which ${command}`);
    return true;
  } catch {
    return false;
  }
}

async function launchCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [], {
      detached: true,
      stdio: "ignore",
      shell: true
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function validateModelAgainstGateway(settings: DesktopSettings, gatewayConfig?: ClaudeGatewayConfig) {
  const model = getEffectiveClaudeModel(settings);
  const gatewayUrl = gatewayConfig?.gatewayUrl ?? `${settings.apiBaseUrl}/mock/claude-gateway`;
  if (!isValidModelName(model)) {
    return { ok: false, reason: "invalid-model-id", model };
  }
  try {
    const response = await fetchJson<{ ok: boolean; reason: string; model: string }>(
      `${gatewayUrl}/models/${encodeURIComponent(model)}`
    );
    return response;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "gateway-unreachable",
      model
    };
  }
}

async function applyGitProxy(proxyUrl: string) {
  try {
    await runShell(`git config --global http.proxy "${proxyUrl}"`);
    await runShell(`git config --global https.proxy "${proxyUrl}"`);
  } catch {
    return;
  }
}

async function clearGitProxy() {
  try {
    await runShell("git config --global --unset-all http.proxy");
  } catch {
    // ignore
  }
  try {
    await runShell("git config --global --unset-all https.proxy");
  } catch {
    // ignore
  }
}

async function ensureUvMirrorConfig() {
  const uvPath = getUvConfigPath();
  await mkdir(path.dirname(uvPath), { recursive: true });
  if (!existsSync(uvPath)) {
    await writeFile(
      uvPath,
      ['index-url = "https://mirrors.corp.internal/pypi/simple"', 'extra-index-url = ["https://pypi.org/simple"]'].join("\n"),
      "utf8"
    );
  }
}

async function ensureClaudeSettingsFile(input: SaveClaudeSettingsInput) {
  const settings = await readSettings();
  const claudePath = getClaudeSettingsPath();
  const existing = await readJsonObject(claudePath);
  const env = (typeof existing.env === "object" && existing.env ? existing.env : {}) as Record<string, string>;
  env.ANTHROPIC_BASE_URL = input.gatewayConfig.gatewayUrl;
  if (input.skipOptions.ideExtension) {
    env.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL = "1";
  } else {
    delete env.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL;
  }
  existing.model = getEffectiveClaudeModel(settings);
  existing.env = env;
  await writeJsonObject(claudePath, existing);
}

async function getVsCodeExtensions() {
  try {
    const { stdout } = await runShell("code --list-extensions");
    return stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function applyVsCodeProxyTemplate(payload: ApplyVsCodeProxyInput) {
  const settings = await readSettings();
  const settingsPath = getVsCodeSettingsPath();
  const data = await readJsonObject(settingsPath);
  data["http.proxy"] = payload.template.proxyUrl;
  data["http.proxySupport"] = payload.template.proxySupportMode;
  data["http.noProxy"] = payload.template.noProxyDomains.join(",");
  data["aiMaestro.extensionMarketplaceProbeUrl"] = payload.template.extensionMarketplaceProbeUrl;
  await writeJsonObject(settingsPath, data);

  if (payload.syncGitProxy) {
    await applyGitProxy(payload.template.proxyUrl);
  }
  if (payload.syncTerminalEnv) {
    await upsertProfileProxyBlock(payload.template.proxyUrl, payload.template.noProxyDomains);
  }

  const next: DesktopSettings = {
    ...settings,
    vscodeProxy: {
      template: payload.template,
      syncGitProxy: payload.syncGitProxy,
      syncTerminalEnv: payload.syncTerminalEnv,
      lastAppliedAt: new Date().toISOString()
    }
  };
  await saveSettings(next);
  return next;
}

async function resetVsCodeProxyTemplate() {
  const settings = await readSettings();
  const settingsPath = getVsCodeSettingsPath();
  const data = await readJsonObject(settingsPath);
  delete data["http.proxy"];
  delete data["http.proxySupport"];
  delete data["http.noProxy"];
  delete data["aiMaestro.extensionMarketplaceProbeUrl"];
  await writeJsonObject(settingsPath, data);
  await clearGitProxy();
  await removeProfileProxyBlock();
  const next: DesktopSettings = {
    ...settings,
    vscodeProxy: {
      syncGitProxy: false,
      syncTerminalEnv: false
    }
  };
  await saveSettings(next);
  return next;
}

function matchAllowedHost(hostname: string, allowedHosts: string[]) {
  return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
}

async function refreshBrowserPolicy() {
  const settings = await readSettings();
  try {
    cachedBrowserPolicy = await fetchJson<BrowserPolicy>(`${settings.apiBaseUrl}/api/browser/policy`);
  } catch {
    cachedBrowserPolicy = {
      proxyUrl: "http://proxy.corp.internal:7890",
      allowedHosts: [...GITHUB_ALLOWED_HOSTS],
      auditAllRequests: true
    };
  }
  await session.fromPartition(GITHUB_PARTITION).setProxy({
    proxyRules: cachedBrowserPolicy.proxyUrl
  });
}

function pushAuditEvent(event: UrlAuditEvent) {
  recentAudits = [...recentAudits.slice(-99), event];
  auditQueue = [...auditQueue, event];
}

function resolveTopLevelUrl(webContentsId?: number) {
  if (typeof webContentsId !== "number") {
    return "";
  }
  return webContents.fromId(webContentsId)?.getURL() ?? "";
}

async function flushAuditQueue() {
  if (!auditQueue.length) {
    return;
  }
  const pending = [...auditQueue];
  const settings = await readSettings();
  try {
    const response = await fetch(`${settings.apiBaseUrl}/api/audit/urls/batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ events: pending })
    });
    if (response.ok) {
      auditQueue = auditQueue.slice(pending.length);
    }
  } catch {
    // keep queue for retry
  }
}

async function registerBrowserHooks() {
  if (browserHooksRegistered) {
    return;
  }
  browserHooksRegistered = true;

  const targetSession = session.fromPartition(GITHUB_PARTITION);
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    if (!details.url.startsWith("http")) {
      return callback({});
    }
    const url = new URL(details.url);
    const allowed = matchAllowedHost(url.hostname, cachedBrowserPolicy.allowedHosts);
    if (!allowed) {
      void readSettings().then((settings) => {
        pushAuditEvent({
          deviceId: settings.deviceId,
          employeeId: settings.employeeId,
          clientVersion: APP_VERSION,
          sceneId: "github-browser",
          requestType: details.resourceType,
          method: details.method,
          url: details.url,
          topLevelUrl: resolveTopLevelUrl(details.webContentsId),
          decision: "blocked",
          statusCode: 0,
          timestamp: new Date().toISOString()
        });
      });
      return callback({ cancel: true });
    }
    return callback({});
  });

  targetSession.webRequest.onCompleted((details) => {
    if (!details.url.startsWith("http")) {
      return;
    }
    const url = new URL(details.url);
    if (!matchAllowedHost(url.hostname, cachedBrowserPolicy.allowedHosts)) {
      return;
    }
    void readSettings().then((settings) => {
      pushAuditEvent({
        deviceId: settings.deviceId,
        employeeId: settings.employeeId,
        clientVersion: APP_VERSION,
        sceneId: "github-browser",
        requestType: details.resourceType,
        method: details.method,
        url: details.url,
        topLevelUrl: resolveTopLevelUrl(details.webContentsId),
        decision: "allowed",
        statusCode: details.statusCode,
        timestamp: new Date().toISOString()
      });
    });
  });
}

async function checkWriteableDirectory(targetPath: string) {
  try {
    await mkdir(targetPath, { recursive: true });
    const probe = path.join(targetPath, ".ai-maestro-write-check");
    await writeFile(probe, "ok", "utf8");
    await rm(probe);
    return true;
  } catch {
    return false;
  }
}

async function buildVsCodeSelfcheck(): Promise<CheckResult[]> {
  const settings = await readSettings();
  const vscodeSettings = await readJsonObject(getVsCodeSettingsPath());
  const extensions = await getVsCodeExtensions();
  const uvExists = await commandExists("uv");
  const checks: CheckResult[] = [];

  checks.push({
    id: "vscode-installed",
    label: "VS Code 是否已安装",
    status: (await commandExists("code")) ? "pass" : "fail",
    detail: (await commandExists("code")) ? "检测到 code 命令。" : "未检测到 code 命令，请先安装 VS Code。"
  });

  checks.push({
    id: "vscode-extensions",
    label: "指定扩展是否齐全",
    status: REQUIRED_VSCODE_EXTENSIONS.every((item) => extensions.includes(item)) ? "pass" : "warn",
    detail: REQUIRED_VSCODE_EXTENSIONS.every((item) => extensions.includes(item))
      ? `已检测到 ${REQUIRED_VSCODE_EXTENSIONS.join("、")}。`
      : `当前扩展列表缺少部分建议项：${REQUIRED_VSCODE_EXTENSIONS.join("、")}。`
  });

  checks.push({
    id: "uv-installed",
    label: "uv 是否可执行",
    status: uvExists ? "pass" : "fail",
    detail: uvExists ? "检测到 uv 命令。" : "未检测到 uv 命令。"
  });

  const templateApplied =
    vscodeSettings["http.proxy"] === settings.vscodeProxy.template?.proxyUrl &&
    vscodeSettings["http.proxySupport"] === settings.vscodeProxy.template?.proxySupportMode;
  checks.push({
    id: "proxy-template",
    label: "代理模板是否已应用",
    status: templateApplied ? "pass" : "warn",
    detail: templateApplied ? "VS Code 用户设置已写入公司代理模板。" : "当前未检测到完整代理模板。"
  });

  try {
    const probeUrl = settings.vscodeProxy.template?.extensionMarketplaceProbeUrl;
    if (probeUrl) {
      const response = await fetch(probeUrl, { method: "POST" });
      checks.push({
        id: "marketplace-probe",
        label: "扩展市场是否可通过内部加速代理访问",
        status: response.ok ? "pass" : "warn",
        detail: response.ok ? "扩展市场探针请求成功。" : `扩展市场探针返回 ${response.status}。`
      });
    } else {
      checks.push({
        id: "marketplace-probe",
        label: "扩展市场是否可通过内部加速代理访问",
        status: "warn",
        detail: "尚未应用代理模板，未执行探针请求。"
      });
    }
  } catch (error) {
    checks.push({
      id: "marketplace-probe",
      label: "扩展市场是否可通过内部加速代理访问",
      status: "warn",
      detail: error instanceof Error ? error.message : "扩展市场探针失败。"
    });
  }

  if (settings.vscodeProxy.syncGitProxy && settings.vscodeProxy.template?.proxyUrl) {
    try {
      const { stdout } = await runShell("git config --global --get http.proxy");
      checks.push({
        id: "git-proxy",
        label: "Git 代理是否与模板一致",
        status: stdout.trim() === settings.vscodeProxy.template.proxyUrl ? "pass" : "warn",
        detail: stdout.trim() === settings.vscodeProxy.template.proxyUrl ? "Git 全局代理配置正确。" : "Git 全局代理与模板不一致。"
      });
    } catch {
      checks.push({
        id: "git-proxy",
        label: "Git 代理是否与模板一致",
        status: "warn",
        detail: "无法读取 Git 全局代理配置。"
      });
    }
  } else {
    checks.push({
      id: "git-proxy",
      label: "Git 代理是否与模板一致",
      status: "warn",
      detail: "当前未启用 Git 代理同步。"
    });
  }

  const profileMarkers = await Promise.all(
    getShellProfilePaths().map(async (profilePath) => {
      if (!existsSync(profilePath)) {
        return false;
      }
      const content = await readFile(profilePath, "utf8");
      return content.includes(PROXY_MARKER_START);
    })
  );

  checks.push({
    id: "terminal-env",
    label: "终端环境变量是否与选项一致",
    status: settings.vscodeProxy.syncTerminalEnv ? (profileMarkers.some(Boolean) ? "pass" : "warn") : "warn",
    detail: settings.vscodeProxy.syncTerminalEnv
      ? profileMarkers.some(Boolean)
        ? "检测到受管代理环境变量块。"
        : "未在常见 shell 配置中找到代理环境变量块。"
      : "当前未启用终端环境变量同步。"
  });

  const uvConfigExists = existsSync(getUvConfigPath()) && (await readFile(getUvConfigPath(), "utf8")).includes("index-url");
  checks.push({
    id: "uv-mirror",
    label: "镜像源配置是否存在",
    status: uvConfigExists ? "pass" : "warn",
    detail: uvConfigExists ? "已检测到 uv 镜像源配置。" : "未检测到 uv 镜像源配置。"
  });

  return checks;
}

async function buildClaudeSelfcheck(sceneId: SceneId): Promise<CheckResult[]> {
  const settings = await readSettings();
  let gatewayConfig: ClaudeGatewayConfig | undefined;
  try {
    gatewayConfig = await fetchJson<ClaudeGatewayConfig>(`${settings.apiBaseUrl}/api/claude/gateway-config`);
  } catch {
    gatewayConfig = undefined;
  }

  const settingsExists = existsSync(getClaudeSettingsPath());
  const claudeInstalled = await commandExists("claude");
  const gatewayHealth = gatewayConfig
    ? await fetchJson<{ ok: boolean }>(`${gatewayConfig.gatewayUrl}/health`).catch(() => ({ ok: false }))
    : { ok: false };
  const modelValidation = await validateModelAgainstGateway(settings, gatewayConfig);
  const checks: CheckResult[] = [
    {
      id: "claude-installed",
      label: "Claude Code 是否已安装",
      status: claudeInstalled ? "pass" : "fail",
      detail: claudeInstalled ? "检测到 claude 命令。" : "未检测到 claude 命令。"
    },
    {
      id: "gateway",
      label: "企业模型网关是否可达",
      status: gatewayHealth.ok ? "pass" : "fail",
      detail: gatewayHealth.ok ? "企业模型网关健康检查通过。" : "无法访问企业模型网关。"
    },
    {
      id: "model",
      label: "当前生效模型是否可用",
      status: modelValidation.ok ? "pass" : "fail",
      detail: modelValidation.ok
        ? `当前模型 ${modelValidation.model} 可被网关解析。`
        : `当前模型 ${modelValidation.model} 校验失败：${modelValidation.reason}。`
    },
    {
      id: "claude-settings",
      label: "关键配置是否存在",
      status: settingsExists ? "pass" : "warn",
      detail: settingsExists ? "检测到 ~/.claude/settings.json。" : "尚未检测到 Claude 设置文件。"
    }
  ];

  if (settings.claude.skipOptions.proxy) {
    checks.push({
      id: "claude-proxy",
      label: "代理是否可用",
      status: "warn",
      detail: "用户已选择跳过代理配置。"
    });
  } else {
    checks.push({
      id: "claude-proxy",
      label: "代理是否可用",
      status: settings.vscodeProxy.template?.proxyUrl ? "pass" : "warn",
      detail: settings.vscodeProxy.template?.proxyUrl ? "将复用内部代理模板。 " : "尚未检测到内部代理模板。"
    });
  }

  if (sceneId === "claude-ppt") {
    checks.push({
      id: "ppt-template-dir",
      label: "PPT 模板目录是否存在",
      status: existsSync(getPptTemplateDir()) ? "pass" : "warn",
      detail: existsSync(getPptTemplateDir()) ? getPptTemplateDir() : "尚未创建 PPT 模板目录。"
    });
    checks.push({
      id: "ppt-export-tool",
      label: "导出工具是否存在",
      status: existsSync(getPptToolMarkerPath()) ? "pass" : "warn",
      detail: existsSync(getPptToolMarkerPath()) ? "已检测到导出工具标记文件。" : "尚未完成 PPT 导出工具准备。"
    });
    checks.push({
      id: "ppt-output-dir",
      label: "输出目录是否可写",
      status: (await checkWriteableDirectory(getPptOutputDir())) ? "pass" : "fail",
      detail: (await checkWriteableDirectory(getPptOutputDir())) ? getPptOutputDir() : "无法写入 PPT 输出目录。"
    });
  }

  return checks;
}

async function buildComateSelfcheck(): Promise<CheckResult[]> {
  const extensions = await getVsCodeExtensions();
  const vscodeComate = extensions.some((item) => item.toLowerCase().includes("comate") || item.toLowerCase().includes("baidu"));
  const windowsVsInstalled = process.platform === "win32" ? await commandExists("devenv") : false;
  const comateConfigExists = existsSync(getComateConfigPath());

  return [
    {
      id: "comate-vscode",
      label: "VS Code 版 Comate 是否已安装",
      status: vscodeComate ? "pass" : "warn",
      detail: vscodeComate ? "已在 VS Code 扩展列表中检测到 Comate。" : "未在 VS Code 扩展列表中检测到 Comate。"
    },
    {
      id: "comate-license",
      label: "登录状态或 License 配置提示",
      status: comateConfigExists ? "pass" : "warn",
      detail: comateConfigExists ? "检测到 Comate 配置目录。" : "未检测到 Comate 配置目录，可能尚未登录或配置 License。"
    },
    {
      id: "comate-vs2022",
      label: "VS 2022 版是否已准备",
      status: process.platform === "win32" ? (windowsVsInstalled ? "pass" : "warn") : "warn",
      detail:
        process.platform === "win32"
          ? windowsVsInstalled
            ? "检测到 Visual Studio 2022 环境。"
            : "未检测到 Visual Studio 2022。"
          : "当前平台仅建议使用 VS Code 版 Comate。"
    }
  ];
}

async function buildGitHubBrowserSelfcheck(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [
    {
      id: "browser-proxy",
      label: "公司代理是否加载成功",
      status: cachedBrowserPolicy.proxyUrl ? "pass" : "fail",
      detail: cachedBrowserPolicy.proxyUrl || "未检测到代理地址。"
    },
    {
      id: "browser-whitelist",
      label: "白名单策略是否加载成功",
      status: GITHUB_ALLOWED_HOSTS.every((item) => cachedBrowserPolicy.allowedHosts.includes(item)) ? "pass" : "fail",
      detail: `当前白名单包含 ${cachedBrowserPolicy.allowedHosts.length} 个域名。`
    }
  ];

  try {
    const response = await fetch("https://github.com", { method: "HEAD" });
    checks.push({
      id: "browser-github",
      label: "GitHub 是否可访问",
      status: response.ok ? "pass" : "warn",
      detail: response.ok ? "GitHub 探针访问成功。" : `GitHub 探针返回 ${response.status}。`
    });
  } catch (error) {
    checks.push({
      id: "browser-github",
      label: "GitHub 是否可访问",
      status: "warn",
      detail: error instanceof Error ? error.message : "GitHub 探针失败。"
    });
  }

  checks.push({
    id: "browser-blocker",
    label: "非白名单 URL 是否会被拦截",
    status: browserHooksRegistered ? "pass" : "fail",
    detail: browserHooksRegistered ? "拦截钩子已注册。" : "拦截钩子尚未注册。"
  });

  checks.push({
    id: "browser-audit",
    label: "URL 审计上报链路是否正常",
    status: browserHooksRegistered ? (recentAudits.length > 0 ? "pass" : "warn") : "fail",
    detail: `本地最近保留 ${recentAudits.length} 条审计记录，待上报 ${auditQueue.length} 条。`
  });

  return checks;
}

function summarizeChecks(sceneId: SceneId, checks: CheckResult[]): ActionRunResult {
  const hasFail = checks.some((item) => item.status === "fail");
  const hasWarn = checks.some((item) => item.status === "warn");
  return {
    sceneId,
    action: "selfcheck",
    status: hasFail ? "error" : hasWarn ? "warning" : "success",
    title: `${sceneId} 自检完成`,
    message: hasFail ? "存在需要处理的问题。" : hasWarn ? "存在可继续跟进的提醒项。" : "所有检查项通过。",
    checks
  };
}

async function runSceneAction(request: ActionRunRequest): Promise<ActionRunResult> {
  const settings = await readSettings();
  if (request.action === "update") {
    return {
      sceneId: request.sceneId,
      action: "update",
      status: "manual",
      title: "更新已确认",
      message: "当前更新策略要求人工确认后执行。",
      detailLines: [
        ...(request.updateInfo?.releaseNotes ?? []),
        request.updateInfo?.downloadUrl ? `下载地址：${request.updateInfo.downloadUrl}` : "未提供下载地址。"
      ]
    };
  }

  switch (request.sceneId) {
    case "vscode-dev":
      if (request.action === "install") {
        await ensureUvMirrorConfig();
        return {
          sceneId: request.sceneId,
          action: "install",
          status: "manual",
          title: "VS Code 安装引导已准备",
          message: "已为 uv 写入公司镜像示例配置，请按企业分发流程安装 VS Code。",
          detailLines: [
            `uv 镜像配置路径：${getUvConfigPath()}`,
            "建议后续在设置页应用内部加速代理模板。",
            "如需自动化安装，可在下一轮迭代对接企业软件分发系统。"
          ]
        };
      }
      if (request.action === "launch") {
        if (await commandExists("code")) {
          await launchCommand("code");
          return {
            sceneId: request.sceneId,
            action: "launch",
            status: "success",
            title: "VS Code 已启动",
            message: "已尝试通过 code 命令启动 VS Code。"
          };
        }
        return {
          sceneId: request.sceneId,
          action: "launch",
          status: "warning",
          title: "未能启动 VS Code",
          message: "未检测到 code 命令，请先完成 VS Code 安装。"
        };
      }
      return summarizeChecks(request.sceneId, await buildVsCodeSelfcheck());

    case "claude-dev":
    case "claude-ppt":
      if (request.action === "install") {
        await ensureClaudeSettingsFile({
          serverSuggestedModel: settings.claude.serverSuggestedModel,
          userSelectedModel: settings.claude.userSelectedModel,
          skipOptions: settings.claude.skipOptions,
          gatewayConfig: {
            gatewayUrl: `${settings.apiBaseUrl}/mock/claude-gateway`,
            authMode: "bearer",
            apiKeyMode: "managed",
            availableModels: ["minimax", "glm"],
            defaultModel: settings.claude.serverSuggestedModel,
            allowCustomModelInput: true
          }
        });

        if (request.sceneId === "claude-ppt") {
          await mkdir(getPptTemplateDir(), { recursive: true });
          await mkdir(getPptOutputDir(), { recursive: true });
          await writeJsonObject(getPptToolMarkerPath(), {
            exportTool: "pptx-export-placeholder",
            updatedAt: new Date().toISOString()
          });
        }

        return {
          sceneId: request.sceneId,
          action: "install",
          status: "manual",
          title: request.sceneId === "claude-ppt" ? "Claude PPT 资产已初始化" : "Claude Code 配置已初始化",
          message: "已写入企业网关基础配置。",
          detailLines:
            request.sceneId === "claude-ppt"
              ? [`模板目录：${getPptTemplateDir()}`, `输出目录：${getPptOutputDir()}`]
              : [`Claude 设置路径：${getClaudeSettingsPath()}`]
        };
      }
      if (request.action === "launch") {
        if (await commandExists("claude")) {
          await launchCommand("claude");
          return {
            sceneId: request.sceneId,
            action: "launch",
            status: "success",
            title: "Claude Code 已启动",
            message: `当前模型：${getEffectiveClaudeModel(settings)}`
          };
        }
        return {
          sceneId: request.sceneId,
          action: "launch",
          status: "warning",
          title: "未能启动 Claude Code",
          message: "未检测到 claude 命令，请先安装 Claude Code。"
        };
      }
      return summarizeChecks(request.sceneId, await buildClaudeSelfcheck(request.sceneId));

    case "comate-dev":
      if (request.action === "install") {
        return {
          sceneId: request.sceneId,
          action: "install",
          status: "manual",
          title: "Comate 安装引导已准备",
          message: "首版提供 VS Code 与 Visual Studio 2022 的分形态指引。",
          detailLines: [
            "VS Code 版：请在扩展市场搜索 Baidu Comate。",
            "VS 2022 版：请在 Visual Studio 扩展管理器中搜索 Baidu Comate。",
            "完成后可回到自检页确认插件状态。"
          ]
        };
      }
      if (request.action === "launch") {
        if (await commandExists("code")) {
          await launchCommand("code");
          return {
            sceneId: request.sceneId,
            action: "launch",
            status: "success",
            title: "已启动 VS Code",
            message: "优先使用 VS Code 承载 Comate。"
          };
        }
        if (process.platform === "win32" && (await commandExists("devenv"))) {
          await launchCommand("devenv");
          return {
            sceneId: request.sceneId,
            action: "launch",
            status: "success",
            title: "已启动 Visual Studio 2022",
            message: "当前使用 VS 2022 承载 Comate。"
          };
        }
        return {
          sceneId: request.sceneId,
          action: "launch",
          status: "warning",
          title: "未检测到可启动的 IDE",
          message: "请先安装 VS Code 或 Visual Studio 2022。"
        };
      }
      return summarizeChecks(request.sceneId, await buildComateSelfcheck());

    case "github-browser":
      if (request.action === "install") {
        await refreshBrowserPolicy();
        return {
          sceneId: request.sceneId,
          action: "install",
          status: "success",
          title: "受控 GitHub 浏览器策略已加载",
          message: "浏览器代理和白名单策略会随应用启动自动生效。"
        };
      }
      if (request.action === "launch") {
        mainWindow?.focus();
        return {
          sceneId: request.sceneId,
          action: "launch",
          status: "success",
          title: "浏览器场景已就绪",
          message: "请在页面内使用受控 GitHub 浏览器。"
        };
      }
      return summarizeChecks(request.sceneId, await buildGitHubBrowserSelfcheck());
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1240,
    minHeight: 800,
    backgroundColor: "#0f1518",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  if (VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "..", "..", "..", "dist", "index.html"));
  }
}

function registerIpcHandlers() {
  ipcMain.handle("desktop:getContext", async () => getDesktopContext());
  ipcMain.handle("desktop:getSettings", async () => readSettings());
  ipcMain.handle("desktop:saveEmployeeId", async (_event, employeeId: string) => {
    const settings = await readSettings();
    const next = { ...settings, employeeId: employeeId.trim() };
    await saveSettings(next);
    return next;
  });
  ipcMain.handle("claude:saveSettings", async (_event, payload: SaveClaudeSettingsInput) => {
    if (payload.userSelectedModel && !isValidModelName(payload.userSelectedModel)) {
      throw new Error("模型名称只能包含字母、数字、点、下划线、冒号和短横线。");
    }
    const settings = await readSettings();
    const next: DesktopSettings = {
      ...settings,
      claude: {
        serverSuggestedModel: payload.serverSuggestedModel,
        userSelectedModel: payload.userSelectedModel?.trim() || undefined,
        skipOptions: payload.skipOptions
      }
    };
    await saveSettings(next);
    await ensureClaudeSettingsFile(payload);
    return next;
  });
  ipcMain.handle("vscode:applyProxyTemplate", async (_event, payload: ApplyVsCodeProxyInput) => applyVsCodeProxyTemplate(payload));
  ipcMain.handle("vscode:resetProxyTemplate", async () => resetVsCodeProxyTemplate());
  ipcMain.handle("scene:runAction", async (_event, payload: ActionRunRequest) => runSceneAction(payload));
  ipcMain.handle("browser:getPolicy", async () => cachedBrowserPolicy);
  ipcMain.handle("browser:getRecentAudits", async () => [...recentAudits].reverse());
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await refreshBrowserPolicy();
  await registerBrowserHooks();
  setInterval(() => {
    void refreshBrowserPolicy();
    void flushAuditQueue();
  }, 15_000);
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
