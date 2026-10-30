// Programmes prédéfinis. Chaque « plan » regroupe plusieurs séances (programs) jouées dans l'ordre.
// legsHeavy = séance de jambes lourde : le planning évite de mettre une course le lendemain.

export interface SeedProgramExercise {
  ex: string; // clé d'exercice
  sets: number;
  reps: number;
  rpe?: number;
}

export interface SeedProgram {
  key: string;
  name: string;
  legsHeavy: boolean;
  exercises: SeedProgramExercise[];
}

export interface SeedPlan {
  key: string;
  name: string;
  description: string;
  daysPerWeek: number;
  level: 'beginner' | 'intermediate' | 'any';
  programs: SeedProgram[];
}

const e = (ex: string, sets: number, reps: number, rpe = 8): SeedProgramExercise => ({ ex, sets, reps, rpe });

export const SEED_PLANS: SeedPlan[] = [
  {
    key: 'gym3_run2',
    name: 'Muscu 3 j + Course 2 j',
    description: 'Haut / Bas / Full body léger. Conçu pour laisser les jambes fraîches avant les courses.',
    daysPerWeek: 3,
    level: 'any',
    programs: [
      { key: 'g3r2_upper', name: 'Haut du corps', legsHeavy: false, exercises: [e('bench_press', 4, 6), e('barbell_row', 4, 8), e('db_shoulder_press', 3, 10), e('lat_pulldown', 3, 10), e('lateral_raise', 3, 15), e('triceps_pushdown', 3, 12), e('db_curl', 3, 12)] },
      { key: 'g3r2_lower', name: 'Bas du corps', legsHeavy: true, exercises: [e('back_squat', 4, 6), e('rdl', 3, 8), e('bulgarian_split_squat', 3, 10), e('leg_curl', 3, 12), e('calf_raise', 3, 15), e('plank', 3, 45)] },
      { key: 'g3r2_full', name: 'Full body léger', legsHeavy: false, exercises: [e('incline_db_press', 3, 10), e('seated_cable_row', 3, 10), e('goblet_squat', 2, 12, 7), e('hip_thrust', 3, 10, 7), e('face_pull', 3, 15), e('hanging_leg_raise', 3, 10)] },
    ],
  },
  {
    key: 'full_body',
    name: 'Full Body',
    description: 'Deux séances A/B en alternance, 2 à 3 fois par semaine. Idéal pour progresser avec peu de temps.',
    daysPerWeek: 3,
    level: 'any',
    programs: [
      { key: 'fb_a', name: 'Full Body A', legsHeavy: true, exercises: [e('back_squat', 3, 8), e('bench_press', 3, 8), e('barbell_row', 3, 8), e('db_shoulder_press', 2, 10), e('db_curl', 2, 12), e('plank', 3, 40)] },
      { key: 'fb_b', name: 'Full Body B', legsHeavy: true, exercises: [e('rdl', 3, 8), e('incline_db_press', 3, 10), e('lat_pulldown', 3, 10), e('lunge', 2, 10), e('lateral_raise', 3, 15), e('triceps_pushdown', 2, 12)] },
    ],
  },
  {
    key: 'upper_lower',
    name: 'Upper / Lower',
    description: 'Haut / Bas deux fois par semaine (4 séances). Bon équilibre volume et récupération.',
    daysPerWeek: 4,
    level: 'intermediate',
    programs: [
      { key: 'ul_upper_a', name: 'Haut A', legsHeavy: false, exercises: [e('bench_press', 4, 6), e('barbell_row', 4, 6), e('ohp', 3, 8), e('pull_up', 3, 8), e('skull_crusher', 3, 10), e('barbell_curl', 3, 10)] },
      { key: 'ul_lower_a', name: 'Bas A', legsHeavy: true, exercises: [e('back_squat', 4, 6), e('rdl', 3, 8), e('leg_press', 3, 10), e('leg_curl', 3, 12), e('calf_raise', 4, 12)] },
      { key: 'ul_upper_b', name: 'Haut B', legsHeavy: false, exercises: [e('incline_db_press', 3, 10), e('seated_cable_row', 3, 10), e('db_shoulder_press', 3, 10), e('lat_pulldown', 3, 12), e('lateral_raise', 3, 15), e('hammer_curl', 3, 12), e('triceps_pushdown', 3, 12)] },
      { key: 'ul_lower_b', name: 'Bas B', legsHeavy: true, exercises: [e('deadlift', 3, 5), e('front_squat', 3, 8), e('hip_thrust', 3, 10), e('leg_extension', 3, 12), e('hanging_leg_raise', 3, 12)] },
    ],
  },
  {
    key: 'ppl',
    name: 'Push / Pull / Legs',
    description: 'Poussée / Tirage / Jambes. À faire une fois (3 j) ou deux fois (6 j) par semaine.',
    daysPerWeek: 3,
    level: 'intermediate',
    programs: [
      { key: 'ppl_push', name: 'Push (poussée)', legsHeavy: false, exercises: [e('bench_press', 4, 6), e('ohp', 3, 8), e('incline_db_press', 3, 10), e('lateral_raise', 4, 15), e('triceps_pushdown', 3, 12), e('overhead_triceps', 3, 12)] },
      { key: 'ppl_pull', name: 'Pull (tirage)', legsHeavy: false, exercises: [e('pull_up', 4, 8), e('barbell_row', 3, 8), e('seated_cable_row', 3, 10), e('face_pull', 3, 15), e('barbell_curl', 3, 10), e('hammer_curl', 3, 12)] },
      { key: 'ppl_legs', name: 'Legs (jambes)', legsHeavy: true, exercises: [e('back_squat', 4, 6), e('rdl', 3, 8), e('leg_press', 3, 12), e('leg_curl', 3, 12), e('calf_raise', 4, 12), e('cable_crunch', 3, 15)] },
    ],
  },
  {
    key: 'beginner',
    name: 'Débutant',
    description: 'Machines et mouvements simples, 2 à 3 séances par semaine. Apprends la technique avant de charger.',
    daysPerWeek: 3,
    level: 'beginner',
    programs: [
      { key: 'beg_a', name: 'Débutant A', legsHeavy: false, exercises: [e('leg_press', 3, 12, 7), e('chest_press_machine', 3, 12, 7), e('lat_pulldown', 3, 12, 7), e('glute_bridge', 3, 15, 7), e('plank', 3, 30, 7)] },
      { key: 'beg_b', name: 'Débutant B', legsHeavy: false, exercises: [e('goblet_squat', 3, 12, 7), e('push_up', 3, 10, 7), e('machine_row', 3, 12, 7), e('db_shoulder_press', 2, 12, 7), e('dead_bug', 3, 10, 7)] },
    ],
  },
  {
    key: 'intermediate',
    name: 'Intermédiaire (force + volume)',
    description: '4 séances : deux orientées force (reps basses), deux orientées volume (reps hautes).',
    daysPerWeek: 4,
    level: 'intermediate',
    programs: [
      { key: 'int_upper_power', name: 'Haut force', legsHeavy: false, exercises: [e('bench_press', 4, 5, 8.5), e('barbell_row', 4, 5, 8.5), e('ohp', 3, 6), e('pull_up', 3, 6), e('close_grip_bench', 2, 8)] },
      { key: 'int_lower_power', name: 'Bas force', legsHeavy: true, exercises: [e('back_squat', 4, 5, 8.5), e('deadlift', 3, 4, 8.5), e('leg_press', 3, 10), e('calf_raise', 4, 10)] },
      { key: 'int_upper_volume', name: 'Haut volume', legsHeavy: false, exercises: [e('incline_db_press', 4, 10), e('seated_cable_row', 4, 12), e('cable_fly', 3, 15), e('lateral_raise', 4, 15), e('db_curl', 3, 12), e('triceps_pushdown', 3, 15)] },
      { key: 'int_lower_volume', name: 'Bas volume', legsHeavy: true, exercises: [e('front_squat', 3, 10), e('db_rdl', 3, 12), e('bulgarian_split_squat', 3, 12), e('leg_curl', 3, 15), e('ab_wheel', 3, 10)] },
    ],
  },
];

/** Plan conseillé selon le profil. */
export function recommendedPlanKey(gymDays: number, runDays: number, level: string): string {
  if (level === 'beginner') return 'beginner';
  if (gymDays === 3 && runDays > 0) return 'gym3_run2';
  if (gymDays <= 3) return 'full_body';
  if (gymDays === 4) return 'upper_lower';
  return 'ppl';
}
