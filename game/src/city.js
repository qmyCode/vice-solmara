// city.js — one job: the map itself, as data. Vice Solmara is an island drawn from curves, never
// a grid: a closed Catmull-Rom coastline with a bay bitten out of its east shore, a second small
// isle joined by a causeway, and 24 roads that are all bends — a coast boulevard hugging the
// shoreline, two ring roads, eight bowed radials, old-town diagonals, a hill switchback and a
// harbour avenue. This module builds the road graph (junctions merged by proximity, gaps bridged,
// reachability proven), answers GPS routes with Dijkstra, places 200+ buildings, palms, lamps and
// neon signs along the roads, and knows the ground height and the district of any point.

import { Rng, clamp, lerp, dist2d } from './rng.js';

/** Sample a closed Catmull-Rom spline through pts ([{x,z}]) at n points, evenly by index. */
function closedSpline(pts, n) {
  const out = [];
  const m = pts.length;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * m;
    const i0 = Math.floor(t) % m;
    const f = t - Math.floor(t);
    const p0 = pts[(i0 + m - 1) % m], p1 = pts[i0], p2 = pts[(i0 + 1) % m], p3 = pts[(i0 + 2) % m];
    const cr = (a, b, c, d) => {
      const f2 = f * f, f3 = f2 * f;
      return 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
    };
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
  }
  return out;
}

/** Sample an open Catmull-Rom spline through pts at n points. */
function openSpline(pts, n) {
  const ext = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (ext.length - 3);
    const i0 = Math.min(Math.floor(t), ext.length - 4);
    const f = t - i0;
    const p0 = ext[i0], p1 = ext[i0 + 1], p2 = ext[i0 + 2], p3 = ext[i0 + 3];
    const cr = (a, b, c, d) => {
      const f2 = f * f, f3 = f2 * f;
      return 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
    };
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
  }
  return out;
}

/** Resample a polyline so consecutive points sit about `step` apart. */
function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1], b = pts[i];
    let seg = dist2d(a.x, a.z, b.x, b.z);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      const nx = lerp(a.x, b.x, t), nz = lerp(a.z, b.z, t);
      out.push({ x: nx, z: nz });
      a = { x: nx, z: nz };
      seg = dist2d(a.x, a.z, b.x, b.z);
      acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  if (dist2d(out[out.length - 1].x, out[out.length - 1].z, last.x, last.z) > step * 0.4) out.push(last);
  return out;
}

/** Distance from point p to segment ab. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  return dist2d(px, pz, ax + dx * t, az + dz * t);
}

/** Distance from a point to the nearest segment of a polyline. */
function polyDist(pts, px, pz) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(px, pz, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  return best;
}

/** Even-odd point-in-polygon over a sampled closed outline. */
function inPoly(pts, px, pz) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const DISTRICTS = [
  { name: 'Centro', x: 0, z: 0 },
  { name: 'Casco Viejo', x: -195, z: -150 },
  { name: 'Barrio Neón', x: 215, z: -175 },
  { name: 'Puerto', x: 30, z: 295 },
  { name: 'Playa Blanca', x: -305, z: 55 },
  { name: 'Colina Alta', x: -215, z: 135 },
  { name: 'La Bahía', x: 295, z: 45 },
  { name: 'Isla Chica', x: 565, z: -45 },
  { name: 'Muelle Viejo', x: 185, z: 225 },
];

export const SIGN_NAMES = [
  'CLUB FARO', 'HOTEL BRISA', 'NEON PIER', 'BAR CORAL', 'CINE LUMEN', 'CAFÉ NEÓN',
  'FARO NIGHTS', 'SOL BAR', 'PIZZA MAREA', 'TATTOO SOL', 'DISCO BRISA', 'MARISCOS LUA',
  'VICE RECORDS', 'PALMA CLUB',
];
const SIGN_COLORS = ['#ff4fd8', '#22d8ff', '#ffb347', '#7dff6a', '#ff5a5a', '#c792ff'];

