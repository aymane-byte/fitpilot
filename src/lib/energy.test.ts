import { describe, expect, it } from 'vitest';
import { bmi, bmr, bodyFatNavy, computeTargets, suggestActivityLevel, tdee, waterTargetMl } from './energy';

describe('bmr (Mifflin-St Jeor)', () => {
  it('homme 78 kg, 170 cm, 20 ans', () => {
    // 10×78 + 6,25×170 − 5×20 + 5 = 1747,5
    expect(bmr(78, 170, 20, 'male')).toBeCloseTo(1747.5);
  });
  it('femme 60 kg, 165 cm, 30 ans', () => {
    // 600 + 1031,25 − 150 − 161 = 1320,25
    expect(bmr(60, 165, 30, 'female')).toBeCloseTo(1320.25);
  });
});

describe('tdee', () => {
  it('applique le facteur d’activité', () => {
    expect(tdee(1747.5, 'moderate')).toBeCloseTo(2708.625);
    expect(tdee(1000, 'sedentary')).toBe(1200);
  });
  it('suggère un niveau selon les séances', () => {
    expect(suggestActivityLevel(0)).toBe('sedentary');
    expect(suggestActivityLevel(3)).toBe('light');
    expect(suggestActivityLevel(5)).toBe('moderate');
    expect(suggestActivityLevel(7)).toBe('active');
  });
});

describe('computeTargets', () => {
  const base = { weightKg: 78, heightCm: 170, age: 20, gender: 'male' as const, activity: 'moderate' as const };

  it('recomposition : déficit modéré de 10 %, protéines 2 g/kg', () => {
    const t = computeTargets({ ...base, goal: 'recomp' });
    expect(t.bmr).toBe(1748);
    expect(t.tdee).toBe(2709);
    expect(t.calories).toBe(2440); // 2708,6 × 0,9 = 2437,8 → 2440
    expect(t.proteinG).toBe(156);
    expect(t.fatG).toBe(68); // 25 % de 2440 / 9 = 67,8
    // glucides = (2440 − 156×4 − 68×9) / 4 = 301
    expect(t.carbsG).toBe(301);
    expect(t.safetyNotes).toEqual([]);
    expect(t.expectedWeeklyChangeKg).toBeLessThan(0);
  });

  it('prise de masse : surplus', () => {
    const t = computeTargets({ ...base, goal: 'muscle_gain' });
    expect(t.calories).toBeGreaterThan(t.tdee);
  });

  it('ne descend jamais sous le BMR', () => {
    const t = computeTargets({ ...base, activity: 'sedentary', goal: 'fat_loss' });
    expect(t.calories).toBeGreaterThanOrEqual(t.bmr);
  });

  it('limite la perte à 0,75 % du poids par semaine', () => {
    const t = computeTargets({ weightKg: 60, heightCm: 180, age: 25, gender: 'male', activity: 'very_active', goal: 'fat_loss' });
    expect(t.safetyNotes).toContain('max_loss');
    expect(-t.expectedWeeklyChangeKg).toBeLessThanOrEqual(60 * 0.0075 + 0.01);
  });

  it('les macros redonnent ~les calories', () => {
    const t = computeTargets({ ...base, goal: 'fat_loss' });
    const kcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(kcal - t.calories)).toBeLessThan(15);
  });

  it('IMC > 30 : protéines sur poids de référence', () => {
    const t = computeTargets({ ...base, weightKg: 120, goal: 'recomp' });
    expect(bmi(120, 170)).toBeGreaterThan(30);
    expect(t.proteinG).toBe(Math.round(25 * 1.7 * 1.7 * 2));
  });
});

describe('eau et masse grasse', () => {
  it('35 ml/kg arrondi à 50 ml', () => {
    expect(waterTargetMl(78)).toBe(2750);
  });
  it('formule US Navy homme', () => {
    const bf = bodyFatNavy({ gender: 'male', heightCm: 170, waistCm: 85, neckCm: 37 });
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(12);
    expect(bf!).toBeLessThan(22);
  });
  it('mesures incohérentes → null', () => {
    expect(bodyFatNavy({ gender: 'male', heightCm: 170, waistCm: 30, neckCm: 37 })).toBeNull();
    expect(bodyFatNavy({ gender: 'female', heightCm: 165, waistCm: 70, neckCm: 32 })).toBeNull();
  });
});
