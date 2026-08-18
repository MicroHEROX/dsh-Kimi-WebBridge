<div align="center">

# Kimi WebBridge for DeepSeek Harness

**让 DeepSeek Harness 的 agent 操控你的真实浏览器——带着你的登录态。**

[![English](https://img.shields.io/badge/English-README-0d1117?style=for-the-badge&logo=github)](README.md)
[![简体中文](https://img.shields.io/badge/简体中文-README-1f6feb?style=for-the-badge&logo=github)](README.zh-CN.md)

[![version](https://img.shields.io/badge/版本-0.1.0-blue)](package.json)
[![dsh](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.7-4b6bfb)](https://github.com/deepseek-ai/deepseek-harness)
[![WebBridge](https://img.shields.io/badge/Kimi%20WebBridge-v1.11.5-7c3aed)](https://www.kimi.com/zh-cn/features/webbridge)
[![node](https://img.shields.io/badge/Node-%E2%89%A518-339933?logo=nodedotjs)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-2ea44f)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-%E2%9C%93-ffd700)](https://github.com/topics/dsh-plugin)

*为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）开发的第三方插件 bundle。它把本机 [Kimi WebBridge](https://www.kimi.com/zh-cn/features/webbridge) 守护进程开放为 15 个原生 `kimi_webbridge_*` 工具——agent 可以在**你的真实浏览器**里（以你的身份）打开页面、读取内容、点击、输入、截图、执行 JS、抓取网络请求、上传文件、另存 PDF。*

</div>

---

## ✨ 它能做什么

| | |
|---|---|
| 🧭 **真实浏览器、真实会话** | 模型驱动你的实际浏览器——Cookie、登录态一应俱全。无爬虫、无无头浏览器。 |
| 🛡️ **全本机运行** | 一切都在你的机器上：插件 → `127.0.0.1:10086` 守护进程 → 你的浏览器。第三方服务接触不到你的流量。 |
| 📦 **单文件、零构建** | 纯 ESM，除 harness 自带包外零运行时依赖。无 TypeScript、无转译、无 API key。 |
| 🔌 **标准 Cordis bundle** | `name` / `inject` / `apply` + `defineTool`——与官方内置工具完全相同的模式。不改动 dsh 安装。 |
| 🗂️ **与产品一致的标签分组** | 一个 session = 一个标签分组；模型首次使用时用你的语言命名分组，且只在用户要求时关闭。 |

## 🛠️ 模型获得的能力——15 个工具

| 工具 | 用途 |
|---|---|
| `kimi_webbridge_navigate` | 打开 URL（新标签或当前标签），首次使用时设置标签分组名 |
| `kimi_webbridge_find_tab` | 按 URL 重新选中本任务标签；`active:true` 借用你正在看的标签 |
| `kimi_webbridge_list_tabs` | 列出本任务标签 |
| `kimi_webbridge_snapshot` | 以无障碍树读取页面，交互元素带 `@e` 引用 |
| `kimi_webbridge_click` | 点击元素（`@e` 引用或 CSS 选择器） |
| `kimi_webbridge_fill` | 向输入框 / textarea / contenteditable 富文本编辑器输入 |
| `kimi_webbridge_evaluate` | 在页面中执行 JavaScript（支持 async） |
| `kimi_webbridge_cdp` | 原始 `chrome.debugger` 透传（高级逃生通道） |
| `kimi_webbridge_screenshot` | 截图当前标签或指定元素；返回文件路径 |
| `kimi_webbridge_network` | 抓取 / 查看标签的网络请求 |
| `kimi_webbridge_upload` | 向 `<input type=file>` 上传文件 |
| `kimi_webbridge_save_as_pdf` | 将当前页面渲染为 PDF；返回文件路径 |
| `kimi_webbridge_close_tab` | 关闭当前标签 |
| `kimi_webbridge_close_session` | 关闭整个标签分组——仅当用户明确要求时 |
| `kimi_webbridge_start_daemon` | 守护进程不可达时自动启动 |

## ✅ 环境要求与版本

| 组件 | 版本 |
|---|---|
| DeepSeek Harness（`dsh`） | **0.1.0-rc.7**（已实测）——凡自带 `@deepseek-ai/dsh-tools` 的构建均可工作 |
| Node.js | **≥ 18**（全局 `fetch`） |
| Kimi WebBridge 守护进程 | **v1.11.5**（已实测） |
| Kimi WebBridge 浏览器扩展 | **1.11.5**（已实测） |
| 操作系统 | **Windows**（已实测）；macOS/Linux 代码路径已写但未真机验证 |

> 兼容性以实测为准。安装后运行 `node tests/smoke.mjs` 即可自检当前环境。

## 📦 安装

**方式 A——从 GitHub（推荐）：**

```sh
dsh plugin --profile demo add github:MicroHEROX/dsh-Kimi-WebBridge
dsh --profile demo web
```

**方式 B——本地目录：**

```sh
dsh plugin --profile demo add ./dsh-Kimi-WebBridge
dsh --profile demo web
```

**方式 C——不安装，一次性 overlay**（`kimi-webbridge.overlay.yml`）：

```yaml
- insert:
    - id: kimi-webbridge
      name: '/绝对/路径/dsh-Kimi-WebBridge/index.js'
      config:
        session: dsh
```

```sh
dsh web --patch ./kimi-webbridge.overlay.yml
```

**方式 D——长期生效：** 把 `cordis.patch.yml` 中的 `insert` 块合并到 `$DSH_HOME/profiles/<name>/cordis.patch.yml`（或 `$DSH_HOME/cordis.patch.yml` 对所有 profile 生效）。

**卸载：**

```sh
dsh plugin --profile demo remove dsh-kimi-webbridge
```

CLI 移除依赖并对账 profile 层列表，15 个工具随之注销。验证行已消失：

```sh
dsh --profile demo --dump-config    # 不应再出现 kimi-webbridge 行
```

> ⚠️ **已知 harness 坑（dsh 0.1.0-rc.7，[讨论 #913](https://github.com/deepseek-ai/deepseek-harness/discussions/913)）：** 罕见的 pnpm 瞬时失败可能导致条目残留在 `dsh.profile.bundles`，此后 profile 启动报 `cannot resolve profile bundle "dsh-kimi-webbridge"`——`dsh plugin install` **无法**修复（社区复核：[#917](https://github.com/deepseek-ai/deepseek-harness/discussions/917)）。**恢复方法：** 编辑 profile 的 `package.json`，从 `dsh.profile.bundles` 数组中删除 `"dsh-kimi-webbridge"`，再重新启动。

> 安装只打包运行文件（`index.js`、`cordis.patch.yml`、README、LICENSE）；`docs/` 与 `tests/` 只存在于本仓库。已用 `npm pack` 实测确认。

## 🚀 快速开始

1. 安装 bundle 并启动 `dsh web --profile demo`。
2. 等待 `kimi_webbridge_*` 工具出现在工具目录。
3. 提问：*"用浏览器打开 example.com，告诉我页面上有什么，并截个图。"*
4. agent 会打开一个标签分组（用你的语言命名）、通过 `snapshot` 读取页面、保存截图并把文件展示给你。

## ⚙️ 配置

所有键均可选；在更晚的 patch 层按 id 覆盖 `kimi-webbridge` 行，需要把用到的键写全：

```yaml
- id: kimi-webbridge
  name: dsh-kimi-webbridge
  config:
    baseUrl: 'http://127.0.0.1:10086'   # 守护进程地址
    session: dsh                        # 守护进程侧标签分组名（一个 profile 一个）
    requestTimeoutMs: 120000            # 单次请求超时
    startDaemonTool: true               # 是否暴露 kimi_webbridge_start_daemon
    daemonBin: null                     # 覆盖自动探测的守护进程二进制路径
    maxRenderText: 50000                # 渲染结果文本上限
```

## ✅ 已完成 / ⚠️ 未完成

**已完成并验证**
- 15 个工具全部经真实 harness + 真实浏览器端到端验证（dsh 0.1.0-rc.7，守护进程 v1.11.5）：导航、真实点击跳转、表单填写 + 值复核、文件上传 + `files.length` 复核、网络抓取、CDP 布局指标、截图、PDF、标签管理、守护进程自启动。
- 捕获类工具自动重试（新标签首次截图可能因页面未稳定而卡住，重试即秒回）。
- 守护进程不可达的优雅报错 + 自愈路径（`kimi_webbridge_start_daemon`），已用 `--patch` 指向死端口实测。
- schema 严格性经真实 `@deepseek-ai/dsh-tools` 编译 + raw-JSON-schema 边界校验（`tests/smoke.mjs`）。

**未完成 / 已知限制**
- 严格校验 `event.isTrusted` 的网站（银行门户、验证码）会忽略 `fill`/`click`——需手动操作。协议层面可用 `cdp` 发受信输入，但属高级用法。
- 跨源 iframe 不在范围内：`snapshot`/`click`/`fill`/`evaluate` 只作用于顶层框架。
- `session` 按 **profile** 隔离而非按 agent：子 agent 共享同一标签分组。按 agent 隔离是未来想法（见路线图）。
- 尚无 `status`/健康检查工具（守护进程有 `GET /status`，但还没有对应的工具——适合作为第一个贡献）。
- macOS/Linux 代码路径存在但未真机验证。
- CDP 受扩展暴露面限制（`Browser.*` 等浏览器级域不可用）。

## 🗺️ 路线图——可行的路与走不通的路

**可行的路**
- ✅ **直接 HTTP 调守护进程**（本插件）——今天 WebBridge 暴露的唯一接口。
- ✅ 按 profile 命名 session；配置化工具开关（`startDaemonTool`）。
- 🔜 基于 `GET /status` 的健康检查工具；按 agent 的 session 映射；单个工具的配置化启停。
- 🔜 待 harness API 稳定后发布到 npm。

**走不通的路（别去）**
- ❌ **用 `@deepseek-ai/dsh-mcp-client` 挂载**——WebBridge **没有 MCP 端点**（`/mcp`、`/sse` 均 404，只有 `/command` 与 `/status`）。Exa 那类 MCP 路线不适用。
- ❌ **OAuth 登录流程**（类似 `mcp.exa.ai?login`）——守护进程桥不支持；WebBridge 也没有 API key 的概念。
- ❌ **守护进程生命周期除 `start` 外的一切**——插件绝不执行 `stop`/`restart`/`uninstall`，那始终是用户的事。
- ❌ **无头 / 虚拟机自动化**——模型以"你"的身份在你的浏览器里操作；这不是爬虫或 CI 工具。

## 🔐 安全

- 守护进程只监听 `127.0.0.1`；模型以"你"的身份操作你的浏览器。请留意你的 harness 允许它做什么。
- 插件**不存储、不发送任何凭据**，**零文件系统访问**，从不修改 `deepseek-harness` 安装。
- `kimi_webbridge_cdp` 与 `kimi_webbridge_evaluate` 功能强大；不可信模型策略下应禁用它。

## 🧪 验证安装

```sh
node tests/smoke.mjs
```

离线注册 + schema 边界检查始终运行；守护进程可达时还会跑在线端到端（navigate → snapshot → evaluate → screenshot → close）。

## 🙏 致谢

- **[DeepSeek](https://www.deepseek.com)**——感谢 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent 运行时及其插件架构（`dsh`、Cordis、`dsh-tools`）。
- **[Moonshot AI（月之暗面）](https://www.moonshot.cn)**——感谢 [Kimi WebBridge](https://www.kimi.com/zh-cn/features/webbridge)，本插件驱动的本地浏览器桥。
- **Koishi/Cordis 生态**——感谢 DeepSeek Harness 所基于的插件框架（`cordis`、`schemastery`），本插件遵循其约定。

## 📌 版本与兼容性

- **插件版本：** 0.1.0
- **实测环境：** dsh 0.1.0-rc.7 · Node 24（要求 ≥18）· Kimi WebBridge 守护进程 v1.11.5 / 扩展 1.11.5 · Windows
- **依赖：** 零声明——`@deepseek-ai/dsh-tools` 运行时由 harness 安装解析（不会从 registry 装副本）

## 📚 更多文档

- [工程文档](docs/engineering.md) · [标准术语表](docs/glossary.md) · [API 参考](docs/api-reference.md) · [解决方案与踩坑](docs/solutions.md)

## 📄 License

[MIT](LICENSE)。非 DeepSeek 或 Moonshot 官方产品。WebBridge 是 Moonshot AI 的产品。
