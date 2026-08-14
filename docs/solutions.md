# dsh-kimi-webbridge 解决方案文档（踩坑 / 疑难 / 方法论）

> 按"现象 → 根因 → 解决方案 → 出处"组织。所有问题均在本项目开发与真机实验中实际发生并解决。
> 官方源码路径均指 <https://github.com/deepseek-ai/deepseek-harness/tree/master>（下文缩写 `dsh/`）；实测环境 dsh v0.1.0-rc.6。

---

## P1 测试桩遮蔽真实库，插件运行时注册失败（UNSUPPORTED_SCHEMA）

**现象**：`dsh --profile headless` 启动即失败：

```
unsupported JSON schema: schema.properties.success.description annotation must be lossless JSON data;
schema.properties.success.required is not supported on type "boolean"; …
at assertSupportedJsonSchema (dsh-tools/lib/index.js)
at Proxy.register … at register (index.js:200)
```

**根因**：离线测试用的桩 `node_modules/@deepseek-ai/dsh-tools`（透传 defineTool 不编译）残留在包根。`dsh plugin add ./DSHKimiWebBridge` 以 `link:` 方式安装，运行时 Node 从项目目录**先命中桩**，作者形 schema（属性级 `required:true`、`description:undefined`）直达真实注册表的 `assertSupportedJsonSchema` 被拒。

**解决方案**：
- 桩移入 `tests/stub/@deepseek-ai/dsh-tools`（不参与运行时解析）；`node_modules/` 只由测试在运行期创建。
- `tests/smoke.mjs` part 0 按优先级链接**真实**库：`$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-tools`（healed closure）→ npm 全局 dsh 安装副本 → 兜底桩。

**出处**：
- 修复：`tests/smoke.mjs`（part 0 链接逻辑）、`tests/stub/`、`.gitignore`
- 官方机制：`dsh/packages/boot/app-boot/src/profile.ts`（healed closure）；`dsh/apps/cli/src/plugin.ts`（link: 安装与 reconcile）

## P2 `description: undefined` 注解被编译期拒绝

**现象**：`valueSchemaSpecToJsonSchema` 在 **defineTool 编译期**抛错（比 P1 更早，且在纯真库下独立存在）：

```
schema.properties.success.description annotation must be lossless JSON data; … must be a string
```

**根因**：schema 助手 `req({type:'boolean'})` 展开后含 `description: undefined` 键。作者 DSL 编译 `copyAnnotations` 按 `hasOwn` 拷贝，`description:undefined` 残留进 raw schema；`assertSupportedJsonSchema` 要求注释必须是**无损 JSON 数据**（undefined 不是）。

**解决方案**：`req`/`opt` 仅在显式提供描述时附加 `description`：

```js
const req = (schema, description) => ({
  ...schema, required: true,
  ...(description === undefined ? {} : { description }),
})
```

**出处**：
- 修复：`index.js`（`req`/`opt` 定义）
- 官方规则：`dsh/packages/core/tools/src/schema.ts`（`assertAuthorKeys`、`copyAnnotations`）与 `lib` 内 `assertSupportedJsonSchema`
- 回归闸门：`tests/smoke.mjs` part 1e（编译产物中 description 必须为字符串）

## P3 ParameterSchemaSpec 不支持 `minimum` / `maximum`

**现象**：`quality: {type:'integer', minimum:0, maximum:100}` 注册即抛 "…minimum is not supported by the value schema DSL"。

**根因**：作者 DSL 的 number/integer 节点词汇表只有 `type/enum/const`（+注释）；数值区间约束不在 DSL 内（须用 `enum`/`const` 或交给描述文本/execute 校验）。

**解决方案**：删除 `minimum`/`maximum`，约束写进描述（"JPEG quality 0-100 (jpeg only)"）。

**出处**：
- 修复：`index.js`（screenshot.quality、save_as_pdf.scale）
- 官方规则：`dsh/packages/core/tools/src/schema.ts`（`assertAuthorKeys` 的 scalar case）
- 排查工具：`tests/smoke.mjs` part 1d 词汇表复刻

