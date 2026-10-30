import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error module JS sans types
import worker from './worker.js';

const env = { ALLOWED_ORIGIN: 'https://moi.github.io', GROQ_API_KEY: 'secret-groq', GEMINI_API_KEY: 'secret-gemini' };
const req = (path: string, origin = env.ALLOWED_ORIGIN, method = 'POST') =>
  new Request(`https://proxy.example${path}`, { method, headers: { origin, 'content-type': 'application/json' }, body: method === 'POST' ? '{"a":1}' : undefined });

describe('proxy Cloudflare', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuse une autre origine', async () => {
    const res = await worker.fetch(req('/groq', 'https://pirate.example'), env);
    expect(res.status).toBe(403);
  });

  it('ajoute la clé Groq côté serveur', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(req('/groq'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(env.ALLOWED_ORIGIN);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer secret-groq');
  });

  it('Gemini : modèle validé, clé en en-tête', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await worker.fetch(req('/gemini/gemini-3.5-flash-lite'), env);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.5-flash-lite:generateContent');
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('secret-gemini');
    expect((await worker.fetch(req('/gemini/..%2Fevil'), env)).status).toBe(400);
  });

  it('préflight CORS et routes inconnues', async () => {
    expect((await worker.fetch(req('/groq', env.ALLOWED_ORIGIN, 'OPTIONS'), env)).status).toBe(204);
    expect((await worker.fetch(req('/autre'), env)).status).toBe(404);
  });
});
