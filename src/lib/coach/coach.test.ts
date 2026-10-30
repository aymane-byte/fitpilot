import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeTargets } from '../energy';
import { addDays } from '../dates';
import { buildContext, compactSummary, type CoachRawData } from './context';
import { asksTooFewCalories, calorieAdvice, detectIntent, findExercise, inconsistencies, isMedical, proteinInsight, recoveryInsight, rulesReply, weeklyInsights } from './rules';
import { askCoach, geminiProvider, groqProvider, ProviderError, RateLimiter, rulesProvider, systemPrompt } from './providers';

const today = '2026-10-30';
const targets = computeTargets({ weightKg: 78, heightCm: 170, age: 20, gender: 'male', activity: 'moderate', goal: 'recomp' });

function raw(over: Partial<CoachRawData> = {}, opts: { weeklyPct?: number; logged?: number; kcal?: number; protein?: number } = {}): CoachRawData {
  const pct = opts.weeklyPct ?? -0.3;
  // 21 jours de pesées avec une pente régulière de `pct` % par semaine
  const weights = Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, i - 20), value: 78 * (1 + ((pct / 100) * (i - 20)) / 7) }));
  const nutrition = Array.from({ length: 14 }, (_, i) => ({
    date: addDays(today, i - 13),
    entries: i >= 14 - (opts.logged ?? 6) ? 3 : 0,
    kcal: opts.kcal ?? 2400,
    proteinG: opts.protein ?? 150,
    carbsG: 280,
    fatG: 70,
  }));
  return {
    today,
    profile: { name: 'Test', age: 20, gender: 'male', heightCm: 170, goal: 'recomp', gymDaysPerWeek: 3, runDaysPerWeek: 2, gymLevel: 'intermediate', runLevel: 'intermediate', injuries: '', allergies: '', dietaryPreferences: '', supplements: '' },
    currentWeightKg: 78,
    targets,
    weights,
    nutrition,
    workouts: [],
    runs: [],
    scheduled: [],
    ...over,
  };
}

describe('contexte', () => {
  it('résumé compact avec 14 jours et sans données superflues', () => {
    const ctx = buildContext(raw());
    expect(ctx.days).toHaveLength(14);
    const s = compactSummary(ctx);
    expect(s.length).toBeLessThan(3500);
    expect(JSON.parse(s).objectifsJour.kcal).toBe(targets.calories);
  });
  it('jours d’entraînement consécutifs', () => {
    const ctx = buildContext(raw({ workouts: [0, 1, 2].map((i) => ({ date: addDays(today, -i), name: 'X', sets: 10 })), runs: [{ date: addDays(today, -3), km: 5, sec: 1500, type: 'easy' }] }));
    expect(ctx.consecutiveTrainingDays).toBe(4);
  });
});

describe('ajustement calorique', () => {
  it('pas assez de repas notés → pas d’ajustement', () => {
    expect(calorieAdvice(buildContext(raw({}, { logged: 2 }))).kind).toBe('need_logs');
  });
  it('recomposition dans la zone → garder', () => {
    expect(calorieAdvice(buildContext(raw({}, { weeklyPct: -0.3 }))).kind).toBe('keep');
  });
  it('perte trop rapide (> 1 %/sem) → +150 kcal', () => {
    const a = calorieAdvice(buildContext(raw({}, { weeklyPct: -1.4 })));
    expect(a).toMatchObject({ kind: 'too_fast', delta: 150, suggestedKcal: targets.calories + 150 });
  });
  it('prise de poids en recomposition → −150 kcal', () => {
    expect(calorieAdvice(buildContext(raw({}, { weeklyPct: 0.4 })))).toMatchObject({ kind: 'down', delta: -150 });
  });
  it('ne descend jamais sous le BMR', () => {
    const lowTargets = { ...targets, calories: targets.bmr + 50 };
    const a = calorieAdvice(buildContext(raw({ targets: lowTargets }, { weeklyPct: 0.5 })));
    expect(a.kind).toBe('floor');
    expect(a.suggestedKcal).toBeGreaterThanOrEqual(targets.bmr);
  });
  it('prise de muscle trop lente → +150', () => {
    const r = raw({}, { weeklyPct: -0.1 });
    r.profile.goal = 'muscle_gain';
    expect(calorieAdvice(buildContext(r)).kind).toBe('up');
  });
});

