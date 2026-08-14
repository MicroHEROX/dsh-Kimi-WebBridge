# dsh-kimi-webbridge API 参考

> 三部分：(1) 模型向工具 API（15 个 `kimi_webbridge_*`）；(2) 部署配置 API 与插件模块导出；(3) WebBridge 守护进程 HTTP API（插件背后的协议）。
> 参数名与守护进程 action 参数一一对应；输出 schema 与实测响应信封逐键对齐（dsh v0.1.0-rc.6 + Windows 守护进程实测）。

## 1. 工具 API（ctx.tools 注册，经 defineTool 编译）

通用行为：
- 请求体固定携带 `session`（来自配置，全任务稳定）。
- 错误：守护进程不可达 → 附带 `kimi_webbridge_start_daemon` 提示；`ok:false` → 透传 daemon `error.message`。
- 取消：`exec.signal` 中止请求；超时由 `requestTimeoutMs` 控制。
- 渲染：`render` 返回 `[{type:'text', text:<紧凑 JSON>}]`，超过 `maxRenderText` 截断。

### 1.1 kimi_webbridge_navigate
打开 URL。任务的第一次调用设置 `group_title`（用户语言的短标签）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `url` | string | ✓ | 完整 URL |
| `newTab` | boolean | | true=新标签；省略=当前标签跳转 |
| `group_title` | string | | 分组人类标签，仅首次设置 |

输出：`{success:boolean, url:string, tabId:integer}`（additionalProperties:false）

### 1.2 kimi_webbridge_find_tab
按完整 URL 重新选中本会话标签；`active:true` 借用用户正在看的标签。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `url` | string | ✓ | 完整 URL（取自 navigate 结果或 list_tabs） |
| `active` | boolean | | true=使用用户当前查看的标签 |

输出：`{success:boolean, url?, tabId?, borrowed?}`（开放对象）

### 1.3 kimi_webbridge_list_tabs
列出本会话标签。无参数。
输出：`{success:boolean, tabs:<json>`（tabs 形如 `[{tabId,url,title,active,groupTitle}]`）

### 1.4 kimi_webbridge_snapshot
读取当前标签无障碍树（页面内容的主要读取方式）。无参数。
输出：`{url:string, title:string, tree:<json>`（tree 节点含 `role/name/ref/children`，交互元素带 `@e` 引用）

### 1.5 kimi_webbridge_click
点击元素（合成 `el.click()`）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `selector` | string | ✓ | `@e` 引用（首选）或 CSS 选择器 |

输出：`{success:boolean, tag?, text?}`（开放对象）

### 1.6 kimi_webbridge_fill
清空并插入文本；input/textarea 与 contenteditable 富文本均有效。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `selector` | string | ✓ | `@e` 引用或 CSS 选择器 |
| `value` | string | ✓ | 插入文本（替换现有内容） |

输出：`{success:boolean, tag?, mode?}`（mode ∈ `value|contenteditable`，开放对象）

### 1.7 kimi_webbridge_evaluate
在页面执行 JS（支持 async/await）。
> 实现注：守护进程对 `undefined` 结果省略 `value` 键，本工具在 execute 层归一化为 `value ?? null`、`type ?? 'undefined'`（见 `docs/solutions.md` #7）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | ✓ | JavaScript 代码 |

输出：`{type:string, value:<json>}`（additionalProperties:false）

### 1.8 kimi_webbridge_cdp
原始 `chrome.debugger` 透传（高级逃生舱）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `method` | string | ✓ | CDP 方法（如 `Page.getLayoutMetrics`） |
| `params` | json | | CDP 参数 |

输出：`<json>`（原始 CDP 结果；扩展不支持的方法会透传 daemon 错误）

### 1.9 kimi_webbridge_screenshot
截图（视口或指定元素）。守护进程写盘并返回文件路径（用文件工具读取）。
> 实现注：`retryOnTimeout:true` —— 新标签后首次截图可能因页面未稳定卡住，超时后自动重试 1 次（重试通常秒回）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `format` | string | | `png`(默认) \| `jpeg` |
| `quality` | integer | | JPEG 质量 0–100 |
| `selector` | string | | `@e` 或 CSS，仅截取该元素 |
| `path` | string | | 自定义输出路径（唯一名；已存在则覆盖） |

输出：`{format:string, path:string, sizeBytes:integer, mimeType:string}`（additionalProperties:false）

### 1.10 kimi_webbridge_network
网络抓包：start / stop / list / detail。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `cmd` | string | ✓ | enum `start\|stop\|list\|detail` |
| `filter` | string | | URL 子串过滤（list） |
| `requestId` | string | | 请求 id（detail） |

输出：`<json>`（list 形如 `{count, requests}`）

### 1.11 kimi_webbridge_upload
向 `<input type=file>` 设置文件。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `selector` | string | ✓ | `@e` 或 CSS 选择器 |
| `files` | array[string] | ✓ | 文件**绝对路径**列表 |

输出：`{success:boolean, fileCount?, …}`（开放对象）

### 1.12 kimi_webbridge_save_as_pdf
把当前页面渲染为 PDF（守护进程写盘返回路径）。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `paper_format` | string | | enum `letter\|a4\|legal\|a3\|tabloid` |
| `landscape` | boolean | | 横向（默认 false） |
| `scale` | number | | 0.1–2.0（默认 1.0） |
| `print_background` | boolean | | 保留背景色（默认 true） |
| `path` | string | | 自定义输出路径（唯一名） |

