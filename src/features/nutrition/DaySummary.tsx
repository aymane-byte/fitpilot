import type { MealItem } from '@/db/types';
import { MacroBar, ProgressRing } from '@/components/ProgressRing';
import { num, t } from '@/i18n';
import type { Targets } from '@/lib/energy';
import { sumNutrients } from '@/lib/nutrition';

const n = t.nutrition;

/** Résumé calories + macros d'un jour (réutilisé par le tableau de bord). */
export function DaySummary({ items, targets }: { items: MealItem[]; targets: Targets }) {
  const total = sumNutrients(items);
  const left = targets.calories - total.kcal;
  return (
    <div className="flex items-center gap-4">
      <ProgressRing value={total.kcal} max={targets.calories} size={112} label={`${total.kcal} / ${targets.calories} kcal`} color={left < -targets.calories * 0.1 ? 'var(--warning)' : undefined}>
        <div>
          <p className="num text-xl font-bold leading-none" data-testid="kcal-left">
            {num(Math.abs(left), 0)}
          </p>
          <p className="mt-1 text-[11px] text-muted">kcal {left >= 0 ? n.remaining : n.over}</p>
        </div>
      </ProgressRing>
      <div className="flex flex-1 flex-col gap-2.5">
        <MacroBar label={t.targets.protein} value={total.proteinG} target={targets.proteinG} color="var(--protein)" />
        <MacroBar label={t.targets.carbs} value={total.carbsG} target={targets.carbsG} color="var(--carbs)" />
        <MacroBar label={t.targets.fat} value={total.fatG} target={targets.fatG} color="var(--fat)" />
      </div>
    </div>
  );
}
