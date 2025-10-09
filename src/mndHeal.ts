// src/mndHeal.ts
const LOG = (...a: any[]) => console.log('[mnd-heal]', ...a);

// ---- Tunables
const CRITICAL_ENDPOINTS = [
  '/wallet-proxy/health',
  '/.well-known/auth/health',
  '/api/getVersion'
];
const RELOAD_AFTER_TOTAL_MS = 20000;
const PER_TRY_TIMEOUT_MS   = 3000;
const MAX_RETRIES_PER_URL  = 4;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = PER_TRY_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort('timeout'), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

async function pingOnce(url: string) {
  try {
    const r = await fetchWithTimeout(url, { method: 'GET', credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  } catch (e) {
    LOG('ping failed', url, String(e));
    return false;
  }
}

async function retryPing(url: string, maxRetries = MAX_RETRIES_PER_URL) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    if (await pingOnce(url)) return true;
    const delay = Math.min(500 * Math.pow(2, attempt), 4000);
    await sleep(delay);
    attempt++;
  }
  return false;
}

function ensureBanner() {
  if (document.getElementById('mnd-heal-banner')) return;
  const div = document.createElement('div');
  div.id = 'mnd-heal-banner';
  div.style.cssText = `
    position: fixed; bottom: 8px; left: 8px; z-index: 99999;
    padding: 8px 12px; border-radius: 6px; background: rgba(0,0,0,.75);
    color: #fff; font: 14px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,.35);
  `;
  div.textContent = 'Reconnecting to local wallet…';
  document.body.appendChild(div);
}
const updateBanner = (msg: string) => {
  const el = document.getElementById('mnd-heal-banner');
  if (el) el.textContent = msg;
};
const removeBanner = () => document.getElementById('mnd-heal-banner')?.remove();

async function watchdog() {
  const start = Date.now();
  ensureBanner();

  while (Date.now() - start < RELOAD_AFTER_TOTAL_MS) {
    updateBanner('Reconnecting to local wallet…');
    const results = await Promise.all(CRITICAL_ENDPOINTS.map(u => retryPing(u)));
    if (results.some(Boolean)) {
      removeBanner();
      LOG('bridge healthy again');
      return;
    }
    updateBanner('Still reconnecting…');
    await sleep(1000);
  }

  // Final fallback: single cache-busting reload
  updateBanner('Refreshing…');
  const url = new URL(location.href);
  url.searchParams.set('_mnd_reload', Date.now().toString());
  location.replace(url.toString());
}

export async function startMndHeal() {
  // quick background check after load
  const results = await Promise.all(CRITICAL_ENDPOINTS.map(u => pingOnce(u)));
  if (!results.every(Boolean)) {
    void watchdog(); // don’t block UI
  }

  // also react to network changes
  window.addEventListener('online',  () => { LOG('online');  void startMndHeal(); });
  window.addEventListener('offline', () => { LOG('offline'); ensureBanner(); updateBanner('Offline…'); });
}
