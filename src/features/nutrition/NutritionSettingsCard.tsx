import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { Toggle } from '@/components/Toggle';
import { useToast } from '@/components/Toast';
import { updateSettings } from '@/db/db';
import { useSettings } from '@/hooks/useData';
import { t } from '@/i18n';
import { CYCLING_DEFAULT_PCT, isValidTime } from '@/lib/dayTargets';

const x = t.nx;

export function NutritionSettingsCard() {
  const toast = useToast();
  const settings = useSettings();
  const [suhoor, setSuhoor] = useState('');
  const [iftar, setIftar] = useState('');
  useEffect(() => {
    if (!settings) return;
    setSuhoor(settings.ramadan?.suhoor ?? '04:50');
    setIftar(settings.ramadan?.iftar ?? '19:05');
  }, [settings?.ramadan?.suhoor, settings?.ramadan?.iftar, settings]);
  if (!settings) return null;
  const cycling = settings.calorieCycling ?? { enabled: false, pct: CYCLING_DEFAULT_PCT };
  const ramadan = settings.ramadan ?? { enabled: false, suhoor: '04:50', iftar: '19:05' };
  const timesOk = isValidTime(suhoor) && isValidTime(iftar);

  return (
    <Card>
      <CardTitle icon={<Utensils size={18} />}>{x.settingsTitle}</CardTitle>
      <div className="flex flex-col gap-3">
        <Toggle label={x.cycling} hint={x.cyclingHint} checked={cycling.enabled} onChange={(enabled) => updateSettings({ calorieCycling: { ...cycling, enabled } })} />
        {cycling.enabled && (
          <>
            <Segmented
              label={x.cyclingPct}
              value={cycling.pct}
              onChange={(pct) => updateSettings({ calorieCycling: { ...cycling, pct } })}
              options={[
                { value: 0.05, label: '+5 %' },
                { value: 0.1, label: '+10 %' },
                { value: 0.15, label: '+15 %' },
              ]}
            />
            <p className="text-xs text-muted">{x.cyclingNoPlan}</p>
          </>
        )}
        <div className="border-t border-line pt-3">
          <Toggle label={x.ramadan} hint={x.ramadanHint} checked={ramadan.enabled} onChange={(enabled) => updateSettings({ ramadan: { ...ramadan, suhoor: isValidTime(suhoor) ? suhoor : ramadan.suhoor, iftar: isValidTime(iftar) ? iftar : ramadan.iftar, enabled } })} />
        </div>
        {ramadan.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={x.suhoor} value={suhoor} onChange={setSuhoor} inputMode="numeric" placeholder="04:50" error={suhoor && !isValidTime(suhoor) ? x.errTime : undefined} />
              <TextField label={x.iftar} value={iftar} onChange={setIftar} inputMode="numeric" placeholder="19:05" error={iftar && !isValidTime(iftar) ? x.errTime : undefined} />
            </div>
            <p className="text-xs text-muted">{x.timeHint}</p>
            <Button
              variant="secondary"
              disabled={!timesOk}
              onClick={async () => {
                await updateSettings({ ramadan: { enabled: true, suhoor: suhoor.padStart(5, '0'), iftar: iftar.padStart(5, '0') } });
                toast(t.common.saved);
              }}
            >
              {t.common.save}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
