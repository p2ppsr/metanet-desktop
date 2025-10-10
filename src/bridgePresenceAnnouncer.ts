// src/bridgePresenceAnnouncer.ts
export {} // make this file an external module so `declare global` is allowed

/* Broadcast that Metanet Desktop is present/ready so pages like Gateway can
   auto-dismiss their "requires Desktop" modal without a manual reload. */

declare global {
  interface Window {
    __mndAnnouncePresence?: () => void
    __mndPresenceInstalled?: boolean
  }
}

(function setupPresence() {
  if (typeof window === 'undefined') return
  const g = window as Window & { __mndPresenceInstalled?: boolean; __mndAnnouncePresence?: () => void }
  if (g.__mndPresenceInstalled) return
  g.__mndPresenceInstalled = true

  const bc = (() => {
    try { return new BroadcastChannel('metanet-desktop') } catch { return null }
  })()

  const payload = () => ({
    type: 'metanet-desktop-ready',
    ts: Date.now(),
    ua: navigator.userAgent || '',
  })

  function announceOnce() {
    try { window.postMessage(payload(), '*') } catch {}
    try { bc?.postMessage(payload()) } catch {}
    try {
      localStorage.setItem('metanet-desktop:ready', String(Date.now()))
      localStorage.removeItem('metanet-desktop:ready')
    } catch {}
  }

  function burst(times = 6, intervalMs = 800) {
    let n = 0
    const id = setInterval(() => {
      announceOnce()
      if (++n >= times) clearInterval(id)
    }, intervalMs)
  }

  g.__mndAnnouncePresence = () => { burst(3, 500) }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => burst(), { once: true })
  } else {
    burst()
  }

  window.addEventListener('focus', () => burst(2, 400))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) burst(2, 400)
  })
})();
