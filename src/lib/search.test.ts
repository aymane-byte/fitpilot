import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchFood, searchFoods, stem, tokens } from './search';
import { buildIndex, ciqualRows, searchCiqual, type CiqualFile } from './ciqual';
import { SEED_FOODS } from '@/db/seed/foods';

const ciqual = buildIndex(ciqualRows(JSON.parse(readFileSync('public/data/ciqual-2020.json', 'utf-8')) as CiqualFile));
const seed = (q: string) => searchFoods(SEED_FOODS, q, (f) => f.name).map((h) => h.item.name);

describe('recherche par mots', () => {
  it('normalisation : accents, pluriels, petits mots, « sans » = « non »', () => {
    expect(tokens('Thé à la menthe sans sucre')).toEqual(['the', 'menth', 'non', 'sucr']);
    expect(tokens('Thé infusé, non sucré')).toEqual(['the', 'infus', 'non', 'sucr']);
    expect(stem('lentilles')).toBe('lentill');
    expect(stem('sucree')).toBe('sucr');
    expect(tokens('Sucrée')).toEqual(['sucr']);
  });
  it('« thé sans sucre » : aliments fournis et CIQUAL', () => {
    expect(seed('thé sans sucre')[0]).toBe('Thé à la menthe sans sucre');
    expect(seed('the sans sucre')).not.toContain('Thé à la menthe sucré'); // « sucré » ≠ « sans sucre »
    expect(seed('thé sucré')).toContain('Thé à la menthe sucré');
    expect(seed('thé sucré')).not.toContain('Thé à la menthe sans sucre');
    const c = searchCiqual(ciqual, 'thé sans sucre').map((f) => f.name);
    expect(c[0]).toBe('Thé infusé, non sucré');
    expect(c).toContain('Thé vert, infusé, non sucré');
  });
  it('ordre libre, début de mot, majuscules', () => {
    expect(seed('poulet blanc')).toContain('Blanc de poulet cuit');
    expect(seed('LENT')).toContain('Lentilles cuites (3dess)');
    expect(seed('cafe noir')).toEqual(['Café noir sans sucre']);
    expect(searchCiqual(ciqual, 'yaourt grec')[0].name).toMatch(/^Yaourt à la grecque/);
  });
  it('résultats approchés quand un mot ne correspond pas (3 mots ou plus)', () => {
    const m = matchFood('thé menthe miel', 'Thé à la menthe sans sucre');
    expect(m).toMatchObject({ matched: 2, total: 3 });
    expect(matchFood('poulet curry', 'Blanc de poulet cuit')).toBeNull(); // 2 mots : tous requis
    // Les complets passent avant les approchés.
    const r = searchFoods([{ n: 'Thé menthe miel' }, { n: 'Thé menthe' }], 'thé menthe miel', (x) => x.n);
    expect(r.map((x) => [x.item.n, x.approx])).toEqual([['Thé menthe miel', false], ['Thé menthe', true]]);
  });
  it('requête vide ou faite de petits mots → rien', () => {
    expect(matchFood('de la', 'Thé')).toBeNull();
    expect(searchCiqual(ciqual, 'a')).toEqual([]);
  });
});
