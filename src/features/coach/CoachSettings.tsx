import { useEffect, useState } from 'react';
import { Bot, KeyRound, TriangleAlert } from 'lucide-react';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { updateSettings } from '@/db/db';
import type { CoachProvider as ProviderPref, Settings } from '@/db/types';
import { fmt, t } from '@/i18n';
import { askCoach, DEFAULT_MODELS, geminiProvider, groqProvider, MODEL_CHOICES, RateLimiter, rulesProvider } from '@/lib/coach/providers';
import { loadCoachContext } from './loadContext';

const c = t.coach;

export function CoachSettingsCard({ settings }: { settings: Settings }) {
  const toast = useToast();
  const [provider, setProvider] = useState<ProviderPref>(settings.coachProvider);
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey ?? '');
  const [groqKey, setGroqKey] = useState(settings.groqApiKey ?? '');
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel || DEFAULT_MODELS.gemini);
  const [groqModel, setGroqModel] = useState(settings.groqModel || DEFAULT_MODELS.groq);
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl ?? '');
  const [testing, setTesting] = useState(false);

  useEffect(() => setProvider(settings.coachProvider), [settings.coachProvider]);

  async function save() {
    const proxy = proxyUrl.trim();
    if (proxy && !/^https:\/\/[^\s]+$/.test(proxy)) {
      toast(c.proxy, 'error');
      return;
    }
    await updateSettings({
      coachProvider: provider,
      geminiApiKey: geminiKey.trim() || undefined,
      groqApiKey: groqKey.trim() || undefined,
      geminiModel: geminiModel.trim() || DEFAULT_MODELS.gemini,
      groqModel: groqModel.trim() || DEFAULT_MODELS.groq,
      proxyUrl: proxy || undefined,
    });
    toast(c.saved);
  }

  async function test() {
    setTesting(true);
    try {
      const ctx = await loadCoachContext();
      if (!ctx) return;
      const cfg = provider === 'gemini' ? { apiKey: geminiKey.trim(), model: geminiModel, proxyUrl: proxyUrl.trim() || undefined } : { apiKey: groqKey.trim(), model: groqModel, proxyUrl: proxyUrl.trim() || undefined };
      const p = provider === 'gemini' ? geminiProvider(cfg) : groqProvider(cfg);
      const res = await askCoach({ provider: p, fallback: rulesProvider([]), turns: [{ role: 'user', content: 'Réponds seulement « OK ».' }], ctx, online: navigator.onLine, rateLimiter: new RateLimiter(5, 0), timeoutMs: 20_000 });
      if (res.provider === provider) toast(fmt(c.testOk, { provider: c.providers[provider] }));
      else toast(fmt(c.testFail, { reason: fmt(c.reasons[res.fallbackReason ?? 'network'], { status: res.status ?? '' }) }), 'error');
    } finally {
      setTesting(false);
    }
  }

  const llm = provider !== 'rules';
  return (
    <Card>
      <CardTitle icon={<Bot size={18} />}>{c.settingsTitle}</CardTitle>
      <div className="flex flex-col gap-4">
        <Segmented<ProviderPref> label={c.provider} value={provider} onChange={setProvider} options={(['rules', 'gemini', 'groq'] as const).map((v) => ({ value: v, label: c.providers[v] }))} />
        <Notice>{llm ? c.llmHint : c.rulesHint}</Notice>
        {llm && (
          <>
            <Notice tone="warning" icon={<TriangleAlert size={16} />}>
              {c.keyWarn}
            </Notice>
            {provider === 'gemini' ? (
              <TextField label={fmt(c.keyLabel, { provider: 'Gemini' })} type="password" autoComplete="off" value={geminiKey} onChange={setGeminiKey} hint={c.keyHowGemini} />
            ) : (
              <TextField label={fmt(c.keyLabel, { provider: 'Groq' })} type="password" autoComplete="off" value={groqKey} onChange={setGroqKey} hint={c.keyHowGroq} />
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">{c.model}</span>
              <input
                list={`models-${provider}`}
                value={provider === 'gemini' ? geminiModel : groqModel}
                onChange={(e) => (provider === 'gemini' ? setGeminiModel(e.target.value) : setGroqModel(e.target.value))}
                className="min-h-12 rounded-2xl border border-line bg-surface-2 px-4 text-fg outline-none focus:border-accent-text"
              />
              <datalist id={`models-${provider}`}>
                {MODEL_CHOICES[provider].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <TextField label={c.proxy} value={proxyUrl} onChange={setProxyUrl} inputMode="url" placeholder="https://fitpilot-proxy.xxx.workers.dev" hint={c.proxyHint} />
          </>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} icon={<KeyRound size={18} />}>
            {t.common.save}
          </Button>
          {llm && (
            <Button variant="secondary" className="flex-1" onClick={test} disabled={testing}>
              {c.test}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