## P4 输出 schema 的 required 用法：作者形 vs 编译形

**现象**：对输出 schema 手写 JSON Schema（属性级 `required`）注册失败（同 P1 的 required 违规）。

**根因**：`assertSupportedJsonSchema` 只允许 `required` 出现在 **object 类型节点**（值为字符串数组）。作者 DSL 的逐属性 `required:true` 必须经 `defineTool` 编译，由 property-map 提升为对象级 `required:["url",…]`（编译产物里属性节点不再携带 required）。

**结论（规范用法）**：输出/参数 schema 一律写作者形（逐属性 `required:true`），交给 `defineTool` 编译；**禁止**手写 raw JSON Schema 直传 `ctx.tools.register`（除非走 raw ToolDefinition 路径并自行通过边界校验）。

**出处**：
- 官方：`dsh/packages/core/tools/src/schema.ts`（`parameterSchemaSpecToJsonSchema` 的 required 提升）；`docs/cookbook/adding-a-tool.md`
- 验证：真机 probe 输出编译产物（required 数组化）→ 沉淀为 `tests/smoke.mjs` part 1e

## P5 新标签后首次截图卡顿，重试秒回

**现象**：navigate 后立即 screenshot，请求挂起超过 25 s（`requestTimeoutMs` 触发）；同一标签稍后重试 0.2 s 返回。

**根因**：守护进程在等待新标签渲染/页面稳定（daemon 行为，非插件 bug；经真机多次复现确认）。

**解决方案**：对幂等的捕获类工具（screenshot、save_as_pdf）启用 `retryOnTimeout`：超时（排除 exec.signal 取消）→ sleep 1.5 s → 重试 1 次。非幂等动作（navigate 等）绝不自动重试。

**出处**：
- 修复：`index.js`（`callDaemon` options、两个工具的 `{retryOnTimeout:true}`）
- 实测记录：`docs/api-reference.md` §3 约束；`README.zh-CN.md` 故障排查表

## P6 守护进程不可达的错误处理与自愈

**现象**：daemon 未运行时调用任何工具 → fetch 失败。

**解决方案**（分层）：
1. 网络级错误报错附带操作指引：`Kimi WebBridge daemon unreachable at … Start it with kimi_webbridge_start_daemon (or manually, then retry). Check … : <帮助URL>`；
2. `kimi_webbridge_start_daemon`：spawn 二进制（`detached`+`unref`，**绝不 stop/restart/uninstall**）→ 20 s 轮询 `/command list_tabs` 就绪 → `{started:true|false, error?}`；
3. 行为测试确认：`--patch` 覆盖 `baseUrl` 为死端口，模型收到优雅错误并得到自愈指引（见实验 D）。

**出处**：
- 修复：`index.js`（`requestDaemon` 错误分支、start_daemon 实现）
- 官方行为基准：WebBridge 帮助 <https://www.kimi.com/zh-cn/features/webbridge>

## P7 evaluate 返回 `undefined` 时守护进程省略 `value` 键

**现象**：JS 求值结果为 `undefined`（含 void 返回的 async 代码）时，daemon 返回 `{"type":"undefined"}`（JSON 无法表达 undefined），必填 `value` 的输出 schema 校验失败（`missing required property "value.value"`）——真实行为测试（任务 B 第 6 步）暴露。

**解决方案**：保持 schema 严格，在 execute 层归一化 canonical 值：

```js
return { type: data?.type ?? 'undefined', value: data?.value ?? null }
```

与 harness 规范一致：execute 必须返回 schema 声明的 canonical 值，数据修补发生在 execute 内。

**出处**：
- 修复：`index.js`（`kimi_webbridge_evaluate` 的 execute）
- 规范：`dsh/docs/cookbook/adding-a-tool.md`（canonical value 契约）

## P8 Windows 环境下 pnpm / corepack 环境坑（开发环境）