describe('règles', () => {
  it('une journée en cours ne compte pas dans les moyennes', () => {
    // Seul aujourd'hui est noté (repas partiel) → pas de conclusion sur les protéines
    const ctx = buildContext(raw({}, { logged: 1, protein: 30 }));
    expect(ctx.nutrition7.daysLogged).toBe(0);
    expect(proteinInsight(ctx).level).toBe('info');
  });
  it('protéines insuffisantes', () => {
    expect(proteinInsight(buildContext(raw({}, { protein: 100 }))).level).toBe('warn');
    expect(proteinInsight(buildContext(raw({}, { protein: 160 }))).level).toBe('good');
  });
  it('repos conseillé après 5 jours d’affilée', () => {
    const ctx = buildContext(raw({ workouts: [0, 1, 2, 3, 4].map((i) => ({ date: addDays(today, -i), name: 'X', sets: 10 })) }));
    expect(recoveryInsight(ctx).level).toBe('warn');
  });
  it('incohérences : cible IMC trop bas, prise de muscle en déficit', () => {
    const r = raw({}, { kcal: 2000 });
    r.profile.goal = 'muscle_gain';
    r.profile.targetWeightKg = 50;
    const ids = inconsistencies(buildContext(r)).map((i) => i.id);
    expect(ids).toContain('bmi');
    expect(ids).toContain('gain_deficit');
  });
  it('conflit jambes → course signalé dans l’analyse', () => {
    const ctx = buildContext(raw({ scheduled: [
      { date: today, kind: 'workout', title: 'Bas', legsHeavy: true, status: 'planned' },
      { date: addDays(today, 1), kind: 'run', title: 'Footing', status: 'planned' },
    ] }));
    expect(weeklyInsights(ctx).some((i) => i.id.startsWith('conflict'))).toBe(true);
  });
  it('intentions', () => {
    expect(detectIntent('Dois-je ajuster mes calories ?')).toBe('calories');
    expect(detectIntent('mes protéines ?')).toBe('protein');
    expect(detectIntent('je suis fatigué')).toBe('rest');
    expect(detectIntent('que faire aujourd’hui')).toBe('today');
  });
  it('explique un exercice de la bibliothèque (nom le plus précis)', () => {
    const exs = [
      { name: 'Squat barre', muscles: ['quads'], instructions: 'Descends', mistakes: 'Genoux' },
      { name: 'Squat bulgare', muscles: ['quads'], instructions: 'Pied arrière', mistakes: 'Équilibre' },
    ];
    expect(findExercise('explique le squat bulgare', exs)?.name).toBe('Squat bulgare');
    expect(rulesReply('Explique le squat barre', buildContext(raw()), exs)).toContain('Descends');
  });
});

describe('sécurité', () => {
  it('questions médicales → médecin, pas de diagnostic', () => {
    expect(isMedical('J’ai une douleur au genou')).toBe(true);
    expect(rulesReply('quel médicament pour le dos ?', buildContext(raw()))).toMatch(/médecin/);
  });
  it('refuse un régime sous le BMR', () => {
    expect(asksTooFewCalories('je veux manger seulement 1000 kcal', targets.bmr)).toBe(true);
    expect(asksTooFewCalories('mon objectif 2400 kcal est-il bon ?', targets.bmr)).toBe(false);
    expect(rulesReply('je veux manger seulement 1000 kcal par jour', buildContext(raw()))).toMatch(/métabolisme de base/);
  });
  it('le prompt système contient les règles de sécurité et le BMR', () => {
    const p = systemPrompt(buildContext(raw()));
    expect(p).toContain(String(targets.bmr));
    expect(p).toMatch(/diagnostic/);
  });
});

