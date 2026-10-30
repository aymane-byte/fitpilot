import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, ChevronLeft, ChevronRight, Copy, Flame, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { LazyBarTargetChart } from '@/components/LazyTrendChart';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Food, MealItem, MealType } from '@/db/types';
import { useProfile, useSettings, useTargets, useWeightEntries } from '@/hooks/useData';
import type { Profile } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { addDays, formatDateFr, todayISO, type ISODate } from '@/lib/dates';
import type { Targets } from '@/lib/energy';
import { lastNDays, nutritionReport, sumNutrients } from '@/lib/nutrition';
import { FoodEditor, FoodRow, FoodSearchBar, useFoodSearch } from './FoodSheets';
import { DaySummary } from './DaySummary';
import { AddFoodSheet } from './AddFoodSheet';
import { RecipesTab } from './RecipesTab';
import { copyMeal, dayItems, daysNutrition, MEAL_TYPES, microsOfItems, yesterdayHas } from './service';
import { averageMicros } from '@/lib/micros';
import { MicrosCard } from './MicrosCard';
import { RamadanCard } from './RamadanCard';
import { PlannerTab } from './PlannerTab';
import { useDayTargets } from './useDayTargets';
import { mealLabel } from './labels';
import { WaterTracker } from './WaterTracker';

const n = t.nutrition;
type Tab = 'journal' | 'foods' | 'recipes' | 'plan' | 'report';

export function NutritionPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'journal';
  const profile = useProfile();
  const entries = useWeightEntries();
  const data = useTargets(profile, entries);
  return (
    <>
      <PageHeader title={n.title} />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Segmented<Tab> value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={(['journal', 'foods', 'recipes', 'plan', 'report'] as const).map((v) => ({ value: v, label: v === 'plan' ? t.nx.planTab : n.tabs[v] }))} />
        {tab === 'journal' && data && profile && <Journal targets={data.targets} profile={profile} />}
        {tab === 'foods' && <FoodsTab />}
        {tab === 'recipes' && <RecipesTab />}
        {tab === 'plan' && <PlannerTab />}
        {tab === 'report' && data && profile && <Report targets={data.targets} profile={profile} />}
        <p className="text-xs text-muted">{n.valuesNote}</p>
      </main>
    </>
  );
}

