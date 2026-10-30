// Proxy FitPilot (Cloudflare Workers, offre gratuite).
// Garde les clés API côté Cloudflare (secrets) : le téléphone n'en a plus besoin.
// Routes : POST /groq            → Groq chat completions
//          POST /gemini/<modèle> → Gemini generateContent
// Variables : ALLOWED_ORIGIN (ex. https://ton-pseudo.github.io), secrets GROQ_API_KEY / GEMINI_API_KEY.

const MAX_BODY = 64 * 1024;

function cors(origin, allowed) {
  return {
    'access-control-allow-origin': origin === allowed ? origin : 'null',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? '';
    const headers = cors(origin, env.ALLOWED_ORIGIN);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (origin !== env.ALLOWED_ORIGIN) return new Response('Origine non autorisée', { status: 403, headers });
    if (request.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers });

    const body = await request.text();
    if (body.length > MAX_BODY) return new Response('Requête trop grande', { status: 413, headers });

    const url = new URL(request.url);
    let upstream;
    if (url.pathname === '/groq') {
      if (!env.GROQ_API_KEY) return new Response('GROQ_API_KEY manquante', { status: 500, headers });
      upstream = fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
        body,
      });
    } else if (url.pathname.startsWith('/gemini/')) {
      const model = decodeURIComponent(url.pathname.slice('/gemini/'.length));
      if (!/^[a-z0-9.\-]+$/i.test(model)) return new Response('Modèle invalide', { status: 400, headers });
      if (!env.GEMINI_API_KEY) return new Response('GEMINI_API_KEY manquante', { status: 500, headers });
      upstream = fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body,
      });
    } else {
      return new Response('Introuvable', { status: 404, headers });
    }

    const res = await upstream;
    return new Response(res.body, { status: res.status, headers: { ...headers, 'content-type': 'application/json' } });
  },
};
