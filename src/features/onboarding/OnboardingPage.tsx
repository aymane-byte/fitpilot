import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Card';
import type { Profile } from '@/db/types';
import { fmt, t } from '@/i18n';
import { fieldErrors, profileSchema } from '@/lib/schemas';
import { targetsFor } from '@/hooks/useData';
import { defaultProfileDraft } from './defaults';
import { GoalSection, IdentitySection, NutritionSection, TrainingSection, type SectionProps } from '../profile/ProfileSections';
import { HowCalculated, TargetsGrid } from '../profile/TargetsView';
import { saveProfile } from '../profile/saveProfile';
import { BackupImport } from '../settings/BackupImport';

const f = t.profileFields;
const steps: { title: string; Section: (p: SectionProps) => ReactElement; fields?: (keyof Profile)[] }[] = [
  { title: f.identity, Section: IdentitySection, fields: ['name', 'age', 'heightCm', 'weightKg', 'targetWeightKg'] },
  { title: f.goalSection, Section: GoalSection },
  { title: f.training, Section: TrainingSection },
  { title: f.nutrition, Section: NutritionSection },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(-1); // -1 = accueil, steps.length = résumé
  const [draft, setDraft] = useState<Profile>(() => defaultProfileDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set: SectionProps['set'] = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const { [key as string]: _removed, ...rest } = e;
      return rest;
    });
  };

  function next() {
    const fields = steps[step]?.fields;
    if (fields) {
      const res = profileSchema.safeParse(draft);
      if (!res.success) {
        const errs = fieldErrors(res.error);
        const relevant = Object.fromEntries(Object.entries(errs).filter(([k]) => fields.includes(k as keyof Profile)));
        if (Object.keys(relevant).length) {
          setErrors(relevant);
          return;
        }
      }
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    setSaving(true);
    const res = await saveProfile({ ...draft, createdAt: Date.now() });
    setSaving(false);
    if (res.ok) navigate('/', { replace: true });
    else {
      setErrors(res.errors);
      setStep(0);
    }
  }

  if (step === -1) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-between px-5 pt-safe pb-safe">
        <div className="flex flex-1 flex-col justify-center gap-6 py-10 animate-rise">
          <img src="./icons/icon-192.png" alt="" className="size-20 rounded-[22px] shadow-lg" />
          <div>
            <h1 className="text-[34px] font-bold leading-tight tracking-tight">{t.onboarding.welcomeTitle}</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-muted">{t.onboarding.welcomeText}</p>
          </div>
          <Notice icon={<ShieldCheck size={18} className="text-accent-text" />}>{t.settings.privacy}</Notice>
        </div>
        <div className="flex flex-col gap-2 pb-6">
          <Button size="lg" block onClick={() => setStep(0)} icon={<ArrowRight size={20} />}>
            {t.onboarding.start}
          </Button>
          <BackupImport variant="ghost" label={t.onboarding.restore} onDone={() => navigate('/', { replace: true })} />
        </div>
      </main>
    );
  }

  const isSummary = step === steps.length;
  const total = steps.length + 1;
  const current = steps[step];
  const weight = draft.weightKg;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-safe pb-safe">
      <div className="sticky top-0 z-10 -mx-5 bg-bg/90 px-5 pt-3 pb-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            aria-label={t.common.back}
            className="-ml-2 grid size-11 place-items-center rounded-full active:bg-surface-2"
          >
            <ChevronLeft size={24} />
          </button>
          <p className="text-sm text-muted">{fmt(t.onboarding.step, { n: step + 1, total })}</p>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition ${i <= step ? 'bg-accent' : 'bg-surface-2'}`} />
          ))}
        </div>
      </div>

      <div key={step} className="flex-1 py-4 animate-rise">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight">{isSummary ? t.onboarding.summaryTitle : current.title}</h1>
        {step === 0 && <p className="mb-5 text-sm text-muted">{t.onboarding.prefilledNote}</p>}
        {isSummary ? (
          <div className="mt-2 flex flex-col gap-4">
            <p className="text-sm text-muted">{t.onboarding.summaryText}</p>
            <TargetsGrid targets={targetsFor(draft, weight)} />
            <HowCalculated profile={draft} weightKg={weight} targets={targetsFor(draft, weight)} />
          </div>
        ) : (
          <div className={step === 0 ? '' : 'mt-5'}>
            <current.Section draft={draft} set={set} errors={errors} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 bg-bg/90 px-5 pt-3 pb-5 backdrop-blur-xl">
        {isSummary ? (
          <Button size="lg" block onClick={finish} disabled={saving}>
            {t.onboarding.finish}
          </Button>
        ) : (
          <Button size="lg" block onClick={next} icon={<ArrowRight size={20} />}>
            {t.common.next}
          </Button>
        )}
      </div>
    </main>
  );
}
