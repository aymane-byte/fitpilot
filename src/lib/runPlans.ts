// Programmes de course (données statiques). Chaque semaine propose 2 ou 3 séances.
import type { RunTypeKey } from './runTypes';

export interface RunSession {
  type: RunTypeKey;
  title: string;
  detail: string;
  minutes: number;
}

export interface RunPlan {
  key: string;
  name: string;
  description: string;
  weeks: RunSession[][];
}

const easy = (min: number, extra = ''): RunSession => ({ type: 'easy', title: `Footing ${min} min`, detail: `Allure facile : tu dois pouvoir parler. ${extra}`.trim(), minutes: min });
const long = (min: number): RunSession => ({ type: 'long', title: `Sortie longue ${min} min`, detail: 'Allure très facile, régulière. Hydrate-toi.', minutes: min });
const tempo = (warm: number, block: number, reps = 1): RunSession => ({
  type: 'tempo',
  title: reps > 1 ? `Tempo ${reps} × ${block} min` : `Tempo ${block} min`,
  detail: `${warm} min échauffement, ${reps > 1 ? `${reps} × ${block} min à allure soutenue (récup 2 min trot)` : `${block} min à allure soutenue mais contrôlée`}, 10 min retour au calme.`,
  minutes: warm + block * reps + (reps - 1) * 2 + 10,
});
const intervals = (reps: number, work: string, rest: string, min: number): RunSession => ({
  type: 'intervals',
  title: `Fractionné ${reps} × ${work}`,
  detail: `15 min échauffement, ${reps} × ${work} rapide, récupération ${rest} en trottinant, 10 min retour au calme.`,
  minutes: min,
});
const walkRun = (reps: number, run: number, walk: number): RunSession => ({
  type: 'easy',
  title: `${reps} × (${run} min course / ${walk} min marche)`,
  detail: '5 min de marche rapide avant et après. Course très lente.',
  minutes: reps * (run + walk) + 10,
});

export const RUN_PLANS: RunPlan[] = [
  {
    key: 'beginner5k',
    name: 'Débutant 5 km',
    description: '8 semaines, de la marche-course à 30 min de course continue (≈ 5 km).',
    weeks: [
      [walkRun(8, 1, 1.5), walkRun(8, 1, 1.5), walkRun(8, 1, 1.5)],
      [walkRun(6, 2, 1.5), walkRun(6, 2, 1.5), walkRun(6, 2, 1.5)],
      [walkRun(5, 3, 1.5), walkRun(5, 3, 1.5), walkRun(5, 3, 1.5)],
      [walkRun(4, 5, 2), walkRun(4, 5, 2), walkRun(4, 5, 2)],
      [walkRun(3, 8, 2), walkRun(3, 8, 2), walkRun(2, 10, 2)],
      [walkRun(2, 12, 2), easy(20), walkRun(2, 12, 2)],
      [easy(22), easy(25), easy(25)],
      [easy(25), easy(28), easy(30, 'Objectif : 5 km !')],
    ],
  },
  {
    key: 'intermediate5k',
    name: 'Intermédiaire 5 km',
    description: '6 semaines pour courir plus vite sur 5 km. Pour qui court déjà 30 min.',
    weeks: [
      [easy(30), intervals(6, '400 m', '90 s', 45), long(40)],
      [easy(30), tempo(15, 12), long(45)],
      [easy(35), intervals(5, '800 m', '2 min', 50), long(45)],
      [easy(30), tempo(15, 8, 2), long(50)],
      [easy(35), intervals(6, '800 m', '2 min', 55), long(50)],
      [easy(25), intervals(4, '400 m', '90 s', 35), { type: 'tempo', title: 'Test 5 km', detail: '15 min échauffement puis 5 km à fond, régulier.', minutes: 45 }],
    ],
  },
  {
    key: 'tenK',
    name: 'Préparation 10 km',
    description: '8 semaines, 3 séances : facile, qualité, sortie longue.',
    weeks: [
      [easy(30), tempo(15, 10), long(45)],
      [easy(35), intervals(6, '600 m', '2 min', 50), long(50)],
      [easy(35), tempo(15, 15), long(55)],
      [easy(30), intervals(5, '1 km', '2 min', 55), long(50)],
      [easy(40), tempo(15, 10, 2), long(65)],
      [easy(40), intervals(6, '1 km', '2 min', 60), long(70)],
      [easy(35), tempo(15, 20), long(75)],
      [easy(30), intervals(4, '400 m', '90 s', 35), { type: 'long', title: 'Test 10 km', detail: '15 min échauffement puis 10 km à allure objectif.', minutes: 70 }],
    ],
  },
  {
    key: 'endurance',
    name: 'Endurance',
    description: '8 semaines pour allonger la sortie longue progressivement (+10 % max par semaine).',
    weeks: [
      [easy(30), long(45)],
      [easy(30), long(50)],
      [easy(35), long(55)],
      [easy(30), long(45)], // semaine allégée
      [easy(35), long(60)],
      [easy(40), long(70)],
      [easy(40), long(75)],
      [easy(30), long(60)],
    ],
  },
  {
    key: 'fatloss',
    name: 'Course perte de gras',
    description: '6 semaines, 2 séances : footing facile + fractionné court. Compatible avec 3 séances de muscu.',
    weeks: [
      [easy(30), intervals(8, '30 s', '60 s', 35)],
      [easy(35), intervals(10, '30 s', '60 s', 37)],
      [easy(35), intervals(8, '45 s', '75 s', 40)],
      [easy(30), intervals(6, '30 s', '60 s', 30)], // semaine allégée
      [easy(40), intervals(8, '1 min', '1 min', 43)],
      [easy(40), intervals(10, '1 min', '1 min', 47)],
    ],
  },
];

/** Séances de la semaine en cours d'un plan démarré à `startISO` (null si terminé ou pas commencé). */
export function planWeek(plan: RunPlan, startISO: string, todayISO: string): { index: number; sessions: RunSession[] } | null {
  const [y, m, d] = startISO.split('-').map(Number);
  const [ty, tm, td] = todayISO.split('-').map(Number);
  const days = Math.round((new Date(ty, tm - 1, td).getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (days < 0) return null;
  const index = Math.floor(days / 7);
  if (index >= plan.weeks.length) return null;
  return { index, sessions: plan.weeks[index] };
}
