import { describe, expect, it } from 'vitest';
import { nextAction, todayItems } from './today';

const base = { weighedToday: false, waterMl: 0, waterTargetMl: 2750, backupDue: false, hour: 8 };

describe('résumé du jour', () => {
  it('le matin, la pesée est recommandée en premier', () => {
    expect(nextAction(todayItems(base))?.key).toBe('weigh');
  });
  it('le soir, l’eau passe avant la pesée', () => {
    expect(nextAction(todayItems({ ...base, hour: 19 }))?.key).toBe('water');
  });
  it('la sauvegarde apparaît seulement si nécessaire', () => {
    expect(todayItems(base).some((i) => i.key === 'backup')).toBe(false);
    expect(todayItems({ ...base, backupDue: true }).some((i) => i.key === 'backup')).toBe(true);
  });
  it('tout est fait → aucune action', () => {
    expect(nextAction(todayItems({ ...base, weighedToday: true, waterMl: 3000 }))).toBeNull();
  });
});

describe('séance prévue', () => {
  it('une séance prévue passe avant l’eau', () => {
    expect(nextAction(todayItems({ ...base, weighedToday: true, planned: { done: false } }))?.key).toBe('activity');
  });
  it('séance faite → comptée comme faite', () => {
    const items = todayItems({ ...base, planned: { done: true } });
    expect(items.find((i) => i.key === 'activity')?.done).toBe(true);
  });
});
