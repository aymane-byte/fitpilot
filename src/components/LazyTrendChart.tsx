import { lazy, Suspense, type ComponentProps } from 'react';

const Chart = lazy(() => import('./TrendChart').then((m) => ({ default: m.TrendChart })));

/** TrendChart chargé à la demande (Chart.js ne pèse pas sur le premier affichage). */
export function LazyTrendChart(props: ComponentProps<typeof Chart>) {
  return (
    <Suspense fallback={<div className="h-44" />}>
      <Chart {...props} />
    </Suspense>
  );
}

const Bars = lazy(() => import('./TrendChart').then((m) => ({ default: m.BarTargetChart })));

export function LazyBarTargetChart(props: ComponentProps<typeof Bars>) {
  return (
    <Suspense fallback={<div className="h-44" />}>
      <Bars {...props} />
    </Suspense>
  );
}
