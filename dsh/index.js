// Host half of dsh-magic-indicator.
//
// The visible chip is the browser half (see package.json "dsh.client"). This
// half exists to answer one question the browser cannot answer itself:
// "does the agent currently need the outbound proxy switched on?"
//
// The agent owns that answer, and it publishes it by writing a tiny state file.
// This half exposes that file over same-origin HTTP so the chip can poll it:
//
//     GET  /dsh-magic/status                -> { active, text }
//     POST /dsh-magic/set  {"active":true}  -> writes the state, returns { active, text }
//
// Why a file rather than a Host Remote: the writing side is the agent itself,
// whose only host-side capability is the filesystem. A file needs no schema,
// no code generation and no restart, and it stays inspectable by a human.
//
// TWO independent ways to toggle, so the plugin stays self-contained when shared:
//
//   1. POST /dsh-magic/set  - any agent, any language, no dependency:
//        curl -X POST http://127.0.0.1:<port>/dsh-magic/set -d '{"active":true}'
//   2. An agent tool `magic_support` - registered only when the host exposes a
//      `tools` service and accepts a plain ToolDefinition. Registration is
//      best-effort inside try/catch: this plugin deliberately imports NOTHING
//      from @deepseek-ai/* so it stays portable across dsh versions, and a
//      rejected registration must not take the chip down with it.
//
// webServer routes run no auth gate of their own (the dispatcher calls the
// handler directly), and the chip polls same-origin, so no credential plumbing
// is needed. The routes are loopback-only in practice: the server binds 127.0.0.1.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'magic-indicator'

// Hard dependency: apply() runs only once webServer is live, so ctx.webServer is
// defined by the time the routes are registered. `tools` is deliberately NOT in
// this list - it is an optional service reached through ctx.get().
export const inject = ['webServer']

const STATUS_PATH = '/dsh-magic/status'
const SET_PATH = '/dsh-magic/set'
const DEFAULT_TEXT = '需要魔法支援'

function statePath() {
  const home = process.env.DSH_HOME
  return join(home && home.length > 0 ? home : join(homedir(), '.dsh'), 'magic-support.json')
}

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8'))
    return {
      active: parsed != null && parsed.active === true,
      text: typeof parsed?.text === 'string' && parsed.text.length > 0 ? parsed.text : DEFAULT_TEXT,
    }
  } catch {
    // Missing or unreadable file is the normal idle state, not an error.
    return { active: false, text: DEFAULT_TEXT }
  }
}

function writeState(next) {
  const target = statePath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(next), 'utf8')
  return next
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 64 * 1024) req.destroy() // never buffer unbounded input
    })
    req.on('end', () => resolve(raw))
    req.on('error', () => resolve(''))
  })
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function statusHandler(_req, res) {
  sendJson(res, 200, readState())
}

async function setHandler(req, res) {
  const raw = await readBody(req)
  let body
  try {
    body = raw.length > 0 ? JSON.parse(raw) : {}
  } catch {
    sendJson(res, 400, { error: 'body must be JSON' })
    return
  }
  if (typeof body?.active !== 'boolean') {
    sendJson(res, 400, { error: 'active (boolean) is required' })
    return
  }
  const current = readState()
  const text = typeof body.text === 'string' && body.text.length > 0 ? body.text : current.text
  sendJson(res, 200, writeState({ active: body.active, text }))
}

// Best-effort agent tool. Wrapped so an unsupported host, a rejected definition,
// or a missing service degrades to "route only" instead of breaking activation.
function registerTool(ctx) {
  try {
    const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
    if (tools == null || typeof tools.register !== 'function') return
    tools.register({
      name: 'magic_support',
      description:
        'Turn the composer "需要魔法支援" (proxy needed) indicator on or off, or read its state. '
        + 'Turn it ON before asking the user to enable their proxy/VPN, and OFF once the request '
        + 'succeeds -- the chip is a one-way signal that an outbound-proxy action is pending.',
      // `parameters` must already be raw JSON Schema. The framework's defineTool()
      // helper accepts a friendlier per-property map and compiles it with
      // parameterSchemaSpecToJsonSchema(); importing that helper would mean
      // depending on @deepseek-ai/dsh-tools, which this plugin deliberately avoids,
      // so the compiled shape is written out by hand instead:
      //   { type: 'object', properties: {…}, required: [...] }
      // That helper also wraps execute() in argument validation, so `action` is
      // validated inside execute() below.
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['on', 'off', 'status'],
            description: 'on = light the chip up, off = clear it, status = read the current state.',
          },
          text: {
            type: 'string',
            description: 'Optional replacement label for the chip (default 需要魔法支援).',
          },
        },
        required: ['action'],
      },
      output: {
        // Annotation-only: defineTool() compiles the author-facing `{ type: 'json' }`
        // node to exactly this.
        schema: {},
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args) {
        const action = args?.action
        if (action === 'status') return readState()
        if (action !== 'on' && action !== 'off') throw new Error('action must be on, off or status')
        const current = readState()
        const text = typeof args?.text === 'string' && args.text.length > 0 ? args.text : current.text
        return writeState({ active: action === 'on', text })
      },
    })
  } catch (error) {
    console.error('[magic-indicator] optional agent tool not registered:', error?.message ?? error)
  }
}

export function apply(ctx) {
  const registerRoutes = () => {
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: statusHandler }),
      ctx.webServer.register({ kind: 'exact', path: SET_PATH, handler: setHandler }),
    ]
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          /* already released */
        }
      }
    }
  }

  // ctx.effect ties the disposer to this plugin's lifetime; fall back to a plain
  // registration on a context that does not expose it.
  if (typeof ctx.effect === 'function') ctx.effect(registerRoutes)
  else registerRoutes()

  registerTool(ctx)
}
