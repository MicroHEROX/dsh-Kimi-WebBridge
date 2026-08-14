/**
 * dsh-kimi-webbridge — Kimi WebBridge browser tools for DeepSeek Harness.
 *
 * A third-party plugin bundle that turns the local Kimi WebBridge daemon
 * (http://127.0.0.1:10086, the same bridge behind https://www.kimi.com/zh-cn/products/kimi-webbridge)
 * into 15 native dsh tools. The agent drives the user's REAL browser — with
 * their login sessions — through the daemon's HTTP API:
 *
 *   POST {baseUrl}/command  body: { action, args, session }
 *   response: { ok: true, data } | { ok: false, error: { code, message } }
 *
 * This module registers tools only (the standard `ctx.tools.register` pattern
 * used by the shipped tool packages); it never modifies the
 * deepseek-harness installation itself.
 *
 * @module dsh-kimi-webbridge
 */

import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'kimi-webbridge'
export const inject = ['tools']

const HELP_URL = 'https://www.kimi.com/zh-cn/features/webbridge'

const DEFAULT_CONFIG = {
  baseUrl: 'http://127.0.0.1:10086',
  session: 'dsh',
  requestTimeoutMs: 120000,
  startDaemonTool: true,
  daemonBin: null,
  maxRenderText: 50000,
}

function normalizeConfig(config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) }
  const errors = []
  if (typeof cfg.baseUrl !== 'string' || !/^https?:\/\//.test(cfg.baseUrl)) {
    errors.push('baseUrl must be an http(s) URL (default http://127.0.0.1:10086)')
  }
  if (typeof cfg.session !== 'string' || cfg.session.length === 0) {
    errors.push('session must be a non-empty string')
  }
  if (!Number.isFinite(cfg.requestTimeoutMs) || cfg.requestTimeoutMs <= 0) {
    errors.push('requestTimeoutMs must be a positive number')
  }
  if (typeof cfg.startDaemonTool !== 'boolean') {
    errors.push('startDaemonTool must be a boolean')
  }
  if (cfg.daemonBin !== null && typeof cfg.daemonBin !== 'string') {
    errors.push('daemonBin must be a string or null')
  }
  if (!Number.isFinite(cfg.maxRenderText) || cfg.maxRenderText <= 0) {
    errors.push('maxRenderText must be a positive number')
  }
  if (errors.length > 0) {
    throw new Error(`kimi-webbridge: invalid config:\n- ${errors.join('\n- ')}`)
  }
  return cfg
}

function daemonBinPath(cfg) {
  if (cfg.daemonBin) return cfg.daemonBin
  const home = os.homedir()
  return process.platform === 'win32'
    ? path.join(home, '.kimi-webbridge', 'bin', 'kimi-webbridge.exe')
    : path.join(home, '.kimi-webbridge', 'bin', 'kimi-webbridge')
}

/**
 * Combine the tool-run abort signal with a hard timeout into one AbortSignal.
 * @returns a cleanup function to call when the request settles.
 */
function withAbort(execSignal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  if (execSignal) {
    if (execSignal.aborted) controller.abort()
    else execSignal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer)
      if (execSignal) execSignal.removeEventListener('abort', onAbort)
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * POST one command to the WebBridge daemon and return `data`.
 * Throws a tool-visible Error with an actionable message on failure.
 * @param options.retryOnTimeout - retry once after a timeout (for idempotent
 * capture tools: the daemon's first screenshot right after a fresh navigate
 * can hang while the page settles; a retry on the settled page succeeds fast).
 */
async function callDaemon(cfg, action, args, exec, { retryOnTimeout = false } = {}) {
  try {
    return await requestDaemon(cfg, action, args, exec)
  } catch (error) {
    if (retryOnTimeout && error.kind === 'timeout' && !exec?.signal?.aborted) {
      await sleep(1500)
      return await requestDaemon(cfg, action, args, exec)
    }
    throw error
  }
}

async function requestDaemon(cfg, action, args, exec) {
  const url = `${cfg.baseUrl}/command`
  const body = JSON.stringify({ action, args: args ?? {}, session: cfg.session })
  let response
  const { signal, timedOut, cleanup } = withAbort(exec?.signal, cfg.requestTimeoutMs)
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    })
  } catch (error) {
    if (exec?.signal?.aborted) throw error
    if (timedOut()) {
      const failure = new Error(
        `Kimi WebBridge did not answer ${action} within ${cfg.requestTimeoutMs} ms — the daemon may be waiting for the page to settle.`
      )
      failure.kind = 'timeout'
      throw failure
    }
    const hint = ' Start it with kimi_webbridge_start_daemon (or manually, then retry).'
    throw new Error(
      `Kimi WebBridge daemon unreachable at ${cfg.baseUrl} (${error.message}).${hint} `
      + `Check the daemon and the browser extension: ${HELP_URL}`,
    )
  } finally {
    cleanup()
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`Kimi WebBridge daemon returned a non-JSON response (HTTP ${response.status}).`)
  }
  if (payload && payload.ok === false) {
    const code = payload.error?.code ?? 'unknown'
    const message = payload.error?.message ?? 'no message'
    throw new Error(`Kimi WebBridge error (${code}): ${message}`)
  }
  if (!payload || payload.ok !== true) {
    throw new Error(`Kimi WebBridge daemon returned an unexpected envelope: ${JSON.stringify(payload).slice(0, 500)}`)
  }
  return payload.data
}

