import { useState } from 'react';
import { ChevronDown, Flame } from 'lucide-react';
import type { Profile } from '@/db/types';
import { fmt, num, signed, t } from '@/i18n';
import { ACTIVITY_FACTORS, GOAL_ADJUSTMENT, proteinReferenceWeight, type Targets } from '@/lib/energy';

const tt = t.targets;

/** Grille des objectifs quotidiens (calories, macros, eau). */
export function TargetsGrid({ targets }: { targets: Targets }) {
  const items = [
    { label: tt.protein, value: targets.proteinG, unit: t.common.g, color: 'var(--protein)' },
    { label: tt.carbs, value: targets.carbsG, unit: t.common.g, color: 'var(--carbs)' },
    { label: tt.fat, value: targets.fatG, unit: t.common.g, color: 'var(--fat)' },
    { label: tt.water, value: targets.waterMl, unit: t.common.ml, color: 'var(--info)' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-3xl bg-accent-soft p-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-ink">
          <Flame size={24} />
        </span>
        <div>
          <p className="text-sm text-muted">{tt.target}</p>
          <p className="num text-3xl font-bold tracking-tight">
            {num(targets.calories, 0)} <span className="text-base font-medium text-muted">{t.common.kcal}</span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((i) => (
          <div key={i.label} className="rounded-2xl bg-surface-2 p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2 rounded-full" style={{ background: i.color }} />
              {i.label}
            </p>
            <p className="num mt-0.5 text-xl font-semibold">
              {num(i.value, 0)} <span className="text-sm font-normal text-muted">{i.unit}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">{fmt(tt.expected, { kg: signed(targets.expectedWeeklyChangeKg, 2) })}</p>
    </div>
  );
}

/** Section dépliable « Comment c'est calculé ? » avec les vraies valeurs de l'utilisateur. */
export function HowCalculated({ profile, weightKg, targets }: { profile: Profile; weightKg: number; targets: Targets }) {
  const [open, setOpen] = useState(false);
  const adj = GOAL_ADJUSTMENT[profile.goal];
  const refW = proteinReferenceWeight(weightKg, profile.heightCm);
  const lines = [
    fmt(tt.howBmr, {
      sex: profile.gender === 'male' ? tt.howBmrMale : tt.howBmrFemale,
      w: num(weightKg),
      h: num(profile.heightCm),
      a: profile.age,
      sexValue: profile.gender === 'male' ? tt.howBmrMale : tt.howBmrFemale,
      bmr: num(targets.bmr, 0),
    }),
    fmt(tt.howTdee, {
      level: t.options.activity[profile.activityLevel],
      f: num(ACTIVITY_FACTORS[profile.activityLevel], 3),
      tdee: num(targets.tdee, 0),
    }),
    fmt(tt.howGoal, {
      goal: t.options.goal[profile.goal],
      pct: adj === 0 ? '0 %' : `${signed(adj * 100, 0)} %`,
      kcal: num(targets.calories, 0),
    }),
    ...(targets.safetyNotes.includes('max_loss') ? [tt.howSafetyLoss] : []),
    ...(targets.safetyNotes.includes('floor_bmr') ? [tt.howSafetyFloor] : []),
    fmt(tt.howProtein, { perKg: num(targets.proteinPerKg), w: num(refW, 1), g: targets.proteinG, kcal: targets.proteinG * 4 }),
    ...(refW !== weightKg ? [fmt(tt.howProteinRef, { w: num(refW, 1) })] : []),
    fmt(tt.howFat, { g: targets.fatG }),
    fmt(tt.howCarbs, { g: targets.carbsG }),
    fmt(tt.howWater, { ml: num(targets.waterMl, 0) }),
  ];
  return (
    <div className="rounded-2xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between px-4 text-left text-[15px] font-medium"
      >
        {tt.howTitle}
        <ChevronDown size={18} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3 text-sm leading-relaxed text-muted animate-fade">
          <p className="flex justify-between text-fg">
            <span>{tt.bmr}</span>
            <span className="num font-semibold">{num(targets.bmr, 0)} kcal</span>
          </p>
          <p className="flex justify-between text-fg">
            <span>{tt.tdee}</span>
            <span className="num font-semibold">{num(targets.tdee, 0)} kcal</span>
          </p>
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="rounded-xl bg-surface-2 p-3 text-fg">{tt.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
