// Standalone unit test for the dsh-magic-indicator HOST half.
//
// Runs the real module in a plain Node process with a mock Cordis context, so
// the new routes and the optional tool registration are exercised end to end
// WITHOUT restarting DSH or touching the live state file (DSH_HOME is pointed
// at a temp dir before the module is imported).
//
// Usage: node test-host.mjs <absolute path to dsh/index.js>

import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = process.argv[2]
if (!modulePath) {
  console.error('usage: node test-host.mjs <path to dsh/index.js>')
  process.exit(2)
}

// Redirect DSH_HOME before importing: the module resolves the state path lazily
// on every call, so this keeps the real ~/.dsh/magic-support.json untouched.
const sandbox = mkdtempSync(join(tmpdir(), 'magic-host-test-'))
process.env.DSH_HOME = sandbox

const plugin = await import(pathToFileURL(modulePath).href)

let pass = 0
let fail = 0
function check(label, condition, detail = '') {
  if (condition) {
    pass++
    console.log(`  PASS  ${label}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}${detail ? '  ->  ' + detail : ''}`)
  }
}

// ---------------------------------------------------------------- mock ctx
const routes = []
const tools = []
const fakeRes = () => ({
  statusCode: 0,
  headers: null,
  body: '',
  writeHead(code, headers) { this.statusCode = code; this.headers = headers },
  end(chunk) { this.body = chunk ?? '' },
})
const fakeReq = (body) => {
  const listeners = {}
  return {
    on(event, cb) { (listeners[event] ??= []).push(cb); return this },
    destroy() {},
    async emitBody() {
      if (body !== undefined) for (const cb of listeners['data'] ?? []) cb(body)
      for (const cb of listeners['end'] ?? []) cb()
    },
  }
}

const ctx = {
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
  get(name) {
    return name === 'tools' ? { register(def) { tools.push(def); return () => {} } } : undefined
  },
  effect(fn) { fn() },
}

// ------------------------------------------------------------------- run
console.log('--- module shape ---')
check('exports name', plugin.name === 'magic-indicator', String(plugin.name))
check('inject is exactly [webServer]', JSON.stringify(plugin.inject) === '["webServer"]', JSON.stringify(plugin.inject))
check('exports apply', typeof plugin.apply === 'function')

plugin.apply(ctx)

console.log('\n--- route registration ---')
check('registered exactly 2 routes', routes.length === 2, `got ${routes.length}`)
const statusRoute = routes.find((r) => r.path === '/dsh-magic/status')
const setRoute = routes.find((r) => r.path === '/dsh-magic/set')
check('status route is exact', statusRoute?.kind === 'exact')
check('set route is exact', setRoute?.kind === 'exact')
check('both handlers are functions', typeof statusRoute?.handler === 'function' && typeof setRoute?.handler === 'function')

const stateFile = join(sandbox, 'magic-support.json')

console.log('\n--- GET /dsh-magic/status ---')
let res = fakeRes()
await statusRoute.handler(fakeReq(), res)
check('200 on empty state', res.statusCode === 200, String(res.statusCode))
check('idle by default', JSON.parse(res.body).active === false, res.body)
check('default label', JSON.parse(res.body).text === '需要魔法支援', res.body)
check('content-type is json', String(res.headers['content-type']).includes('application/json'))
check('no-store cache header', res.headers['cache-control'] === 'no-store')
check('no state file created by a read', !existsSync(stateFile))

console.log('\n--- POST /dsh-magic/set ---')
res = fakeRes()
const onReq = fakeReq('{"active":true}')
const p = setRoute.handler(onReq, res)
await onReq.emitBody()
await p
check('200 for active:true', res.statusCode === 200, String(res.statusCode))
check('returns active true', JSON.parse(res.body).active === true, res.body)
check('state file written', existsSync(stateFile))
check('file content is UTF-8 JSON', readFileSync(stateFile, 'utf8') === '{"active":true,"text":"需要魔法支援"}', readFileSync(stateFile, 'utf8'))

res = fakeRes()
await statusRoute.handler(fakeReq(), res)
check('status reflects the write', JSON.parse(res.body).active === true, res.body)