export function createCity(seed = 7) {
  const rng = new Rng(seed);

  // ---- coastline: a ring of control points, the east side pulled in to bite out the bay ----
  const ctrl = [];
  const NC = 16;
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * Math.PI * 2;
    let r = 400 + rng.range(-38, 38);
    const deg = (a * 180) / Math.PI; // 0 = east, growing toward the south (+z)
    if (deg > 348 || deg < 52) r *= 0.58; // the bay bite
    ctrl.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  const coast = closedSpline(ctrl, 240);
  const centroid = { x: 0, z: 0 };
  const scalePt = (p, s) => ({ x: centroid.x + (p.x - centroid.x) * s, z: centroid.z + (p.z - centroid.z) * s });
  const ringOf = (s, n) => closedSpline(ctrl.map((p) => scalePt(p, s)), n);

  // ---- the little isle across the bay ----
  const isleC = { x: 565, z: -45 };
  const isleCtrl = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 96 + rng.range(-12, 12);
    isleCtrl.push({ x: isleC.x + Math.cos(a) * r, z: isleC.z + Math.sin(a) * r });
  }
  const isleCoast = closedSpline(isleCtrl, 72);

  // ---- ground height: flat city, one hill, beach falloff, causeway deck ----
  const hill = { x: -215, z: 135 };
  function heightAt(x, z) {
    const onIsle = inPoly(isleCoast, x, z);
    const onMain = inPoly(coast, x, z);
    if (!onIsle && !onMain) {
      // causeway deck: a soft bridge of land between the east shore and the isle
      const dDeck = segDist(x, z, 352, -18, 478, -42);
      if (dDeck < 13) return 1.7 * (1 - dDeck / 13) + 0.2;
      return -2.6;
    }
    let h = 0.25;
    const dh = dist2d(x, z, hill.x, hill.z);
    h += 27 * Math.exp(-(dh * dh) / (2 * 78 * 78));
    return h;
  }
  const inWater = (x, z) => heightAt(x, z) < -0.4 && !inPoly(coast, x, z) && !inPoly(isleCoast, x, z);

  // ---- roads: every one of them a curve ----
  const roads = [];
  const addRoad = (name, rawPts, width, closed = false, step = 13) => {
    const pts = resample(rawPts, step);
    roads.push({ name, pts, width, closed });
    return roads[roads.length - 1];
  };
  addRoad('Bulevar Costero', ringOf(0.9, 200), 13, true);
  addRoad('Anillo Medio', ringOf(0.63, 160), 11, true);
  addRoad('Anillo Centro', ringOf(0.38, 120), 10, true);
  const radialAngles = [18, 63, 108, 153, 198, 243, 288, 333];
  radialAngles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const dirx = Math.cos(a), dirz = Math.sin(a);
    const bow = (i % 2 === 0 ? 1 : -1) * rng.range(16, 30);
    const cps = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const s = lerp(0.38, 0.9, t);
      const base = scalePt({ x: dirx * 400, z: dirz * 400 }, s);
      const bend = Math.sin(t * Math.PI) * bow;
      cps.push({ x: base.x + -dirz * bend, z: base.z + dirx * bend });
    }
    addRoad(`Radial ${['Sol', 'Luna', 'Palma', 'Viento', 'Coral', 'Onda', 'Faro', 'Brisa'][i]}`, openSpline(cps, 26), 10);
  });
  // old-town diagonals: chords across the north-west between the two rings
  for (let i = 0; i < 5; i++) {
    const a1 = ((100 + i * 15) * Math.PI) / 180;
    const a2 = ((128 + i * 15) * Math.PI) / 180;
    const p1 = scalePt({ x: Math.cos(a1) * 400, z: Math.sin(a1) * 400 }, 0.63);
    const p2 = scalePt({ x: Math.cos(a2) * 400, z: Math.sin(a2) * 400 }, 0.38);
    const mid = { x: (p1.x + p2.x) / 2 + rng.range(-12, 12), z: (p1.z + p2.z) / 2 + rng.range(-12, 12) };
    addRoad(`Travesía ${i + 1}`, openSpline([p1, mid, p2], 12), 8.5);
  }
  // hill switchback up to the mirador
  {
    const base = scalePt({ x: Math.cos(2.6) * 400, z: Math.sin(2.6) * 400 }, 0.63);
    const cps = [base];
    for (let k = 1; k <= 5; k++) {
      const t = k / 5;
      cps.push({
        x: lerp(base.x, hill.x, t) + (k % 2 === 0 ? -1 : 1) * 34 * Math.sin(t * Math.PI),
        z: lerp(base.z, hill.z, t) + (k % 2 === 0 ? 1 : -1) * 10,
      });
    }
    cps.push({ x: hill.x + 16, z: hill.z - 10 });
    addRoad('Subida del Mirador', openSpline(cps, 30), 8.5);
    addRoad('Mirador', openSpline([
      { x: hill.x + 16, z: hill.z - 10 }, { x: hill.x + 44, z: hill.z + 6 },
      { x: hill.x + 30, z: hill.z + 34 }, { x: hill.x - 2, z: hill.z + 30 },
      { x: hill.x + 16, z: hill.z - 10 },
    ], 20), 8, true);
  }
  // harbour avenue along the south shore + the causeway + the isle ring
  {
    const arc = [];
    for (let k = 0; k <= 10; k++) {
      const a = ((58 + k * 6.4) * Math.PI) / 180;
      arc.push(scalePt({ x: Math.cos(a) * 400, z: Math.sin(a) * 400 }, 0.79));
    }
    addRoad('Avenida del Puerto', openSpline(arc, 30), 11);
    addRoad('Calzada del Este', openSpline([
      { x: 330, z: -8 }, { x: 395, z: -30 }, { x: 452, z: -44 }, { x: 492, z: -46 },
    ], 16), 11);
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push({ x: isleC.x + Math.cos(a) * 58, z: isleC.z + Math.sin(a) * 58 });
    }
    addRoad('Anillo de la Isla', closedSpline(ring, 40), 9, true);
  }

  // ---- the road graph: merge nearby samples into junctions, bridge any gap, prove reach ----
  const nodes = [];
  const hash = new Map();
  const cellOf = (x, z) => `${Math.floor(x / 9)},${Math.floor(z / 9)}`;
  function nodeAt(x, z) {
    const cx = Math.floor(x / 9), cz = Math.floor(z / 9);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const bucket = hash.get(`${ix},${iz}`);
      if (!bucket) continue;
      for (const id of bucket) {
        if (dist2d(nodes[id].x, nodes[id].z, x, z) < 8.5) return id;
      }
    }
    const id = nodes.length;
    nodes.push({ x, z, adj: [] });
    const key = cellOf(x, z);
    if (!hash.has(key)) hash.set(key, []);
    hash.get(key).push(id);
    return id;
  }
  const edgeSet = new Set();
  function addEdge(a, b) {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    const d = dist2d(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
    nodes[a].adj.push({ to: b, d });
    nodes[b].adj.push({ to: a, d });
  }
  for (const road of roads) {
    const ids = road.pts.map((p) => nodeAt(p.x, p.z));
    road.nodeIds = ids;
    for (let i = 1; i < ids.length; i++) addEdge(ids[i - 1], ids[i]);
    if (road.closed && ids.length > 2) addEdge(ids[ids.length - 1], ids[0]);
  }
  // bridge unreachable components to the main one until a single graph remains
  for (;;) {
    const seen = new Uint8Array(nodes.length);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const cur = stack.pop();
      for (const e of nodes[cur].adj) if (!seen[e.to]) { seen[e.to] = 1; stack.push(e.to); }
    }
    let orphan = -1;
    for (let i = 0; i < nodes.length; i++) if (!seen[i]) { orphan = i; break; }
    if (orphan === -1) break;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!seen[i]) continue;
      const d = dist2d(nodes[i].x, nodes[i].z, nodes[orphan].x, nodes[orphan].z);
      if (d < bestD) { bestD = d; best = i; }
    }
    addEdge(orphan, best);
  }
  const reachableCount = nodes.length; // by construction, every node is now in the one graph

  function nearestNode(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = dist2d(nodes[i].x, nodes[i].z, x, z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Dijkstra over the junction graph; returns a waypoint list from (ax,az) to (bx,bz). */
  function route(ax, az, bx, bz) {
    const start = nearestNode(ax, az), goal = nearestNode(bx, bz);
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    dist[start] = 0;
    for (;;) {
      let cur = -1, curD = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < curD) { curD = dist[i]; cur = i; }
      if (cur === -1 || cur === goal) break;
      done[cur] = 1;
      for (const e of nodes[cur].adj) {
        const nd = dist[cur] + e.d;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = cur; }
      }
    }
    const path = [];
    let cur = goal;
    while (cur !== -1) { path.push({ x: nodes[cur].x, z: nodes[cur].z }); cur = prev[cur]; }
    path.reverse();
    if (path.length === 0 || dist2d(path[0].x, path[0].z, ax, az) > 0.01) path.unshift({ x: ax, z: az });
    path.push({ x: bx, z: bz });
    return path;
  }

  function districtAt(x, z) {
    let best = DISTRICTS[0], bestD = Infinity;
    for (const d of DISTRICTS) {
      const dd = dist2d(x, z, d.x, d.z);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best.name;
  }

  // ---- roadside furniture: buildings, palms, lamps, signs (placed along the roads) ----
  const roadPtsFlat = [];
  for (const road of roads) for (const p of road.pts) roadPtsFlat.push(p);
  const roadHash = new Map();
  roadPtsFlat.forEach((p, i) => {
    const key = cellOf(p.x, p.z);
    if (!roadHash.has(key)) roadHash.set(key, []);
    roadHash.get(key).push(i);
  });
  function nearRoad(x, z, within) {
    const cx = Math.floor(x / 9), cz = Math.floor(z / 9);
    for (let ix = cx - 2; ix <= cx + 2; ix++) for (let iz = cz - 2; iz <= cz + 2; iz++) {
      const bucket = roadHash.get(`${ix},${iz}`);
      if (!bucket) continue;
      for (const i of bucket) if (dist2d(roadPtsFlat[i].x, roadPtsFlat[i].z, x, z) < within) return true;
    }
    return false;
  }

  const buildings = [];
  const colliders = [];
  const signs = [];
  const facadePalettes = {
    'Casco Viejo': [0xc96f4a, 0xd9a066, 0xb8574f, 0xe0b184],
    'Centro': [0x8d99ae, 0x6c7a89, 0xa8b6c4, 0x5d6d7e],
    'Barrio Neón': [0x74569e, 0x9e5a8a, 0x4a6fa5, 0x815ac9],
    'Puerto': [0x9a8f7a, 0x7a8a99, 0xb0a58e],
    'Colina Alta': [0xd9c9a3, 0xc4b393, 0xe6d7b8],
    'default': [0xa39e93, 0x8d99ae, 0xc9b8a3, 0x7a8a99],
  };
  let signIdx = 0;
  for (const road of roads) {
    for (let i = 2; i < road.pts.length - 2; i += 1) {
      if (!rng.chance(0.85)) continue;
      const p = road.pts[i], q = road.pts[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len, pz = dx / len;
      for (const side of [-1, 1]) {
        if (!rng.chance(0.88)) continue;
        const w = rng.range(11, 20), d = rng.range(11, 18);
        const off = road.width / 2 + d / 2 + rng.range(0.8, 2.6);
        const bx = p.x + px * side * off, bz = p.z + pz * side * off;
        if (inWater(bx, bz)) continue;
        if (nearRoad(bx, bz, Math.max(w, d) * 0.5 + 2)) continue;
        let clash = false;
        for (const b of buildings) if (dist2d(bx, bz, b.x, b.z) < (Math.max(w, d) + Math.max(b.w, b.d)) / 2 + 1.2) { clash = true; break; }
        if (clash) continue;
        const district = districtAt(bx, bz);
        let h;
        if (district === 'Centro') h = rng.range(20, 48);
        else if (district === 'Barrio Neón') h = rng.range(14, 34);
        else if (district === 'Casco Viejo') h = rng.range(7, 15);
        else if (district === 'Colina Alta') h = rng.range(6, 12);
        else h = rng.range(8, 26);
        const palette = facadePalettes[district] || facadePalettes.default;
        const b = { x: bx, z: bz, w, d, h, rot: Math.atan2(dx, dz) + (side < 0 ? 0 : Math.PI), color: rng.pick(palette), district };
        buildings.push(b);
        colliders.push({ x: bx, z: bz, r: Math.min(w, d) * 0.58 }); // inscribed-ish: never eats the road
        const neonZone = district === 'Barrio Neón' || district === 'Casco Viejo' || district === 'Centro' || road.name === 'Bulevar Costero';
        if (neonZone && h > 9 && rng.chance(0.42)) {
          // most signs ride at street level where the camera lives; some ride high
          const street = rng.chance(0.62);
          signs.push({
            x: bx - px * side * (d / 2 + 0.4), z: bz - pz * side * (d / 2 + 0.4),
            rotY: Math.atan2(px * side, pz * side), w: Math.min(w * 0.92, 15), h: rng.range(2.4, 3.6),
            y: street ? rng.range(3.1, 5.2) : rng.range(h * 0.45, h * 0.7),
            text: SIGN_NAMES[signIdx % SIGN_NAMES.length], color: SIGN_COLORS[signIdx % SIGN_COLORS.length],
          });
          signIdx++;
        }
      }
    }
  }

  const palms = [];
  for (const road of roads) {
    const palmRoad = road.name === 'Bulevar Costero' || road.name === 'Avenida del Puerto' || road.name === 'Anillo de la Isla'
      || road.name === 'Anillo Centro' || road.name.startsWith('Travesía');
    if (!palmRoad) continue;
    const palmChance = (road.name === 'Anillo Centro' || road.name.startsWith('Travesía')) ? 0.3 : 0.55;
    for (let i = 0; i < road.pts.length; i += 2) {
      const p = road.pts[i], q = road.pts[(i + 1) % road.pts.length];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const px = -dz / len, pz = dx / len;
      for (const side of [-1, 1]) {
        if (!rng.chance(palmChance)) continue;
        const x = p.x + px * side * (road.width / 2 + 2.6), z = p.z + pz * side * (road.width / 2 + 2.6);
        if (inWater(x, z) || nearRoad(x, z, 4)) continue;
        palms.push({ x, z, rot: rng.range(0, Math.PI * 2), s: rng.range(0.85, 1.25) });
      }
    }
  }

  const lamps = [];
  for (const road of roads) {
    for (let i = 0; i < road.pts.length; i += 2) {
      const p = road.pts[i], q = road.pts[(i + 1) % road.pts.length];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const side = i % 4 === 0 ? 1 : -1;
      const x = p.x + (-dz / len) * side * (road.width / 2 + 0.7), z = p.z + (dx / len) * side * (road.width / 2 + 0.7);
      if (inWater(x, z)) continue;
      lamps.push({ x, z });
    }
  }

  // ---- named places the story visits: anchored to the nearest road point of a district ----
  function placeNear(x, z, label) {
    const id = nearestNode(x, z);
    return { label, x: nodes[id].x, z: nodes[id].z };
  }
  const places = {
    garage: placeNear(-160, -120, 'Taller Marisol'),
    club: placeNear(235, -150, 'Club Faro'),
    hotel: placeNear(120, -265, 'Hotel Brisa Grande'),
    port: placeNear(30, 300, 'Almacén del Puerto'),
    mirador: { label: 'Mirador de la Colina', x: hill.x + 30, z: hill.z + 16 },
    station: placeNear(-30, 40, 'Comisaría Central'),
    marina: placeNear(-120, 285, 'Marina del Sur'),
    isleBar: placeNear(565, -45 + 40, 'Bar La Ola'),
    chopshop: placeNear(190, 235, 'Desguace Muelle'),
    bank: placeNear(40, -60, 'Banco del Centro'),
  };

  return {
    seed, coast, isleCoast, isleC, hill, roads, nodes, buildings, colliders, signs, palms, lamps,
    places, districts: DISTRICTS, reachableCount,
    heightAt, inWater, districtAt, nearestNode, route, nearRoad, polyDist,
  };
}
