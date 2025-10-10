// src/fetchProxy.ts
import { invoke } from '@tauri-apps/api/core'

// Only patch once
if (typeof window !== 'undefined') {
  const g = window as unknown as { __mndNetPatches?: boolean }
  if (!g.__mndNetPatches) {
    g.__mndNetPatches = true

    // ---------- helpers ----------
    function toURL(u: string): URL | null {
      try { return new URL(u, window.location.href) } catch { return null }
    }
    function isHttps(u: string): boolean {
      const t = toURL(u); return t ? t.protocol === 'https:' : false
    }
    function hostOf(u: string): string {
      const t = toURL(u); return t ? t.hostname : ''
    }
    function pathOf(u: string): string {
      const t = toURL(u); return t ? t.pathname.toLowerCase() : ''
    }
    function isHttpsManifest(u: string): boolean {
      if (!isHttps(u)) return false
      const p = pathOf(u)
      return p.endsWith('/manifest.json') || p === '/manifest.json'
    }
    const isLookup = (u: string) => pathOf(u) === '/lookup'
    const isOverlayHost = (h: string) => /^overlay-[a-z]+-\d+\.bsvb\.tech$/i.test(h)
    // Any backend under *.projects.babbage.systems (and fallback *.babbage.systems)
    const isBackendHost = (h: string) =>
      /\.projects\.babbage\.systems$/i.test(h) || /\.babbage\.systems$/i.test(h)

    // Return a valid empty JSON payload the UI can consume
    function softJsonEmpty(): Response {
      const body = JSON.stringify({ type: 'output-list', outputs: [] })
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-mnd-soft-fail': 'true',
          'cache-control': 'no-store',
        },
      })
    }

    async function proxyManifest(url: string) {
      return invoke<{
        status: number
        headers: Array<[string, string]>
        body: string
      }>('proxy_fetch_manifest', { url })
    }

    async function proxyAny(method: string, url: string, init?: RequestInit) {
      // collect headers
      const hdrs: Array<[string, string]> = []
      const h = new Headers(init?.headers || {})
      h.forEach((v, k) => hdrs.push([k, v]))

      // best-effort body extraction (most lookups are GET anyway)
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
    ;(window as any).__mndOriginalFetch = originalFetch

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url

      // Explicit bypass hook (kept for tooling)
      const bypass = !!(init && new Headers(init.headers || {}).get('x-mnd-bypass'))
      if (bypass) {
        return originalFetch(input as any, init as any)
      }

      // Force overlay /lookup to be a network error so the SDK falls back to backend
      if (isLookup(url) && isOverlayHost(hostOf(url))) {
        console.warn('[MND] overlay lookup -> forcing network error to trigger backend fallback:', url)
        return Promise.reject(new TypeError('Failed to fetch')) // simulate network error
      }

      // Proxy *any* backend /lookup (*.projects.babbage.systems) via Tauri to bypass CORS
      if (isHttps(url) && isLookup(url) && isBackendHost(hostOf(url))) {
        try {
          console.info('[MND] proxying backend /lookup via tauri (fetch):', url)
          const r = await proxyAny((init?.method || 'GET'), url, init)
          return new Response(r.body ?? '', { status: r.status, headers: new Headers(r.headers) })
        } catch (e) {
          console.warn('[MND] backend /lookup via tauri FAILED (fetch); returning 200 empty JSON:', e, url)
          return softJsonEmpty()
        }
      }

      // Proxy HTTPS manifest.json
      if (isHttpsManifest(url)) {
        try {
          const r = await proxyManifest(url)
          return new Response(r.body, { status: r.status, headers: new Headers(r.headers) })
        } catch (e) {
          console.warn('[MND] proxy_fetch_manifest (fetch) failed; falling back:', e)
          return originalFetch(input as any, init as any)
        }
      }

      // Pass-through for everything else
      return originalFetch(input as any, init as any)
    }

    // ---------- XMLHttpRequest patch ----------
    const OriginalXHR = window.XMLHttpRequest

    class ProxyXHR extends OriginalXHR {
      private __mnd_url: string | null = null
      private __mnd_method: string = 'GET'
      private __mnd_headers: Record<string, string> = {}

      override open(method: string, url: string, async?: boolean, user?: string | null, password?: string | null): void {
        this.__mnd_method = (method || 'GET').toUpperCase()
        this.__mnd_url = url
        this.__mnd_headers = {}

        const h = hostOf(url)
        const intercept =
          isHttpsManifest(url) ||
          (isLookup(url) && (isOverlayHost(h) || (isHttps(url) && isBackendHost(h))))

        if (!intercept) {
          return super.open(method, url, async ?? true, user as any, password as any)
        }

        // Intercepted: fulfill later
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
        ;(this as any).readyState = 4
        this.dispatchEvent(new Event('readystatechange'))
        this.dispatchEvent(new Event('load'))
        if (typeof (this as any).onload === 'function') (this as any).onload!(new Event('load') as any)
        this.dispatchEvent(new Event('loadend'))
      }

      override async send(body?: Document | BodyInit | null): Promise<void> {
        const url = this.__mnd_url
        const method = this.__mnd_method
        if (!url) return super.send(body as any)

        const h = hostOf(url)

        // Overlay lookups: simulate network error so fallback runs
        if (isLookup(url) && isOverlayHost(h)) {
          console.warn('[MND] overlay XHR lookup -> forcing network error to trigger backend fallback:', url)
          // Network error semantics for XHR: status stays 0, fire `error`, then `loadend`
          ;(this as any).readyState = 4
          this.dispatchEvent(new ProgressEvent('error'))
          this.dispatchEvent(new Event('loadend'))
          return
        }

        // Backend lookup: proxy via Tauri for any *.projects.babbage.systems
        if (isHttps(url) && isLookup(url) && isBackendHost(h)) {
          try {
            console.info('[MND] proxying backend /lookup via tauri (XHR):', url)
            const init: RequestInit = { method, headers: this.__mnd_headers }
            if (body != null) {
              if (typeof body === 'string') init.body = body
              else if (body instanceof Blob) init.body = await body.text()
            }
            const r = await proxyAny(method, url, init)
            return this.fulfillWith(r.status, r.body ?? '', r.headers, url)
          } catch (e) {
            console.warn('[MND] backend /lookup via tauri FAILED (XHR); 200 empty JSON:', e, url)
            return this.fulfillWith(
              200,
              JSON.stringify({ type: 'output-list', outputs: [] }),
              [['content-type', 'application/json'], ['x-mnd-soft-fail', 'true'], ['cache-control', 'no-store']],
              url
            )
          }
        }

        // Manifest: proxy via Tauri
        if (isHttpsManifest(url)) {
          try {
            const r = await proxyManifest(url)
            return this.fulfillWith(r.status, r.body, r.headers, url)
          } catch {
            // fall back to native XHR if proxy fails
            return super.send(body as any)
          }
        }

        // Not intercepted
        return super.send(body as any)
      }
    }

    try {
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

    console.info('[MND] manifest + generalized backend /lookup proxy active (overlay lookups force network error)')
  }
}