res = fakeRes()
const offReq = fakeReq('{"active":false}')
const p2 = setRoute.handler(offReq, res)
await offReq.emitBody()
await p2
check('200 for active:false', res.statusCode === 200, String(res.statusCode))
check('turned back off', JSON.parse(res.body).active === false, res.body)

console.log('\n--- POST validation ---')
res = fakeRes()
const badReq = fakeReq('{"nope":1}')
const p3 = setRoute.handler(badReq, res)
await badReq.emitBody()
await p3
check('400 when active is missing', res.statusCode === 400, String(res.statusCode))
check('400 names the missing field', String(res.body).includes('active'), res.body)

res = fakeRes()
const junkReq = fakeReq('{not json')
const p4 = setRoute.handler(junkReq, res)
await junkReq.emitBody()
await p4
check('400 on malformed JSON', res.statusCode === 400, String(res.statusCode))

res = fakeRes()
const emptyReq = fakeReq('')
const p5 = setRoute.handler(emptyReq, res)
await emptyReq.emitBody()
await p5
check('400 on empty body', res.statusCode === 400, String(res.statusCode))

console.log('\n--- corrupted state file tolerance ---')
const { writeFileSync } = await import('node:fs')
writeFileSync(stateFile, '{ this is not json', 'utf8')
res = fakeRes()
await statusRoute.handler(fakeReq(), res)
check('corrupt file falls back to idle', res.statusCode === 200 && JSON.parse(res.body).active === false, res.body)

console.log('\n--- optional agent tool ---')
check('one tool registered', tools.length === 1, `got ${tools.length}`)
const tool = tools[0]
check('tool name is magic_support', tool?.name === 'magic_support', String(tool?.name))
check('tool declares a description', typeof tool?.description === 'string' && tool.description.length > 20)
// The registry stores RAW JSON Schema, not defineTool()'s friendlier per-property
// map. Asserting the raw shape is what catches a definition the registry rejects.
check('parameters is an object-rooted JSON Schema', tool?.parameters?.type === 'object', JSON.stringify(tool?.parameters))
check('parameters declares a properties map', typeof tool?.parameters?.properties === 'object' && tool.parameters.properties !== null)
check('parameters.required lists action', JSON.stringify(tool?.parameters?.required) === '["action"]', JSON.stringify(tool?.parameters?.required))
check('action is declared as a string property', tool?.parameters?.properties?.action?.type === 'string')
check('action enum is on/off/status', JSON.stringify(tool?.parameters?.properties?.action?.enum) === '["on","off","status"]')
check('text is declared as a string property', tool?.parameters?.properties?.text?.type === 'string')
check(
  'no leftover authoring-only keys in parameters',
  !('action' in (tool?.parameters ?? {})) && !('text' in (tool?.parameters ?? {})),
  'found a friendlier-map leftover where JSON Schema keys belong',
)
check('tool has output.schema', tool?.output?.schema != null)
check('output.schema is not the authoring-only json form', tool?.output?.schema?.type !== 'json', JSON.stringify(tool?.output?.schema))
check('tool output.render yields text blocks', (() => {
  const blocks = tool.output.render({}, { active: true })
  return Array.isArray(blocks) && blocks[0]?.type === 'text'
})())

let toolResult = await tool.execute({ action: 'on' })
check('tool on -> active true', toolResult.active === true, JSON.stringify(toolResult))
toolResult = await tool.execute({ action: 'status' })
check('tool status reads back', toolResult.active === true, JSON.stringify(toolResult))
toolResult = await tool.execute({ action: 'off' })
check('tool off -> active false', toolResult.active === false, JSON.stringify(toolResult))
let threw = false
try { await tool.execute({ action: 'bogus' }) } catch { threw = true }
check('tool rejects an unknown action', threw)

console.log('\n--- host without a tools service (degradation) ---')
const bareTools = []
const bareCtx = {
  webServer: { register(r) { bareTools.push(r); return () => {} } },
  get() { return undefined },
  effect(fn) { fn() },
}
plugin.apply(bareCtx)
check('routes still registered without tools', bareTools.length === 2, `got ${bareTools.length}`)

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
process.exit(fail === 0 ? 0 : 1)
