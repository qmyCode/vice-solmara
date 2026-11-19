// city.js — one job: the map of Isla del Poniente as data.
// A closed Catmull-Rom coastline with a bay bitten out of the east shore,
// three ring avenues that follow the coast's curves, bowed radial streets,
// old-town diagonals, a hill switchback and a causeway to Isla Chica.
// No straight grid anywhere: every road is a sampled curve, and the same
// polylines feed the renderer, the traffic graph and GPS (Dijkstra).

import { worldRng as rng, clamp, lerp } from './rng.js';

const TAU = Math.PI * 2;

// ---------- coastline ----------
function coastRadius(theta) {
  let r = 400 * (1 + 0.10 * Math.sin(3 * theta + 1.2) + 0.07 * Math.sin(5 * theta + 0.4) + 0.04 * Math.sin(8 * theta));
  // The bay: pull the east shore (15°..40°) deep inland.
  const bayC = 0.48, bayW = 0.24; // radians, centred ~27.5°
  let d = Math.abs(((theta - bayC + Math.PI * 3) % TAU) - Math.PI);
  const bite = Math.exp(-(d * d) / (2 * bayW * bayW));
  r *= (1 - 0.44 * bite);
  return r;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

// Smooth closed spline through control points, resampled evenly.
function closedSpline(ctrl, samplesPerSeg) {
  const out = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s++) out.push(catmull(p0, p1, p2, p3, s / samplesPerSeg));
  }
  return out;
}

const coastCtrl = [];
for (let i = 0; i < 24; i++) {
  const th = (i / 24) * TAU, r = coastRadius(th);
  coastCtrl.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
}
export const COAST = closedSpline(coastCtrl, 8); // 192 pts

const isleCtrl = [];
const ISLE_C = { x: 520, z: 262 };
for (let i = 0; i < 10; i++) {
  const th = (i / 10) * TAU, r = 88 * (1 + 0.13 * Math.sin(3 * th + 2.0));
  isleCtrl.push({ x: ISLE_C.x + Math.cos(th) * r, z: ISLE_C.z + Math.sin(th) * r });
}
export const ISLE_COAST = closedSpline(isleCtrl, 6);

export function coastRAt(x, z) {
  if (Math.hypot(x - ISLE_C.x, z - ISLE_C.z) < 150) {
    return { r: 88, d: Math.hypot(x - ISLE_C.x, z - ISLE_C.z), isle: true };
  }
  const th = Math.atan2(z, x);
  return { r: coastRadius(th), d: Math.hypot(x, z), isle: false };
}

// ---------- terrain height ----------
const HILL = { x: -168, z: -196, amp: 30, sig: 118 };
export function heightAt(x, z) {
  const { r, d } = coastRAt(x, z);
  const shore = clamp((r - d) / 46, 0, 1); // 1 inland → 0 at waterline
  let h = Math.exp(-(((x - HILL.x) ** 2) + ((z - HILL.z) ** 2)) / (2 * HILL.sig * HILL.sig)) * HILL.amp;
  h += 2.2 * Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013);
  h += 1.1 * Math.sin(x * 0.031) * Math.sin(z * 0.027 + 0.6);
  h = h * (0.25 + 0.75 * shore);
  if (shore <= 0) h = -3.5 * (1 - shore) - 0.4;
  return h;
}

// ---------- roads ----------
function ringRoad(scale, name, coast = COAST) {
  const cx = coast === ISLE_COAST ? ISLE_C.x : 0, cz = coast === ISLE_COAST ? ISLE_C.z : 0;
  return { name, width: 13, pts: coast.map(p => ({ x: cx + (p.x - cx) * scale, z: cz + (p.z - cz) * scale })) };
}
function bezierRoad(name, a, c, b, segs = 16, width = 11) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, z: u * u * a.z + 2 * u * t * c.z + t * t * b.z });
  }
  return { name, width, pts };
}
function coastPt(theta, scale = 1) { const r = coastRadius(theta) * scale; return { x: Math.cos(theta) * r, z: Math.sin(theta) * r }; }

export const ROADS = [];
ROADS.push(ringRoad(0.90, 'Bulevar Costero'));
ROADS.push(ringRoad(0.63, 'Anillo Medio'));
ROADS.push(ringRoad(0.37, 'Anillo Centro'));
ROADS.push(ringRoad(0.68, 'Anillo Chica', ISLE_COAST));

