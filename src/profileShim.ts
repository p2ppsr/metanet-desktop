// src/profileShim.ts
// Ensure activeProfile exists *and* is always readable during early app boot.

type Profile = {
  id: string
  name: string
  active: boolean
  createdAt: number | null
  identityKey: string
}

const PLACEHOLDER: Profile = {
  id: 'bootstrap',
  name: 'bootstrap',
  active: true,
  createdAt: null,
  identityKey: 'unknown'
}

function parseProfile(s: string | null): Profile | null {
  if (!s) return null
  try {
    const p = JSON.parse(s)
    if (p && typeof p.id === 'string' && p.id) return p as Profile
  } catch {}
  return null
}

function seedIfNeeded() {
  try {
    const curr = parseProfile(localStorage.getItem('activeProfile'))
    if (!curr) {
      localStorage.setItem('activeProfile', JSON.stringify(PLACEHOLDER))
      // fire a storage event so any listeners inside the UI lib react
      try {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'activeProfile',
            newValue: JSON.stringify(PLACEHOLDER),
            oldValue: null,
            storageArea: localStorage,
          })
        )
      } catch {}
      console.info('[MND] seeded activeProfile placeholder')
    }
  } catch (e) {
    console.warn('[MND] unable to seed activeProfile', e)
  }
}

function hardenGetter() {
  try {
    const StorageProto = Object.getPrototypeOf(localStorage) as Storage
    const origGetItem = StorageProto.getItem
    StorageProto.getItem = function (this: Storage, key: string) {
      const v = origGetItem.call(this, key)
      if (key === 'activeProfile') {
        const p = parseProfile(v)
        if (!p) return JSON.stringify(PLACEHOLDER)
      }
      return v
    }
  } catch (e) {
    console.warn('[MND] could not patch localStorage.getItem', e)
  }
}

function suppressEarlyNullRejection() {
  // Some builds throw an unhandled rejection when activeProfile is null very early.
  window.addEventListener('unhandledrejection', (ev) => {
    const msg = String(ev.reason || '')
    if (msg.includes("activeProfile.id") || msg.includes("activeProfile") || msg.includes("null is not an object")) {
      // Ensure seed (in case something wiped it) and swallow the early rejection.
      try { seedIfNeeded() } catch {}
      ev.preventDefault()
      console.info('[MND] suppressed early activeProfile null rejection')
    }
  })
}

seedIfNeeded()
hardenGetter()
suppressEarlyNullRejection()
