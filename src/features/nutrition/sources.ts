// Sources d'aliments externes : table CIQUAL (fichier statique), Open Food Facts (code-barres),
// analyse photo par Gemini (option). Tout ce qui est utilisé est copié dans la base locale.
import { db, getSettings } from '@/db/db';
import type { Food } from '@/db/types';
import { buildIndex, ciqualCategory, ciqualKey, ciqualRows, searchCiqual, type CiqualFile, type CiqualFood, type CiqualIndex } from '@/lib/ciqual';
import { isValidBarcode, offProductUrl, parseOffProduct } from '@/lib/openFoodFacts';
import { parseVisionResponse, visionRequestBody, type VisionItem } from '@/lib/foodVision';
import { DEFAULT_MODELS } from '@/lib/coach/providers';
import { MICRO_KEYS } from '@/lib/micros';

export const CIQUAL_SOURCE = 'CIQUAL 2020 (ANSES)';
export const OFF_SOURCE = 'Open Food Facts';

let index: Promise<CiqualIndex> | null = null;

/** Charge la table CIQUAL une seule fois (fichier mis en cache par le service worker). */
export function loadCiqual(): Promise<CiqualIndex> {
  if (!index) {
    index = fetch(`${import.meta.env.BASE_URL}data/ciqual-2020.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CiqualFile>;
      })
      .then((file) => buildIndex(ciqualRows(file)))
      .catch((e) => {
        index = null; // nouvel essai au prochain appel
        throw e;
      });
  }
  return index;
}

export async function searchCiqualFoods(query: string, limit = 25): Promise<CiqualFood[]> {
  return searchCiqual(await loadCiqual(), query, limit);
}

/** Aliment CIQUAL → aliment local (réutilise la copie existante, éventuellement modifiée). */
export async function materializeCiqual(c: CiqualFood): Promise<Food> {
  const existing = await db.foods.where('ciqualCode').equals(c.code).first();
  if (existing) return existing;
  const food: Food = {
    key: ciqualKey(c.code),
    name: c.name,
    category: ciqualCategory(c),
    kcal: c.kcal,
    proteinG: c.proteinG,
    carbsG: c.carbsG,
    fatG: c.fatG,
    estimated: false,
    source: CIQUAL_SOURCE,
    custom: false,
    units: [],
    ciqualCode: c.code,
  };
  for (const k of MICRO_KEYS) if (c[k] !== undefined) food[k] = c[k];
  const id = (await db.foods.add(food)) as number;
  return { ...food, id };
}

export type BarcodeResult = { status: 'found'; food: Food; cached: boolean } | { status: 'notFound' } | { status: 'offline' } | { status: 'invalid' };

/** Code-barres : base locale d'abord (hors-ligne), puis Open Food Facts ; le produit est gardé. */
export async function lookupBarcode(code: string, fetchImpl: typeof fetch = fetch): Promise<BarcodeResult> {
  const clean = code.replace(/\D/g, '');
  if (!isValidBarcode(clean)) return { status: 'invalid' };
  const local = await db.foods.where('barcode').equals(clean).first();
  if (local) return { status: 'found', food: local, cached: true };
  let json: unknown;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetchImpl(offProductUrl(clean), { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status === 404) return { status: 'notFound' };
    if (!res.ok) return { status: 'offline' };
    json = await res.json();
  } catch {
    return { status: 'offline' };
  }
  const p = parseOffProduct(json, clean);
  if (!p) return { status: 'notFound' };
  const { barcode, brand, servingG, allergens, nutriscore, name, kcal, proteinG, carbsG, fatG, ...micros } = p;
  const food: Food = {
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    category: 'packaged',
    kcal,
    proteinG,
    carbsG,
    fatG,
    estimated: false,
    source: OFF_SOURCE,
    custom: false,
    units: servingG ? [{ label: 'portion (emballage)', grams: servingG }] : [],
    allergens,
    barcode,
    brand,
    nutriscore,
    ...micros,
  };
  const id = (await db.foods.add(food)) as number;
  return { status: 'found', food: { ...food, id }, cached: false };
}

export class VisionError extends Error {
  constructor(public code: 'noKey' | 'network' | 'quota' | 'auth' | 'empty') {
    super(code);
  }
}

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Photo de plat → aliments estimés par Gemini. L'image part directement chez Google (clé perso). */
export async function analyzeMealPhoto(image: Blob, fetchImpl: typeof fetch = fetch): Promise<VisionItem[]> {
  const s = await getSettings();
  if (!s.geminiApiKey && !s.proxyUrl) throw new VisionError('noKey');
  const model = s.geminiModel || DEFAULT_MODELS.gemini;
  const url = s.proxyUrl ? `${s.proxyUrl.replace(/\/$/, '')}/gemini/${encodeURIComponent(model)}` : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = visionRequestBody(await blobToBase64(image), image.type || 'image/jpeg');
  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40_000);
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(s.proxyUrl ? {} : { 'x-goog-api-key': s.geminiApiKey! }) }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch {
    throw new VisionError('network');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new VisionError('quota');
  if (res.status === 401 || res.status === 403) throw new VisionError('auth');
  if (!res.ok) throw new VisionError('network');
  const items = parseVisionResponse(await res.json());
  if (!items.length) throw new VisionError('empty');
  return items;
}

export async function hasVisionKey(): Promise<boolean> {
  const s = await getSettings();
  return !!(s.geminiApiKey || s.proxyUrl);
}
