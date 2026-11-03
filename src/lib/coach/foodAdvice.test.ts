import { describe, expect, it } from 'vitest';
import { SEED_FOODS } from '@/db/seed/foods';
import { computeTargets } from '../energy';
import { findFoodInMessage, FOOD_QUESTION, foodAdvice, portionInUnits, suggestedPortion } from './foodAdvice';

const targets = computeTargets({ weightKg: 78, heightCm: 170, age: 20, gender: 'male', activity: 'moderate', goal: 'recomp' });
const find = (q: string) => findFoodInMessage(q, SEED_FOODS)?.key;
const food = (key: string) => SEED_FOODS.find((f) => f.key === key)!;

describe('aliment cité dans une question', () => {
  it('français et darija, sans accents, au pluriel', () => {
    expect(find('Est-ce que je peux manger des dattes le soir ?')).toBe('dates');
    expect(find('wach nakol lentilles bzaf ?')).toBe('lentils');
    expect(find('chhal mn khobz khasni nakol ?')).toBe('khobz');
    expect(find('je mange de l’amlou au petit-déj, combien ?')).toBe('amlou');
    expect(find('les oeufs c’est bon ?')).toMatch(/^egg/);
    expect(find('Mes protéines sont-elles suffisantes ?')).toBeUndefined();
  });
  it('détection d’une question d’alimentation', () => {
    expect(FOOD_QUESTION.test('wach nakol dattes')).toBe(true);
    expect(FOOD_QUESTION.test('combien de khobz ?')).toBe(true);
    expect(FOOD_QUESTION.test('kifach nakolhom ?')).toBe(true);
    expect(FOOD_QUESTION.test('Analyse ma semaine')).toBe(false);
  });
});

describe('conseil et quantité', () => {
  it('aliment riche en protéines : portion pour ~1/4 des protéines du jour', () => {
    const p = suggestedPortion(food('chicken_breast'), targets);
    expect(p.basis).toBe('protein');
    expect(p.grams).toBeGreaterThanOrEqual(100);
    expect(p.grams).toBeLessThanOrEqual(160);
    expect(foodAdvice(food('chicken_breast'), targets, 'recomp')).toMatch(/Très bonne source de protéines/);
  });
  it('très gras (amlou) : petite portion ~120 kcal', () => {
    const p = suggestedPortion(food('amlou'), targets);
    expect(p.basis).toBe('fat');
    expect(p.grams).toBeLessThanOrEqual(25);
    expect(foodAdvice(food('amlou'), targets, 'fat_loss')).toMatch(/Très calorique : garde des petites portions/);
  });
  it('féculent (khobz) exprimé en unité maison', () => {
    const p = suggestedPortion(food('khobz'), targets);
    expect(p.basis).toBe('carbs');
    expect(portionInUnits(food('khobz'), p.grams)).toMatch(/× (tranche|quart) de khobz/);
    expect(foodAdvice(food('khobz'), targets, 'recomp')).toMatch(/Quantité conseillée : environ \d+ g \(≈ /);
  });
  it('dattes : sucres, conseil autour de l’entraînement ; légumes à volonté', () => {
    const dates = { ...food('dates'), sugarsG: 64, fiberG: 2.5 };
    expect(foodAdvice(dates, targets, 'recomp')).toMatch(/Riche en sucres/);
    expect(foodAdvice(food('tomato'), targets, 'recomp')).toMatch(/à volonté/);
    expect(foodAdvice(food('dates'), targets, 'recomp', { ramadan: true })).toMatch(/ftour/);
  });
});
