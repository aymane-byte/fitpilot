// Fournisseurs du coach : interface commune, appels Gemini / Groq, repli automatique sur les règles.
import { compactSummary, type CoachContext } from './context';
import { rulesReply, type ExerciseInfo } from './rules';

export type ProviderId = 'rules' | 'gemini' | 'groq';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Usage {
  input?: number;
  output?: number;
  total?: number;
}

export interface ProviderReply {
  text: string;
  usage?: Usage;
}

export interface ProviderConfig {
  apiKey?: string;
  model: string;
  /** URL d'un proxy (Cloudflare Worker) qui ajoute la clé côté serveur. */
  proxyUrl?: string;
}

export interface CoachProvider {
  id: ProviderId;
  reply(turns: ChatTurn[], ctx: CoachContext, signal: AbortSignal): Promise<ProviderReply>;
}

export class ProviderError extends Error {
  constructor(
    public reason: 'noKey' | 'timeout' | 'rateLimit' | 'quota' | 'auth' | 'http' | 'network' | 'empty' | 'offline',
    public status?: number,
  ) {
    super(reason);
  }
}

export const DEFAULT_MODELS: Record<'gemini' | 'groq', string> = {
  gemini: 'gemini-3.5-flash-lite',
  groq: 'openai/gpt-oss-20b',
};

/** Modèles proposés (vérifiés gratuits en octobre 2026 ; le champ reste modifiable). */
export const MODEL_CHOICES: Record<'gemini' | 'groq', string[]> = {
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  groq: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
};

const MAX_TURNS = 8;
const MAX_OUTPUT_TOKENS = 900;

/** Consignes de sécurité communes, envoyées à chaque appel LLM. */
export function systemPrompt(ctx: CoachContext): string {
  return [
    'Tu es FitPilot Coach, un coach sportif et nutrition bienveillant. Réponds en français, de façon concise et concrète (max ~200 mots), avec des listes courtes si utile.',
    'Appuie-toi UNIQUEMENT sur les données ci-dessous ; si une donnée manque, dis-le et dis que tu n’es pas sûr.',
    'Règles de sécurité obligatoires :',
    '- Aucun diagnostic médical, aucun médicament ; en cas de douleur, blessure, maladie, grossesse ou traitement, recommande un médecin.',
    `- Jamais de calories sous le BMR (${ctx.raw.targets.bmr} kcal) ; perte de poids max 0,5–1 % du poids par semaine.`,
    '- Pas de surentraînement : au moins 1–2 jours de repos par semaine, pas de jambes lourdes la veille d’une course.',
    '- Respecte les allergies et blessures indiquées. Cuisine marocaine familiale bienvenue.',
    'Données (JSON compact, 14 derniers jours) :',
    compactSummary(ctx),
  ].join('\n');
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw new ProviderError('timeout');
    throw new ProviderError('network');
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('auth', res.status);
  if (res.status === 429) throw new ProviderError('quota', 429);
  if (!res.ok) throw new ProviderError('http', res.status);
  return res.json();
}

