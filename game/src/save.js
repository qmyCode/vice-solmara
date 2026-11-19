// save.js — one job: persist Rico's progress in localStorage.
// Cash, respect, story progress, unlocked weapons and lifetime stats survive
// a reload; a fresh profile starts with $120 and a name nobody knows.

const KEY = 'vice-solmara-save-v1';

export const DEFAULT_SAVE = {
  cash: 120, respect: 8, missionIndex: 0, day: 1,
  weapons: [true, true, false], // fists, pistol, SMG (SMG is earned in CH 4)
  stats: { carsStolen: 0, explosions: 0, busts: 0, missionsDone: 0, distanceKm: 0 },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SAVE), ...s, stats: { ...DEFAULT_SAVE.stats, ...(s.stats || {}) } };
  } catch { return structuredClone(DEFAULT_SAVE); }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export function respectRank(respect) {
  if (respect >= 85) return 'DON DE SOLMARA';
  if (respect >= 65) return 'CAPO COSTERO';
  if (respect >= 45) return 'HOMBRE DE MARINA';
  if (respect >= 28) return 'RUEDAS CONOCIDAS';
  if (respect >= 15) return 'CHICO DE LOS RECADOS';
  return 'DON NADIE';
}
