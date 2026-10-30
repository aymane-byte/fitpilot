import { useEffect, useState } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { cssVar } from '@/hooks/useTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler);

/** Couleurs lues depuis les variables CSS, relues à chaque changement de thème. */
export function useThemeColors() {
  const read = () => ({ accent: cssVar('--accent-text'), muted: cssVar('--muted'), grid: cssVar('--border'), text: cssVar('--text'), surface: cssVar('--surface-2') });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const onTheme = () => setColors(read());
    window.addEventListener('fitpilot-theme', onTheme);
    return () => window.removeEventListener('fitpilot-theme', onTheme);
  }, []);
  return colors;
}

export const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Courbe simple (une série) avec infobulle au toucher. `invert` : plus bas = mieux (allure). */
export function TrendChart({ labels, values, format, invert, ariaLabel }: { labels: string[]; values: number[]; format: (v: number) => string; invert?: boolean; ariaLabel: string }) {
  const c = useThemeColors();
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion() ? false : { duration: 500 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      tooltip: {
        backgroundColor: c.surface,
        titleColor: c.text,
        bodyColor: c.text,
        borderColor: c.grid,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: { label: (ctx) => format(ctx.parsed.y ?? 0) },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.muted, maxTicksLimit: 5, maxRotation: 0, font: { size: 11 } }, border: { display: false } },
      y: { reverse: invert, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, maxTicksLimit: 5, font: { size: 11 }, callback: (v) => format(Number(v)) } },
    },
  };
  return (
    <div className="h-44">
      <Line
        aria-label={ariaLabel}
        options={options}
        data={{
          labels,
          datasets: [
            {
              data: values,
              borderColor: c.accent,
              backgroundColor: c.accent,
              tension: 0.3,
              borderWidth: 2.5,
              pointRadius: values.length > 30 ? 0 : 3,
              pointHitRadius: 12,
            },
          ],
        }}
      />
    </div>
  );
}

/** Barres par jour avec une ligne d'objectif (ex. calories de la semaine). */
export function BarTargetChart({ labels, values, target, format, ariaLabel, targetLabel }: { labels: string[]; values: number[]; target: number; format: (v: number) => string; ariaLabel: string; targetLabel: string }) {
  const c = useThemeColors();
  return (
    <div className="h-44">
      <Bar
        aria-label={ariaLabel}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: reduceMotion() ? false : { duration: 500 },
          plugins: {
            tooltip: { backgroundColor: c.surface, titleColor: c.text, bodyColor: c.text, borderColor: c.grid, borderWidth: 1, displayColors: false, callbacks: { label: (ctx) => format(ctx.parsed.y ?? 0) } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: c.muted, font: { size: 11 } }, border: { display: false } },
            y: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, maxTicksLimit: 5, font: { size: 11 } } },
          },
        }}
        data={{
          labels,
          datasets: [
            { type: 'bar' as const, data: values, backgroundColor: c.accent, borderRadius: 8, maxBarThickness: 28 },
            // Ligne d'objectif dessinée comme une série « line » superposée.
            { type: 'line' as const, label: targetLabel, data: labels.map(() => target), borderColor: c.muted, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 } as never,
          ],
        }}
      />
    </div>
  );
}
