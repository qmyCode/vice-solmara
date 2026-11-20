// save.js — one job: the localStorage save. Cash, respect, story progress and unlocked weapons
// survive a reload; a corrupt or missing save quietly falls back to a fresh start.
const KEY = 'vice-solmara-save-v1';

export const FRESH_SAVE = { cash: 250, respect: 0, mission: 0, weapons: ['fists', 'pistol'], finished: false };

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...FRESH_SAVE };
    const data = JSON.parse(raw);
    return {
      cash: Number.isFinite(data.cash) ? data.cash : FRESH_SAVE.cash,
      respect: Number.isFinite(data.respect) ? data.respect : 0,
      mission: Number.isInteger(data.mission) ? data.mission : 0,
      weapons: Array.isArray(data.weapons) && data.weapons.length ? data.weapons.slice() : FRESH_SAVE.weapons.slice(),
      finished: !!data.finished,
    };
  } catch {
    return { ...FRESH_SAVE };
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Private windows and full storage: the run simply lasts this visit only.
  }
}
