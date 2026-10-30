export const RUN_TYPES = ['easy', 'tempo', 'intervals', 'long', 'recovery'] as const;
export type RunTypeKey = (typeof RUN_TYPES)[number];
