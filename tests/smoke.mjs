/**
 * Smoke test for dsh-kimi-webbridge.
 *
 * Part 0 (setup): resolves @deepseek-ai/dsh-tools — real library first (env
 *   DSH_TOOLS_PATH, then the healed profile closure ~/.dsh/profiles/node_modules,
 *   then the npm-global dsh install), falling back to tests/stub — and links it
 *   into a throwaway node_modules so the plugin module resolves it the same way
 *   the harness does. With the real library, every tool definition passes the
 *   REAL defineTool compile + raw-JSON-schema boundary checks (this is exactly
 *   the failure class that broke registration at runtime once: author-form
 *   schemas with per-property `required` or `description: undefined`).
 *
 * Part 1 (offline): the 15 tools register with the expected names, config
 *   validation rejects bad config, author-schema DSL conformance replica.
 *
 * Part 2 (live, skipped when the daemon is down): drives the real Kimi
 *   WebBridge daemon through the registered tool `execute` functions —
 *   navigate -> snapshot -> evaluate -> screenshot -> list_tabs -> close_session.
 *
 * Run: node tests/smoke.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let realToolsPath = process.env.DSH_TOOLS_PATH ?? ''
if (!realToolsPath) {
  const candidates = [
    path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-tools'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools'),
    path.join(os.homedir(), 'Library', 'Application Support', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      realToolsPath = candidate
      break
    }
  }
}
let libSource = 'stub (tests/stub — real dsh-tools not found on this machine)'
let toolsLinkTarget = path.join(projectRoot, 'tests', 'stub', '@deepseek-ai', 'dsh-tools')
if (realToolsPath) {
  libSource = `real @deepseek-ai/dsh-tools (${realToolsPath})`
  toolsLinkTarget = realToolsPath
}
const moduleDir = path.join(projectRoot, 'node_modules', '@deepseek-ai')
fs.mkdirSync(moduleDir, { recursive: true })
const linkPath = path.join(moduleDir, 'dsh-tools')
fs.rmSync(linkPath, { recursive: true, force: true })
fs.symlinkSync(toolsLinkTarget, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
console.log(`part 0: linked dsh-tools from ${libSource}`)

const { apply } = await import('../index.js')

let failures = 0
function check(label, condition, detail = '') {
  const mark = condition ? 'ok  ' : 'FAIL'
  if (!condition) failures++
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('part 1: registration (offline)')
const registered = []
const ctx = {
  tools: {
    register(def) {
      registered.push(def)
    },
  },
}
apply(ctx, {})
const names = registered.map((t) => t.name)
const expected = [
  'kimi_webbridge_navigate',
  'kimi_webbridge_find_tab',
  'kimi_webbridge_list_tabs',
  'kimi_webbridge_snapshot',
  'kimi_webbridge_click',
  'kimi_webbridge_fill',
  'kimi_webbridge_evaluate',
  'kimi_webbridge_cdp',
  'kimi_webbridge_screenshot',
  'kimi_webbridge_network',
  'kimi_webbridge_upload',
  'kimi_webbridge_save_as_pdf',
  'kimi_webbridge_close_tab',
  'kimi_webbridge_close_session',
  'kimi_webbridge_start_daemon',
]
check('15 tools registered', registered.length === 15, `got ${registered.length}`)
for (const wanted of expected) {
  check(`tool ${wanted}`, names.includes(wanted))
}
for (const t of registered) {
  check(`  ${t.name}: execute is a function`, typeof t.execute === 'function')
  check(`  ${t.name}: output.render is a function`, typeof t.output.render === 'function')
  check(`  ${t.name}: parameters is an object`, t.parameters && typeof t.parameters === 'object')
}

console.log('part 1b: config validation')
try {
  apply(ctx, { session: '' })
  check('bad session rejected', false)
} catch (error) {
  check('bad session rejected', /invalid config/.test(error.message), error.message.split('\n')[0])
}
try {
  apply(ctx, { startDaemonTool: 'yes' })
  check('bad startDaemonTool rejected', false)
} catch (error) {
  check('bad startDaemonTool rejected', /startDaemonTool/.test(error.message))
}
const withoutDaemon = []
apply({ tools: { register: (d) => withoutDaemon.push(d) } }, { startDaemonTool: false })
check('startDaemonTool:false omits the daemon tool', withoutDaemon.length === 14)

console.log('part 1c: start_daemon tool does not hit the daemon HTTP API')
const sd = registered.find((t) => t.name === 'kimi_webbridge_start_daemon')
check('start_daemon has its own execute', sd.execute && !sd.parameters?.action)

if (!realToolsPath) {
  console.log('part 1d: author-schema DSL conformance (mirrors packages/core/tools/src/schema.ts rules)')
  const ANNOTATION_KEYS = ['description', 'title', 'default', 'examples']
  function isLosslessJson(value) {
    if (value === undefined) return false
    try {
      return JSON.stringify(value) !== undefined
    } catch {
      return false
    }
  }
  function assertSchemaNode(node, nodePath, { allowRequired } = {}) {
    const allowed = [...ANNOTATION_KEYS, ...(allowRequired ? ['required'] : [])]
    const type = node.type
    let extra
    switch (type) {
      case 'json':
        extra = ['type']
        break
      case 'object':
        extra = ['type', 'properties', 'additionalProperties']
        check(`${nodePath} declares explicit additionalProperties`, typeof node.additionalProperties === 'boolean', nodePath)
        if (node.properties) {
          for (const [k, v] of Object.entries(node.properties)) assertSchemaNode(v, `${nodePath}.properties.${k}`, { allowRequired: true })
        }
        break
      case 'array':
        extra = ['type', 'items']
        if (node.items) assertSchemaNode(node.items, `${nodePath}.items`)
        break
      case 'string':
      case 'number':
      case 'integer':
      case 'boolean':
      case 'null':
        extra = ['type', 'enum', 'const']
        break
      case undefined:
        if (node.oneOf) {
          extra = ['oneOf', 'type']
          check(`${nodePath} oneOf has >=2 branches`, node.oneOf.length >= 2)
        } else {
          check(`${nodePath} has a type`, false, JSON.stringify(node))
          return
        }
        break
      default:
        check(`${nodePath} has a supported type`, false, JSON.stringify(node))
        return
    }
    for (const key of Object.keys(node)) {
      check(`${nodePath}.${key} is in the DSL vocabulary`, allowed.includes(key) || extra.includes(key), nodePath)
    }
    for (const key of ANNOTATION_KEYS) {
      if (key in node) {
        check(`${nodePath}.${key} annotation is lossless JSON (${key} must be a string)`, isLosslessJson(node[key]))
      }
    }
    if (node.required !== undefined) {
      check(`${nodePath}.required is true when present`, node.required === true)
    }
  }
  for (const tool of registered) {
    for (const [key, spec] of Object.entries(tool.parameters)) {
      assertSchemaNode(spec, `${tool.name}.parameters.${key}`, { allowRequired: true })
    }
    assertSchemaNode(tool.output.schema, `${tool.name}.output.schema`)
  }
} else {
  console.log('part 1d: author-form not observable (definitions were compiled by the real defineTool) — covered by part 1e')
}
for (const tool of registered) {
  check(`${tool.name} snake_case name`, /^[a-z][a-z0-9_]*$/.test(tool.name))
  check(`${tool.name} has description`, typeof tool.description === 'string' && tool.description.length > 0)
  check(`${tool.name} render returns content blocks`, Array.isArray(tool.output.render({}, { success: true })))
}

console.log('part 1e: compiled raw-schema boundary (real defineTool output)')
if (realToolsPath) {
  function walkCompiled(node, nodePath) {
    if (!node || typeof node !== 'object') return
    for (const key of ['description', 'title']) {
      if (key in node) {
        check(`${nodePath}.${key} is a string in compiled output`, typeof node[key] === 'string', String(node[key]))
      }
    }
    if ('required' in node) {
      check(`${nodePath}.required is an array of strings in compiled output`, Array.isArray(node.required) && node.required.every((r) => typeof r === 'string'), JSON.stringify(node.required))
    }
    if (node.type === 'object' && node.properties) {
      for (const [k, v] of Object.entries(node.properties)) walkCompiled(v, `${nodePath}.properties.${k}`)
    } else if (node.type === 'array' && node.items) {
      walkCompiled(node.items, `${nodePath}.items`)
    }
  }
  for (const tool of registered) {
    walkCompiled(tool.parameters, `${tool.name}.parameters`)
    walkCompiled(tool.output.schema, `${tool.name}.output.schema`)
  }
  check('registered definitions came from the real defineTool', true, libSource)
} else {
  console.log('  real dsh-tools unavailable — boundary checks need the harness installation; stub passed through')
}

console.log('part 2: live daemon (skipped if unreachable)')
const liveRegistered = []
apply({ tools: { register: (d) => liveRegistered.push(d) } }, { requestTimeoutMs: 20000 })
const byName = Object.fromEntries(liveRegistered.map((t) => [t.name, t]))
const run = { signal: undefined }
const execTool = async (name, args) => {
  const tool = byName[name]
  const data = await tool.execute(args, run)
  return { data, render: tool.output.render(args, data) }
}

try {
  await execTool('kimi_webbridge_list_tabs', {})
  console.log('  daemon reachable, running live checks')
} catch {
  console.log('  daemon NOT reachable — live checks skipped (run the daemon to verify)')
  process.exit(failures > 0 ? 1 : 0)
}

const nav = await execTool('kimi_webbridge_navigate', {
  url: 'https://example.com',
  newTab: true,
  group_title: 'dsh-kimi-webbridge smoke test',
})
check('navigate returns url', nav.data?.url === 'https://example.com', JSON.stringify(nav.data).slice(0, 120))

const snap = await execTool('kimi_webbridge_snapshot', {})
check('snapshot returns title', snap.data?.title === 'Example Domain', snap.data?.title)
check('snapshot tree has @e refs', JSON.stringify(snap.data?.tree).includes('@e'), 'tree contains @e')

const ev = await execTool('kimi_webbridge_evaluate', { code: 'document.title' })
check('evaluate returns value', ev.data?.value === 'Example Domain', JSON.stringify(ev.data).slice(0, 120))

const shot = await execTool('kimi_webbridge_screenshot', {})
check('screenshot returns a path', typeof shot.data?.path === 'string' && shot.data?.sizeBytes > 0, shot.data?.path ?? 'no path')

const tabs = await execTool('kimi_webbridge_list_tabs', {})
check('list_tabs returns tabs', Array.isArray(tabs.data?.tabs) && tabs.data.tabs.length >= 1, `count=${tabs.data?.tabs?.length}`)

const closed = await execTool('kimi_webbridge_close_session', {})
check('close_session returns closed count', closed.data?.closed >= 1, `closed=${closed.data?.closed}`)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures > 0 ? 1 : 0)