describe('fournisseurs LLM et repli', () => {
  afterEach(() => vi.unstubAllGlobals());
  const ctx = () => buildContext(raw());
  const fallback = rulesProvider([]);
  const turns = [{ role: 'user' as const, content: 'Analyse ma semaine' }];
  const free = () => new RateLimiter(100, 0);

  it('Gemini : lit la réponse et l’usage de tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Bravo !' }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, totalTokenCount: 940 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await askCoach({ provider: geminiProvider({ apiKey: 'k', model: 'gemini-3.5-flash-lite' }), fallback, turns, ctx: ctx(), rateLimiter: free() });
    expect(r).toMatchObject({ provider: 'gemini', text: 'Bravo !', usage: { total: 940 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('gemini-3.5-flash-lite:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('k');
  });

  it('Groq : format OpenAI, clé en en-tête Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 120 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await askCoach({ provider: groqProvider({ apiKey: 'g', model: 'openai/gpt-oss-20b' }), fallback, turns, ctx: ctx(), rateLimiter: free() });
    expect(r).toMatchObject({ provider: 'groq', text: 'OK', usage: { total: 120 } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer g');
  });

  it('proxy : aucune clé envoyée depuis le téléphone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'via proxy' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await askCoach({ provider: groqProvider({ model: 'openai/gpt-oss-20b', proxyUrl: 'https://p.example.workers.dev/' }), fallback, turns, ctx: ctx(), rateLimiter: free() });
    expect(r.text).toBe('via proxy');
    expect(fetchMock.mock.calls[0][0]).toBe('https://p.example.workers.dev/groq');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it.each([
    [429, 'quota'],
    [401, 'auth'],
    [500, 'http'],
  ])('HTTP %i → repli sur les règles (%s)', async (status, reason) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    const r = await askCoach({ provider: groqProvider({ apiKey: 'g', model: 'm' }), fallback, turns, ctx: ctx(), rateLimiter: free() });
    expect(r.provider).toBe('rules');
    expect(r.fallbackReason).toBe(reason);
    expect(r.text.length).toBeGreaterThan(20);
  });

  it('sans clé, hors-ligne, limite de débit → repli', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await askCoach({ provider: geminiProvider({ model: 'm' }), fallback, turns, ctx: ctx(), rateLimiter: free() })).fallbackReason).toBe('noKey');
    expect((await askCoach({ provider: geminiProvider({ apiKey: 'k', model: 'm' }), fallback, turns, ctx: ctx(), online: false })).fallbackReason).toBe('offline');
    const limiter = new RateLimiter(1, 0);
    limiter.take();
    expect((await askCoach({ provider: geminiProvider({ apiKey: 'k', model: 'm' }), fallback, turns, ctx: ctx(), rateLimiter: limiter })).fallbackReason).toBe('rateLimit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('délai dépassé → repli (timeout)', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const r = await askCoach({ provider: geminiProvider({ apiKey: 'k', model: 'm' }), fallback, turns, ctx: ctx(), timeoutMs: 50, rateLimiter: free() });
    expect(r.fallbackReason).toBe('timeout');
  });

  it('réponse vide → repli', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 })));
    const r = await askCoach({ provider: geminiProvider({ apiKey: 'k', model: 'm' }), fallback, turns, ctx: ctx(), rateLimiter: free() });
    expect(r.fallbackReason).toBe('empty');
  });

  it('limiteur : intervalle minimal et plafond par minute', () => {
    let now = 0;
    const l = new RateLimiter(2, 1000, () => now);
    expect(l.take()).toBe(true);
    expect(l.take()).toBe(false); // trop rapproché
    now = 1500;
    expect(l.take()).toBe(true);
    now = 3000;
    expect(l.take()).toBe(false); // 2 par minute max
    now = 61_000;
    expect(l.take()).toBe(true);
    expect(ProviderError).toBeDefined();
  });
});
