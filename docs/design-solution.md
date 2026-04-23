# 设计方案

## 总体思路

系统保持三层，结构尽量简单：

- 桌面端：Electron + React + Ant Design
- 后端：Node.js + Express + SQLite
- 共享层：前后端共享类型和固定场景定义

这套结构的重点不是“灵活”，而是“够用、清楚、容易改”。

## 为什么后端选 Express

后端当前只做这些事情：

- 设备注册
- 场景信息下发
- 更新检查
- 代理和模型配置下发
- 探针接收
- URL 审计接收

这些都是很直接的 HTTP 接口，用 `Express` 最省事：

- 学习成本低
- 路由写法最直白
- 团队接手容易
- 以后排查问题更轻松

所以这里不追求更“工程化”的框架，优先简单。

## 为什么存储选 SQLite

这个项目的后端是轻量服务，不需要独立数据库集群。

选 `SQLite` 的原因：

- 不需要单独安装数据库
- 本地开发方便
- 部署简单
- 足够承载当前配置、探针、审计和飞书同步结果

默认数据库路径：

- `data/app-store.sqlite`

## 桌面端设计

首页固定展示 5 个场景：

- `VS Code` 编程开发
- `Claude Code` 编程开发
- `Claude Code` 写 PPT
- `百度 Comate` 编程
- `受控 GitHub 浏览器`

每个场景统一只保留 4 个动作：

- 安装
- 更新
- 启动
- 自检

这样用户不会面对复杂菜单，也不需要理解底层编排逻辑。

## 场景设计

### VS Code 编程开发

负责：

- VS Code 是否存在
- 扩展是否齐全
- `uv` 是否可执行
- 内部加速代理是否已应用
- 镜像源配置是否存在

### Claude Code 编程开发

负责：

- Claude Code 安装、启动、自检
- 企业模型网关配置
- 推荐模型选择
- 手动输入模型覆盖
- 跳过可选配置步骤

运行时模型优先级固定为：

1. 用户手动选择或输入的模型
2. 服务端推荐模型
3. 客户端默认模型

### Claude Code 写 PPT

在 Claude Code 基础上增加：

- PPT 模板目录
- 导出工具
- 输出目录可写检查

### 百度 Comate 编程

- Windows：支持 VS Code 版和 Visual Studio 2022 版
- macOS：支持 VS Code 版
- Linux：第一版不承诺

### 受控 GitHub 浏览器

- 内置浏览器，不拉起系统浏览器
- 强制公司代理
- 仅允许 GitHub 白名单域名
- 记录每一个请求 URL

## 后端接口

当前固定接口如下：

- `POST /api/device/register`
- `GET /api/bootstrap`
- `GET /api/scenes/:sceneId`
- `GET /api/updates/check`
- `GET /api/browser/policy`
- `GET /api/claude/gateway-config`
- `GET /api/vscode/proxy-template`
- `POST /api/probe/actions/batch`
- `POST /api/audit/urls/batch`

这些接口都很薄，目标就是简单直给。

## 更新设计

更新采用“默认值 + 配置覆盖”的方式。

默认情况下，代码里自带：

- 客户端版本信息
- 更新说明
- 下载地址
- 场景更新信息

如果企业环境需要覆盖，则按下面的优先级读取：

1. `AI_MAESTRO_RUNTIME_CONFIG` 指向的 JSON 文件
2. `data/runtime-config.json`
3. 代码默认值

这样做的好处是：

- 开发环境不用额外准备也能跑
- 企业部署时又能替换成自己的版本信息和下载地址

所有更新都必须让用户确认后才能执行。

## 审计与飞书同步

系统有两类记录：

- 动作探针：进入场景、安装、更新、启动、自检
- URL 审计：受控 GitHub 浏览器中的每一个请求 URL

数据流固定为：

1. 客户端上报到后端
2. 后端先写 SQLite
3. worker 调用飞书 API 写入多维表格
4. 成功后把结果写回数据库

飞书相关配置全部走环境变量，不硬编码。

## 当前不做的事情

- 不做通用编排平台
- 不做插件市场
- 不做复杂后台管理系统
- 不引入 PostgreSQL
- 不为了扩展性过早抽象