export function geminiProvider(cfg: ProviderConfig): CoachProvider {
  return {
    id: 'gemini',
    async reply(turns, ctx, signal) {
      if (!cfg.apiKey && !cfg.proxyUrl) throw new ProviderError('noKey');
      const body = {
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents: turns.slice(-MAX_TURNS).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature: 0.5, maxOutputTokens: MAX_OUTPUT_TOKENS },
      };
      const url = cfg.proxyUrl
        ? `${cfg.proxyUrl.replace(/\/$/, '')}/gemini/${encodeURIComponent(cfg.model)}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
      const json = (await postJson(url, body, cfg.proxyUrl ? {} : { 'x-goog-api-key': cfg.apiKey! }, signal)) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
      if (!text) throw new ProviderError('empty');
      const u = json.usageMetadata;
      return { text, usage: u ? { input: u.promptTokenCount, output: u.candidatesTokenCount, total: u.totalTokenCount } : undefined };
    },
  };
}

export function groqProvider(cfg: ProviderConfig): CoachProvider {
  return {
    id: 'groq',
    async reply(turns, ctx, signal) {
      if (!cfg.apiKey && !cfg.proxyUrl) throw new ProviderError('noKey');
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: [{ role: 'system', content: systemPrompt(ctx) }, ...turns.slice(-MAX_TURNS)],
        temperature: 0.5,
        max_tokens: MAX_OUTPUT_TOKENS,
      };
      // Les modèles gpt-oss raisonnent avant de répondre : effort réduit pour économiser le quota gratuit.
      if (cfg.model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
      const url = cfg.proxyUrl ? `${cfg.proxyUrl.replace(/\/$/, '')}/groq` : 'https://api.groq.com/openai/v1/chat/completions';
      const json = (await postJson(url, body, cfg.proxyUrl ? {} : { authorization: `Bearer ${cfg.apiKey}` }, signal)) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new ProviderError('empty');
      const u = json.usage;
      return { text, usage: u ? { input: u.prompt_tokens, output: u.completion_tokens, total: u.total_tokens } : undefined };
    },
  };
}

export function rulesProvider(exercises: ExerciseInfo[]): CoachProvider {
  return {
    id: 'rules',
    async reply(turns, ctx) {
      const last = [...turns].reverse().find((m) => m.role === 'user');
      return { text: rulesReply(last?.content ?? '', ctx, exercises) };
    },
  };
}

// --- Limitation de débit simple (côté appareil) -----------------------------------

export class RateLimiter {
  private calls: number[] = [];
  constructor(
    private maxPerMinute: number,
    private minIntervalMs: number,
    private now: () => number = Date.now,
  ) {}
  /** true si l'appel est autorisé (et l'enregistre). */
  take(): boolean {
    const t = this.now();
    this.calls = this.calls.filter((c) => t - c < 60_000);
    const last = this.calls.at(-1);
    if (this.calls.length >= this.maxPerMinute || (last !== undefined && t - last < this.minIntervalMs)) return false;
    this.calls.push(t);
    return true;
  }
}

const limiter = new RateLimiter(10, 2_000);

export interface AskResult {
  text: string;
  provider: ProviderId;
  model?: string;
  usage?: Usage;
  /** Raison du repli sur les règles, si le fournisseur choisi a échoué. */
  fallbackReason?: ProviderError['reason'];
  status?: number;
}

/**
 * Pose la question au fournisseur choisi, avec délai maximal ; repli automatique et transparent
 * sur le moteur de règles en cas d'absence d'internet, de clé, d'erreur ou de quota.
 */
export async function askCoach(opts: {
  provider: CoachProvider;
  fallback: CoachProvider;
  turns: ChatTurn[];
  ctx: CoachContext;
  model?: string;
  timeoutMs?: number;
  online?: boolean;
  rateLimiter?: RateLimiter;
}): Promise<AskResult> {
  const { provider, fallback, turns, ctx } = opts;
  const toFallback = async (reason: ProviderError['reason'], status?: number): Promise<AskResult> => {
    const r = await fallback.reply(turns, ctx, new AbortController().signal);
    return { text: r.text, provider: 'rules', fallbackReason: reason, status };
  };
  if (provider.id === 'rules') {
    const r = await provider.reply(turns, ctx, new AbortController().signal);
    return { text: r.text, provider: 'rules' };
  }
  if (opts.online === false) return toFallback('offline');
  if (!(opts.rateLimiter ?? limiter).take()) return toFallback('rateLimit');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    const r = await provider.reply(turns, ctx, controller.signal);
    return { text: r.text, provider: provider.id, model: opts.model, usage: r.usage };
  } catch (e) {
    if (e instanceof ProviderError) return toFallback(e.reason, e.status);
    return toFallback(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}
