// Cloudflare Worker — Free-tier 1 download / 60 minutes (survives extension reinstall)
// Dashboard: Workers & Pages → Create → paste this file. No KV bind required.
//
// After deploy, copy the workers.dev URL into FREE_RATE_LIMIT_API in license.js

const WINDOW_MS = 60 * 60 * 1000;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

async function clientId(request) {
  const ip = (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0] ||
    '0'
  ).trim();
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('fvd-free-v1|' + ip)
  );
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    const id = await clientId(request);
    const cache = caches.default;
    const cacheKey = new Request(new URL('/slot/' + id, request.url).toString(), { method: 'GET' });
    const now = Date.now();
    const hit = await cache.match(cacheKey);

    if (hit) {
      const started = parseInt(await hit.text(), 10);
      if (Number.isFinite(started) && now - started < WINDOW_MS) {
        const minutesRemaining = Math.max(1, Math.ceil((WINDOW_MS - (now - started)) / 60000));
        return json({ allowed: false, minutesRemaining });
      }
    }

    await cache.put(
      cacheKey,
      new Response(String(now), {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'text/plain'
        }
      })
    );
    return json({ allowed: true, minutesRemaining: 0 });
  }
};