/** Drop undefined keys so optional parameters are never sent as explicit nulls. */
function cleanArgs(args) {
  const out = {}
  for (const [key, value] of Object.entries(args ?? {})) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function renderJson(value, maxText) {
  const text = JSON.stringify(value)
  return [{ type: 'text', text: text.length > maxText ? text.slice(0, maxText) + '\n…(truncated)' : text }]
}

const obj = (properties, additionalProperties = false) => ({
  type: 'object',
  additionalProperties,
  properties,
})

const opt = (schema, description) => (description === undefined ? { ...schema } : { ...schema, description })
const req = (schema, description) => ({
  ...schema,
  required: true,
  ...(description === undefined ? {} : { description }),
})

export function apply(ctx, config) {
  const cfg = normalizeConfig(config)
  const maxText = cfg.maxRenderText
  const exec = (action, argsSchema, options = {}) => ({
    async execute(args, run) {
      return callDaemon(cfg, action, cleanArgs(args), run, options)
    },
    parameters: argsSchema,
  })

  const register = (definition) => ctx.tools.register(defineTool(definition))

  register({
    name: 'kimi_webbridge_navigate',
    description:
      'Open a URL in the user\'s REAL browser, with their logged-in sessions. '
      + 'The FIRST navigate of a task creates a tab group — set group_title there to a short '
      + 'human label in the user\'s language. newTab:true opens a new tab so pages coexist '
      + '(comparing, cross-referencing); omit it to send the current tab to the URL. '
      + 'Returned tabId/url are the tab\'s identity for kimi_webbridge_find_tab.',
    ...exec('navigate', {
      url: req({ type: 'string' }, 'Full URL to open, e.g. https://www.kimi.com'),
      newTab: opt({ type: 'boolean' }, 'true = open a new tab; omit = navigate the current tab'),
      group_title: opt({ type: 'string' }, 'Human-readable tab-group label; set on the FIRST navigate of a task'),
    }),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        url: req({ type: 'string' }),
        tabId: req({ type: 'integer' }),
      }),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_find_tab',
    description:
      'Re-select a tab opened earlier in this task (pass its FULL url from the navigate result or '
      + 'kimi_webbridge_list_tabs), making it the current tab for click/fill/snapshot/screenshot. '
      + 'active:true borrows the tab the USER is currently viewing (operates it in place). '
      + 'If no matching tab, open it again with kimi_webbridge_navigate newTab:true.',
    ...exec('find_tab', {
      url: req({ type: 'string' }, 'Full URL of the tab to select, e.g. https://www.kimi.com/'),
      active: opt({ type: 'boolean' }, 'true = use the tab the user is currently viewing'),
    }),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        url: opt({ type: 'string' }),
        tabId: opt({ type: 'integer' }),
        borrowed: opt({ type: 'boolean' }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_list_tabs',
    description:
      'List the tabs of this task\'s group: {tabId, url, title, active, groupTitle}. '
      + 'Use it to inspect what is open or to get the exact URL for kimi_webbridge_find_tab.',
    ...exec('list_tabs', {}),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        tabs: req({ type: 'json' }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_snapshot',
    description:
      'Read the current tab\'s accessibility tree: {url, title, tree} where interactive elements '
      + 'carry @e refs (e.g. @e123). Use the @e refs with kimi_webbridge_click / _fill — they survive '
      + 'CSS changes that break hand-written selectors. This is the primary way to read page content.',
    ...exec('snapshot', {}),
    output: {
      schema: obj({
        url: req({ type: 'string' }),
        title: req({ type: 'string' }),
        tree: req({ type: 'json' }),
      }),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_click',
    description:
      'Click an element in the current tab (synthetic el.click()). selector = @e ref from '
      + 'kimi_webbridge_snapshot (preferred) or a CSS selector. Sites that strictly check '
      + 'event.isTrusted (banking portals, captchas) may ignore it — then tell the user the page '
      + 'needs manual interaction.',
    ...exec('click', {
      selector: req({ type: 'string' }, '@e ref (e.g. @e123) from snapshot, or a CSS selector'),
    }),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        tag: opt({ type: 'string' }),
        text: opt({ type: 'string' }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_fill',
    description:
      'Clear-and-insert text into an input/textarea OR a [contenteditable] rich editor '
      + '(ProseMirror/TipTap/Lexical/Slate/Quill...). selector = @e ref or CSS selector. '
      + 'To APPEND text: read the current value via kimi_webbridge_evaluate, concatenate, then fill. '
      + 'No separate Enter tool: submit by clicking the submit button.',
    ...exec('fill', {
      selector: req({ type: 'string' }, '@e ref or CSS selector of the input/textarea/[contenteditable]'),
      value: req({ type: 'string' }, 'Text to insert (replaces existing content)'),
    }),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        tag: opt({ type: 'string' }),
        mode: opt({ type: 'string', enum: ['value', 'contenteditable'] }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_evaluate',
    description:
      'Run JavaScript in the current page (async/await supported); returns {type, value}. '
      + 'Fall back to this only when the snapshot lacks an @e ref or you need page state the '
      + 'snapshot does not expose (attributes, scroll). Wrap top-level const/let in an IIFE — the '
      + 'page realm persists between calls. Return compact data.',
    parameters: {
      code: req({ type: 'string' }, 'JavaScript to run in the page (async/await supported)'),
    },
    async execute(args, run) {
      const data = await callDaemon(cfg, 'evaluate', cleanArgs(args), run)
      // JSON cannot carry `undefined`, so the daemon omits keys whose JS value
      // is undefined (or void-returning async code); normalize so the canonical
      // output always matches the declared schema.
      return { type: data?.type ?? 'undefined', value: data?.value ?? null }
    },
    output: {
      schema: obj({
        type: req({ type: 'string' }),
        value: req({ type: 'json' }),
      }),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_cdp',
    description:
      'Raw chrome.debugger passthrough — advanced escape hatch for cases the other tools do not '
      + 'cover (e.g. trusted input events via Input.dispatchKeyEvent, Input.dispatchMouseEvent). '
      + 'method = CDP method, params = its parameter object. Prefer the dedicated tools first.',
    ...exec('cdp', {
      method: req({ type: 'string' }, 'CDP method, e.g. Input.dispatchKeyEvent'),
      params: opt({ type: 'json' }, 'CDP method parameters'),
    }),
    output: {
      schema: { type: 'json' },
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_screenshot',
    description:
      'Screenshot the current tab (or one element). The daemon writes the image to disk and '
      + 'returns {format, path, sizeBytes, mimeType} — the path is the file to open with your '
      + 'file-read tool to actually see the image. format: png (default) | jpeg; quality 0-100 '
      + '(jpeg only); optional selector (@e or CSS) for element-only capture; optional custom path '
      + '(use a unique name; parent dirs are created, existing files overwritten).',
    ...exec('screenshot', {
      format: opt({ type: 'string', enum: ['png', 'jpeg'] }, 'png (default) or jpeg'),
      quality: opt({ type: 'integer' }, 'JPEG quality 0-100 (jpeg only)'),
      selector: opt({ type: 'string' }, '@e ref or CSS selector to screenshot only that element'),
      path: opt({ type: 'string' }, 'Custom output path (unique name; existing files overwritten)'),
    }, { retryOnTimeout: true }),
    output: {
      schema: obj({
        format: req({ type: 'string' }),
        path: req({ type: 'string' }),
        sizeBytes: req({ type: 'integer' }),
        mimeType: req({ type: 'string' }),
      }),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_network',
    description:
      'Inspect network requests of the current tab: cmd=start begins capture, stop ends it, '
      + 'list returns captured requests (filter narrows by URL substring), detail returns full '
      + 'request/response data for a requestId.',
    ...exec('network', {
      cmd: req({ type: 'string', enum: ['start', 'stop', 'list', 'detail'] }, 'Network command'),
      filter: opt({ type: 'string' }, 'URL substring filter for list'),
      requestId: opt({ type: 'string' }, 'Request id for detail'),
    }),
    output: {
      schema: { type: 'json' },
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_upload',
    description:
      'Set file(s) on a <input type=file> in the current tab. files = ABSOLUTE paths on disk '
      + '(e.g. from your file tools).',
    ...exec('upload', {
      selector: req({ type: 'string' }, '@e ref or CSS selector of the <input type=file>'),
      files: req({ type: 'array', items: { type: 'string' } }, 'Absolute paths of the files to upload'),
    }),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        fileCount: opt({ type: 'integer' }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_save_as_pdf',
    description:
      'Render the current page to PDF. The daemon writes the file to disk and returns its path — '
      + 'open it with your file-read tool. paper_format: letter (default) | a4 | legal | a3 | '
      + 'tabloid; landscape; scale 0.1-2.0; print_background (default true); optional custom path '
      + '(unique name; existing files overwritten).',
    ...exec('save_as_pdf', {
      paper_format: opt({ type: 'string', enum: ['letter', 'a4', 'legal', 'a3', 'tabloid'] }, 'Paper size'),
      landscape: opt({ type: 'boolean' }, 'Landscape orientation (default false)'),
      scale: opt({ type: 'number' }, 'Scale factor 0.1-2.0 (default 1.0)'),
      print_background: opt({ type: 'boolean' }, 'Keep background colors (default true)'),
      path: opt({ type: 'string' }, 'Custom output path (unique name; existing files overwritten)'),
    }, { retryOnTimeout: true }),
    output: {
      schema: obj({
        path: req({ type: 'string' }),
        sizeBytes: opt({ type: 'integer' }),
        mimeType: opt({ type: 'string' }),
        pageTitle: opt({ type: 'string' }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_close_tab',
    description: 'Close the current tab of this task\'s group.',
    ...exec('close_tab', {}),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        closed: opt({ type: 'boolean' }),
      }, true),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  register({
    name: 'kimi_webbridge_close_session',
    description:
      'Close ALL tabs of this task\'s group (returns how many were closed). '
      + 'Call ONLY when the user explicitly asks to close the tabs ("close those", "clear the tabs").',
    ...exec('close_session', {}),
    output: {
      schema: obj({
        success: req({ type: 'boolean' }),
        closed: req({ type: 'integer' }),
      }),
      render: (a, v) => renderJson(v, maxText),
    },
  })

  if (cfg.startDaemonTool) {
    // start_daemon is special: it spawns the daemon binary and polls for
    // readiness instead of a plain /command round-trip.
    const bin = daemonBinPath(cfg)
    register({
      name: 'kimi_webbridge_start_daemon',
      description:
        'Start the local Kimi WebBridge daemon if it is not reachable. Safe to call anytime — it '
        + 'no-ops when the daemon is already up. NEVER run stop/restart/uninstall yourself; leave '
        + 'that to the user.',
      parameters: {},
      async execute(_args, run) {
        await new Promise((resolve, reject) => {
          const child = spawn(bin, ['start'], { stdio: 'ignore', detached: true })
          child.once('error', reject)
          child.once('spawn', () => {
            child.unref()
            resolve()
          })
        }).catch((error) => {
          if (run?.signal?.aborted) throw error
          throw new Error(
            `Could not start the Kimi WebBridge daemon at ${bin} (${error.message}). `
            + `Install it from ${HELP_URL} and set daemonBin if it lives elsewhere.`,
          )
        })
        const deadline = Date.now() + 20000
        for (;;) {
          if (run?.signal?.aborted) {
            throw new Error('kimi_webbridge_start_daemon aborted')
          }
          try {
            await callDaemon(cfg, 'list_tabs', {}, run)
            return { started: true, daemonBin: bin, baseUrl: cfg.baseUrl }
          } catch {
            if (Date.now() > deadline) {
              return {
                started: false,
                daemonBin: bin,
                baseUrl: cfg.baseUrl,
                error: 'daemon did not answer within 20 s — check the daemon and the browser extension',
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }
      },
      output: {
        schema: obj({
          started: req({ type: 'boolean' }),
          daemonBin: req({ type: 'string' }),
          baseUrl: req({ type: 'string' }),
          error: opt({ type: 'string' }),
        }, true),
        render: (a, v) => renderJson(v, maxText),
      },
    })
  }
}
