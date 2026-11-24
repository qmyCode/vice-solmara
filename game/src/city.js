// city.js — one job: the map as data. A closed Catmull-Rom coastline spline (no grid anywhere),
// a bay bitten into the east shore, a second small isle across a causeway, curved roads that
// follow the coast and climb the hill, a junction graph over those roads with Dijkstra routing,
// 9 named districts, named places, and the building/palm/lamp lots the 3D world is built from.
// Terrain height is analytic, so the mesh, the roads and the physics all agree on the ground.
import { createRng, clamp, lerp, sstep, dist2d } from './rng.js';

const ISLE = { x: 548, z: 168, r: 88 };
const HILL = { x: -215, z: -150, peak: 52, sigma: 105 };
export const NEON_NAMES = ['CLUB FARO', 'HOTEL BRISA', 'NEON PIER', 'BAR CORAL', 'CINE LUMEN', 'CAFÉ NEÓN', 'FARO NIGHTS', 'SOL BAR', 'PIZZA MAREA', 'TATTOO SOL', 'DISCO BRISA', 'MARISCOS LUA'];
const DISTRICT_DEFS = [
  { name: 'Puerto Viejo', x: -205, z: 205, r: 150 },
  { name: 'Centro Neón', x: 0, z: 0, r: 165 },
  { name: 'Bulevar del Sol', x: 30, z: -330, r: 170 },
  { name: 'Colina Alta', x: -215, z: -150, r: 150 },
  { name: 'Muelle Sur', x: 235, z: -255, r: 140 },
  { name: 'Playa Serena', x: 265, z: 215, r: 150 },
  { name: 'Bahía Este', x: 205, z: 95, r: 130 },
  { name: 'Jardines del Norte', x: -30, z: 275, r: 150 },
  { name: 'Isla Chica', x: ISLE.x, z: ISLE.z, r: 110 },
];

/** Catmull-Rom through closed control points, sampled `per` times per span. */
function closedSpline(ctrl, per) {
  const pts = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i + n - 1) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      pts.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  return pts;
}

/** Resample a polyline at even spacing; keeps first and last points. */
function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = out[out.length - 1] === pts[i - 1] && acc === 0 ? pts[i - 1] : out[out.length - 1];
    let prev = pts[i - 1];
    const segLen = dist2d(prev.x, prev.z, pts[i].x, pts[i].z);
    let used = acc;
    while (used + step <= segLen) {
      const t = (used + step) / segLen;
      const p = { x: lerp(prev.x, pts[i].x, t), z: lerp(prev.z, pts[i].z, t) };
      out.push(p);
      prev = p;
      used += step;
    }
    acc = segLen - used;
    a = a; // (kept simple: spacing drift is invisible at these scales)
  }
  const last = pts[pts.length - 1];
  if (dist2d(out[out.length - 1].x, out[out.length - 1].z, last.x, last.z) > step * 0.4) out.push(last);
  return out;
}

/** Quadratic bezier sampled into a polyline. */
function bowed(a, b, bow, samples = 14) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const cx = mx + (-dz / len) * bow, cz = mz + (dx / len) * bow;
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, z: u * u * a.z + 2 * u * t * cz + t * t * b.z });
  }
  return pts;
}

