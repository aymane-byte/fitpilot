import { useEffect, useState } from 'react';
import { Activity, Salad, Target, User } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import type { Profile } from '@/db/types';
import { t } from '@/i18n';
import { latestWeight, targetsFor, useProfile, useWeightEntries } from '@/hooks/useData';
import { GoalSection, IdentitySection, NutritionSection, TrainingSection, type SectionProps } from './ProfileSections';
import { HowCalculated, TargetsGrid } from './TargetsView';
import { BodyFatCard } from './BodyFatCard';
import { saveProfile } from './saveProfile';

const f = t.profileFields;

export function ProfilePage() {
  const profile = useProfile();
  const entries = useWeightEntries();
  const toast = useToast();
  const [draft, setDraft] = useState<Profile>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const current = profile && entries ? latestWeight(profile, entries) : undefined;

  // Le brouillon part du profil, avec le poids actuel (dernière pesée).
  useEffect(() => {
    if (profile && current !== undefined && !draft) setDraft({ ...profile, weightKg: current });
  }, [profile, current, draft]);

  if (!draft || current === undefined) return <PageHeader title={t.profile.title} back />;

  const set: SectionProps['set'] = (key, value) => {
    setDraft((d) => d && { ...d, [key]: value });
    setErrors((e) => {
      const { [key as string]: _removed, ...rest } = e;
      return rest;
    });
  };

  async function save() {
    if (!draft) return;
    const res = await saveProfile(draft, current);
    if (res.ok) toast(t.profile.saved);
    else {
      setErrors(res.errors);
      toast(Object.values(res.errors)[0], 'error');
    }
  }

  const props = { draft, set, errors };
  const targets = targetsFor(draft, draft.weightKg || current);
  const dirty = JSON.stringify({ ...profile, weightKg: current }) !== JSON.stringify(draft);

  return (
    <>
      <PageHeader title={t.profile.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-40">
        <Card>
          <CardTitle icon={<User size={18} />}>{f.identity}</CardTitle>
          <IdentitySection {...props} />
        </Card>
        <Card>
          <CardTitle icon={<Target size={18} />}>{f.goalSection}</CardTitle>
          <GoalSection {...props} />
        </Card>
        <Card>
          <CardTitle icon={<Activity size={18} />}>{f.training}</CardTitle>
          <TrainingSection {...props} />
        </Card>
        <Card>
          <CardTitle icon={<Salad size={18} />}>{f.nutrition}</CardTitle>
          <NutritionSection {...props} />
        </Card>
        <Card>
          <CardTitle>{t.onboarding.summaryTitle}</CardTitle>
          <div className="flex flex-col gap-4">
            <TargetsGrid targets={targets} />
            <HowCalculated profile={draft} weightKg={draft.weightKg || current} targets={targets} />
          </div>
        </Card>
        <BodyFatCard profile={draft} />
      </main>
      {dirty && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 px-4 pb-3 animate-rise">
          <div className="mx-auto max-w-lg">
            <Button size="lg" block onClick={save} className="shadow-xl">
              {t.common.save}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