function Journal({ targets: base, profile }: { targets: Targets; profile: Profile }) {
  const today = todayISO();
  const [date, setDate] = useState<ISODate>(today);
  const items = useLiveQuery(() => dayItems(date), [date]);
  const settings = useSettings();
  const day = useDayTargets(date, profile, base);
  const [adding, setAdding] = useState<MealType | null>(null);
  if (!items || !settings) return null;
  const all = MEAL_TYPES.flatMap((m) => items[m]);
  // Objectif du jour : cyclage (entraînement / repos) et plafond Ramadan appliqués.
  const targets: Targets = day ? { ...base, calories: day.calories, carbsG: day.carbsG, proteinG: day.proteinG, fatG: day.fatG } : base;
  const delta = targets.calories - base.calories;

  return (
    <>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
        <button type="button" aria-label={n.prevDay} onClick={() => setDate(addDays(date, -1))} className="grid size-11 place-items-center rounded-xl active:bg-surface-2">
          <ChevronLeft size={20} />
        </button>
        <p className="font-semibold first-letter:uppercase">{date === today ? n.today : formatDateFr(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <button type="button" aria-label={n.nextDay} disabled={date >= today} onClick={() => setDate(addDays(date, 1))} className="grid size-11 place-items-center rounded-xl active:bg-surface-2 disabled:opacity-30">
          <ChevronRight size={20} />
        </button>
      </div>
      <Card>
        <CardTitle icon={<Flame size={18} />}>{n.consumed}</CardTitle>
        {day && day.reasons.length > 0 && (
          <p className="num -mt-1 mb-3 text-xs font-medium text-accent-text" data-testid="day-target-reason">
            {day.reasons.map((r) => (r === 'training' ? fmt(t.nx.trainingDay, { d: delta }) : r === 'rest' ? fmt(t.nx.restDay, { d: -delta }) : t.nx.ramadanCap)).join(' · ')}
          </p>
        )}
        <DaySummary items={all} targets={targets} />
        <div className="mt-4 border-t border-line pt-4">
          <WaterTracker date={date} targetMl={targets.waterMl} />
        </div>
      </Card>
      <RamadanCard settings={settings} waterMl={targets.waterMl} />
      {all.length === 0 && <Notice>{n.emptyDay}</Notice>}
      {MEAL_TYPES.map((m) => (
        <MealCard key={m} date={date} meal={m} label={mealLabel(m, settings)} items={items[m]} onAdd={() => setAdding(m)} />
      ))}
      {all.length > 0 && <MicrosCard totals={microsOfItems(all)} profile={profile} kcal={targets.calories} />}
      {adding && <AddFoodSheet date={date} meal={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function MealCard({ date, meal, label, items, onAdd }: { date: ISODate; meal: MealType; label: string; items: MealItem[]; onAdd: () => void }) {
  const toast = useToast();
  const canCopy = useLiveQuery(() => (items.length ? false : yesterdayHas(date, meal)), [date, meal, items.length]);
  const total = sumNutrients(items);
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-2 pl-1">
        <h2 className="flex-1 text-[15px] font-semibold">
          {label}
          {items.length > 0 && <span className="num ml-2 text-sm font-normal text-muted">{total.kcal} kcal</span>}
        </h2>
        {canCopy && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await copyMeal(addDays(date, -1), date, meal);
              toast(n.copied);
            }}
            icon={<Copy size={16} />}
          >
            {n.copyYesterday}
          </Button>
        )}
        <button type="button" onClick={onAdd} aria-label={fmt(n.addTo, { meal: label.toLowerCase() })} className="grid size-11 place-items-center rounded-xl bg-accent text-accent-ink active:brightness-90">
          <Plus size={20} />
        </button>
      </div>
      {items.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2 pl-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">
                  {i.name}
                  {i.estimated && <span className="ml-1.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">{t.nx.estimatedTag}</span>}
                </span>
                <span className="num block text-xs text-muted">
                  {i.unitLabel ? `${num(i.qty ?? 1)} × ${i.unitLabel} (${num(i.grams)} g) · ` : i.grams ? `${num(i.grams)} g · ` : ''}P {num(i.proteinG)} · G {num(i.carbsG)} · L {num(i.fatG)}
                </span>
              </span>
              <span className="num text-sm font-semibold">{i.kcal}</span>
              <button type="button" aria-label={`${n.deleteItem} ${i.name}`} onClick={() => db.mealItems.delete(i.id!)} className="grid size-10 place-items-center rounded-full text-muted active:text-danger">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FoodsTab() {
  const search = useFoodSearch();
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  return (
    <>
      <FoodSearchBar {...search} />
      <Button variant="secondary" block onClick={() => setEditing('new')} icon={<Plus size={18} />}>
        {n.newFood}
      </Button>
      {search.filtered.length === 0 ? (
        <Notice>{n.noFood}</Notice>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {search.filtered.map((f) => (
            <FoodRow key={f.id} f={f} onClick={() => setEditing(f)} />
          ))}
        </ul>
      )}
      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing === 'new' ? n.newFood : n.editFood}>
          <FoodEditor initial={editing === 'new' ? undefined : editing} onSaved={() => setEditing(null)} onDeleted={() => setEditing(null)} />
        </Sheet>
      )}
    </>
  );
}

function Report({ targets, profile }: { targets: Targets; profile: Profile }) {
  const today = todayISO();
  const days = useLiveQuery(() => daysNutrition(lastNDays(today, 7)), [today]);
  const micros = useLiveQuery(async () => {
    const list = await Promise.all(lastNDays(today, 7).map(async (d) => Object.values(await dayItems(d)).flat()));
    return averageMicros(list.filter((items) => items.length).map((items) => microsOfItems(items)));
  }, [today]);
  if (!days) return null;
  const r = nutritionReport(days, { kcal: targets.calories, proteinG: targets.proteinG });
  const stats = [
    [n.avgKcal, r.daysLogged ? `${num(r.avg.kcal, 0)} kcal` : '—', `${t.targets.target} ${num(targets.calories, 0)}`],
    [n.avgProtein, r.daysLogged ? `${num(r.avg.proteinG, 0)} g` : '—', `${t.targets.target} ${targets.proteinG} g`],
    [n.daysLogged, `${r.daysLogged} / 7`, ''],
    [n.daysOnTarget, `${r.daysOnTarget} / ${r.daysLogged}`, ''],
    [n.daysProtein, `${r.daysProteinOk} / ${r.daysLogged}`, ''],
  ];
  return (
    <>
      <Card>
        <CardTitle icon={<BarChart3 size={18} />}>{n.reportTitle}</CardTitle>
        {r.daysLogged === 0 ? (
          <p className="text-sm text-muted">{n.reportEmpty}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {stats.map(([label, value, hint]) => (
              <div key={label} className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xs text-muted">{label}</p>
                <p className="num text-lg font-semibold">{value}</p>
                {hint && <p className="num text-[11px] text-muted">{hint}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
      {r.daysLogged > 0 && (
        <Card>
          <CardTitle>{n.chartKcal}</CardTitle>
          <LazyBarTargetChart
            labels={days.map((d) => formatDateFr(d.date, { weekday: 'short' }))}
            values={days.map((d) => d.kcal)}
            target={targets.calories}
            targetLabel={n.chartTarget}
            format={(v) => `${num(v, 0)} kcal`}
            ariaLabel={n.chartKcal}
          />
        </Card>
      )}
      {r.daysLogged > 0 && micros && <MicrosCard totals={micros} profile={profile} kcal={targets.calories} title={`${t.nx.microsTitle} · ${t.nx.microsAvg}`} defaultOpen />}
    </>
  );
}
