import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { reduceMotion as prefersReducedMotion, useThemeColors } from '@/components/TrendChart';
import { num, t } from '@/i18n';
import { formatDateFr } from '@/lib/dates';
import { dailyAverages, movingAverage, type DatedValue } from '@/lib/stats';

export function WeightChart({ entries, target }: { entries: DatedValue[]; target?: number }) {
  const c = useThemeColors();
  const reduceMotion = prefersReducedMotion();

  const { labels, raw, avg } = useMemo(() => {
    const daily = dailyAverages(entries);
    const ma = movingAverage(entries);
    return {
      labels: daily.map((d) => formatDateFr(d.date)),
      raw: daily.map((d) => Math.round(d.value * 10) / 10),
      avg: ma.map((d) => d.value),
    };
  }, [entries]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 500 },
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
        callbacks: { label: (ctx) => `${ctx.dataset.label} : ${num(ctx.parsed.y ?? 0, 2)} kg` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.muted, maxTicksLimit: 5, maxRotation: 0, font: { size: 11 } }, border: { display: false } },
      y: {
        grid: { color: c.grid },
        border: { display: false },
        ticks: { color: c.muted, maxTicksLimit: 5, font: { size: 11 }, callback: (v) => num(Number(v), 1) },
        suggestedMin: Math.min(...raw, target ?? Infinity) - 0.5,
        suggestedMax: Math.max(...raw, target ?? -Infinity) + 0.5,
      },
    },
  };

  return (
    <div className="h-44">
      <Line
        aria-label={`${t.dashboard.chartRaw} / ${t.dashboard.chartAvg}`}
        options={options}
        data={{
          labels,
          datasets: [
            {
              label: t.dashboard.chartAvg,
              data: avg,
              borderColor: c.accent,
              backgroundColor: (ctx) => {
                const { chart } = ctx;
                if (!chart.chartArea) return 'transparent';
                const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
                g.addColorStop(0, c.accent + '40');
                g.addColorStop(1, c.accent + '00');
                return g;
              },
              fill: true,
              tension: 0.35,
              borderWidth: 2.5,
              pointRadius: 0,
              pointHitRadius: 12,
            },
            ...(target !== undefined
              ? [
                  {
                    label: t.dashboard.target,
                    data: labels.map(() => target),
                    borderColor: c.muted,
                    borderDash: [5, 5],
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHitRadius: 0,
                    fill: false,
                  },
                ]
              : []),
            {
              label: t.dashboard.chartRaw,
              data: raw,
              borderColor: 'transparent',
              backgroundColor: c.muted,
              pointRadius: raw.length > 40 ? 1.5 : 3,
              pointHitRadius: 12,
              showLine: false,
            },
          ],
        }}
      />
    </div>
  );
}
