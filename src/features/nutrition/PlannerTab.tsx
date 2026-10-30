import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, ClipboardCheck, Copy, Plus, Share2, ShoppingCart, Trash2 } from 'lucide-react';
import { Card, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { NumberField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { db, updateSettings } from '@/db/db';
import type { Food, MealPlanItem, MealType } from '@/db/types';
import { shareOrDownload } from '@/db/backup';
import { useSettings } from '@/hooks/useData';
import { fmt, num, t } from '@/i18n';
import { addDays, formatDateFr, startOfWeek, todayISO, type ISODate } from '@/lib/dates';
import { nutrientsFor } from '@/lib/nutrition';
import type { ShopLine } from '@/lib/mealPlan';
import { AddFoodSheet } from './AddFoodSheet';
import { copyPlanToJournal, copyPlanWeek, MEAL_TYPES, planWeek, weekShopping } from './service';
import { mealLabel } from './labels';

const x = t.nx;

export function PlannerTab() {
  const toast = useToast();
  const settings = useSettings();
  const [monday, setMonday] = useState(startOfWeek(todayISO()));
  const [adding, setAdding] = useState<{ date: ISODate; meal: MealType } | null>(null);
  const [shopping, setShopping] = useState(false);
  const data = useLiveQuery(async () => {
    const items = await planWeek(monday);
    const foods = new Map((await db.foods.bulkGet([...new Set(items.map((i) => i.foodId))])).filter((f): f is Food => !!f).map((f) => [f.id!, f]));
    return { items, foods };
  }, [monday]);
  if (!data || !settings) return null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const kcalOf = (i: MealPlanItem) => (data.foods.get(i.foodId) ? nutrientsFor(data.foods.get(i.foodId)!, i.grams).kcal : 0);

  return (
    <>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
        <button type="button" aria-label={t.planning.prevWeek} onClick={() => setMonday(addDays(monday, -7))} className="grid size-11 place-items-center rounded-xl active:bg-surface-2">
          <ChevronLeft size={20} />
        </button>
        <p className="font-semibold">{fmt(t.planning.weekOf, { date: formatDateFr(monday, { day: 'numeric', month: 'long' }) })}</p>
        <button type="button" aria-label={t.planning.nextWeek} onClick={() => setMonday(addDays(monday, 7))} className="grid size-11 place-items-center rounded-xl active:bg-surface-2">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setShopping(true)} icon={<ShoppingCart size={18} />} disabled={!data.items.length}>
          {x.shopping}
        </Button>
        <Button
          variant="secondary"
          disabled={!data.items.length}
          onClick={async () => {
            await copyPlanWeek(monday);
            toast(x.planWeekCopied);
          }}
          icon={<Copy size={18} />}
        >
          {x.planCopyWeek}
        </Button>
      </div>
      {data.items.length === 0 && <Notice>{x.planEmpty}</Notice>}
      {days.map((d) => {
        const dayItems = data.items.filter((i) => i.date === d);
        const kcal = dayItems.reduce((s, i) => s + kcalOf(i), 0);
        return (
          <Card key={d} className="!p-3" data-testid={`plan-${d}`}>
            <div className="mb-1 flex items-center justify-between gap-2 pl-1">
              <h2 className="text-[15px] font-semibold first-letter:uppercase">
                {formatDateFr(d, { weekday: 'long', day: 'numeric', month: 'short' })}
                {kcal > 0 && <span className="num ml-2 text-sm font-normal text-muted">{fmt(x.planDayKcal, { kcal })}</span>}
              </h2>
              {dayItems.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ClipboardCheck size={16} />}
                  onClick={async () => {
                    const k = await copyPlanToJournal(d);
                    toast(fmt(x.planCopied, { n: k }));
                  }}
                >
                  {x.planToJournal}
                </Button>
              )}
            </div>
            {MEAL_TYPES.map((m) => {
              const list = dayItems.filter((i) => i.type === m);
              return (
                <div key={m} className="flex items-start gap-2 border-t border-line py-1.5 pl-1 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted">{mealLabel(m, settings)}</p>
                    {list.map((i) => (
                      <p key={i.id} className="flex items-center gap-1 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {i.name} <span className="num text-xs text-muted">· {i.unitLabel ? `${num(i.qty ?? 1)} × ${i.unitLabel}` : `${num(i.grams)} g`} · {kcalOf(i)} kcal</span>
                        </span>
                        <button type="button" aria-label={`${t.common.delete} ${i.name}`} onClick={() => db.mealPlans.delete(i.id!)} className="grid size-9 place-items-center rounded-full text-muted active:text-danger">
                          <Trash2 size={14} />
                        </button>
                      </p>
                    ))}
                  </div>
                  <button type="button" aria-label={`${x.planAdd} : ${mealLabel(m, settings)} ${formatDateFr(d, { weekday: 'long' })}`} onClick={() => setAdding({ date: d, meal: m })} className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent-text active:bg-line">
                    <Plus size={16} />
                  </button>
                </div>
              );
            })}
          </Card>
        );
      })}
      {adding && <AddFoodSheet target="plan" date={adding.date} meal={adding.meal} onClose={() => setAdding(null)} />}
      {shopping && <ShoppingSheet monday={monday} checked={settings.shoppingChecked?.[monday] ?? []} onClose={() => setShopping(false)} />}
    </>
  );
}

