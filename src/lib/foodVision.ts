// Photo d'un plat → estimation des aliments et quantités par Gemini (option, clé personnelle).
// Le résultat est TOUJOURS une estimation : l'utilisateur valide et corrige chaque ligne
// avant l'enregistrement. Rien n'est ajouté automatiquement.
import { z } from 'zod';

export interface VisionItem {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const VISION_PROMPT = [
  'Tu analyses la photo d’un repas (souvent de la cuisine marocaine familiale : tajine, couscous, harira, khobz…).',
  'Liste chaque aliment visible avec une estimation de la quantité en grammes et des valeurs nutritionnelles pour CETTE quantité.',
  'Si tu n’es pas sûr, donne ta meilleure estimation prudente. N’invente pas d’aliments invisibles.',
  'Réponds uniquement en JSON : {"items":[{"name":"…","grams":0,"kcal":0,"proteinG":0,"carbsG":0,"fatG":0}]} avec des noms en français.',
].join('\n');

export function visionRequestBody(base64: string, mimeType: string) {
  return {
    contents: [{ role: 'user', parts: [{ text: VISION_PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  };
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  grams: z.coerce.number().min(1).max(2000),
  kcal: z.coerce.number().min(0).max(5000),
  proteinG: z.coerce.number().min(0).max(300),
  carbsG: z.coerce.number().min(0).max(500),
  fatG: z.coerce.number().min(0).max(300),
});

/** Extrait et valide les aliments de la réponse Gemini. Les lignes invalides sont ignorées. */
export function parseVisionResponse(json: unknown): VisionItem[] {
  const text = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const raw = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items;
  if (!Array.isArray(list)) return [];
  const out: VisionItem[] = [];
  for (const it of list.slice(0, 12)) {
    const r = itemSchema.safeParse(it);
    if (!r.success) continue;
    const v = r.data;
    // Valeurs incohérentes (densité > 9 kcal/g) : ligne ignorée plutôt que d'enregistrer n'importe quoi.
    if (v.kcal / v.grams > 9.5) continue;
    out.push({ name: v.name, grams: Math.round(v.grams), kcal: Math.round(v.kcal), proteinG: Math.round(v.proteinG * 10) / 10, carbsG: Math.round(v.carbsG * 10) / 10, fatG: Math.round(v.fatG * 10) / 10 });
  }
  return out;
}

/** Recalcule les valeurs d'une ligne quand l'utilisateur corrige la quantité (proportionnel). */
export function rescaleItem(item: VisionItem, grams: number): VisionItem {
  if (item.grams <= 0 || grams <= 0) return { ...item, grams: Math.max(0, grams) };
  const f = grams / item.grams;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { name: item.name, grams: Math.round(grams), kcal: Math.round(item.kcal * f), proteinG: r1(item.proteinG * f), carbsG: r1(item.carbsG * f), fatG: r1(item.fatG * f) };
}
