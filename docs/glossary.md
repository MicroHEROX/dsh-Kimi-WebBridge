# dsh-kimi-webbridge 标准术语表

> 覆盖 DeepSeek Harness（dsh）插件生态、Cordis 框架与本插件使用的 WebBridge 域术语。
> 英文术语为规范名，中文为约定译名；定义均对照官方源码/文档（来源见 [相关链接](#相关链接)）。

## dsh 生态与 Cordis 框架

| 术语 | 定义 |
|---|---|
| **dsh** | DeepSeek Harness 的命令行入口（`npx @deepseek-ai/dsh`），以 "一切皆插件" 的 Cordis 组合加载 profile 并启动应用 |
| **harness / 安装** | dsh CLI 自身及其依赖包图（本文指本机 `AppData\Roaming\npm\node_modules\@deepseek-ai\dsh` 之类安装物）；本插件承诺零修改 |
| **profile** | 一个可启动的组合：`$DSH_HOME/profiles/<name>/` 下的 `package.json`（含 `dsh.profile.bundles` 层列表）+ 用户 `cordis.patch.yml`。模板：`web`、`headless` |
| **bundle** | 分发单元：声明 `dsh.bundle.patch` 的 npm 包；其 patch 文件在组合中贡献一行或多行 |
| **cordis.yml / cordis.patch.yml** | 组合描述文件：`- insert:` 下若干**行（row）**；patch 按行 id 覆盖，后层胜出 |
| **行（row）** | 组合中的一项：`{id, name, config?, disabled?, inject?}`；`name` 为包名或模块路径 |
| **层（layer）/ 层栈** | 按序应用的 patch：bundle 层 → profile patch → `$DSH_HOME/cordis.patch.yml` → `--patch` overlay；同一行 id 后层整行替换 config |
| **loader（加载器）** | `@deepseek-ai/cordis-plugin-loader`（vendor）：按层解析行、经 Node ESM 解析入口模块、调度 apply |
| **插件模块（plugin module）** | 导出 `name` / `inject` / `apply(ctx, config)`（可选 `Config` schema）的 ESM 模块 |
| **inject** | 声明 apply 前必须就绪的服务键（如 `['tools']`），Cordis 据此等待 |
| **ctx（Context）** | Cordis 上下文：服务注册、事件、作用域与生命周期 |
| **fiber** | 插件激活状态机：PENDING → LOADING → ACTIVE；卸载/热更时 dispose |
| **HMR** | `@deepseek-ai/cordis-plugin-hmr`：插件源码热替换，注册物随上下文自动清理 |
| **healed closure** | `$DSH_HOME/profiles/node_modules` 的扁平 junction 闭包（`healProfilesModuleFallback`），让 out-of-tree 插件通过 Node 父级回溯解析到 dsh 安装内的 `@deepseek-ai/*` 副本 |
| **reconcilePlugins** | `dsh plugin` 成功后按已安装状态重写 `dsh.profile.bundles`；只增删依赖管理的条目，模板 bundle 永不触碰 |
| **service（服务）** | 由插件提供/消费的命名能力（`ctx.tools`、`ctx.sessions`、`ctx.systemPrompt`…） |
| **dsh-tools** | `@deepseek-ai/dsh-tools`：工具注册表 + schema DSL + `defineTool` 助手 + 执行管线 |
| **ToolDefinition** | 工具定义：`{name, description, parameters, output, execute, …}`（可含 `presentCall`/`presentResult`/`timeoutMs`/`isConcurrencySafe`） |
| **defineTool** | 作者向工厂：把 **ParameterSchemaSpec / ValueSchemaSpec** 编译为受支持 raw JSON Schema，并包上参数校验 |
| **ParameterSchemaSpec** | 参数 DSL：属性表，逐属性 `required: true`；编译为对象根 + `required` 数组 |
| **ValueSchemaSpec** | 输出值 DSL：`string/number/integer/boolean/null/array/object/json/oneOf`；object 必须显式 `additionalProperties`；`json` = 任意无损 JSON |
| **assertSupportedJsonSchema** | raw JSON Schema 边界校验：注释必须是无损 JSON 数据；`required` 仅允许出现在 object 类型节点（值为字符串数组） |
| **ToolArgsError** | 模型参数校验失败：`INVALID_ARGS`，含逐条 violations |
| **output.schema / render** | 工具 canonical 输出的 schema 与纯渲染函数（返回 `ContentBlock[]`，如 `{type:'text', text}`） |
| **canonical value** | `execute` 必须返回的、与 `output.schema` 严格一致的 JSON 值；注册表会校验/冻结 |
| **exec（ToolRunContext）** | 执行上下文：`{token, callId, name, arguments, signal, agent?, parent?}`；`signal` 为取消信号，execute 必须尊重 |
| **spill** | 大结果外溢策略：`dsh-spill-policy` 默认 `maxInlineBytes: 50000`，与 `maxRenderText` 对齐 |
| **system-prompt 组装** | `ctx.systemPrompt` 把已注册工具 schema 注入每次模型请求（模型"看见"工具的方式） |
| **tools/pre-execute、tools/execute** | 执行管线守卫/执行事件（权限、超时、度量挂载点） |
| **JSON-RPC / ACP / Code Mode** | dsh 对外协议：stdio JSON-RPC、Agent Client Protocol、`run_code` 传输（本插件不涉及） |
| **dsh-mcp-client** | dsh 自带 MCP 客户端桥（挂远端 MCP 端点用）。WebBridge 无 MCP 端点，本插件不使用 |

## WebBridge 域

| 术语 | 定义 |
|---|---|
| **Kimi WebBridge** | Moonshot AI 的浏览器桥产品：浏览器扩展 + 本地守护进程，让 AI 操控用户真实浏览器（含登录态） |
| **守护进程（daemon）** | 本机服务，监听 `http://127.0.0.1:10086`；二进制 `%USERPROFILE%\.kimi-webbridge\bin\kimi-webbridge.exe`（Windows）/ `~/.kimi-webbridge/bin/kimi-webbridge`（POSIX） |
| **`/command` 端点** | `POST {baseUrl}/command`，体：`{action, args, session}`；响应 `{ok:true, data}` 或 `{ok:false, error:{code, message}}` |
| **action（工具动作）** | daemon 命令名：navigate / find_tab / list_tabs / snapshot / click / fill / evaluate / cdp / screenshot / network / upload / save_as_pdf / close_tab / close_session（以及插件侧的 start_daemon） |
| **session** | WebBridge 会话名：**一个任务 = 一个 session = 一个标签分组**；请求体顶层字段，全任务保持稳定 |
| **tab group（标签分组）** | 同一 session 打开的标签构成的分组；`group_title` 为其人类可读标签（首次 navigate 设置） |
| **@e ref** | snapshot 无障碍树中交互元素的引用（如 `@e123`）；优先于手写 CSS 选择器（可免疫 CSS 哈希变化） |
| **accessibility tree（无障碍树）** | snapshot 返回的页面可读结构：`{role, name, ref, children}` |
| **contenteditable** | 富文本编辑区（ProseMirror/TipTap/Lexical/Slate…）；`fill` 对 input/textarea 与 contenteditable 均有效 |
| **event.isTrusted** | 浏览器原生事件标记；严格校验的站点会忽略合成事件（`click`/`fill` 失效时需人工介入） |
| **chrome.debugger** | 浏览器扩展 API；`cdp` 动作的底层透传通道（高级逃生舱） |
| **会话内标签（session tab）** | 本会话打开的标签；`find_tab` 默认只搜索本会话标签，`active:true` 可借用用户正在看的标签 |

## 测试相关

| 术语 | 定义 |
|---|---|
| **author 形 schema** | `defineTool` 输入的作者 DSL（含逐属性 `required:true`） |
| **编译后（compiled）raw schema** | defineTool 输出、注册表校验的 raw JSON Schema（`required` 为对象级数组） |
| **tests/stub** | 离线兜底桩（`@deepseek-ai/dsh-tools` 透传实现），仅在无 dsh 安装的机器上被 smoke 测试使用；**不得出现在包根 `node_modules/`**（会遮蔽真实库） |
| **part 1e 边界校验** | smoke 测试对真实 defineTool 编译产物做的深遍历（注释必须是字符串、required 必须是字符串数组） |

## 相关链接

- dsh 架构：<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/architecture.md>
- 添加工具 cookbook：<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cookbook/adding-a-tool.md>
- 扩展 cookbook：<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cookbook/extension-cookbook.md>
- 插件发布：<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/user/develop/basic/publish.md>
- 核心源码：`packages/core/tools/src/schema.ts`、`apps/cli/src/plugin.ts`、`packages/boot/app-boot/src/profile.ts`
- WebBridge 帮助：<https://www.kimi.com/zh-cn/features/webbridge>