export function buildCity(seed) {
  const rng = createRng(seed ^ 0x5013a);

  // --- coastline -----------------------------------------------------------
  const ctrl = [];
  for (let k = 0; k < 24; k++) {
    const th = (k / 24) * Math.PI * 2;
    let r = 400 + 42 * Math.sin(th * 2 + 0.7) + 26 * Math.sin(th * 3 + 2.1) + rng.range(-9, 9);
    const deg = (th * 180) / Math.PI;
    if (deg > 6 && deg < 54) { // the bay: pull the east shore hard inward
      const pull = Math.sin(((deg - 6) / 48) * Math.PI);
      r = lerp(r, 216, pull * 0.88);
    }
    ctrl.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
  }
  const coast = closedSpline(ctrl, 8); // 192 points, closed
  const coastTable = coast.map((p) => ({ ang: Math.atan2(p.z, p.x), r: Math.hypot(p.x, p.z) })).sort((a, b) => a.ang - b.ang);
  function coastRadiusAt(th) {
    let t = th;
    while (t < -Math.PI) t += Math.PI * 2;
    while (t > Math.PI) t -= Math.PI * 2;
    const tab = coastTable;
    let lo = 0, hi = tab.length - 1;
    if (t <= tab[0].ang || t >= tab[hi].ang) {
      const a = tab[hi], b = tab[0];
      const span = b.ang + Math.PI * 2 - a.ang;
      const f = span === 0 ? 0 : ((t < a.ang ? t + Math.PI * 2 : t) - a.ang) / span;
      return lerp(a.r, b.r, clamp(f, 0, 1));
    }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid].ang <= t) lo = mid; else hi = mid; }
    const a = tab[lo], b = tab[hi];
    return lerp(a.r, b.r, (t - a.ang) / (b.ang - a.ang || 1));
  }
  const scaledCoast = (s) => coast.map((p) => ({ x: p.x * s, z: p.z * s }));

  // --- terrain height --------------------------------------------------------
  function baseHeight(shore) {
    const t = clamp((1.13 - shore) / 0.26, 0, 1);
    return -2.6 + 5.4 * (t * t * (3 - 2 * t));
  }
  function height(x, z) {
    const d = Math.hypot(x, z);
    const shore = d / coastRadiusAt(Math.atan2(z, x));
    let h = baseHeight(shore);
    const di = dist2d(x, z, ISLE.x, ISLE.z);
    h = Math.max(h, baseHeight(di / ISLE.r) - 0.4);
    const hd = dist2d(x, z, HILL.x, HILL.z);
    h += HILL.peak * Math.exp(-(hd * hd) / (2 * HILL.sigma * HILL.sigma)) * sstep(1.04, 0.86, shore);
    // causeway deck: hold the crossing at a steady 2.4 over the bay
    const deck = distToSeg(x, z, CAUSE_A, CAUSE_B);
    if (deck < 20) h = lerp(2.4, h, sstep(9, 20, deck));
    return h;
  }
  function distToSeg(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return dist2d(px, pz, a.x + dx * t, a.z + dz * t);
  }
  const CAUSE_A = { x: 196, z: 92 };
  const CAUSE_B = { x: ISLE.x - 62, z: ISLE.z - 8 };
  const isWater = (x, z) => height(x, z) < -0.55;

  // --- roads -----------------------------------------------------------------
  const roads = [];
  const addRoad = (name, pts, width = 11, closed = false) => {
    const road = { name, pts: resample(pts, 6), width, closed };
    roads.push(road);
    return road;
  };
  addRoad('Bulevar Costero', scaledCoast(0.9), 13, true);
  addRoad('Anillo Medio', scaledCoast(0.63), 11, true);
  addRoad('Anillo Centro', scaledCoast(0.37), 10, true);
  const ringPt = (s, deg) => { const th = (deg * Math.PI) / 180, r = coastRadiusAt(th) * s; return { x: Math.cos(th) * r, z: Math.sin(th) * r }; };
  const radialAngles = [8, 52, 96, 140, 184, 228, 272, 316];
  radialAngles.forEach((deg, i) => {
    addRoad('Radial ' + (i + 1), bowed(ringPt(0.37, deg), ringPt(0.9, deg), (i % 2 ? -1 : 1) * 16), 10);
  });
  // old-town diagonals (Puerto Viejo, north-west)
  addRoad('Diagonal A', bowed(ringPt(0.63, 118), ringPt(0.63, 168), 12), 9);
  addRoad('Diagonal B', bowed(ringPt(0.37, 128), ringPt(0.9, 158), -10), 9);
  addRoad('Diagonal C', bowed(ringPt(0.63, 140), ringPt(0.9, 118), 8), 9);
  addRoad('Diagonal D', bowed(ringPt(0.37, 105), ringPt(0.63, 150), -14), 9);
  addRoad('Diagonal E', bowed(ringPt(0.9, 140), ringPt(0.63, 105), 10), 9);
  // hill switchback + mirador loop
  const hillBase = ringPt(0.63, 214);
  const sw = [hillBase];
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const bx = lerp(hillBase.x, HILL.x, t), bz = lerp(hillBase.z, HILL.z, t);
    const off = (i % 2 ? 1 : -1) * 26 * Math.sin(t * Math.PI);
    const dx = HILL.x - hillBase.x, dz = HILL.z - hillBase.z, len = Math.hypot(dx, dz) || 1;
    sw.push({ x: bx + (-dz / len) * off, z: bz + (dx / len) * off });
  }
  sw.push({ x: HILL.x, z: HILL.z });
  addRoad('Subida del Mirador', sw, 9);
  const miradorLoop = [];
  for (let k = 0; k < 10; k++) { const th = (k / 10) * Math.PI * 2; miradorLoop.push({ x: HILL.x + Math.cos(th) * 26, z: HILL.z + Math.sin(th) * 26 }); }
  addRoad('Mirador Loop', miradorLoop, 8, true);
  // harbour avenue + piers (Muelle Sur)
  addRoad('Avenida del Puerto', bowed(ringPt(0.9, -58), ringPt(0.9, -12), 20), 11);
  const pierBase1 = ringPt(0.97, -38), pierBase2 = ringPt(0.97, -24);
  addRoad('Muelle Uno', [ringPt(0.86, -38), pierBase1, { x: pierBase1.x * 1.09, z: pierBase1.z * 1.09 }], 8);
  addRoad('Muelle Dos', [ringPt(0.86, -24), pierBase2, { x: pierBase2.x * 1.08, z: pierBase2.z * 1.08 }], 8);
  // causeway + isle ring
  addRoad('Calzada del Este', [CAUSE_A, { x: 330, z: 128 }, CAUSE_B], 12);
  const isleRing = [];
  for (let k = 0; k < 12; k++) { const th = (k / 12) * Math.PI * 2; isleRing.push({ x: ISLE.x + Math.cos(th) * 52, z: ISLE.z + Math.sin(th) * 52 }); }
  addRoad('Anillo de la Isla', isleRing, 9, true);
  addRoad('Espigón de la Isla', [{ x: ISLE.x - 50, z: ISLE.z - 6 }, CAUSE_B], 9);

  // --- junction graph ---------------------------------------------------------
  const nodes = [];
  const nodeGrid = new Map();
  function nodeAt(x, z) {
    const cx = Math.floor(x / 7), cz = Math.floor(z / 7);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const cell = nodeGrid.get(ix + ',' + iz);
      if (cell) for (const id of cell) { if (dist2d(nodes[id].x, nodes[id].z, x, z) < 6.5) return id; }
    }
    const id = nodes.length;
    nodes.push({ x, z, adj: [] });
    const key = cx + ',' + cz;
    if (!nodeGrid.has(key)) nodeGrid.set(key, []);
    nodeGrid.get(key).push(id);
    return id;
  }
  function link(a, b) {
    if (a === b) return;
    const w = dist2d(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
    if (!nodes[a].adj.some((e) => e.to === b)) nodes[a].adj.push({ to: b, w });
    if (!nodes[b].adj.some((e) => e.to === a)) nodes[b].adj.push({ to: a, w });
  }
  for (const road of roads) {
    const ids = road.pts.map((p) => nodeAt(p.x, p.z));
    for (let i = 1; i < ids.length; i++) link(ids[i - 1], ids[i]);
    if (road.closed && ids.length > 2) link(ids[ids.length - 1], ids[0]);
  }
  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) { const d = dist2d(nodes[i].x, nodes[i].z, x, z); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  /** Dijkstra route between two world points; returns world-space waypoints (may be []). */
  function route(ax, az, bx, bz) {
    const start = nearestNode(ax, az), goal = nearestNode(bx, bz);
    if (start === goal) return [{ x: bx, z: bz }];
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    dist[start] = 0;
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u === -1 || u === goal) break;
      done[u] = 1;
      for (const e of nodes[u].adj) {
        const nd = du + e.w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
      }
    }
    if (!Number.isFinite(dist[goal])) return [];
    const path = [];
    for (let u = goal; u !== -1; u = prev[u]) path.push({ x: nodes[u].x, z: nodes[u].z });
    path.reverse();
    path.push({ x: bx, z: bz });
    return path;
  }
  const randomNode = () => nodes[rng.int(0, nodes.length - 1)];

  // --- districts & places ------------------------------------------------------
  const districts = DISTRICT_DEFS.map((d) => ({ ...d }));
  function districtAt(x, z) {
    let best = null, bd = Infinity;
    for (const d of districts) { const dd = dist2d(x, z, d.x, d.z) - d.r * 0.4; if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  function roadPoint(roadName, t, side = 0, off = 0) {
    const road = roads.find((r) => r.name === roadName);
    const pts = road.pts;
    const f = clamp(t, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), fr = f - i;
    const x = lerp(pts[i].x, pts[i + 1].x, fr), z = lerp(pts[i].z, pts[i + 1].z, fr);
    let dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    return { x: x + -dz * side * off, z: z + dx * side * off, ang: Math.atan2(dx, dz), road };
  }
  const places = {
    garage: { id: 'garage', name: 'Taller Marisol', ...roadPoint('Diagonal B', 0.42, 1, 13) },
    hotel: { id: 'hotel', name: 'Hotel Brisa Grande', ...roadPoint('Bulevar Costero', 0.78, -1, 14) },
    pier: { id: 'pier', name: 'Muelle de Carga', ...roadPoint('Muelle Uno', 0.97, 0, 0) },
    mirador: { id: 'mirador', name: 'Mirador de la Colina', x: HILL.x + 20, z: HILL.z + 8, ang: 0 },
    showroom: { id: 'showroom', name: 'Vitral Motors', ...roadPoint('Anillo Centro', 0.13, 1, 12) },
    safehouse: { id: 'safehouse', name: 'Casa Segura', ...roadPoint('Radial 3', 0.55, -1, 13) },
    isleHouse: { id: 'isleHouse', name: 'Refugio de la Isla', ...roadPoint('Anillo de la Isla', 0.3, 1, 12) },
    station: { id: 'station', name: 'Comisaría Central', ...roadPoint('Anillo Centro', 0.55, -1, 12) },
    hospital: { id: 'hospital', name: 'Clínica del Sol', ...roadPoint('Anillo Medio', 0.33, 1, 13) },
    club: { id: 'club', name: 'Club Faro', ...roadPoint('Bulevar Costero', 0.6, -1, 14) },
  };

  // --- building / palm / lamp lots ----------------------------------------------
  const buildings = [];
  const colliders = [];
  const taken = [];
  function spotTaken(x, z, r) {
    for (const t of taken) if (dist2d(x, z, t.x, t.z) < r + t.r) return true;
    return false;
  }
  for (const p of Object.values(places)) taken.push({ x: p.x, z: p.z, r: 17 });
  let neonIdx = 0;
  for (const road of roads) {
    let carry = rng.range(0, 8);
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i];
      carry += dist2d(a.x, a.z, b.x, b.z);
      if (carry < 14.5) continue;
      carry = 0;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const px = -dz / len, pz = dx / len;
      for (const side of [1, -1]) {
        if (rng.chance(0.24)) continue;
        const off = road.width / 2 + 6.5 + rng.range(0, 6);
        const x = b.x + px * side * off, z = b.z + pz * side * off;
        const h = height(x, z);
        if (h < 0.7) continue;
        if (Math.abs(height(x + px * 5, z + pz * 5) - h) > 4.2) continue;
        if (spotTaken(x, z, 11)) continue;
        const dist = districtAt(x, z);
        const tall = dist.name === 'Centro Neón' ? rng.range(17, 44) : dist.name === 'Bulevar del Sol' ? rng.range(9, 24) : dist.name === 'Isla Chica' ? rng.range(5, 9) : rng.range(5, 14);
        const bld = {
          x, z, y: h - 0.3, w: rng.range(9, 16), d: rng.range(9, 16), h: tall,
          rot: Math.atan2(dx, dz) + (side < 0 ? Math.PI : 0) + rng.range(-0.05, 0.05),
          district: dist.name,
          neon: (dist.name === 'Centro Neón' || dist.name === 'Bulevar del Sol') && rng.chance(0.42) ? NEON_NAMES[neonIdx++ % NEON_NAMES.length] : null,
          tint: rng.pick([0xf0c8a8, 0xe8b4a0, 0xf6ddae, 0xcfe0d8, 0xbcd2e8, 0xe6c8dc, 0xd8e6c0, 0xf2e3c8, 0xc9a189, 0xb5c0c8, 0xe0cfae, 0xd9b8d0]),
        };
        buildings.push(bld);
        colliders.push({ x, z, hw: bld.w / 2, hd: bld.d / 2, rot: bld.rot });
        taken.push({ x, z, r: 10.5 });
      }
    }
  }
  const palms = [];
  {
    const coastRoad = roads[0];
    for (let i = 0; i < coastRoad.pts.length; i += 3) {
      const p = coastRoad.pts[i], q = coastRoad.pts[(i + 1) % coastRoad.pts.length];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const side = rng.chance(0.6) ? 1 : -1;
      const x = p.x + (-dz / len) * side * (coastRoad.width / 2 + 3.4) + rng.range(-2, 2);
      const z = p.z + (dx / len) * side * (coastRoad.width / 2 + 3.4) + rng.range(-2, 2);
      if (height(x, z) > 0.2) palms.push({ x, z, y: height(x, z), s: rng.range(0.85, 1.3), lean: rng.range(-0.09, 0.09) });
    }
    for (let i = 0; i < 26; i++) {
      const th = rng.range(0, Math.PI * 2), rr = rng.range(58, 74);
      const x = ISLE.x + Math.cos(th) * rr, z = ISLE.z + Math.sin(th) * rr;
      if (height(x, z) > 0.2) palms.push({ x, z, y: height(x, z), s: rng.range(0.85, 1.25), lean: rng.range(-0.09, 0.09) });
    }
  }
  const lamps = [];
  for (const road of roads) {
    for (let i = 0; i < road.pts.length; i += 4) {
      const p = road.pts[i], q = road.pts[Math.min(road.pts.length - 1, i + 1)];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const side = i % 8 === 0 ? 1 : -1;
      const x = p.x + (-dz / len) * side * (road.width / 2 + 1.2), z = p.z + (dx / len) * side * (road.width / 2 + 1.2);
      if (height(x, z) > 0.1) lamps.push({ x, z, y: height(x, z) });
    }
  }

  return { seed, coast, coastRadiusAt, height, isWater, roads, nodes, nearestNode, route, randomNode, districts, districtAt, places, buildings, colliders, palms, lamps, isle: ISLE, hill: HILL };
}
