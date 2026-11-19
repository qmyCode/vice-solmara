// save.js — one job: remember the run between visits. Cash, respect, story progress and
// owned weapons persist in localStorage; a fresh profile starts broke with bare fists and a
// borrowed pistol from the fixer's first job.

const KEY = 'viceSolmaraSaveV1';

export const FRESH_SAVE = {
  cash: 120,
  respect: 0,
  missionIdx: 0,
  weapons: ['fists', 'pistol'],
  storyDone: false,
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...FRESH_SAVE };
    const parsed = JSON.parse(raw);
    return { ...FRESH_SAVE, ...parsed, weapons: Array.isArray(parsed.weapons) ? parsed.weapons : [...FRESH_SAVE.weapons] };
  } catch {
    return { ...FRESH_SAVE };
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode: the run simply does not persist */
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to wipe */ }
}
