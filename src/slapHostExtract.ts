// src/slapHostExtract.ts
// Minimal extractor: pulls hostnames/URLs out of SLAP output-list "beef" blobs.

export type SlapEnvelope = {
  type: string;
  outputs?: Array<{ beef?: number[]; tape?: unknown }>;
};

const urlRegex = /https?:\/\/([a-z0-9\.\-]+)(?::\d+)?/gi;

export function extractHostsFromSlap(jsonLike: unknown): string[] {
  const env = jsonLike as SlapEnvelope;
  if (!env || env.type !== 'output-list' || !Array.isArray(env.outputs)) return [];

  const seen = new Set<string>();
  const td = new TextDecoder('utf-8', { fatal: false });

  for (const out of env.outputs) {
    if (!out?.beef || !Array.isArray(out.beef)) continue;

    try {
      const u8 = new Uint8Array(out.beef as number[]);
      const text = td.decode(u8);

      // Collect hostnames from embedded URLs
      for (const m of text.matchAll(urlRegex)) {
        const host = m[1]?.toLowerCase();
        if (host) seen.add(host);
      }

      // Also pick up bare hostnames that might appear without scheme
      // (very loose, but harmless)
      const hostish = text.match(/\b([a-z0-9\-]+\.)+[a-z]{2,}\b/gi) || [];
      for (const h of hostish) seen.add(h.toLowerCase());
    } catch {
      // best effort; ignore this output if decode fails
    }
  }
  return Array.from(seen);
}
