// src/fetchProxy.ts
import { invoke } from '@tauri-apps/api/core'

// Only patch once
if (typeof window !== 'undefined') {
  const g = window as unknown as { __mndNetPatches?: boolean }
  if (!g.__mndNetPatches) {
    g.__mndNetPatches = true

    // ---------- helpers ----------
    const TRACKER_HOSTS = new Set<string>([
      'overlay-eu-1.bsvb.tech',
      'overlay-ap-1.bsvb.tech',
      'backend.2efa4b8fe4c2bd42083636871b007e9e.projects.babbage.systems',
    ])

    function isHttps(u: string): boolean {
      try {
        return new URL(u).protocol === 'https:'
      } catch {
        return false
      }
    }
    function hostOf(u: string): string {
      try {
        return new URL(u).hostname
      } catch {
        return ''
      }
    }
    function pathOf(u: string): string {
      try {
        return new URL(u).pathname.toLowerCase()
      } catch {
        return ''
      }
    }
    function isHttpsManifest(u: string): boolean {
      if (!isHttps(u)) return false
      const p = pathOf(u)
      return p.endsWith('/manifest.json') || p === '/manifest.json'
    }
    function isLookup(u: string): boolean {
      return pathOf(u) === '/lookup'
    }

    async function proxyManifest(url: string) {
      return invoke<{
        status: number
        headers: Array<[string, string]>
        body: string
      }>('proxy_fetch_manifest', { url })
    }

    async function proxyAny(method: string, url: string, init?: RequestInit) {
      const hdrs: Array<[string, string]> = []
      const h = new Headers(init?.headers || {})
      h.forEach((v, k) => hdrs.push([k, v]))

      let body: string | undefined
      if (init?.body != null) {
        if (typeof init.body === 'string') body = init.body
        else if (init.body instanceof Blob) body = await init.body.text()
        else if (init.body instanceof ArrayBuffer) body = new TextDecoder().decode(init.body)
        else if ((init.body as any)?.text) body = await (init.body as any).text()
      }

      return invoke<{
        status: number
        headers: Array<[string, string]>
        body: string
      }>('proxy_fetch_any', { method, url, headers: hdrs, body })
    }

    // ---------- fetch() patch ----------
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url

      // 1) Always proxy manifest.json over Tauri to bypass CORS + add timeouts
      if (isHttpsManifest(url)) {
        try {
          const r = await proxyManifest(url)
          return new Response(r.body, { status: r.status, headers: new Headers(r.headers) })
        } catch (e) {
          console.warn('[MND] proxy_fetch_manifest (fetch) failed; falling back:', e)
          return originalFetch(input as any, init as any)
        }
      }

      // 2) /lookup for known tracker hosts → try proxy, soft-fail on error
      if (isHttps(url) && isLookup(url) && TRACKER_HOSTS.has(hostOf(url))) {
        try {
          const r = await proxyAny((init?.method || 'GET'), url, init)
          return new Response(r.body, { status: r.status, headers: new Headers(r.headers) })
        } catch (e) {
          console.warn('[MND] proxy_fetch_any (lookup) failed; serving soft empty hosts:', e)
          return new Response(JSON.stringify({ hosts: [] }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-mnd-soft-fail': 'true',
              'cache-control': 'no-store',
            },
          })
        }
      }

      return originalFetch(input as any, init as any)
    }

    // ---------- XMLHttpRequest patch (covers axios/XHR paths) ----------
    const OriginalXHR = window.XMLHttpRequest

    class ProxyXHR extends OriginalXHR {
      private __mnd_url: string | null = null
      private __mnd_method: string = 'GET'
      private __mnd_headers: Record<string, string> = {}

      override open(method: string, url: string, async?: boolean, user?: string | null, password?: string | null): void {
        this.__mnd_method = (method || 'GET').toUpperCase()
        this.__mnd_url = url
        this.__mnd_headers = {}

        // For non-intercepted requests, pass through
        if (!(isHttpsManifest(url) || (isHttps(url) && isLookup(url) && TRACKER_HOSTS.has(hostOf(url))))) {
          return super.open(method, url, async ?? true, user as any, password as any)
        }

        // Keep XHR state machine happy; we'll short-circuit in send()
        super.open(method, 'about:blank', async ?? true, user as any, password as any)
      }

      override setRequestHeader(name: string, value: string): void {
        try { this.__mnd_headers[name] = value } catch {}
        try { super.setRequestHeader(name, value) } catch {}
      }

      private async fulfillWith(status: number, body: string, headers: Array<[string, string]>, responseURL: string) {
        const headersMap = new Map<string, string>()
        for (const [k, v] of headers) headersMap.set(k.toLowerCase(), v)

        Object.defineProperty(this, 'status', { value: status })
        Object.defineProperty(this, 'statusText', { value: String(status) })
        Object.defineProperty(this, 'responseURL', { value: responseURL })
        ;(this as any).getAllResponseHeaders = () =>
          Array.from(headersMap.entries()).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n'
        ;(this as any).getResponseHeader = (n: string) => headersMap.get(String(n || '').toLowerCase()) ?? null
        Object.defineProperty(this, 'responseText', { value: body })
        Object.defineProperty(this, 'response', { value: body })
        ;(this as any).readyState = 4 // DONE
        this.dispatchEvent(new Event('readystatechange'))
        this.dispatchEvent(new Event('load'))
        if (typeof (this as any).onload === 'function') (this as any).onload!(new Event('load') as any)
        this.dispatchEvent(new Event('loadend'))
      }

      override async send(body?: Document | BodyInit | null): Promise<void> {
        const url = this.__mnd_url
        const method = this.__mnd_method
        if (!url) return super.send(body as any)

        const interceptManifest = isHttpsManifest(url)
        const interceptLookup = isHttps(url) && isLookup(url) && TRACKER_HOSTS.has(hostOf(url))

        if (!interceptManifest && !interceptLookup) {
          return super.send(body as any)
        }

        try {
          if (interceptManifest) {
            const r = await proxyManifest(url)
            return this.fulfillWith(r.status, r.body, r.headers, url)
          } else {
            // lookup → try proxy, soft-fail on error
            try {
              const init: RequestInit = { method }
              if (Object.keys(this.__mnd_headers).length) init.headers = this.__mnd_headers
              if (body != null) {
                if (typeof body === 'string') init.body = body
                else if (body instanceof Blob) init.body = await body.text()
              }
              const r = await proxyAny(method, url, init)
              return this.fulfillWith(r.status, r.body, r.headers, url)
            } catch (e) {
              console.warn('[MND] proxy (XHR lookup) failed; serving soft empty hosts:', e)
              return this.fulfillWith(
                200,
                '{"hosts":[]}',
                [['content-type', 'application/json'], ['x-mnd-soft-fail', 'true']],
                url
              )
            }
          }
        } catch (_e) {
          // If manifest proxy fails, fall back to native XHR
          return super.send(body as any)
        }
      }
    }

    try {
      // Install our XHR shim
      ;(window as any).XMLHttpRequest = ProxyXHR
    } catch (e) {
      console.warn('[MND] Unable to patch XMLHttpRequest:', e)
    }

    // ---------- Optional: disarm <link rel="manifest"> auto-fetch ----------
    try {
      const prune = () => {
        document.querySelectorAll('link[rel="manifest"]').forEach(el => el.parentElement?.removeChild(el))
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', prune, { once: true })
      } else {
        prune()
      }
    } catch {}

    console.info('[MND] manifest + lookup proxy (fetch + XHR) active')
  }
}
