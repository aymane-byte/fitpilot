import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { t } from '@/i18n';

/** Enregistre le service worker et propose la mise à jour quand une nouvelle version est prête. */
export function UpdatePrompt() {
  const toast = useToast();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      toast(t.pwa.offlineReady);
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 px-4 animate-rise">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl">
        <p className="text-sm font-medium">{t.pwa.updateReady}</p>
        <Button size="sm" onClick={() => updateServiceWorker(true)} icon={<RefreshCw size={16} />}>
          {t.pwa.update}
        </Button>
      </div>
    </div>
  );
}
