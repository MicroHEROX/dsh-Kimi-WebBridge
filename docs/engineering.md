# dsh-kimi-webbridge 工程文档

> 面向 DeepSeek Harness（`dsh`）的第三方插件 bundle：通过 Kimi WebBridge 本地守护进程把用户真实浏览器（含登录态）开放为 15 个原生 `kimi_webbridge_*` 工具。
> 适用版本：dsh v0.1.0-rc.6（已实测）；WebBridge 守护进程（Windows 实测）。

## 1. 项目概述

| 项 | 值 |
|---|---|
| 包名 | `dsh-kimi-webbridge` |
| 形态 | Cordis 插件 bundle（`dsh.bundle.patch`） |
| 运行时 | 纯 Node ESM，Node ≥ 18，无构建步骤 |
| 依赖 | 零依赖：`@deepseek-ai/dsh-tools` 运行时经 healed closure 由 dsh 安装解析（声明 peerDependencies 会诱导 pnpm 从 registry 装副本并遮蔽 closure，故不声明） |
| 对外能力 | 15 个 `kimi_webbridge_*` 工具（见 `docs/api-reference.md`） |
| 不改动 | `deepseek-harness` 安装文件、`$DSH_HOME` 配置（零文件系统访问） |

## 2. 目录结构

```
DSHKimiWebBridge/
├── package.json          # bundle 清单：dsh.bundle.patch → cordis.patch.yml
├── cordis.patch.yml      # 组合层：插入 {id: kimi-webbridge} 行及默认配置
├── index.js              # 插件模块：name/inject/apply + 15 工具注册 + HTTP 客户端
├── tests/
│   ├── smoke.mjs         # 冒烟测试：真实 dsh-tools 链接 + 离线校验 + 在线端到端
│   └── stub/@deepseek-ai/dsh-tools/   # 离线兜底桩（无 dsh 环境时使用，非发布物）
├── docs/                 # 本文档集
├── README.md / README.zh-CN.md
└── LICENSE / .gitignore  # node_modules/ 与 *.log 忽略
```

`node_modules/` 仅由 `tests/smoke.mjs` 在运行期创建（指向真实 dsh-tools 的 junction），不提交、不参与运行时解析。

## 3. 架构与数据流

```
┌─ deepseek-harness 进程 ─────────────────────────────────────────┐
│  cordis.yml 组合 → loader 解析行 {id: kimi-webbridge}            │
│       │ Node ESM 解析包名 → index.js                              │
│       ▼                                                          │
│  apply(ctx, config)  (inject: ['tools'] 等待服务就绪)            │
│       │ ctx.tools.register(defineTool(def)) × 15                 │
│       ▼                                                          │
│  工具注册表 → system-prompt 组装 schema 注入模型请求              │
│       │                                                          │
│  模型调用工具 → validateArgs（INVALID_ARGS 拒绝）→ execute        │
│       │ exec.signal（取消）+ requestTimeoutMs 超时                │
│       ▼                                                          │
│  POST {baseUrl}/command  {action, args, session}                 │
└───────┬──────────────────────────────────────────────────────────┘
        ▼ 127.0.0.1:10086
┌─ Kimi WebBridge 守护进程 ────────────────────────────────────────┐
│  响应 {ok:true, data} | {ok:false, error:{code,message}}         │
└───────┬──────────────────────────────────────────────────────────┘
        ▼ chrome.debugger 扩展
┌─ 用户真实浏览器（含登录态）───────────────────────────────────────┘
```

失败路径：
- 守护进程不可达 → `fetch failed` → 报错信息附带 `kimi_webbridge_start_daemon` 提示与帮助 URL；
- 超时（仅 screenshot / save_as_pdf）→ 自动重试 1 次（新标签首次截图可能卡顿，重试即秒回）；
- 守护进程返回 `ok:false` → 原样透传 `error.message`。

## 4. 模块设计（index.js）

| 段 | 职责 | 说明 |
|---|---|---|
| `DEFAULT_CONFIG` / `normalizeConfig` | 配置默认值与校验 | 非法配置抛带操作指引的错误，符合 harness "配置错误即可操作化" 约定 |
| `daemonBinPath` | 守护进程二进制路径 | Windows `%USERPROFILE%\.kimi-webbridge\bin\kimi-webbridge.exe`；POSIX `~/.kimi-webbridge/bin/kimi-webbridge`；`daemonBin` 可覆盖 |
| `withAbort` | 信号合成 | `exec.signal` + `requestTimeoutMs` 超时 → 单一 AbortSignal；`timedOut()` 区分超时与取消 |
| `requestDaemon` | HTTP 单次请求 | 解析 `{ok,data}/{ok:false,error}` 信封；网络错误分类（timeout / unreachable / 非法响应） |
| `callDaemon` | 带重试的请求 | `retryOnTimeout:true` 时超时后 sleep 1.5 s 重试 1 次（幂等捕获类工具专用） |
| `cleanArgs` | 参数清洗 | 丢弃 `undefined`，避免把未传可选参数序列化成显式 null |
| `renderJson` | 渲染 | `[{type:'text', text}]`，超 `maxRenderText` 截断 |
| `obj`/`req`/`opt` | schema 助手 | `req`/`opt` 仅在提供描述时附加 `description`（见 `docs/solutions.md` #2） |
| `exec` | 通用 execute 工厂 | 大部分工具共用；参数与 daemon action 一一对应 |
| 工具注册 | 15 个 `defineTool` 调用 | 参数即 daemon 参数名（`group_title`、`newTab`、`paper_format`…）；输出 schema 与实测信封逐键对齐 |
| `kimi_webbridge_start_daemon` | 特殊实现 | spawn 二进制（`detached`+`unref`）→ 20 s 轮询就绪 → `{started}`；不走 `/command` |
| `kimi_webbridge_evaluate` | 特殊实现 | `value ?? null` 归一化（见 `docs/solutions.md` #7） |

