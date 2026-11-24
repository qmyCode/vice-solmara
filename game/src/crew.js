// crew.js — one job: Rico's crew, the city's memory, and his name on the street.
// Three crew members with real, keybound abilities on real cooldowns (the driver's plate
// swap burns police heat, the mechanic restores the current car's condition, the lookout
// marks roadblocks on the minimap). District standing moves with what you do in each
// district — missions raise it, witnessed crimes lower it — and RESPECT climbs a ladder
// of street ranks. Everything the HUD shows about these systems is read from this state.
import { clamp } from './rng.js';

export const CREW_DEFS = [
  { id: 'driver', who: 'santi', name: 'Santi Ríos', role: 'DRIVER', ability: 'SWAP PLATES', key: 'KeyZ', keyLabel: 'Z', cdMax: 45 },
  { id: 'mechanic', who: 'paco', name: 'Paco Delgado', role: 'MECHANIC', ability: 'QUICK FIX', key: 'KeyX', keyLabel: 'X', cdMax: 30 },
  { id: 'lookout', who: 'luna', name: 'Luna Marín', role: 'LOOKOUT', ability: 'EYES OUT', key: 'KeyC', keyLabel: 'C', cdMax: 40 },
];

export const RANKS = [
  { at: 0, title: 'DON NADIE' },
  { at: 25, title: 'MENSAJERO' },
  { at: 60, title: 'CHOFER' },
  { at: 110, title: 'FIJADOR' },
  { at: 175, title: 'SHOT CALLER' },
  { at: 260, title: 'REY DE LA BAHÍA' },
  { at: 380, title: 'LEYENDA' },
];

export function rankFor(respect) {
  let i = 0;
  while (i < RANKS.length - 1 && respect >= RANKS[i + 1].at) i++;
  const cur = RANKS[i], next = RANKS[i + 1] || null;
  return {
    index: i + 1, title: cur.title, next,
    frac: next ? clamp((respect - cur.at) / (next.at - cur.at), 0, 1) : 1,
  };
}

export function createCrew(G) {
  const city = G.city;
  const members = CREW_DEFS.map((d) => ({ ...d, cd: 0 }));
  // Standing starts neutral-ish everywhere, warmer where Marina's people are known.
  const standing = {};
  for (const d of city.districts) standing[d.name] = 50;
  standing['Puerto Viejo'] = 58;
  standing['Bulevar del Sol'] = 54;
  standing['Muelle Sur'] = 44;
  let crimeThrottle = 0;

  const crew = {
    members,
    standing,
    eyesOutT: 0,
    rankFor,
    labelFor(v) { return v < 35 ? 'HOSTILE' : v >= 70 ? 'FRIENDLY' : 'NEUTRAL'; },
    currentDistrict() {
      const pp = G.playerPos();
      return city.districtAt(pp.x, pp.z);
    },
    currentStanding() {
      const d = crew.currentDistrict();
      return d ? { district: d, value: Math.round(standing[d.name] ?? 50), label: crew.labelFor(standing[d.name] ?? 50) } : null;
    },
    onCrime(x, z) {
      if (crimeThrottle > 0) return;
      crimeThrottle = 2.5;
      const d = city.districtAt(x, z);
      if (d) standing[d.name] = clamp((standing[d.name] ?? 50) - 3, 0, 100);
    },
    onMissionDone() {
      const d = crew.currentDistrict();
      if (d) standing[d.name] = clamp((standing[d.name] ?? 50) + 12, 0, 100);
    },
    useAbility(i) {
      const m = members[i];
      if (!m || m.cd > 0) return false;
      if (m.id === 'driver') {
        if (!G.police || G.police.stars <= 0) { if (G.hud) G.hud.toast('Santi: no heat to burn — plates are clean.'); return false; }
        G.police.dropStar();
        if (G.hud) { G.hud.toast('Santi swapped the plates — heat drops'); G.hud.dispatch('Dispatch: plate check negative — suspect vehicle mismatch.'); }
      } else if (m.id === 'mechanic') {
        const car = G.player && G.player.mode === 'car' ? G.player.car : null;
        if (!car || car.exploded) { if (G.hud) G.hud.toast('Paco: get in a car first, hermano.'); return false; }
        if (car.health >= 100) { if (G.hud) G.hud.toast('Paco: she is already perfect.'); return false; }
        car.health = Math.min(100, car.health + 55);
        if (car.health >= 30) car.wrecked = false;
        if (G.hud) G.hud.toast(`Paco patched her up — condition ${Math.round(car.health)}%`);
      } else if (m.id === 'lookout') {
        crew.eyesOutT = 20;
        if (G.hud) G.hud.toast('Luna is watching — roadblocks marked on the map');
      }
      m.cd = m.cdMax;
      return true;
    },
    update(dt) {
      crimeThrottle = Math.max(0, crimeThrottle - dt);
      if (crew.eyesOutT > 0) crew.eyesOutT = Math.max(0, crew.eyesOutT - dt);
      for (const m of members) if (m.cd > 0) m.cd = Math.max(0, m.cd - dt);
      if (G.state === 'play' && G.input) {
        for (let i = 0; i < members.length; i++) {
          if (G.input.pressed.has(members[i].key)) { G.input.pressed.delete(members[i].key); crew.useAbility(i); }
        }
      }
    },
  };
  return crew;
}
