<div align="center">

# Kimi WebBridge for DeepSeek Harness

**Give your DeepSeek Harness agents the user's real browser — with their login sessions.**

[![English](https://img.shields.io/badge/English-README-0d1117?style=for-the-badge&logo=github)](README.md)
[![简体中文](https://img.shields.io/badge/简体中文-README-1f6feb?style=for-the-badge&logo=github)](README.zh-CN.md)

[![version](https://img.shields.io/badge/version-0.1.0-blue)](package.json)
[![dsh](https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-4b6bfb)](https://github.com/deepseek-ai/deepseek-harness)
[![WebBridge](https://img.shields.io/badge/Kimi%20WebBridge-v1.11.5-7c3aed)](https://www.kimi.com/zh-cn/features/webbridge)
[![node](https://img.shields.io/badge/Node-%E2%89%A518-339933?logo=nodedotjs)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-2ea44f)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-%E2%9C%93-ffd700)](https://github.com/topics/dsh-plugin)

*A third-party plugin bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). It turns the local [Kimi WebBridge](https://www.kimi.com/zh-cn/features/webbridge) daemon into 15 native `kimi_webbridge_*` tools — the agent can open pages, read them, click, type, screenshot, run JS, inspect network traffic, upload files, and save PDFs in **your real browser**, logged in as you.*

</div>

---

## ✨ What it does

| | |
|---|---|
| 🧭 **Real browser, real sessions** | The model drives your actual browser — cookies, logins and all. No scraping, no headless shell. |
| 🛡️ **Local-only** | Everything happens on your machine: plugin → `127.0.0.1:10086` daemon → your browser. No third-party service sees your traffic. |
| 📦 **One file, no build** | Pure ESM, zero runtime dependencies beyond the harness's own packages. No TypeScript, no transpile, no API keys. |
| 🔌 **Standard Cordis bundle** | `name` / `inject` / `apply` + `defineTool` — the exact pattern the shipped harness tools use. Never touches the dsh installation. |
| 🗂️ **Tab groups like the product** | One session = one tab group; the model names the group in your language on first use and closes it only when you ask. |

## 🛠️ What the model gets — 15 tools

| Tool | Purpose |
|---|---|
| `kimi_webbridge_navigate` | Open a URL (new tab or current), set the tab-group label on first use |
| `kimi_webbridge_find_tab` | Re-select a task tab by URL; `active:true` borrows the tab you're viewing |
| `kimi_webbridge_list_tabs` | List the task's tabs |
| `kimi_webbridge_snapshot` | Read the page as an accessibility tree with `@e` element refs |
| `kimi_webbridge_click` | Click an element (`@e` ref or CSS selector) |
| `kimi_webbridge_fill` | Type into inputs, textareas and contenteditable rich editors |
| `kimi_webbridge_evaluate` | Run JavaScript in the page (async supported) |
| `kimi_webbridge_cdp` | Raw `chrome.debugger` passthrough (advanced escape hatch) |
| `kimi_webbridge_screenshot` | Screenshot the tab or one element; returns a file path |
| `kimi_webbridge_network` | Capture / inspect the tab's network requests |
| `kimi_webbridge_upload` | Upload files to a `<input type=file>` |
| `kimi_webbridge_save_as_pdf` | Render the current page to PDF; returns a file path |
| `kimi_webbridge_close_tab` | Close the current tab |
| `kimi_webbridge_close_session` | Close the whole tab group — only when you ask |
| `kimi_webbridge_start_daemon` | Auto-start the local daemon when unreachable |

## ✅ Requirements & versions

| Component | Version |
|---|---|
| DeepSeek Harness (`dsh`) | **0.1.0-rc.6** (tested) — any build shipping `@deepseek-ai/dsh-tools` should work |
| Node.js | **≥ 18** (global `fetch`) |
| Kimi WebBridge daemon | **v1.11.5** (tested) |
| Kimi WebBridge browser extension | **1.11.5** (tested) |
| OS | **Windows** (tested); macOS/Linux supported by code paths, not yet verified |

> Compatibility is pinned to what was actually verified. Run `node tests/smoke.mjs` after installing to check your environment.

## 📦 Installation

**Option A — from GitHub (recommended):**

```sh
dsh plugin --profile demo add github:MicroHEROX/dsh-Kimi-WebBridge
dsh --profile demo web
```

**Option B — from a local checkout:**

```sh
dsh plugin --profile demo add ./dsh-Kimi-WebBridge
dsh --profile demo web
```

**Option C — no install, one-off overlay** (`kimi-webbridge.overlay.yml`):

```yaml
- insert:
    - id: kimi-webbridge
      name: '/absolute/path/to/dsh-Kimi-WebBridge/index.js'
      config:
        session: dsh
```

```sh
dsh web --patch ./kimi-webbridge.overlay.yml
```

**Option D — permanent merge:** copy the `insert` block from `cordis.patch.yml` into `$DSH_HOME/profiles/<name>/cordis.patch.yml` (or `$DSH_HOME/cordis.patch.yml` for all profiles).

**Uninstall:**

```sh
dsh plugin --profile demo remove dsh-kimi-webbridge
```

The CLI removes the dependency and reconciles the profile's layer list; the 15 tools unregister. Verify the row is gone:

```sh
dsh --profile demo --dump-config    # the kimi-webbridge row must not appear
```

> ⚠️ **Known harness caveat (dsh 0.1.0-rc.6, [discussion #913](https://github.com/deepseek-ai/deepseek-harness/discussions/913)):** on rare transient pnpm failures the entry can remain in `dsh.profile.bundles`, and the profile then fails to boot with `cannot resolve profile bundle "dsh-kimi-webbridge"` — `dsh plugin install` does **not** fix it (community analysis: [#917](https://github.com/deepseek-ai/deepseek-harness/discussions/917)). **Recovery:** edit the profile's `package.json` and delete `"dsh-kimi-webbridge"` from `dsh.profile.bundles`, then boot again.

> Only runtime files (`index.js`, `cordis.patch.yml`, READMEs, LICENSE) are installed; `docs/` and `tests/` stay in this repository. Verified with `npm pack`.

## 🚀 Quick start

1. Install the bundle and start `dsh web --profile demo`.
2. Wait for the `kimi_webbridge_*` tools in the catalog.
3. Ask: *"Open example.com in the browser, tell me what's on the page, and screenshot it."*
4. The agent opens a tab group (named in your language), reads the page via `snapshot`, saves the screenshot, and shows you the file.

## ⚙️ Configuration

All keys optional; override the `kimi-webbridge` row from a later patch layer, restating every key you need:

```yaml
- id: kimi-webbridge
  name: dsh-kimi-webbridge
  config:
    baseUrl: 'http://127.0.0.1:10086'   # daemon endpoint
    session: dsh                        # daemon-side tab-group name (one per profile)
    requestTimeoutMs: 120000            # per-request timeout
    startDaemonTool: true               # expose kimi_webbridge_start_daemon
    daemonBin: null                     # override the auto-detected daemon binary
    maxRenderText: 50000                # cap on rendered result text
```

## ✅ Done / ⚠️ Not done

**Done and verified**
- All 15 tools end-to-end tested through the real harness + real browser (dsh 0.1.0-rc.6, daemon v1.11.5): navigation, clicking through to real sites, form fill + value verification, file upload + `files.length` verification, network capture, CDP layout metrics, screenshots, PDFs, tab management, daemon self-start.
- Automatic retry for capture tools (a fresh tab's first screenshot can stall while the page settles — a retry returns instantly).
- Graceful daemon-unreachable errors with a self-heal path (`kimi_webbridge_start_daemon`), tested against a dead port via `--patch`.
- Schema strictness verified against the *real* `@deepseek-ai/dsh-tools` compile + raw-JSON-schema boundary checks (`tests/smoke.mjs`).

**Not done / known limits**
- `fill`/`click` are ignored by sites that strictly check `event.isTrusted` (banking portals, captchas) — those need manual interaction. Trusted input is possible at the protocol level via `cdp`, but that is advanced.
- Cross-origin iframes are out of scope: `snapshot`/`click`/`fill`/`evaluate` operate on the top frame only.
- `session` is per-**profile**, not per-agent: subagents share the same tab group. Per-agent session isolation is a future idea (see below).
- No `status`/health tool yet (the daemon exposes `GET /status`, but there is no tool for it — a good first contribution).
- macOS/Linux code paths exist but were not verified on real machines.
- CDP is limited to what the extension exposes (browser-level domains such as `Browser.*` are not available).

## 🗺️ Roadmap — routes that work and routes that don't

**Viable routes**
- ✅ **Direct HTTP to the daemon** (this plugin) — the only interface WebBridge exposes today.
- ✅ Per-profile session naming; config-driven tool toggles (`startDaemonTool`).
- 🔜 Health/status tool over `GET /status`; per-agent session mapping; config-driven enable/disable of individual tools.
- 🔜 Publishing to npm once the harness API is stable.

**Dead ends (don't go here)**
- ❌ **Mounting via `@deepseek-ai/dsh-mcp-client`** — WebBridge has **no MCP endpoint** (`/mcp` and `/sse` return 404; only `/command` and `/status` exist). The MCP route used by e.g. Exa does not apply.
- ❌ **OAuth login flows** (`mcp.exa.ai?login`-style) — not supported by the daemon bridge; API keys are not a WebBridge concept either.
- ❌ **Daemon lifecycle beyond `start`** — the plugin never runs `stop`/`restart`/`uninstall`; that is always the user's call.
- ❌ **Headless / VM automation** — the model acts as *you*, in *your* browser; this is not a scraping or CI tool.

## 🔐 Security

- The daemon listens on `127.0.0.1` only; the model operates your browser **as you**. Review what your harness is allowed to ask for.
- The plugin stores and sends **no credentials**, has **no filesystem access**, and never modifies the `deepseek-harness` installation.
- `kimi_webbridge_cdp` and `kimi_webbridge_evaluate` are powerful; disable them for untrusted model policies.

## 🧪 Verifying your install

```sh
node tests/smoke.mjs
```

Offline registration + schema-boundary checks always run; live daemon round-trips (navigate → snapshot → evaluate → screenshot → close) run when the daemon is reachable.

## 🙏 Credits & thanks

- **[DeepSeek](https://www.deepseek.com)** — for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent runtime and its plugin architecture (`dsh`, Cordis, `dsh-tools`).
- **[Moonshot AI](https://www.moonshot.cn)** — for [Kimi WebBridge](https://www.kimi.com/zh-cn/features/webbridge), the local browser bridge this plugin drives.
- **The Koishi/Cordis ecosystem** — for the plugin framework (`cordis`, `schemastery`) that DeepSeek Harness is built on, and whose conventions this plugin follows.

## 📌 Version & compatibility

- **Plugin:** 0.1.0
- **Tested with:** dsh 0.1.0-rc.6 · Node 24 (≥18 required) · Kimi WebBridge daemon v1.11.5 / extension 1.11.5 · Windows
- **Dependencies:** none declared — `@deepseek-ai/dsh-tools` resolves at runtime from the harness installation (no registry copies are installed)

## 📚 More docs

- [Engineering documentation](docs/engineering.md) · [Glossary](docs/glossary.md) · [API reference](docs/api-reference.md) · [Solutions & pitfalls](docs/solutions.md)

## 📄 License

[MIT](LICENSE). Not an official DeepSeek or Moonshot product. WebBridge is a product of Moonshot AI.