## 5. 生命周期

1. **安装**：`dsh plugin --profile <p> add ./DSHKimiWebBridge`（pnpm 在 profile 目录运行，成功后 `reconcilePlugins` 按"是否声明 `dsh.bundle`"把包加入层栈）。替代路径：`--patch` overlay / 手动合并 `$DSH_HOME` patch（见 `README.zh-CN.md`）。
2. **加载**：loader 组合各层 → 解析行 → ESM 解析包名（peer 依赖经 `$DSH_HOME/profiles/node_modules` 的 healed closure 解析到 dsh 安装内副本）。
3. **注册**：`apply(ctx, config)` 在 `inject:['tools']` 就绪后执行；`defineTool` 编译并校验 schema（编译期失败会中止加载并给出 `UNSUPPORTED_SCHEMA` 明细）。
4. **调用**：模型按注入的 schema 调用；注册表先 `validateArgs` 再执行；`execute` 返回 canonical 值经输出 schema 校验后进入会话。
5. **卸载**：`dsh plugin --profile <p> remove dsh-kimi-webbridge` → 依赖移除 → 层栈摘除 → 工具随插件上下文 dispose 注销。模板 bundle 永不被触碰。

## 6. 配置键（行 `config:`）

| 键 | 默认 | 说明 |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:10086` | 守护进程端点 |
| `session` | `dsh` | WebBridge 侧标签分组名；一个 profile 一个名字 |
| `requestTimeoutMs` | `120000` | 单请求超时（截图/导航可能较慢） |
| `startDaemonTool` | `true` | 是否暴露 `kimi_webbridge_start_daemon` |
| `daemonBin` | `null` | 覆盖守护进程二进制路径 |
| `maxRenderText` | `50000` | 渲染文本上限（对齐 dsh spill 默认） |

覆盖方式：profile patch / `--patch` overlay 按 id `kimi-webbridge` 整行重写。

## 7. 开发与验证工作流

```sh
# 1. 静态检查
node --check index.js

# 2. 冒烟测试（自动链接真实 dsh-tools，回退 tests/stub）
node tests/smoke.mjs
#   part 0  链接真实 @deepseek-ai/dsh-tools（healed closure → npm 全局 dsh）
#   part 1  15 工具注册 / 配置校验 / start_daemon 语义
#   part 1e 真实 defineTool 编译 + 编译产物 raw-schema 边界深遍历
#   part 2  在线端到端（守护进程可达时）：navigate→snapshot→evaluate→screenshot→list_tabs→close_session

# 3. 真实 harness 行为测试（headless profile）
dsh --profile headless "…任务…"

# 4. 主 profile 启动复核
dsh --profile web   # 20~30 s 观察日志无 kimi 相关报错

# 5. 卸载验证
dsh plugin --profile headless remove dsh-kimi-webbridge   # 可选，验证可逆
```

## 8. 分发与发布

- npm 发布：`package.json` 已声明 `files`（index.js / cordis.patch.yml / README×2 / LICENSE）、`dsh.bundle.patch`、`dsh-plugin` 关键词与 GitHub topic。
- git 安装：无 `prepare` 脚本 → 无需 `allowBuilds` 授权。
- 版本兼容：peer 依赖 `*`；已实测 dsh v0.1.0-rc.6 的 `@deepseek-ai/dsh-tools` 编译与边界规则。上游 schema DSL 变更时以 `tests/smoke.mjs` part 1e 作为回归闸门。

## 9. 相关文档索引

| 文档 | 内容 |
|---|---|
| `docs/glossary.md` | 标准术语表（dsh 生态 + WebBridge 域） |
| `docs/api-reference.md` | 15 工具 API、配置 API、内部函数、WebBridge HTTP API |
| `docs/solutions.md` | 踩坑记录、疑难问题、解决方案与方法论（含出处地址） |
| `README.md` / `README.zh-CN.md` | 用户向安装/使用/故障排查（默认英文，可切换中文） |
