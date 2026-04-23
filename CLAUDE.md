# AI Maestro Lite Context

## 产品定位

AI Maestro Lite 是一个企业内部 AI 场景助手。

它不做通用编排，不做插件市场，不做复杂工作流。当前只做 5 个固定场景：

- `VS Code` 编程开发
- `Claude Code` 编程开发
- `Claude Code` 写 PPT
- `百度 Comate` 编程
- `受控 GitHub 浏览器`

## 产品目标

解决企业内部使用 AI 工具时的几个常见问题：

- 工具太多，入口太散
- 配置太多，代理、镜像、模型网关不统一
- 用户不知道自己当前机器缺什么
- 更新和下载缺少统一入口
- 审计和中台同步要求高

## 当前技术方案

- 桌面端：Electron + React + Ant Design
- 后端：Node.js + Express + SQLite
- 共享类型：`packages/shared`

之所以选 `Express`，原因很直接：

- 路由少
- 逻辑简单
- 更容易看懂
- 团队更容易接手

之所以选 `SQLite`，也是为了简单：

- 不依赖独立数据库服务
- 本地就能跑
- 适合当前这个轻量后端

## 固定动作

每个场景都只保留固定动作：

- 安装
- 更新
- 启动
- 自检

不要继续往“通用任务系统”方向抽象。

## 场景差异

### VS Code

- 检查 VS Code
- 检查扩展
- 检查 `uv`
- 配置内部加速代理
- 执行自检

### Claude Code

- 安装和启动 Claude Code
- 切换推荐模型
- 支持手动输入模型覆盖推荐值
- 支持跳过可选配置步骤
- 执行自检

### Claude Code 写 PPT

- 继承 Claude Code 基础能力
- 增加 PPT 模板、导出工具、输出目录检查

### 百度 Comate

- 支持 VS Code 版
- Windows 支持 Visual Studio 2022 版

### 受控 GitHub 浏览器

- 内置浏览器
- 强制走公司代理
- 只允许 GitHub 白名单域名
- 记录每一个请求 URL

## 更新策略

所有更新都要先展示说明，再由用户确认。

更新信息和下载地址支持两层：

- 默认值：代码里自带
- 覆盖值：运行时配置文件提供

优先级：

1. `AI_MAESTRO_RUNTIME_CONFIG`
2. `data/runtime-config.json`
3. 代码默认值

## 飞书同步策略

飞书同步不直接从客户端写飞书，而是：

1. 客户端把探针和 URL 审计发给后端
2. 后端先写 SQLite
3. worker 再调用飞书 API 写多维表格
4. 成功后把同步结果写回数据库

飞书相关配置统一用环境变量控制。

## 重要路径

- 桌面端：`apps/desktop`
- 后端：`apps/server`
- 共享类型：`packages/shared`
- 文档：`docs`

## 后续实现边界

当前仓库适合继续做这些事情：

- 对接真实软件分发
- 对接真实飞书多维表格
- 补充企业发布流程

当前不建议做这些事情：

- 把产品做成通用编排引擎
- 引入 PostgreSQL
- 引入复杂后台系统
- 为了扩展性过早抽象
