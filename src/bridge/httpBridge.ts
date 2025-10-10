// src/bridge/httpBridge.ts
import { listen, emit } from '@tauri-apps/api/event'

type HttpRequestEvent = {
  method: string
  path: string
  headers: Array<[string, string]> | Record<string, string> | { name: string; value: string }[]
  body: string
  request_id: number
}

type TsResponse = {
  request_id: number
  status: number
  body: string // Rust expects this to be a string
}

// ---------- logging ----------
const VERBOSE = false
const logIn  = (...args: any[]) => (VERBOSE ? console.info : console.debug)('[MND] http bridge <-', ...args)
const logOut = (...args: any[]) => (VERBOSE ? console.info : console.debug)('[MND] http bridge ->', ...args)
const logSys = (...args: any[]) => (VERBOSE ? console.info : console.debug)('[MND] http bridge', ...args)
const logWarn = (...args: any[]) => console.warn('[MND] http bridge', ...args)

// ---------- utils ----------
const json = (v: unknown) => { try { return JSON.stringify(v) } catch { return '{}' } }

function dequote(s: unknown): string {
  let t = String(s ?? '').trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    t = t.slice(1, -1)
  }
  return t
}

function parseBody(s: string): any {
  if (!s) return undefined
  const t = s.trim()
  if (!t) return undefined
  try { return JSON.parse(t) } catch { return undefined }
}

function normalizeReq(raw: any): HttpRequestEvent {
  const method = dequote(raw?.method)
  const path = dequote(raw?.path)
  const body = typeof raw?.body === 'string' ? raw.body : json(raw?.body ?? '')
  const request_id = Number(raw?.request_id ?? 0)
  return { method, path, headers: raw?.headers ?? [], body, request_id }
}

function makeResp(req: HttpRequestEvent, status: number, bodyObj?: unknown): TsResponse {
  return { request_id: req.request_id, status, body: bodyObj === undefined ? '' : json(bodyObj) }
}

// ---------- network setting (persisted) ----------
type Net = 'main' | 'test'
const STORAGE_KEY_NET = 'mnd.network'

function readNet(): Net {
  try {
    const v = localStorage.getItem(STORAGE_KEY_NET)?.trim().toLowerCase()
    return (v === 'test' ? 'test' : 'main')
  } catch { return 'main' }
}

function writeNet(n: Net) {
  try { localStorage.setItem(STORAGE_KEY_NET, n) } catch {}
}

const NET_TTL_MS = 1000
let lastNetAt = 0
let lastNet: Net = readNet()

// ---------- exchangerate cache (cache-only here; no tauri http) ----------
const STORAGE_KEY_RATE = 'mnd.exrate'
const STORAGE_KEY_RATE_AT = 'mnd.exrate_at'
const RATE_TTL_MS = 60_000 // 60s

function readCachedRate() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_RATE)
    const atStr = localStorage.getItem(STORAGE_KEY_RATE_AT)
    const at = atStr ? Number(atStr) : 0
    if (!v || !at) return null
    return { value: JSON.parse(v), at }
  } catch { return null }
}
function writeCachedRate(value: unknown) {
  try {
    localStorage.setItem(STORAGE_KEY_RATE, json(value))
    localStorage.setItem(STORAGE_KEY_RATE_AT, String(Date.now()))
  } catch {}
}

// ---------- router ----------
async function handle(req: HttpRequestEvent): Promise<TsResponse> {
  let pathname = '/'
  try {
    pathname = new URL(req.path, 'http://localhost').pathname
  } catch {
    pathname = String(req.path || '/')
  }

  // Ready probe
  if (req.method === 'GET' && pathname === '/bridge/ready') {
    return makeResp(req, 200, { ready: true, src: 'renderer' })
  }

  // Current network (cached)
  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/getNetwork') {
    const now = Date.now()
    if (now - lastNetAt >= NET_TTL_MS) {
      lastNet = readNet()
      lastNetAt = now
    }
    return makeResp(req, 200, { network: lastNet })
  }

  // Update network at runtime
  if (req.method === 'POST' && pathname === '/setNetwork') {
    const body = parseBody(req.body)
    const requested = String(body?.network ?? '').toLowerCase()
    const next: Net = requested === 'test' ? 'test' : requested === 'main' ? 'main' : lastNet

    if (next !== 'main' && next !== 'test') {
      return makeResp(req, 400, { ok: false, error: 'invalid_network', expected: ['main', 'test'] })
    }

    writeNet(next)
    lastNet = next
    lastNetAt = Date.now()
    return makeResp(req, 200, { ok: true, network: next })
  }

  // CORS-safe price placeholder:
  // For now, serve cached value if available; otherwise a harmless stub.
  // TODO (optional): add a Rust-side fetch command and call it from here.
  if (req.method === 'GET' && pathname === '/exchangerate') {
    const now = Date.now()
    const cached = readCachedRate()
    if (cached && (now - cached.at) < RATE_TTL_MS) {
      return makeResp(req, 200, { ...cached.value, cached: true })
    }
    // No fresh cache — return a safe stub so UI won’t crash
    return makeResp(req, 200, { cached: false, unavailable: true })
  }

  // Simple health/status
  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/getStatus') {
    return makeResp(req, 200, { status: 'ok', source: 'renderer' })
  }

  // Default: never 404 → avoid busy loops / retries
  return makeResp(req, 200, { ok: true })
}

// ---------- lifecycle ----------
let stop: null | (() => void) = null

export async function startHttpBridge() {
  if (stop) return

  const unlisten = await listen<string>('http-request', async (evt) => {
    let req: HttpRequestEvent | null = null
    try {
      const rawPayload = typeof evt.payload === 'string' ? evt.payload : String(evt.payload ?? '')
      const parsed = JSON.parse(rawPayload)
      req = normalizeReq(parsed)

      const id = `#${req.request_id}`
      logIn(req.method, req.path, id)

      const resp = await handle(req)

      // Emit OBJECT (not JSON string)
      await emit('ts-response', resp)

      logOut(resp.status, id)
    } catch (e) {
      const fallback: TsResponse = {
        request_id: (req?.request_id ?? 0),
        status: 200,
        body: json({ ok: true, note: 'bridge-fallback' }),
      }
      try { await emit('ts-response', fallback) } catch {}
      logWarn('handler error:', e)
    }
  })

  stop = () => { unlisten() }

  if (import.meta?.hot) {
    import.meta.hot.dispose(() => { unlisten() })
  }

  logSys('listener registered')
}
