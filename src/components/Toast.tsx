import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';

type Tone = 'success' | 'error';
interface ToastState {
  id: number;
  text: string;
  tone: Tone;
}

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string, tone: Tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center pt-safe">
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="mx-4 mt-3 flex items-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg shadow-lg animate-rise"
          >
            {toast.tone === 'success' ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
            {toast.text}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
