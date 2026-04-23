import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Collapse,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Menu,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography
} from "antd";
import {
  ApiOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CompassOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SettingOutlined
} from "@ant-design/icons";
import type {
  ActionRunResult,
  BootstrapResponse,
  BrowserPolicy,
  ClaudeGatewayConfig,
  DesktopContext,
  DesktopSettings,
  ProbeActionEvent,
  SceneAction,
  SceneDetail,
  SceneId,
  UpdateCheckResponse,
  UrlAuditEvent,
  VsCodeProxyTemplate
} from "@ai-maestro-lite/shared";

const { Header, Sider, Content } = Layout;
const { Title, Paragraph, Text } = Typography;

const sceneIcons: Record<SceneId, JSX.Element> = {
  "vscode-dev": <CodeOutlined />,
  "claude-dev": <DeploymentUnitOutlined />,
  "claude-ppt": <CompassOutlined />,
  "comate-dev": <ApiOutlined />,
  "github-browser": <GlobalOutlined />
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function getProbeStatus(result: ActionRunResult["status"]): ProbeActionEvent["status"] {
  switch (result) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
    default:
      return "info";
  }
}

export default function App() {
  const { message } = AntApp.useApp();
  const [context, setContext] = useState<DesktopContext | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [sceneDetails, setSceneDetails] = useState<Partial<Record<SceneId, SceneDetail>>>({});
  const [selectedSceneId, setSelectedSceneId] = useState<SceneId>("vscode-dev");
  const [currentResult, setCurrentResult] = useState<ActionRunResult | null>(null);
  const [runningAction, setRunningAction] = useState<SceneAction | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null);
  const [proxyTemplate, setProxyTemplate] = useState<VsCodeProxyTemplate | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<ClaudeGatewayConfig | null>(null);
  const [browserPolicy, setBrowserPolicy] = useState<BrowserPolicy | null>(null);
  const [browserInput, setBrowserInput] = useState("https://github.com");
  const [browserUrl, setBrowserUrl] = useState("https://github.com");
  const [recentAudits, setRecentAudits] = useState<UrlAuditEvent[]>([]);
  const [employeeIdDraft, setEmployeeIdDraft] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");
  const [recommendedModel, setRecommendedModel] = useState("minimax");
  const [skipOptions, setSkipOptions] = useState({
    proxy: false,
    ideExtension: false,
    workspace: false,
    sampleConfig: false
  });
  const [proxySwitches, setProxySwitches] = useState({
    syncGitProxy: true,
    syncTerminalEnv: true
  });

  const settings = context?.settings;
  const apiBaseUrl = settings?.apiBaseUrl ?? "http://127.0.0.1:8787";
  const selectedScene = sceneDetails[selectedSceneId] ?? bootstrap?.scenes.find((scene) => scene.id === selectedSceneId);

  const syncFromSettings = (nextSettings: DesktopSettings) => {
    setContext((current) => (current ? { ...current, settings: nextSettings } : current));
    setEmployeeIdDraft(nextSettings.employeeId);
    setCustomModelInput(nextSettings.claude.userSelectedModel ?? "");
    setRecommendedModel(nextSettings.claude.serverSuggestedModel);
    setSkipOptions(nextSettings.claude.skipOptions);
    setProxySwitches({
      syncGitProxy: nextSettings.vscodeProxy.syncGitProxy,
      syncTerminalEnv: nextSettings.vscodeProxy.syncTerminalEnv
    });
  };

  const postProbeEvent = async (
    sceneId: SceneId,
    action: ProbeActionEvent["action"],
    status: ProbeActionEvent["status"],
    errorMessage?: string
  ) => {
    if (!context) {
      return;
    }
    const event: ProbeActionEvent = {
      deviceId: context.settings.deviceId,
      employeeId: context.settings.employeeId,
      clientVersion: context.appVersion,
      sceneId,
      action,
      status,
      errorMessage,
      timestamp: new Date().toISOString()
    };

    try {
      await fetchJson(`${apiBaseUrl}/api/probe/actions/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ events: [event] })
      });
    } catch {
      // keep UI optimistic when backend is offline
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const desktopContext = await window.aiMaestro.getDesktopContext();
        if (!mounted) {
          return;
        }
        setContext(desktopContext);
        syncFromSettings(desktopContext.settings);

        const [bootstrapData, proxyData, gatewayData, browserData] = await Promise.all([
          fetchJson<BootstrapResponse>(`${desktopContext.settings.apiBaseUrl}/api/bootstrap`),
          fetchJson<VsCodeProxyTemplate>(`${desktopContext.settings.apiBaseUrl}/api/vscode/proxy-template`),
          fetchJson<ClaudeGatewayConfig>(`${desktopContext.settings.apiBaseUrl}/api/claude/gateway-config`),
          window.aiMaestro.getBrowserPolicy()
        ]);

        if (!mounted) {
          return;
        }

        setBootstrap(bootstrapData);
        setProxyTemplate(proxyData);
        setGatewayConfig(gatewayData);
        setBrowserPolicy(browserData);
        setRecommendedModel(desktopContext.settings.claude.serverSuggestedModel || gatewayData.defaultModel);

        await fetchJson(`${desktopContext.settings.apiBaseUrl}/api/device/register`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            deviceId: desktopContext.settings.deviceId,
            employeeId: desktopContext.settings.employeeId,
            hostname: desktopContext.hostname,
            platform: desktopContext.platform,
            arch: desktopContext.arch,
            appVersion: desktopContext.appVersion
          })
        }).catch(() => undefined);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "初始化失败");
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [message]);

  useEffect(() => {
    let mounted = true;
    if (!context) {
      return;
    }

    const loadScene = async () => {
      if (!sceneDetails[selectedSceneId]) {
        try {
          const detail = await fetchJson<SceneDetail>(`${apiBaseUrl}/api/scenes/${selectedSceneId}`);
          if (mounted) {
            setSceneDetails((current) => ({ ...current, [selectedSceneId]: detail }));
          }
        } catch (error) {
          message.error(error instanceof Error ? error.message : "场景详情加载失败");
        }
      }

      await postProbeEvent(selectedSceneId, "scene_enter", "info");
    };

    void loadScene();

    return () => {
      mounted = false;
    };
  }, [apiBaseUrl, context, message, sceneDetails, selectedSceneId]);

  useEffect(() => {
    if (selectedSceneId !== "github-browser") {
      return;
    }
    let cancelled = false;
    const refreshAudits = async () => {
      const audits = await window.aiMaestro.getRecentAudits();
      if (!cancelled) {
        setRecentAudits(audits);
      }
    };
    void refreshAudits();
    const timer = window.setInterval(() => {
      void refreshAudits();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedSceneId]);

  const actionButtons = useMemo(
    () => [
      { action: "install" as const, label: "安装", icon: <SettingOutlined /> },
      { action: "update" as const, label: "更新", icon: <ReloadOutlined /> },
      { action: "launch" as const, label: "启动", icon: <PlayCircleOutlined /> },
      { action: "selfcheck" as const, label: "自检", icon: <CheckCircleOutlined /> }
    ],
    []
  );

  const handleRunAction = async (action: SceneAction) => {
    if (!selectedScene) {
      return;
    }
    if (action === "update") {
      try {
        const info = await fetchJson<UpdateCheckResponse>(
          `${apiBaseUrl}/api/updates/check?target=scene&sceneId=${selectedScene.id}`
        );
        setUpdateInfo(info);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "更新信息加载失败");
      }
      return;
    }

    try {
      setRunningAction(action);
      const result = await window.aiMaestro.runSceneAction({
        sceneId: selectedScene.id,
        action
      });
      setCurrentResult(result);
      message.success(result.title);
      await postProbeEvent(selectedScene.id, action, getProbeStatus(result.status), result.status === "error" ? result.message : undefined);
    } catch (error) {
      const text = error instanceof Error ? error.message : "执行失败";
      message.error(text);
      await postProbeEvent(selectedScene.id, action, "error", text);
    } finally {
      setRunningAction(null);
    }
  };

  const confirmUpdate = async () => {
    if (!updateInfo) {
      return;
    }
    try {
      setRunningAction("update");
      const result = await window.aiMaestro.runSceneAction({
        sceneId: updateInfo.sceneId ?? selectedSceneId,
        action: "update",
        updateInfo
      });
      setCurrentResult(result);
      message.success(result.title);
      await postProbeEvent(updateInfo.sceneId ?? selectedSceneId, "update", getProbeStatus(result.status));
    } catch (error) {
      const text = error instanceof Error ? error.message : "更新执行失败";
      message.error(text);
      await postProbeEvent(updateInfo.sceneId ?? selectedSceneId, "update", "error", text);
    } finally {
      setRunningAction(null);
      setUpdateInfo(null);
    }
  };

  const handleSaveEmployee = async () => {
    try {
      const next = await window.aiMaestro.saveEmployeeId(employeeIdDraft);
      syncFromSettings(next);
      message.success("员工标识已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const handleSaveClaudeSettings = async () => {
    if (!gatewayConfig) {
      return;
    }
    try {
      const next = await window.aiMaestro.saveClaudeSettings({
        serverSuggestedModel: recommendedModel,
        userSelectedModel: customModelInput.trim() || undefined,
        skipOptions,
        gatewayConfig
      });
      syncFromSettings(next);
      message.success("Claude 设置已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Claude 设置保存失败");
    }
  };

  const handleApplyProxyTemplate = async () => {
    if (!proxyTemplate) {
      return;
    }
    try {
      const next = await window.aiMaestro.applyVsCodeProxyTemplate({
        template: proxyTemplate,
        syncGitProxy: proxySwitches.syncGitProxy,
        syncTerminalEnv: proxySwitches.syncTerminalEnv
      });
      syncFromSettings(next);
      message.success("VS Code 代理模板已应用");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "代理模板应用失败");
    }
  };

  const handleResetProxyTemplate = async () => {
    try {
      const next = await window.aiMaestro.resetVsCodeProxyTemplate();
      syncFromSettings(next);
      message.success("VS Code 代理模板已重置");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "代理模板重置失败");
    }
  };

  if (!context || !bootstrap) {
    return (
      <div className="app-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout className="app-shell">
      <Sider width={300} className="app-sider">
        <div className="brand-block">
          <Text className="eyebrow">Enterprise AI Desktop</Text>
          <Title level={2}>AI Maestro Lite</Title>
          <Paragraph>围绕固定业务场景交付环境准备、配置、自检、更新确认与审计。</Paragraph>
        </div>
        <Menu
          mode="inline"
          className="scene-menu"
          selectedKeys={[selectedSceneId]}
          items={bootstrap.scenes.map((scene) => ({
            key: scene.id,
            icon: sceneIcons[scene.id],
            label: (
              <div className="scene-menu-item">
                <div>{scene.title}</div>
                <Text type="secondary">{scene.description}</Text>
              </div>
            )
          }))}
          onClick={(event) => setSelectedSceneId(event.key as SceneId)}
        />
      </Sider>
      <Layout className="main-panel">
        <Header className="app-header">
          <div>
            <Text className="eyebrow">Client {context.appVersion}</Text>
            <Title level={3} style={{ margin: 0 }}>
              {selectedScene?.title ?? "场景工作台"}
            </Title>
          </div>
          <Space size="middle" align="center">
            <Input
              value={employeeIdDraft}
              placeholder="员工标识"
              className="header-input"
              onChange={(event) => setEmployeeIdDraft(event.target.value)}
            />
            <Button type="primary" onClick={handleSaveEmployee}>
              保存身份
            </Button>
          </Space>
        </Header>
        <Content className="content-panel">
          <div className="overview-grid">
            <Card className="hero-card">
              <Space size={[8, 8]} wrap>
                {selectedScene?.badges?.map((badge) => (
                  <Tag color="cyan" key={badge}>
                    {badge}
                  </Tag>
                ))}
              </Space>
              <Title level={2} style={{ marginTop: 16 }}>
                {selectedScene?.title}
              </Title>
              <Paragraph className="hero-description">{selectedScene?.description}</Paragraph>
              <div className="action-row">
                {actionButtons.map((item) => (
                  <Button
                    key={item.action}
                    size="large"
                    icon={item.icon}
                    loading={runningAction === item.action}
                    onClick={() => void handleRunAction(item.action)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </Card>

            <Card className="announcements-card" title="平台公告">
              <List
                dataSource={bootstrap.announcements}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item}</Text>
                  </List.Item>
                )}
              />
            </Card>
          </div>

          {currentResult && currentResult.sceneId === selectedSceneId ? (
            <Card className="result-card" title="最近一次动作结果">
              <Alert
                type={
                  currentResult.status === "success"
                    ? "success"
                    : currentResult.status === "warning"
                      ? "warning"
                      : currentResult.status === "error"
                        ? "error"
                        : "info"
                }
                message={currentResult.title}
                description={currentResult.message}
                showIcon
              />
              {currentResult.detailLines?.length ? (
                <List
                  className="detail-list"
                  dataSource={currentResult.detailLines}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              ) : null}
              {currentResult.checks?.length ? (
                <List
                  className="detail-list"
                  dataSource={currentResult.checks}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <span>{item.label}</span>
                            <Tag color={item.status === "pass" ? "green" : item.status === "warn" ? "gold" : "red"}>
                              {item.status}
                            </Tag>
                          </Space>
                        }
                        description={item.detail}
                      />
                    </List.Item>
                  )}
                />
              ) : null}
            </Card>
          ) : null}

          <div className="content-grid">
            <Card title="场景说明" className="section-card">
              <List
                dataSource={sceneDetails[selectedSceneId]?.overview ?? []}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item}</Text>
                  </List.Item>
                )}
              />
            </Card>

            <Card title="运行信息" className="section-card">
              <Descriptions column={1} size="small" labelStyle={{ width: 180 }}>
                <Descriptions.Item label="平台">{context.platform}</Descriptions.Item>
                <Descriptions.Item label="架构">{context.arch}</Descriptions.Item>
                <Descriptions.Item label="主机名">{context.hostname}</Descriptions.Item>
                <Descriptions.Item label="设备 ID">{context.settings.deviceId}</Descriptions.Item>
                <Descriptions.Item label="员工标识">{context.settings.employeeId || "未设置"}</Descriptions.Item>
              </Descriptions>
            </Card>
          </div>

          {selectedSceneId === "vscode-dev" && proxyTemplate ? (
            <Card title="VS Code 内部加速代理" className="section-card">
              <Descriptions column={1} size="small" labelStyle={{ width: 180 }}>
                <Descriptions.Item label="代理地址">{proxyTemplate.proxyUrl}</Descriptions.Item>
                <Descriptions.Item label="代理模式">{proxyTemplate.proxySupportMode}</Descriptions.Item>
                <Descriptions.Item label="绕过域名">{proxyTemplate.noProxyDomains.join(", ")}</Descriptions.Item>
                <Descriptions.Item label="扩展市场探针">{proxyTemplate.extensionMarketplaceProbeUrl}</Descriptions.Item>
              </Descriptions>
              <Divider />
              <Space size="large">
                <Space>
                  <Text>同步 Git 代理</Text>
                  <Switch
                    checked={proxySwitches.syncGitProxy}
                    onChange={(value) => setProxySwitches((current) => ({ ...current, syncGitProxy: value }))}
                  />
                </Space>
                <Space>
                  <Text>同步终端环境变量</Text>
                  <Switch
                    checked={proxySwitches.syncTerminalEnv}
                    onChange={(value) => setProxySwitches((current) => ({ ...current, syncTerminalEnv: value }))}
                  />
                </Space>
              </Space>
              <div className="action-row" style={{ marginTop: 20 }}>
                <Button type="primary" onClick={handleApplyProxyTemplate}>
                  一键应用模板
                </Button>
                <Button onClick={handleResetProxyTemplate}>重置模板</Button>
              </div>
            </Card>
          ) : null}

          {(selectedSceneId === "claude-dev" || selectedSceneId === "claude-ppt") && gatewayConfig ? (
            <Card title="Claude 模型与可选跳过项" className="section-card">
              <Form layout="vertical">
                <Form.Item label="服务器推荐模型">
                  <Select
                    value={recommendedModel}
                    options={gatewayConfig.availableModels.map((model) => ({ value: model, label: model }))}
                    onChange={setRecommendedModel}
                  />
                </Form.Item>
                <Form.Item label="手动输入自定义模型名">
                  <Input
                    value={customModelInput}
                    placeholder="例如 minimax-pro 或 glm-4"
                    onChange={(event) => setCustomModelInput(event.target.value)}
                  />
                </Form.Item>
                <Form.Item label="跳过可选配置步骤">
                  <Space wrap>
                    <Switch
                      checked={skipOptions.proxy}
                      onChange={(value) => setSkipOptions((current) => ({ ...current, proxy: value }))}
                    />
                    <Text>跳过代理</Text>
                    <Switch
                      checked={skipOptions.ideExtension}
                      onChange={(value) => setSkipOptions((current) => ({ ...current, ideExtension: value }))}
                    />
                    <Text>跳过 IDE 扩展</Text>
                    <Switch
                      checked={skipOptions.workspace}
                      onChange={(value) => setSkipOptions((current) => ({ ...current, workspace: value }))}
                    />
                    <Text>跳过工作目录</Text>
                    <Switch
                      checked={skipOptions.sampleConfig}
                      onChange={(value) => setSkipOptions((current) => ({ ...current, sampleConfig: value }))}
                    />
                    <Text>跳过示例配置</Text>
                  </Space>
                </Form.Item>
                <Button type="primary" onClick={handleSaveClaudeSettings}>
                  保存 Claude 设置
                </Button>
              </Form>
              <Divider />
              <Alert
                type="info"
                showIcon
                message="模型优先级"
                description="运行时优先使用用户手动输入的模型，其次使用服务器推荐模型，最后回退到客户端默认值。"
              />
            </Card>
          ) : null}

          {selectedSceneId === "comate-dev" ? (
            <Card title="Comate 支持形态" className="section-card">
              <div className="content-grid">
                {(sceneDetails["comate-dev"]?.subTargets ?? []).map((item) => (
                  <Card key={item} className="mini-card">
                    <Title level={4}>{item}</Title>
                    <Paragraph>
                      {item.includes("2022")
                        ? "Windows 上可结合 Visual Studio 2022 做企业开发。"
                        : "适合与 VS Code 开发场景一起使用。"}
                    </Paragraph>
                  </Card>
                ))}
              </div>
            </Card>
          ) : null}

          {selectedSceneId === "github-browser" ? (
            <Card title="受控 GitHub 浏览器" className="section-card">
              {browserPolicy ? (
                <Alert
                  type="warning"
                  showIcon
                  message="当前浏览器只允许 GitHub 白名单域名"
                  description={`代理：${browserPolicy.proxyUrl}；审计：${browserPolicy.auditAllRequests ? "记录所有请求 URL" : "关闭"}`}
                />
              ) : null}
              <div className="browser-toolbar">
                <Input value={browserInput} onChange={(event) => setBrowserInput(event.target.value)} />
                <Button type="primary" onClick={() => setBrowserUrl(browserInput.trim() || "https://github.com")}>
                  打开
                </Button>
              </div>
              <div className="browser-shell">
                <webview src={browserUrl} partition="persist:github-browser" allowpopups className="github-webview" />
              </div>
              <Divider />
              <Title level={4}>最近 URL 审计</Title>
              {recentAudits.length ? (
                <List
                  dataSource={recentAudits.slice(0, 20)}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Tag color={item.decision === "allowed" ? "green" : "red"}>{item.decision}</Tag>
                            <Text>{item.requestType}</Text>
                          </Space>
                        }
                        description={
                          <div>
                            <div>{item.url}</div>
                            <Text type="secondary">
                              {item.method} | {item.statusCode} | {new Date(item.timestamp).toLocaleString()}
                            </Text>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="还没有收到 URL 审计记录" />
              )}
            </Card>
          ) : null}

          <Card title="常见问题" className="section-card">
            <Collapse
              items={(sceneDetails[selectedSceneId]?.faqs ?? []).map((faq) => ({
                key: faq.question,
                label: faq.question,
                children: <Paragraph style={{ marginBottom: 0 }}>{faq.answer}</Paragraph>
              }))}
            />
          </Card>
        </Content>
      </Layout>

      <Modal
        open={Boolean(updateInfo)}
        title="确认更新"
        okText="确认更新"
        cancelText="取消"
        onOk={() => void confirmUpdate()}
        onCancel={() => setUpdateInfo(null)}
        confirmLoading={runningAction === "update"}
      >
        {updateInfo ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message={`最新版本：${updateInfo.latestVersion}`}
              description={`发布时间：${new Date(updateInfo.publishedAt).toLocaleString()}`}
            />
            <List
              size="small"
              dataSource={updateInfo.releaseNotes}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
            <Text>所有更新都必须经由当前弹窗确认后才会继续执行。</Text>
          </Space>
        ) : null}
      </Modal>
    </Layout>
  );
}