// Bowed radials: centre ring → coast ring, control point swung sideways.
const RADIAL_ANGLES = [0.15, 0.75, 1.35, 2.0, 2.65, 3.3, 3.95, 4.6, 5.25, 5.85];
RADIAL_ANGLES.forEach((a, i) => {
  const A = coastPt(a, 0.37), B = coastPt(a + 0.10, 0.90);
  const mid = coastPt(a + 0.30, 0.63);
  ROADS.push(bezierRoad('Radial ' + (i + 1), A, mid, B, 15));
});
// Old-town diagonals: long bowed chords across the middle.
[[0.5, 2.6], [1.9, 4.1], [3.4, 5.6], [5.5, 1.2], [2.9, 0.2]].forEach(([a1, a2], i) => {
  const A = coastPt(a1, 0.63), B = coastPt(a2, 0.63);
  const mid = { x: (A.x + B.x) / 2 * 0.55 + Math.cos((a1 + a2) / 2) * 40, z: (A.z + B.z) / 2 * 0.55 + Math.sin((a1 + a2) / 2) * 40 };
  ROADS.push(bezierRoad('Diagonal ' + (i + 1), A, mid, B, 18));
});
// Hill switchback up to the Colina Alta mirador.
{
  const base = coastPt(3.85, 0.63);
  const pts = [base,
    { x: -120, z: -120 }, { x: -215, z: -140 }, { x: -150, z: -215 },
    { x: HILL.x - 18, z: HILL.z + 26 }, { x: HILL.x + 6, z: HILL.z - 6 }];
  const sw = { name: 'Subida del Mirador', width: 9, pts: [] };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], c = { x: (a.x + b.x) / 2 + (rng.next() - 0.5) * 18, z: (a.z + b.z) / 2 + (rng.next() - 0.5) * 18 };
    for (let s = 0; s < 8; s++) {
      const t = s / 8, u = 1 - t;
      sw.pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, z: u * u * a.z + 2 * u * t * c.z + t * t * b.z });
    }
  }
  sw.pts.push(pts[pts.length - 1]);
  ROADS.push(sw);
}
// Harbour spur + causeway to Isla Chica.
{
  const A = coastPt(0.48, 0.90);
  const B = { x: ISLE_C.x - 62, z: ISLE_C.z - 30 };
  const mid = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 - 26 };
  ROADS.push(bezierRoad('Calzada del Este', A, mid, B, 18, 12));
  const H1 = coastPt(5.9, 0.90), H2 = coastPt(5.55, 0.90);
  ROADS.push(bezierRoad('Avenida del Puerto', H1, { x: (H1.x + H2.x) / 2 * 1.04, z: (H1.z + H2.z) / 2 * 1.04 }, H2, 10, 12));
}

