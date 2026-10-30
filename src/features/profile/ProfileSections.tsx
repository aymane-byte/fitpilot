import { NumberField, TextArea, TextField } from '@/components/Field';
import { DayCount, Segmented } from '@/components/Segmented';
import type { Profile } from '@/db/types';
import { fmt, t } from '@/i18n';
import { suggestActivityLevel } from '@/lib/energy';

export interface SectionProps {
  draft: Profile;
  set: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
  errors: Record<string, string>;
}

const opts = <T extends string>(map: Record<T, string>, hints?: Record<T, string>) =>
  (Object.keys(map) as T[]).map((value) => ({ value, label: map[value], hint: hints?.[value] }));

const f = t.profileFields;

export function IdentitySection({ draft, set, errors }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextField label={f.name} value={draft.name} onChange={(v) => set('name', v)} error={errors.name} autoComplete="given-name" />
      <Segmented label={f.gender} value={draft.gender} options={opts(t.options.gender)} onChange={(v) => set('gender', v)} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={f.age} value={draft.age} onChange={(v) => set('age', v as number)} unit={t.common.years} integer error={errors.age} />
        <NumberField label={f.height} value={draft.heightCm} onChange={(v) => set('heightCm', v as number)} unit={t.common.cm} error={errors.heightCm} />
        <NumberField label={f.weight} value={draft.weightKg} onChange={(v) => set('weightKg', v as number)} unit={t.common.kg} error={errors.weightKg} />
        <NumberField
          label={`${f.targetWeight} (${t.common.optional})`}
          value={draft.targetWeightKg}
          onChange={(v) => set('targetWeightKg', v)}
          unit={t.common.kg}
          error={errors.targetWeightKg}
        />
      </div>
    </div>
  );
}

export function GoalSection({ draft, set }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <Segmented layout="grid" label={f.goal} value={draft.goal} options={opts(t.options.goal, t.options.goalHint)} onChange={(v) => set('goal', v)} />
      <TextArea label={f.injuries} value={draft.injuries} onChange={(v) => set('injuries', v)} placeholder={f.injuriesPlaceholder} />
    </div>
  );
}

export function TrainingSection({ draft, set }: SectionProps) {
  const sessions = draft.gymDaysPerWeek + draft.runDaysPerWeek;
  const suggested = suggestActivityLevel(sessions);
  return (
    <div className="flex flex-col gap-4">
      <Segmented label={f.gymLevel} value={draft.gymLevel} options={opts(t.options.level)} onChange={(v) => set('gymLevel', v)} />
      <DayCount label={f.gymDays} value={draft.gymDaysPerWeek} onChange={(v) => set('gymDaysPerWeek', v)} />
      <Segmented label={f.equipment} value={draft.equipment} options={opts(t.options.equipment)} onChange={(v) => set('equipment', v)} />
      <Segmented label={f.runLevel} value={draft.runLevel} options={opts(t.options.runLevel)} onChange={(v) => set('runLevel', v)} />
      <DayCount label={f.runDays} value={draft.runDaysPerWeek} onChange={(v) => set('runDaysPerWeek', v)} />
      <NumberField label={f.canRun} value={draft.canRunMinutes} onChange={(v) => set('canRunMinutes', v ?? 0)} unit={t.common.min} integer />
      <Segmented label={f.preferredTime} value={draft.preferredTime} options={opts(t.options.time)} onChange={(v) => set('preferredTime', v)} />
      <div className="flex flex-col gap-1.5">
        <Segmented
          layout="grid"
          label={f.activity}
          value={draft.activityLevel}
          options={opts(t.options.activity, t.options.activityHint)}
          onChange={(v) => set('activityLevel', v)}
        />
        <p className="text-xs text-muted">{fmt(f.activitySuggest, { n: sessions, level: t.options.activity[suggested] })}</p>
      </div>
    </div>
  );
}

export function NutritionSection({ draft, set }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextArea label={f.diet} value={draft.dietaryPreferences} onChange={(v) => set('dietaryPreferences', v)} placeholder={f.dietPlaceholder} />
      <TextArea label={f.allergies} value={draft.allergies} onChange={(v) => set('allergies', v)} placeholder={f.allergiesPlaceholder} />
      <Segmented label={f.budget} value={draft.foodBudget} options={opts(t.options.budget)} onChange={(v) => set('foodBudget', v)} />
      <TextField label={f.supplements} value={draft.supplements} onChange={(v) => set('supplements', v)} placeholder={f.supplementsPlaceholder} />
    </div>
  );
}
