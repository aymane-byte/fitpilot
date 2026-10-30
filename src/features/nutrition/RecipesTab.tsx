import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Card, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { MiniNumber, NumberField, TextField } from '@/components/Field';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { db } from '@/db/db';
import type { Food, Recipe } from '@/db/types';
import { fmt, num, t } from '@/i18n';
import { nutrientsFor, recipePer100g } from '@/lib/nutrition';
import { FoodRow, FoodSearchBar, useFoodSearch } from './FoodSheets';
import { saveRecipe } from './service';
import { servingGrams } from '@/lib/mealPlan';

const n = t.nutrition;

export function RecipesTab() {
  const recipes = useLiveQuery(() => db.recipes.toArray()) ?? [];
  const foods = useLiveQuery(async () => new Map((await db.foods.where('recipeId').above(0).toArray()).map((f) => [f.recipeId!, f]))) ?? new Map<number, Food>();
  const [editing, setEditing] = useState<Recipe | null>(null);
  return (
    <>
      <Button variant="secondary" block onClick={() => setEditing({ name: '', items: [] })} icon={<Plus size={18} />}>
        {n.newRecipe}
      </Button>
      {recipes.length === 0 ? (
        <Notice>{n.recipesEmpty}</Notice>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {recipes.map((r) => {
            const f = foods.get(r.id!);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setEditing(r)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="num block text-xs text-muted">
                      {r.items.length} · {f ? `${f.kcal} kcal ${n.per100}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <RecipeEditor initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecipeEditor({ initial, onClose }: { initial: Recipe; onClose: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<Recipe>(initial);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const search = useFoodSearch();
  const foods = useLiveQuery(async () => new Map((await db.foods.bulkGet(r.items.map((i) => i.foodId))).filter(Boolean).map((f) => [f!.id!, f!])), [r.items]) ?? new Map<number, Food>();
  const valid = r.items.filter((i) => foods.has(i.foodId));
  const per = recipePer100g(valid.map((i) => ({ food: foods.get(i.foodId)!, grams: i.grams })), r.cookedWeightG);
  const totalKcal = valid.reduce((s, i) => s + nutrientsFor(foods.get(i.foodId)!, i.grams).kcal, 0);

  async function save() {
    if (!r.name.trim()) return setError(n.errName);
    if (!valid.length) return setError(n.recipeNeedItems);
    await saveRecipe({ ...r, name: r.name.trim().slice(0, 60), items: valid });
    toast(n.recipeSaved);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={picking ? n.addIngredient : initial.id ? r.name : n.newRecipe}>
      {picking ? (
        <div className="flex flex-col gap-3">
          <FoodSearchBar {...search} />
          <ul className="max-h-[55dvh] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
            {search.filtered
              .filter((f) => f.recipeId !== initial.id || initial.id === undefined)
              .map((f) => (
                <FoodRow key={f.id} f={f} onClick={() => { setR({ ...r, items: [...r.items, { foodId: f.id!, grams: f.units?.[0]?.grams ?? 100 }] }); setPicking(false); }} />
              ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TextField label={n.recipeName} value={r.name} onChange={(name) => { setR({ ...r, name }); setError(undefined); }} />
          <div>
            <p className="mb-2 text-sm font-medium text-muted">{n.ingredients}</p>
            <ul className="flex flex-col gap-2">
              {r.items.map((i, k) => (
                <li key={k} className="grid grid-cols-[1fr_5.5rem_2.75rem] items-center gap-2">
                  <span className="truncate text-[15px]">{foods.get(i.foodId)?.name ?? '—'}</span>
                  <MiniNumber label={`${foods.get(i.foodId)?.name} g`} value={i.grams} onCommit={(v) => setR({ ...r, items: r.items.map((x, j) => (j === k ? { ...x, grams: v ?? 0 } : x)) })} />
                  <button type="button" aria-label={t.common.delete} onClick={() => setR({ ...r, items: r.items.filter((_, j) => j !== k) })} className="grid size-11 place-items-center rounded-xl text-muted">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <Button className="mt-2" size="sm" variant="secondary" onClick={() => setPicking(true)} icon={<Plus size={16} />}>
              {n.addIngredient}
            </Button>
          </div>
          <p className="-mt-2 text-xs text-muted">{t.nx.rawNote}</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={n.cookedWeight} unit="g" value={r.cookedWeightG} onChange={(cookedWeightG) => setR({ ...r, cookedWeightG })} hint={n.cookedWeightHint} />
            <NumberField label={t.nx.servings} value={r.servings} integer onChange={(servings) => setR({ ...r, servings: servings && servings > 0 && servings <= 50 ? servings : undefined })} hint={t.nx.servingsHint} />
          </div>
          {valid.length > 0 && (
            <Card className="!p-3">
              <p className="num text-sm text-muted">{fmt(n.recipeTotal, { g: num(per.totalG, 0), kcal: num(totalKcal, 0) })}</p>
              <p className="num font-semibold">
                {per.kcal} kcal · P {num(per.proteinG)} · G {num(per.carbsG)} · L {num(per.fatG)} <span className="text-sm font-normal text-muted">{n.per100}</span>
              </p>
              {servingGrams(r) && (
                <p className="num text-sm" data-testid="per-serving">
                  {fmt(t.nx.perServing, { g: servingGrams(r)!, kcal: Math.round((per.kcal * servingGrams(r)!) / 100) })}
                </p>
              )}
            </Card>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button size="lg" block onClick={save}>
            {t.common.save}
          </Button>
          {initial.id !== undefined && (
            <Button
              variant="danger"
              block
              icon={<Trash2 size={18} />}
              onClick={async () => {
                await db.transaction('rw', db.recipes, db.foods, async () => {
                  if (initial.foodId) await db.foods.delete(initial.foodId);
                  await db.recipes.delete(initial.id!);
                });
                onClose();
              }}
            >
              {n.deleteRecipe}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