**现象**：
- `dsh plugin` 报 "pnpm not found on PATH"（`apps/cli/src/plugin.ts` spawnSync `pnpm`，Windows 经 shell 调 `.cmd` shim）；
- `corepack enable pnpm` 报 `EPERM … C:\Program Files\nodejs\pnpx`（写系统目录需管理员）。

**解决方案**：`npm install -g pnpm`（写入用户 `AppData\Roaming\npm`，已在 PATH 上），实测 pnpm v11.21.0。

**出处**：`dsh/apps/cli/src/plugin.ts`（pnpm 转发与 ENOENT 提示）；本仓库开发记录

## P9 PowerShell 内联 JSON 损坏（WebBridge 调用侧坑）

**现象**：`curl -d '{"action":…}'` 在 PowerShell 下被引号/管道损坏，daemon 返回 `invalid JSON … write the JSON body to a fresh temp file`；非 ASCII（中文）会变成 `?`。

**解决方案**：请求体写入唯一命名临时文件，`curl.exe --data-binary @文件`；用后即删。本插件走 Node `fetch`（JSON 序列化），无此问题。

**出处**：WebBridge 官方工具说明（skill 文档）；守护进程错误消息自带指引

## P10 Windows junction 与符号链接权限

**现象**：`fs.symlinkSync(dir, 'junction')` 在 Windows 上无管理员权限也可创建，而 `type:'dir'`（symlink）需要权限。

**解决方案**：`tests/smoke.mjs` part 0 使用 `junction` 类型创建链接（`process.platform === 'win32' ? 'junction' : 'dir'`）。

**出处**：`tests/smoke.mjs`（链接创建逻辑）

## P11 组合树里看不到行 / 行被后层覆盖

**现象**：`--dump-config` 未出现 `kimi-webbridge` 行，或配置未生效。

**根因**：组合顺序为 bundle 层 → profile patch → `$DSH_HOME/cordis.patch.yml` → `--patch` overlay；同一 id 后层**整行替换 config**（不合并）。

**解决方案**：覆盖配置时须重写全部所需键；用 `dsh --profile <p> --dump-config` 核对组合树。

**出处**：`dsh/docs/architecture.md`（组合机制）；`dsh/packages/bundle/base/cordis.patch.yml` 头部注释；本仓库 `cordis.patch.yml` 注释

## P12 dsh rc.6 `dsh plugin remove` 残留 bundles 条目，profile 无法启动

**现象**：`dsh plugin --profile X remove dsh-kimi-webbridge` 后：
- `node_modules` 与 `package.json` 的 `dependencies` 已正确清理；
- 但 `dsh.profile.bundles` **仍残留** `dsh-kimi-webbridge`，`--dump-config` 仍显示该行；
- 启动即失败：`dsh: cannot resolve profile bundle "dsh-kimi-webbridge" from the dsh installation or <profileDir>`；
- 报错提示的自愈命令 `dsh plugin --profile X install` **无效**（实测）。

**归因结论：DeepSeek Harness 侧问题，与插件无关**（已提交官方报告）：
- 对照实验 4/4 通过：`dsh-exa-mcp`（非本插件）link: 卸载正常；本插件 link: 卸载正常；本插件 github: 卸载正常；完整序列重放正常——残留**非确定性复现**；
- 失败现场在 harness `apps/cli/src/plugin.ts` 的 `reconcilePlugins` 路径：`reconcile` 仅在 `exitCode === 0` 时运行；若 pnpm 在**已写 manifest 之后**以非零退出（本机 git 操作反复出现 `HEAD https://github.com/... ETIMEDOUT` 瞬断），reconcile 被跳过；
- 残留条目随后**永久化**：后续每次调用 `wasDependency` 均为 false（依赖已从前后 manifest 消失），移除分支永不触发，条目被当作"用户自有"保留。

**解决方案**：手动编辑 `<profile>/package.json`，从 `dsh.profile.bundles` 数组删除该条目。删除后 profile 恢复启动。

