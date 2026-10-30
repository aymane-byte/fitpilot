import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, FileDown, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { shareOrDownload } from '@/db/backup';
import { useProfile } from '@/hooks/useData';
import { fmt, num, signed, t } from '@/i18n';
import { formatDateFr, todayISO } from '@/lib/dates';
import { askCoach, rulesProvider, type AskResult } from '@/lib/coach/providers';
import { periodBounds, type Report } from '@/lib/report';
import { formatPace } from '@/lib/running';
import { activeProvider, exerciseInfos, loadCoachContext } from '../coach/loadContext';
import { loadReport } from './loadReport';

const r = t.reports;
type Kind = 'week' | 'month';

export function ReportsPage() {
  const toast = useToast();
  const profile = useProfile();
  const today = todayISO();
  const [kind, setKind] = useState<Kind>('week');
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { from, to } = periodBounds(kind, today, offset);
  const report = useLiveQuery(() => loadReport(from, to, today), [from, to, today]);
  const label = kind === 'week' ? fmt(r.periodWeek, { from: formatDateFr(from), to: formatDateFr(to) }) : formatDateFr(from, { month: 'long', year: 'numeric' });

  async function generateSummary() {
    setBusy(true);
    try {
      const ctx = await loadCoachContext();
      if (!ctx) return;
      const { provider, model } = await activeProvider();
      setSummary(
        await askCoach({
          provider,
          fallback: rulesProvider(await exerciseInfos()),
          turns: [{ role: 'user', content: provider.id === 'rules' ? 'bilan de la semaine' : fmt(r.summaryPrompt, { period: label }) }],
          ctx,
          model,
          online: navigator.onLine,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!report) return;
    const { buildPdf } = await import('./pdf');
    const sections = [
      { title: t.progress.title, rows: rows(report, profile?.targetWeightKg).map(([k, v]) => [k, v] as [string, string]) },
      ...(summary ? [{ title: `${r.summary} (${providerLabel(summary)})`, text: summary.text }] : []),
    ];
    const blob = await buildPdf(r.pdfTitle, `${profile?.name ?? ''} · ${label}`, sections, `${fmt(r.generatedOn, { date: new Date().toLocaleDateString(t.meta.locale) })}. ${r.estimateNote}`);
    const res = await shareOrDownload(blob, `fitpilot-rapport-${from}.pdf`, 'application/pdf');
    if (res !== 'cancelled') toast(r.pdfDone);
  }

  return (
    <>
      <PageHeader title={r.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Segmented<Kind> value={kind} onChange={(k) => { setKind(k); setOffset(0); setSummary(null); }} options={[{ value: 'week', label: r.week }, { value: 'month', label: r.month }]} />
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
          <button type="button" aria-label={r.prev} onClick={() => { setOffset(offset - 1); setSummary(null); }} className="grid size-11 place-items-center rounded-xl active:bg-surface-2">
            <ChevronLeft size={20} />
          </button>
          <p className="text-center font-semibold first-letter:uppercase">{label}</p>
          <button type="button" aria-label={r.next} disabled={offset >= 0} onClick={() => { setOffset(offset + 1); setSummary(null); }} className="grid size-11 place-items-center rounded-xl active:bg-surface-2 disabled:opacity-30">
            <ChevronRight size={20} />
          </button>
        </div>
        {report && (
          <Card>
            <ul className="divide-y divide-line">
              {rows(report, profile?.targetWeightKg).map(([k, v, hint]) => (
                <li key={k} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="text-sm text-muted">
                    {k}
                    {hint && <span className="block text-xs">{hint}</span>}
                  </span>
                  <span className="num text-right font-semibold">{v}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <CardTitle icon={<Sparkles size={18} />}>{r.summary}</CardTitle>
          {summary ? (
            <>
              {summary.fallbackReason && <Notice tone="warning">{fmt(t.coach.fallback, { reason: fmt(t.coach.reasons[summary.fallbackReason], { status: summary.status ?? '' }) })}</Notice>}
              <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line">{summary.text}</p>
              <p className="mt-2 text-[11px] font-medium text-muted" data-testid="summary-provider">
                {providerLabel(summary)}
              </p>
            </>
          ) : (
            <Button variant="secondary" block onClick={generateSummary} disabled={busy}>
              {busy ? t.coach.thinking : r.summaryGenerate}
            </Button>
          )}
        </Card>
        <Button size="lg" block onClick={exportPdf} disabled={!report} icon={<FileDown size={18} />}>
          {r.pdf}
        </Button>
        <p className="text-xs text-muted">{r.estimateNote}</p>
      </main>
    </>
  );
}

function providerLabel(a: AskResult) {
  return a.provider === 'rules' ? t.coach.rulesLabel : fmt(t.coach.llmLabel, { provider: t.coach.providers[a.provider], model: a.model ?? '' });
}

function rows(rep: Report, targetWeight?: number): [string, string, string?][] {
  const dash = r.noData;
  const eta =
    rep.weeksToTarget === 0 ? r.etaReached : rep.weeksToTarget !== null ? fmt(r.eta, { weeks: rep.weeksToTarget }) : targetWeight ? r.etaNone : undefined;
  return [
    [r.avgWeight, rep.avgWeight !== null ? `${num(rep.avgWeight)} kg` : dash],
    [r.weightChange, rep.weightChange !== null ? `${signed(rep.weightChange)} kg` : dash],
    [r.waistChange, rep.waistChange !== null ? `${signed(rep.waistChange)} cm` : dash],
    [r.runKm, `${num(rep.runKm)} km`, fmt(r.runCount, { n: rep.runCount })],
    [r.avgPace, rep.avgPaceSec ? `${formatPace(rep.avgPaceSec)} /km` : dash],
    [r.workouts, String(rep.workoutsDone)],
    [r.consistency, rep.consistencyPct !== null ? `${rep.consistencyPct} %` : dash, fmt(r.consistencyHint, { done: rep.sessionsDone, expected: rep.sessionsExpected })],
    [r.avgKcal, rep.avgKcal !== null ? `${num(rep.avgKcal, 0)} kcal` : dash, fmt(r.daysLogged, { n: rep.daysLogged })],
    [r.avgProtein, rep.avgProtein !== null ? `${num(rep.avgProtein, 0)} g` : dash],
    [r.progress, rep.weeklyRateKg !== null ? fmt(r.rate, { kg: signed(rep.weeklyRateKg, 2) }) : dash, eta],
  ];
}
