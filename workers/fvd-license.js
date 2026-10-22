// Cloudflare Worker — Pro license check. The list of valid keys lives only here, never in the extension.
//
// Setup (Workers & Pages → Create → paste this file):
//   Settings → Variables and Secrets → add a SECRET named LICENSE_KEY_HASHES.
//   Value: comma-separated SHA-256 key digests, e.g.  2292da59...394dec,abcd...
//   The digest already shipped in license.js MUST be in the list, or existing Pro users lose Pro.
//   To revoke a key, remove its digest from the secret. To add a buyer, append one.
//
// After deploy, copy the workers.dev URL into LICENSE_API in license.js.

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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    let digest = '';
    try {
      digest = String((await request.json()).digest || '').toLowerCase();
    } catch (e) {
      return json({ error: 'bad_request' }, 400);
    }
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      return json({ valid: false });
    }

    // A missing secret is a deploy mistake, not "invalid": answer 500 so the extension
    // treats it as unreachable and paid users keep Pro.
    if (!env.LICENSE_KEY_HASHES) {
      return json({ error: 'not_configured' }, 500);
    }
    const valid = env.LICENSE_KEY_HASHES.split(',').map((h) => h.trim().toLowerCase()).includes(digest);
    return json({ valid });
  }
};