**官方报告**：<https://github.com/deepseek-ai/deepseek-harness/discussions/913>（deepseek-harness 未启用 Issues，使用 Discussions；含根因假设与 3 条修复建议）。

**出处**：`dsh/apps/cli/src/plugin.ts`（`reconcilePlugins` 的 `if (exitCode === 0)` 门控）；实测环境 dsh v0.1.0-rc.6

---

## 方法论

### M1 双层 schema 校验（作者形 + 编译产物）
作者 DSL 词汇表校验（part 1d）只能防"写错 DSL"；真正的杀手是**编译产物边界**（P1/P2/P4）——必须用真实 `defineTool` 编译后做 raw-schema 深遍历（part 1e：注释必须为字符串、`required` 必须为字符串数组）。两层都过才算合规。

### M2 真机 ground truth 优先
对 daemon API：直接 curl 探测真实响应信封（`{ok,data}`/`{ok:false,error}`）再写 schema，而不是猜。对 harness：probe 脚本直接 require 已安装 `@deepseek-ai/dsh-tools`，观察 defineTool 编译产物（P2/P4 的判定依据）。

### M3 最小复现脚本
`assertSupportedJsonSchema` 类错误写 20 行 probe 即可复现（P2）；无需整跑 harness。保留为 `tests/smoke.mjs` 的自动化等价物。

### M4 行为测试按工具分组、验证真实效果
真实 harness 行为测试（模型驱动）按动作域分组（导航/表单/捕获/错误路径），并在任务文本中要求**验证真实结果**（如 fill 后用 evaluate 复核值、upload 后复核 files.length、点击后复核 URL 跳转），避免"调用成功≠行为正确"。

### M5 可逆实验
一切实验走官方可逆路径：profile add/remove（reconcile 自动对账）、`--patch` overlay 按 id 覆盖、`--dump-config` 核对组合、行为测试后 close_session 清理标签组。保证不破坏用户 profile 与 harness 安装。

### M6 错误路径与正常路径同等测试
守护进程不可达（死端口覆盖）、超时（新标签首截）、非法参数、undefine 值——每类都设计一次行为测试或断言（P5/P6/P7 均由此发现）。

### M7 把踩坑固化为回归闸门
每个已解决问题对应一条自动化断言：P1/P2/P4 → part 0/1e；P3 → part 1d；P5 → 在线截图断言（含重试配置）；P6 → 错误消息断言；P7 → evaluate 归一化断言。**不允许只修代码不留测试。**

---

## 文档地址索引

| 问题 | 代码内位置 | 测试内位置 | 官方出处 |
|---|---|---|---|
| P1 桩遮蔽 | `index.js`（无桩） | `tests/smoke.mjs` part 0 | `dsh/packages/boot/app-boot/src/profile.ts` |
| P2 description:undefined | `index.js` `req`/`opt` | part 1e | `dsh/packages/core/tools/src/schema.ts` |
| P3 minimum/maximum | `index.js` screenshot/scale | part 1d | `dsh/packages/core/tools/src/schema.ts` |
| P4 required 用法 | `index.js` 全部 schema | part 1e | `dsh/docs/cookbook/adding-a-tool.md` |
| P5 首截卡顿 | `index.js` `callDaemon` | 在线截图断言 | 守护进程实测行为 |
| P6 不可达自愈 | `index.js` 错误分支 + start_daemon | 在线断言 | `docs/api-reference.md` §3 |
| P7 evaluate 归一化 | `index.js` evaluate execute | 在线断言 | `dsh/docs/cookbook/adding-a-tool.md` |
| P8 pnpm 环境 | — | — | `dsh/apps/cli/src/plugin.ts` |
| P9 PowerShell JSON | — | — | WebBridge 官方工具说明 |
| P10 junction | — | part 0 | Node 文档 |
| P11 组合覆盖 | `cordis.patch.yml` 注释 | — | `dsh/docs/architecture.md` |
| P12 remove 残留 bundles | —（手动改 profile manifest） | 全周期卸载/残留实测 | `dsh/apps/cli/src/plugin.ts` + discussions #913 |