// ---------- road graph + GPS ----------
export const NODES = []; // {x,z, edges:[{to,cost}]}
function addNode(x, z) { NODES.push({ x, z, edges: [] }); return NODES.length - 1; }
{
  const perRoad = ROADS.map(road => {
    const ids = [];
    let prev = null, acc = 0;
    for (let i = 0; i < road.pts.length; i++) {
      const p = road.pts[i];
      if (prev) acc += Math.hypot(p.x - prev.x, p.z - prev.z);
      if (i === 0 || acc >= 20 || i === road.pts.length - 1) { ids.push(addNode(p.x, p.z)); acc = 0; }
      prev = p;
    }
    return ids;
  });
  const link = (a, b) => {
    const A = NODES[a], B = NODES[b];
    const c = Math.hypot(A.x - B.x, A.z - B.z);
    A.edges.push({ to: b, cost: c }); B.edges.push({ to: a, cost: c });
  };
  perRoad.forEach(ids => { for (let i = 0; i < ids.length - 1; i++) link(ids[i], ids[i + 1]); });
  // Ring roads are loops: close them.
  [0, 1, 2, 3].forEach(r => { const ids = perRoad[r]; if (ids.length > 2) link(ids[ids.length - 1], ids[0]); });
  // Junctions: stitch nodes of different roads that nearly touch.
  for (let i = 0; i < NODES.length; i++) for (let j = i + 1; j < NODES.length; j++) {
    const d = Math.hypot(NODES[i].x - NODES[j].x, NODES[i].z - NODES[j].z);
    if (d < 15 && !NODES[i].edges.some(e => e.to === j)) link(i, j);
  }
}
export function nearestNode(x, z) {
  let best = 0, bd = 1e12;
  for (let i = 0; i < NODES.length; i++) { const d = (NODES[i].x - x) ** 2 + (NODES[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
export function findRoute(ax, az, bx, bz) {
  const s = nearestNode(ax, az), g = nearestNode(bx, bz);
  const dist = new Float64Array(NODES.length).fill(Infinity);
  const prev = new Int32Array(NODES.length).fill(-1);
  const done = new Uint8Array(NODES.length);
  dist[s] = 0;
  for (;;) {
    let u = -1, du = Infinity;
    for (let i = 0; i < NODES.length; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
    if (u < 0 || u === g) break;
    done[u] = 1;
    for (const e of NODES[u].edges) {
      const nd = du + e.cost;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
    }
  }
  if (prev[g] === -1 && g !== s) return [{ x: bx, z: bz }];
  const path = [];
  let cur = g;
  while (cur !== -1) { path.push({ x: NODES[cur].x, z: NODES[cur].z }); cur = prev[cur]; }
  path.reverse();
  path.push({ x: bx, z: bz });
  return path;
}
// Reachability audit (dev assurance): every node reachable from node 0.
export function graphAudit() {
  const seen = new Uint8Array(NODES.length); const stack = [0]; seen[0] = 1; let n = 0;
  while (stack.length) { const u = stack.pop(); n++; for (const e of NODES[u].edges) if (!seen[e.to]) { seen[e.to] = 1; stack.push(e.to); } }
  return { total: NODES.length, reached: n };
}

export function nearestRoadPoint(x, z) {
  let best = null, bd = 1e12;
  for (const road of ROADS) for (const p of road.pts) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return { x: best.x, z: best.z, d: Math.sqrt(bd) };
}
export function roadDist(x, z) { return nearestRoadPoint(x, z).d; }

// ---------- districts ----------
export const DISTRICTS = [
  { name: 'BARRIO NEÓN', x: 60, z: 330, r: 130, tall: 1.0 },
  { name: 'CENTRO CORAL', x: 0, z: 0, r: 130, tall: 1.25 },
  { name: 'PUERTO VIEJO', x: 235, z: -268, r: 120, tall: 0.55 },
  { name: 'COLINA ALTA', x: HILL.x, z: HILL.z, r: 140, tall: 0.4 },
  { name: 'MARINA SUR', x: -215, z: 245, r: 120, tall: 0.5 },
  { name: 'PLAYA DORADA', x: -330, z: 60, r: 115, tall: 0.6 },
  { name: 'MERCADO LUNA', x: 205, z: 165, r: 110, tall: 0.75 },
  { name: 'JARDINES DEL FARO', x: -95, z: -300, r: 115, tall: 0.65 },
  { name: 'ISLA CHICA', x: ISLE_C.x, z: ISLE_C.z, r: 105, tall: 0.45 },
];
export function districtAt(x, z) {
  let best = DISTRICTS[1], bd = 1e12;
  for (const d of DISTRICTS) { const dd = (d.x - x) ** 2 + (d.z - z) ** 2; if (dd < bd) { bd = dd; best = d; } }
  return best;
}

// ---------- story places ----------
function placeAt(theta, scale, name, kind) {
  const p = coastPt(theta, scale); const rp = nearestRoadPoint(p.x, p.z);
  return { name, kind, x: rp.x, z: rp.z };
}
export const PLACES = {
  clubFaro: placeAt(1.62, 0.90, 'Club Faro', 'club'),
  hotelBrisa: placeAt(1.15, 0.90, 'Hotel Brisa Grande', 'hotel'),
  taller: placeAt(2.5, 0.63, 'Taller Marisol', 'garage'),
  marinaDock: placeAt(3.6, 0.90, 'Muelle Sur', 'dock'),
  mercado: placeAt(0.62, 0.63, 'Mercado Luna', 'market'),
  mirador: { name: 'Mirador de la Colina', kind: 'view', x: HILL.x + 6, z: HILL.z - 6 },
  casino: placeAt(5.3, 0.63, 'Casino Coral', 'casino'),
  islaBar: { name: 'Bar La Gaviota', kind: 'bar', x: ISLE_C.x - 30, z: ISLE_C.z + 28 },
  safehouse: placeAt(4.35, 0.63, 'Piso Franco', 'safe'),
};
PLACES.islaBar.x = nearestRoadPoint(PLACES.islaBar.x, PLACES.islaBar.z).x;
PLACES.islaBar.z = nearestRoadPoint(PLACES.islaBar.x, PLACES.islaBar.z).z;

// ---------- buildings ----------
export const BUILDINGS = [];
{
  let tries = 0;
  while (BUILDINGS.length < 234 && tries < 9000) {
    tries++;
    const onIsle = BUILDINGS.length > 218;
    const th = rng.range(0, TAU);
    const rr = onIsle ? rng.range(0, 62) : rng.range(20, coastRadius(th) * 0.94);
    const cx = onIsle ? ISLE_C.x : 0, cz = onIsle ? ISLE_C.z : 0;
    const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
    if (roadDist(x, z) < 16.5) continue;
    if (BUILDINGS.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < 26 ** 2)) continue;
    const d = districtAt(x, z);
    const hBase = rng.range(10, 34) * d.tall * (1 - rr / 900);
    BUILDINGS.push({
      x, z, w: rng.range(11, 20), d: rng.range(11, 20),
      h: clamp(hBase, 7, 46), rot: rng.range(0, Math.PI),
      tone: rng.pick([0x8a5a78, 0x6e4a7a, 0x9a6a68, 0x5a5f8f, 0xa8785e, 0x74547f, 0x86628a]),
      district: d.name,
    });
  }
}

// Neon sign sites: original Solmara business names on boulevard buildings.
export const NEON_SIGNS = [
  'CLUB FARO', 'HOTEL BRISA', 'NEÓN PIER', 'BAR CORAL', 'CINE LUMEN', 'CAFÉ NEÓN',
  'FARO NIGHTS', 'SOL BAR', 'PIZZA MAREA', 'TATTOO SOL', 'DISCO BRISA', 'MARISCOS LUA',
  'CASINO CORAL', 'RADIO OLA', 'TALLER MARISOL', 'JOYAS LUNA',
];
export const NEON_COLORS = [0xff4fd8, 0x37e0ff, 0xffa63f, 0x7dff6a, 0xff5d5d, 0xb18cff];
