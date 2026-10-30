import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bot, CircleAlert, CircleCheck, Info, MessagesSquare, Plus, SendHorizontal, Trash2, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Sheet } from '@/components/Sheet';
import { db } from '@/db/db';
import type { CoachMessage } from '@/db/types';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { askCoach, rulesProvider } from '@/lib/coach/providers';
import { weeklyInsights, type Insight } from '@/lib/coach/rules';
import { formatDateFr, toISODate } from '@/lib/dates';
import { activeProvider, exerciseInfos, loadCoachContext } from './loadContext';

const c = t.coach;

export function CoachPage() {
  const [params, setParams] = useSearchParams();
  const conversationId = params.get('c') ? Number(params.get('c')) : undefined;
  const settings = useSettings();
  const messages = useLiveQuery(() => (conversationId ? db.coachMessages.where('conversationId').equals(conversationId).sortBy('createdAt') : Promise.resolve([] as CoachMessage[])), [conversationId]);
  const insights = useLiveQuery(async () => {
    const ctx = await loadCoachContext();
    return ctx ? weeklyInsights(ctx) : [];
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setInput('');
    try {
      let cid = conversationId;
      const now = Date.now();
      if (!cid) {
        cid = (await db.coachConversations.add({ title: content.slice(0, 50), createdAt: now, updatedAt: now })) as number;
        setParams({ c: String(cid) }, { replace: true });
      }
      await db.coachMessages.add({ conversationId: cid, role: 'user', provider: 'rules', content, createdAt: now });
      const history = await db.coachMessages.where('conversationId').equals(cid).sortBy('createdAt');
      const ctx = await loadCoachContext();
      if (!ctx) return;
      const { provider, model } = await activeProvider();
      const res = await askCoach({
        provider,
        fallback: rulesProvider(await exerciseInfos()),
        turns: history.map((m) => ({ role: m.role, content: m.content })),
        ctx,
        model,
        online: navigator.onLine,
      });
      await db.coachMessages.add({
        conversationId: cid,
        role: 'assistant',
        provider: res.provider,
        content: res.text,
        createdAt: Date.now(),
        model: res.model,
        tokens: res.usage?.total,
        fallbackReason: res.fallbackReason ? fmt(c.reasons[res.fallbackReason] ?? res.fallbackReason, { status: res.status ?? '' }) : undefined,
      });
      await db.coachConversations.update(cid, { updatedAt: Date.now() });
    } finally {
      setBusy(false);
    }
  }

  const empty = !messages?.length;
  const providerName = c.providers[settings?.coachProvider ?? 'rules'];

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={<span className="normal-case">{providerName}</span>}
        action={
          <div className="flex gap-1">
            <button type="button" aria-label={c.conversations} onClick={() => setListOpen(true)} className="grid size-11 place-items-center rounded-full bg-surface-2 active:bg-line">
              <MessagesSquare size={20} />
            </button>
            <button type="button" aria-label={c.newChat} onClick={() => setParams({}, { replace: true })} className="grid size-11 place-items-center rounded-full bg-surface-2 active:bg-line">
              <Plus size={20} />
            </button>
          </div>
        }
      />
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-4 pb-44">
        {empty && (
          <>
            <Notice icon={<Bot size={16} className="text-accent-text" />}>{c.welcome}</Notice>
            {insights && insights.length > 0 && <InsightsCard insights={insights} />}
          </>
        )}
        {messages?.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {busy && <p className="animate-pulse text-sm text-muted">{c.thinking}</p>}
        {empty && (
          <div className="flex flex-wrap gap-2">
            {Object.values(c.quick).map((q) => (
              <button key={q} type="button" onClick={() => send(q)} className="min-h-10 rounded-full border border-line bg-surface px-3.5 text-sm active:bg-surface-2">
                {q}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">{c.disclaimer}</p>
        <div ref={bottom} />
      </main>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 py-2 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <label className="flex-1">
            <span className="sr-only">{c.placeholder}</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder={c.placeholder}
              className="max-h-32 min-h-12 w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 text-fg outline-none placeholder:text-muted/70 focus:border-accent-text"
            />
          </label>
          <button type="submit" disabled={busy || !input.trim()} aria-label={c.send} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink disabled:opacity-40">
            <SendHorizontal size={20} />
          </button>
        </div>
      </form>

      <ConversationsSheet open={listOpen} onClose={() => setListOpen(false)} current={conversationId} onPick={(id) => { setParams(id ? { c: String(id) } : {}, { replace: true }); setListOpen(false); }} />
    </>
  );
}

function InsightsCard({ insights }: { insights: Insight[] }) {
  const icon = { good: <CircleCheck size={16} className="text-accent-text" />, info: <Info size={16} className="text-info" />, warn: <TriangleAlert size={16} className="text-warning" /> };
  return (
    <Card>
      <CardTitle>{c.insightsTitle}</CardTitle>
      <ul className="flex flex-col gap-2.5">
        {insights.map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-sm leading-snug">
            <span className="mt-0.5 shrink-0">{icon[i.level]}</span>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted">{c.rulesLabel}</p>
    </Card>
  );
}

function Bubble({ m }: { m: CoachMessage }) {
  if (m.role === 'user') {
    return <div className="ml-10 self-end rounded-3xl rounded-br-lg bg-accent px-4 py-2.5 text-[15px] whitespace-pre-line text-accent-ink">{m.content}</div>;
  }
  const label = m.provider === 'rules' ? c.rulesLabel : fmt(c.llmLabel, { provider: c.providers[m.provider], model: m.model ?? '' });
  return (
    <div className="mr-6 flex flex-col gap-1">
      {m.fallbackReason && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <CircleAlert size={14} className="mt-px shrink-0" /> {fmt(c.fallback, { reason: m.fallbackReason })}
        </p>
      )}
      <div className="rounded-3xl rounded-bl-lg border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line">{m.content}</div>
      <p className="pl-2 text-[11px] text-muted" data-testid="msg-provider">
        {label}
        {m.tokens ? ` · ${fmt(c.tokens, { n: num(m.tokens, 0) })}` : ''}
      </p>
    </div>
  );
}

function ConversationsSheet({ open, onClose, current, onPick }: { open: boolean; onClose: () => void; current?: number; onPick: (id?: number) => void }) {
  const list = useLiveQuery(() => db.coachConversations.orderBy('updatedAt').reverse().toArray()) ?? [];
  async function remove(id: number) {
    await db.transaction('rw', db.coachConversations, db.coachMessages, async () => {
      await db.coachMessages.where('conversationId').equals(id).delete();
      await db.coachConversations.delete(id);
    });
    if (id === current) onPick(undefined);
  }
  return (
    <Sheet open={open} onClose={onClose} title={c.conversations}>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{c.noConversations}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {list.map((cv) => (
            <li key={cv.id} className={`flex items-center ${cv.id === current ? 'bg-accent-soft' : ''}`}>
              <button type="button" onClick={() => onPick(cv.id)} className="min-h-14 min-w-0 flex-1 px-4 py-2 text-left">
                <span className="block truncate font-medium">{cv.title}</span>
                <span className="block text-xs text-muted">{formatDateFr(toISODate(new Date(cv.updatedAt)), { day: 'numeric', month: 'short' })}</span>
              </button>
              <button type="button" aria-label={c.deleteChat} onClick={() => remove(cv.id!)} className="grid size-12 place-items-center text-muted active:text-danger">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