输出：`{path:string, sizeBytes?, mimeType?, pageTitle?}`（开放对象）
> 实现注：同 screenshot，`retryOnTimeout:true`。

### 1.13 kimi_webbridge_close_tab
关闭当前标签。无参数。
输出：`{success:boolean, closed?}`（开放对象）

### 1.14 kimi_webbridge_close_session
关闭整个标签分组（仅当用户明确要求）。无参数。
输出：`{success:boolean, closed:integer}`（additionalProperties:false）

### 1.15 kimi_webbridge_start_daemon
启动本地守护进程（安全，已运行时为空操作）。`startDaemonTool:false` 时不注册。
> 实现注：spawn 二进制（`detached`+`unref`，绝不执行 stop/restart/uninstall）→ 20 s 轮询就绪。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| （无） | | | |

输出：`{started:boolean, daemonBin:string, baseUrl:string, error?}`（开放对象）

## 2. 部署配置与模块导出

### 2.1 行配置（cordis.patch.yml / 覆盖层，按 id `kimi-webbridge`）

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `baseUrl` | string | `http://127.0.0.1:10086` | 守护进程端点（http/https） |
| `session` | string | `dsh` | WebBridge 分组名，非空 |
| `requestTimeoutMs` | number | `120000` | 单请求超时，正数 |
| `startDaemonTool` | boolean | `true` | 是否注册 start_daemon 工具 |
| `daemonBin` | string\|null | `null` | 覆盖守护进程二进制路径 |
| `maxRenderText` | number | `50000` | 渲染文本上限，正数 |

非法配置：加载时抛错并列出全部违规项（`kimi-webbridge: invalid config: …`）。

### 2.2 模块导出（index.js）

| 导出 | 值 | 说明 |
|---|---|---|
| `name` | `kimi-webbridge` | 插件标识（kebab） |
| `inject` | `['tools']` | 等待工具服务就绪 |
| `apply(ctx, config)` | function | 校验配置 → 注册 15（或 14）个工具 |

### 2.3 内部函数（非公共 API，供维护参考）

| 函数 | 签名要点 | 职责 |
|---|---|---|
| `normalizeConfig(config)` | → cfg | 默认合并 + 逐键校验 |
| `daemonBinPath(cfg)` | → 路径 | 平台化二进制路径 |
| `withAbort(signal, ms)` | → `{signal, timedOut, cleanup}` | 取消+超时合成 |
| `requestDaemon(cfg, action, args, exec)` | → data | 单次请求 + 信封解析 + 错误分类（`kind: 'timeout'`） |
| `callDaemon(cfg, action, args, exec, {retryOnTimeout})` | → data | 超时重试包装 |
| `cleanArgs(args)` | → args | 剔除 undefined |
| `renderJson(value, maxText)` | → ContentBlock[] | 紧凑 JSON 渲染 |
| `obj` / `req` / `opt` | → schema 节点 | schema 助手 |

## 3. WebBridge 守护进程 HTTP API（协议基线）

```
POST http://127.0.0.1:10086/command
Content-Type: application/json
体：{"action":"<action>","args":{...},"session":"<分组名>"}
```
响应信封（实测）：
- 成功：`{"ok":true,"data":{…}}`
- 失败：`{"ok":false,"error":{"code":"<code>","message":"<message>"}}`

已实测的 action 与 data 形状：

| action | 实测 data | 备注 |
|---|---|---|
| navigate | `{success, url, tabId}` | `group_title` 首次设置分组标签 |
| find_tab | `{success, url, tabId, borrowed}` | 按完整 URL |
| list_tabs | `{success, tabs:[{tabId,url,title,active,groupTitle}]}` | |
| snapshot | `{url, title, tree}` | tree 含 `@e` ref |
| click | `{success, tag, text}` | 合成事件 |
| fill | `{mode, success, tag}` | mode=`value`/`contenteditable`；中文等非 ASCII 正常 |
| evaluate | `{type, value}` | `undefined` 时省略 `value` |
| cdp | 原始 CDP 结果 | 不支持的域返回 extension_error 透传 |
| screenshot | `{format, path, sizeBytes, mimeType}` | 写盘返回路径 |
| network | start/stop: `{success, message}`；list: `{count, requests}` | |
| upload | `{success, selector, fileCount, files}` | files=绝对路径数组 |
| save_as_pdf | `{path, sizeBytes, mimeType, pageTitle}` | |
| close_tab | `{success, closed}` | |
| close_session | `{success, closed}` | closed=关闭数 |

其他端点：`GET /status`（200）；`/mcp`、`/sse`、`/health` 均 404（**无 MCP 端点**，故不适用 `@deepseek-ai/dsh-mcp-client`）。

约束（官方行为，插件已内建到工具描述）：
- 新标签后的首次 screenshot/save_as_pdf 可能等待页面稳定（卡顿数秒至数十秒），重试即秒回；
- 严格校验 `event.isTrusted` 的站点会忽略 click/fill；
- 跨源 iframe 内的元素不在顶层框架操作范围内。

## 4. 版本兼容性

- dsh：v0.1.0-rc.6 实测通过（`@deepseek-ai/dsh-tools` 同版）。
- WebBridge：守护进程当前安装版实测；"Please update the Kimi WebBridge extension" 报错 = 扩展版本过旧。
- Node ≥ 18（全局 fetch）；开发环境 Node 24 实测。
