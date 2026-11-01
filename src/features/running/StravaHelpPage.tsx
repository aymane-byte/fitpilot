import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { t } from '@/i18n';
import { ImportRunSheet } from './ImportRunSheet';

const s = t.gpsr;

/** Aide : exporter un GPX depuis strava.com et l'importer dans FitPilot. */
export function StravaHelpPage() {
  const [importing, setImporting] = useState(false);
  return (
    <>
      <PageHeader title={s.stravaTitle} back />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28">
        <Notice>{s.stravaIntro}</Notice>
        {([[s.stravaOneTitle, s.stravaOne], [s.stravaAllTitle, s.stravaAll]] as [string, string[]][]).map(([title, steps]) => (
          <Card key={title}>
            <CardTitle>{title}</CardTitle>
            <ol className="flex flex-col gap-3">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-[15px]">
                  <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
        <p className="text-sm text-muted">{s.stravaNote}</p>
        <Button size="lg" block onClick={() => setImporting(true)} icon={<FileUp size={18} />}>
          {s.stravaCta}
        </Button>
      </main>
      {importing && <ImportRunSheet open onClose={() => setImporting(false)} />}
    </>
  );
}