function ShoppingSheet({ monday, checked, onClose }: { monday: ISODate; checked: number[]; onClose: () => void }) {
  const toast = useToast();
  const list = useLiveQuery(() => weekShopping(monday), [monday]);
  const [pricing, setPricing] = useState<ShopLine | null>(null);
  // État local immédiat (la case réagit tout de suite), enregistré ensuite dans les réglages.
  const [done, setDone] = useState(() => new Set(checked));
  const settings = useSettings();

  async function toggle(id: number) {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    await updateSettings({ shoppingChecked: { ...(settings?.shoppingChecked ?? {}), [monday]: [...next] } });
  }

  async function share() {
    if (!list) return;
    const text = [`${x.shopping} · ${fmt(t.planning.weekOf, { date: formatDateFr(monday, { day: 'numeric', month: 'long' }) })}`, ...list.lines.map((l) => `- ${l.name} : ${l.unitHint ?? `${num(l.grams)} g`}${l.costMad !== undefined ? ` (~${num(l.costMad)} DH)` : ''}`), fmt(x.budget, { mad: num(list.totalMad, 0) })].join('\n');
    const res = await shareOrDownload(text, `courses-${monday}.txt`, 'text/plain');
    if (res !== 'cancelled') toast(t.common.saved);
  }

  return (
    <>
      <Sheet open onClose={onClose} title={x.shopping}>
        {!list ? null : list.lines.length === 0 ? (
          <Notice>{x.shoppingEmpty}</Notice>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="num text-lg font-semibold" data-testid="budget">
              {fmt(x.budget, { mad: num(list.totalMad, 0) })}
            </p>
            {list.missingPrices > 0 && <Notice>{fmt(x.budgetMissing, { n: list.missingPrices })}</Notice>}
            <ul className="divide-y divide-line rounded-2xl border border-line" data-testid="shopping-list">
              {list.lines.map((l) => (
                <li key={l.foodId} className="flex items-center gap-2 px-3 py-2">
                  <input type="checkbox" aria-label={l.name} checked={done.has(l.foodId)} onChange={() => toggle(l.foodId)} className="size-6 shrink-0 accent-[var(--accent-text)]" />
                  <button type="button" onClick={() => setPricing(l)} className={`min-w-0 flex-1 text-left ${done.has(l.foodId) ? 'text-muted line-through' : ''}`}>
                    <span className="block truncate text-[15px]">{l.name}</span>
                    <span className="num block text-xs text-muted">
                      {l.unitHint ? `${l.unitHint} · ` : ''}
                      {num(l.grams)} g
                    </span>
                  </button>
                  <span className="num text-sm font-semibold">{l.costMad !== undefined ? `${num(l.costMad)} ${x.dh}` : '—'}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{x.shoppingNote}</p>
            <p className="text-xs text-muted">{x.priceHint}</p>
            <Button variant="secondary" block onClick={share} icon={<Share2 size={18} />}>
              {x.shoppingShare}
            </Button>
          </div>
        )}
      </Sheet>
      {pricing && <PriceSheet line={pricing} onClose={() => setPricing(null)} />}
    </>
  );
}

function PriceSheet({ line, onClose }: { line: ShopLine; onClose: () => void }) {
  const food = useLiveQuery(() => db.foods.get(line.foodId), [line.foodId]);
  const [mad, setMad] = useState<number>();
  const [grams, setGrams] = useState<number>();
  if (!food) return null;
  const curMad = mad ?? food.price?.mad;
  const curGrams = grams ?? food.price?.grams ?? 1000;
  return (
    <Sheet open onClose={onClose} title={`${x.priceTitle} · ${food.name}`}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={x.priceMad} unit={x.dh} value={curMad} onChange={setMad} autoFocus />
          <NumberField label={x.priceFor} unit="g" value={curGrams} onChange={setGrams} integer />
        </div>
        <p className="text-xs text-muted">{x.priceHint}</p>
        <Button
          size="lg"
          block
          disabled={curMad === undefined || curMad < 0 || !curGrams || curGrams <= 0}
          onClick={async () => {
            await db.foods.update(food.id!, { price: { mad: curMad!, grams: curGrams } });
            onClose();
          }}
        >
          {t.common.save}
        </Button>
      </div>
    </Sheet>
  );
}
