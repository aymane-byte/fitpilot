import { CircleCheck, Compass, Info, Share, SquarePlus, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { t } from '@/i18n';
import { isIOSNonSafari, isStandalone } from './platform';

const i = t.install;

export function InstallPage() {
  const steps = [
    { icon: <Compass size={20} />, text: i.step1 },
    { icon: <Share size={20} />, text: i.step2 },
    { icon: <SquarePlus size={20} />, text: i.step3 },
    { icon: <CircleCheck size={20} />, text: i.step4 },
  ];
  return (
    <>
      <PageHeader title={i.title} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        {isStandalone() && <Notice icon={<CircleCheck size={16} className="text-accent-text" />}>{i.installed}</Notice>}
        {isIOSNonSafari() && <Notice tone="warning">{i.notSafari}</Notice>}
        <Card>
          <ol className="flex flex-col gap-4">
            {steps.map((s, n) => (
              <li key={n} className="flex items-start gap-3">
                <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                  {s.icon}
                  <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">
                    {n + 1}
                  </span>
                </span>
                <p className="pt-2 text-[15px] leading-snug">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
            <Smartphone size={18} className="mt-0.5 shrink-0 text-accent-text" />
            {i.after}
          </p>
        </Card>
        <Card>
          <CardTitle icon={<Info size={18} />}>{i.whyTitle}</CardTitle>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
            <li>{i.why1}</li>
            <li>{i.why2}</li>
            <li>{i.why3}</li>
          </ul>
        </Card>
      </main>
    </>
  );
}
