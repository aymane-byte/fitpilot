import { Volume2 } from 'lucide-react';
import { Card, CardTitle, Notice } from '@/components/Card';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { Toggle } from '@/components/Toggle';
import { updateSettings } from '@/db/db';
import { useSettings } from '@/hooks/useData';
import { t } from '@/i18n';
import type { VoicePrefs } from '@/lib/voice';
import { speak, speechSupported, voicePrefs } from './speech';

const x = t.runx;

export function VoiceSettingsCard() {
  const settings = useSettings();
  if (!settings) return null;
  const v = voicePrefs(settings.voice);
  const set = (patch: Partial<VoicePrefs>) => updateSettings({ voice: { ...v, ...patch } });
  const supported = speechSupported();
  return (
    <Card>
      <CardTitle icon={<Volume2 size={18} />}>{x.voiceTitle}</CardTitle>
      {!supported && (
        <div className="mb-3">
          <Notice tone="warning">{x.voiceUnsupported}</Notice>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Toggle label={x.voiceEnable} checked={v.enabled} onChange={(enabled) => set({ enabled })} />
        <Segmented
          label={x.voiceEvery}
          value={v.everyKm}
          onChange={(everyKm) => set({ everyKm })}
          options={[
            { value: 0.5, label: '0,5 km' },
            { value: 1, label: '1 km' },
            { value: 2, label: '2 km' },
          ]}
        />
        <Toggle label={x.voiceTime} checked={v.time} disabled={!v.enabled} onChange={(time) => set({ time })} />
        <Toggle label={x.voiceSplit} checked={v.splitPace} disabled={!v.enabled} onChange={(splitPace) => set({ splitPace })} />
        <Toggle label={x.voiceAvg} checked={v.avgPace} disabled={!v.enabled} onChange={(avgPace) => set({ avgPace })} />
        <Toggle label={x.voiceAlerts} checked={v.paceAlerts} disabled={!v.enabled} onChange={(paceAlerts) => set({ paceAlerts })} />
        <Button variant="secondary" disabled={!supported} onClick={() => speak(x.voiceTestText, { interrupt: true })} icon={<Volume2 size={18} />}>
          {x.voiceTest}
        </Button>
        <p className="text-xs text-muted">{x.voiceNote}</p>
      </div>
    </Card>
  );
}
