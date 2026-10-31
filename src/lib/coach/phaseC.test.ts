import { describe, expect, it } from 'vitest';
import { computeTargets } from '../energy';
import { microTargets } from '../micros';
import { buildContext, compactSummary, type CoachExtra, type CoachRawData } from './context';
import { detectIntent, loadInsights, microInsights, ramadanInsights, rulesReply, shoeInsights, weeklyInsights } from './rules';

const today = '2026-10-30';
const targets = computeTargets({ weightKg: 78, heightCm: 170, age: 20, gender: 'male', activity: 'moderate', goal: 'recomp' });

function raw(extra?: CoachExtra): CoachRawData {
  return {
    today,
    profile: { name: 'Test', age: 20, gender: 'male', heightCm: 170, goal: 'recomp', gymDaysPerWeek: 3, runDaysPerWeek: 2, gymLevel: 'intermediate', runLevel: 'intermediate', injuries: '', allergies: '', dietaryPreferences: '', supplements: '' },
    currentWeightKg: 78,
    targets,
    weights: [],
    nutrition: [],
    workouts: [],
    runs: [],
    scheduled: [],
    extra,
  };
}

const mt = microTargets({ gender: 'male', age: 20 }, targets.calories);

describe('coach : charge d’entraînement', () => {
  it('surcharge et rampe trop rapide → avertissements', () => {
    const ctx = buildContext(raw({ load: { ctl: 40, atl: 75, tsb: -35, zone: 'overload', ramp: 9.5 } }));
    const ins = loadInsights(ctx);
    expect(ins.map((i) => [i.id, i.level])).toEqual([['load', 'warn'], ['ramp', 'warn']]);
    expect(ins[0].text).toContain('−35');
    expect(ins[0].text).toContain('surcharge');
  });
  it('frais → positif ; sans courses → info ; donnée absente → rien', () => {
    expect(loadInsights(buildContext(raw({ load: { ctl: 30, atl: 20, tsb: 10, zone: 'fresh', ramp: 2 } })))[0].level).toBe('good');
    expect(loadInsights(buildContext(raw({ load: null })))[0].id).toBe('load');
    expect(loadInsights(buildContext(raw()))).toEqual([]);
  });
});

describe('coach : micronutriments', () => {
  it('fibres basses, sel élevé, fer bas', () => {
    const ctx = buildContext(raw({ micros: { days: 5, targets: mt, avg: { fiberG: { value: 14, coverage: 0.9 }, saltG: { value: 7.2, coverage: 0.8 }, ironMg: { value: 6, coverage: 0.8 }, calciumMg: { value: 900, coverage: 0.8 } } } }));
    const ids = microInsights(ctx).map((i) => i.id);
    expect(ids).toEqual(['fiber', 'salt', 'iron']);
    expect(microInsights(ctx)[0].text).toMatch(/loubia|3dess|bissara/);
  });
  it('données trop incomplètes : le coach ne conclut pas', () => {
    const ctx = buildContext(raw({ micros: { days: 3, targets: mt, avg: { fiberG: { value: 3, coverage: 0.2 }, saltG: { value: 1, coverage: 0.2 } } } }));
    expect(microInsights(ctx)).toEqual([expect.objectContaining({ id: 'micros', level: 'info' })]);
  });
  it('dans les repères → positif', () => {
    const ctx = buildContext(raw({ micros: { days: 5, targets: mt, avg: { fiberG: { value: 31, coverage: 1 }, saltG: { value: 4, coverage: 1 } } } }));
    expect(microInsights(ctx)[0]).toMatchObject({ id: 'micros', level: 'good' });
  });
});

describe('coach : Ramadan et chaussures', () => {
  it('Ramadan : hydratation entre ftour et s’hour, entraînement placé', () => {
    const ctx = buildContext(raw({ ramadan: { suhoor: '04:50', iftar: '19:05', waterMl: 2750 } }));
    const txt = ramadanInsights(ctx).map((i) => i.text).join(' ');
    expect(txt).toContain('2750 ml');
    expect(txt).toContain('19:05');
    expect(txt).toMatch(/10 %/);
    expect(ramadanInsights(buildContext(raw()))).toEqual([]);
  });
  it('chaussures usées : alerte, en bon état : rien', () => {
    const ctx = buildContext(raw({ shoes: [{ name: 'Pegasus', km: 720, alertKm: 700, status: 'replace' }, { name: 'Novablast', km: 120, alertKm: 700, status: 'ok' }, { name: 'Ride', km: 640, alertKm: 700, status: 'soon' }] }));
    expect(shoeInsights(ctx).map((i) => [i.level, i.text.split(' : ')[0]])).toEqual([
      ['warn', 'Chaussures « Pegasus »'],
      ['info', 'Chaussures « Ride »'],
    ]);
  });
});

describe('coach : intégration', () => {
  const extra: CoachExtra = {
    load: { ctl: 40, atl: 75, tsb: -35, zone: 'overload', ramp: 3 },
    vdot: { value: 45, thresholdPace: 285, easyPace: 340 },
    micros: { days: 5, targets: mt, avg: { fiberG: { value: 14, coverage: 0.9 }, saltG: { value: 4, coverage: 0.9 } } },
    ramadan: { suhoor: '04:50', iftar: '19:05', waterMl: 2750 },
    shoes: [{ name: 'Pegasus', km: 720, alertKm: 700, status: 'replace' }],
  };
  it('bilan de la semaine inclut les nouvelles analyses', () => {
    const ids = weeklyInsights(buildContext(raw(extra))).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['load', 'shoe-Pegasus', 'fiber', 'ramadan']));
  });
  it('intentions et réponses', () => {
    expect(detectIntent('Combien de fibres je mange ?')).toBe('micros');
    expect(detectIntent('Quand boire pendant le ramadan ?')).toBe('ramadan');
    expect(detectIntent('Mes chaussures sont usées ?')).toBe('shoes');
    expect(detectIntent('Quelle est ma charge ?')).toBe('load');
    const ctx = buildContext(raw(extra));
    expect(rulesReply('Ma forme et mon VDOT ?', ctx)).toContain('VDOT estimé 45');
    expect(rulesReply('Je mange assez de fibres ?', ctx)).toContain('Fibres : 14 g');
    expect(rulesReply('Je cours demain ?', ctx)).toContain('Pegasus');
  });
  it('résumé envoyé au LLM : nouvelles données compactes', () => {
    const s = JSON.parse(compactSummary(buildContext(raw(extra))));
    expect(s.chargeCourse).toEqual({ forme: 40, fatigue: 75, fraicheur: -35, rampe7j: 3 });
    expect(s.vdotEstime).toBe(45);
    expect(s.micros7j.fiberG).toEqual({ moy: 14, renseigne: 0.9 });
    expect(s.ramadan.iftar).toBe('19:05');
    expect(s.chaussuresUsees).toEqual(['Pegasus 720/700 km']);
    expect(compactSummary(buildContext(raw(extra))).length).toBeLessThan(3500);
  });
});
