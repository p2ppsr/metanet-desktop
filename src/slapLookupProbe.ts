// src/slapLookupProbe.ts
// SLAP probe that prefers Tauri proxy (proxy_fetch_any) to avoid CORS/DNS issues,
// falls back to direct fetch, and returns compact summaries (no huge BEEF arrays).

import { invoke } from '@tauri-apps/api/core'

type LookupQuestion = { service: string; query: unknown }

type ProbeSummary = {
  tracker: string
  url: string
  ok: boolean
  status?: number
  jsonPreview?: unknown
  outputList?: {
    totalOutputs: number
    sample: Array<{
      outputIndex: number
      beefLen: number
      ctxLen: number
    }>
  }
  error?: string
  via?: 'tauri' | 'fetch'
}

const DEFAULT_TRACKERS = [
  'https://overlay-us-1.bsvb.tech',
  'https://overlay-eu-1.bsvb.tech',
  'https://overlay-ap-1.bsvb.tech',
  'https://users.bapp.dev',
]

// Try to call the *original* fetch if our fetch shim saved it; else use global fetch.
function getBypassFetch(): typeof fetch {
  const og = (globalThis as any).__mndOriginalFetch
  return typeof og === 'function' ? og.bind(globalThis) : fetch.bind(globalThis)
}

function safeJsonParse<T = unknown>(s: string): T | undefined {
  try { return JSON.parse(s) as T } catch { return undefined }
}

function truncateString(s: string, max = 2000): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `… [truncated ${s.length - max} chars]`
}

async function postJsonViaTauri(url: string, bodyObj: any, timeoutMs: number) {
  const timer = setTimeout(() => {
    // We can’t abort invoke(); we just race with a timeout.
    // The promise below will reject on timeout first.
  }, timeoutMs)

  try {
    const headers: Array<[string, string]> = [
      ['content-type', 'application/json'],
      ['x-mnd-bypass', '1'],
    ]
    const body = JSON.stringify(bodyObj)
    const p = invoke<{ status: number; headers: Array<[string, string]>; body: string }>(
      'proxy_fetch_any',
      { method: 'POST', url, headers, body }
    )

    // Race with timeout
    const winner = await Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timeout (tauri)')), timeoutMs)),
    ])

    const text = (winner as any).body ?? ''
    const preview = truncateString(text, 2000)
    const jsonPreview = safeJsonParse(preview)
    return {
      via: 'tauri' as const,
      ok: (winner as any).status >= 200 && (winner as any).status < 300,
      status: (winner as any).status,
      textPreview: preview,
      jsonPreview,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function postJsonViaFetch(url: string, bodyObj: any, timeoutMs: number) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timer = setTimeout(() => { try { controller?.abort() } catch {} }, timeoutMs)

  try {
    const f = getBypassFetch()
    const res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // hint to any local shim we want a direct call
        'x-mnd-bypass': '1',
      },
      body: JSON.stringify(bodyObj),
      signal: controller?.signal,
    })
    const text = await res.text()
    const preview = truncateString(text, 2000)
    const jsonPreview = safeJsonParse(preview)
    return { via: 'fetch' as const, ok: res.ok, status: res.status, textPreview: preview, jsonPreview }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Probe trackers and return compact, non-spammy details.
 * @param service SLAP service name (e.g. 'ls_users')
 * @param options.trackers override tracker list
 * @param options.limit how many outputs to include in the sample summary (default 3)
 * @param options.timeoutMs per-request timeout (default 10000ms)
 */
export async function slapLookupProbe(
  service: string,
  options: { trackers?: string[]; limit?: number; timeoutMs?: number } = {}
): Promise<ProbeSummary[]> {
  const trackers = options.trackers ?? DEFAULT_TRACKERS
  const limit = options.limit ?? 3
  const timeoutMs = options.timeoutMs ?? 10_000

  const question: LookupQuestion = {
    service: 'ls_slap',
    query: { service },
  }

  const results: ProbeSummary[] = []

  for (const base of trackers) {
    const url = `${base}/lookup`
    console.groupCollapsed(`[SLAP probe] POST ${url} body=${JSON.stringify(question)}`)
    try {
      // Prefer Tauri proxy (bypasses WebView networking limits), then fallback to fetch.
      let r:
        | { via: 'tauri' | 'fetch'; ok: boolean; status?: number; textPreview: string; jsonPreview?: unknown }
        | undefined

      try {
        r = await postJsonViaTauri(url, question, timeoutMs)
      } catch (e) {
        console.warn('[SLAP probe] tauri proxy failed, falling back to fetch:', e)
        r = await postJsonViaFetch(url, question, timeoutMs)
      }

      const summary: ProbeSummary = { tracker: base, url, ok: r.ok, status: r.status, via: r.via }

      // Try to summarize if it looks like { type: 'output-list', outputs: [...] }
      const j = r.jsonPreview as any
      if (j && j.type === 'output-list' && Array.isArray(j.outputs)) {
        const total = j.outputs.length >>> 0
        const sample = j.outputs.slice(0, limit).map((o: any) => ({
          outputIndex: Number(o?.outputIndex ?? -1),
          beefLen: Array.isArray(o?.beef) ? o.beef.length : 0,
          ctxLen: Array.isArray(o?.context) ? o.context.length : 0,
        }))
        summary.outputList = { totalOutputs: total, sample }
        summary.jsonPreview = {
          type: j.type,
          outputs: sample,
          totalOutputs: total,
          _note: `Preview shows first ${sample.length} of ${total} outputs (arrays elided).`,
        }
      } else {
        // Not an output-list or parse failed; include the small preview we parsed (or raw preview string)
        summary.jsonPreview = r.jsonPreview ?? r.textPreview
      }

      console.log('status:', r.status, 'ok:', r.ok, 'via:', r.via)
      console.log('preview JSON:', summary.jsonPreview)
      if (summary.outputList) console.table(summary.outputList.sample)

      results.push(summary)
    } catch (e: any) {
      console.warn('[SLAP probe] error:', e)
      results.push({ tracker: base, url, ok: false, error: String(e?.message ?? e) })
    } finally {
      console.groupEnd()
    }
  }

  try {
    console.table(results.map(r => ({
      tracker: r.tracker,
      ok: r.ok,
      status: r.status ?? '-',
      via: r.via ?? '-',
      outputs: r.outputList?.totalOutputs ?? '-',
      sample: r.outputList?.sample?.length ?? '-',
      err: r.error ?? '',
    })))
  } catch {}

  return results
}

// Expose globally for DevTools usage
declare global {
  interface Window {
    slapProbe?: (service: string, options?: { trackers?: string[]; limit?: number; timeoutMs?: number }) => Promise<ProbeSummary[]>
  }
}
if (typeof window !== 'undefined') {
  (window as any).slapProbe = slapLookupProbe
}

export default slapLookupProbe
