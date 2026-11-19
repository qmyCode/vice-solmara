// world3d.js — one job: turn city.js data into the visible 3D island.
// Terrain with painted vertex colours, ribbon roads that follow the curves,
// instanced buildings with lit windows, neon signs with original names,
// palms, street lamps, water and a day-cycle sky. No shadows (perf) — the
// golden-hour grade comes from fog, hemisphere light and emissive windows.

import * as THREE from 'three';
import { ROADS, BUILDINGS, NEON_SIGNS, NEON_COLORS, heightAt } from './city.js';
import { worldRng as rng, clamp, lerp } from './rng.js';

export const colliders = []; // {x,z,r} for buildings

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#241a30'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 120; y += 11) for (let x = 5; x < 56; x += 11) {
    const lit = rng.chance(0.55);
    g.fillStyle = lit ? (rng.chance(0.75) ? '#ffd489' : '#9fe8ff') : '#171022';
    g.fillRect(x, y, 7, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(text, colorCss) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 96);
  g.font = '900 54px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = colorCss; g.shadowBlur = 26;
  g.fillStyle = colorCss;
  g.fillText(text, 256, 50); g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  const state = { dusk: 0.6, signs: [], lampMat: null, winMat: null, water: null, dome: null, sun: null, hemi: null };

  // ---- sky dome (vertex-coloured) ----
  {
    const geo = new THREE.SphereGeometry(2600, 24, 12);
    const pos = geo.attributes.position; const cols = [];
    const top = new THREE.Color(0x2c4a8a), mid = new THREE.Color(0xff8a5c), bot = new THREE.Color(0x30133f);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 2600;
      const c = y > 0.25 ? mid.clone().lerp(top, (y - 0.25) / 0.75) : bot.clone().lerp(mid, (y + 0.4) / 0.65);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    state.dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
    scene.add(state.dome);
  }
  scene.fog = new THREE.Fog(0xd96a4e, 260, 1500);
  state.hemi = new THREE.HemisphereLight(0xffd9b0, 0x2c1e4a, 0.95);
  scene.add(state.hemi);
  state.sun = new THREE.DirectionalLight(0xffb37a, 1.6);
  state.sun.position.set(-420, 300, -180);
  scene.add(state.sun);
  scene.add(new THREE.AmbientLight(0x604a7a, 0.36));

  // ---- terrain ----
  {
    const SIZE = 1500, SEG = 110;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; const cols = [];
    const sand = new THREE.Color(0xa87f4e), grass = new THREE.Color(0x55703f), urban = new THREE.Color(0x6b6570),
      rock = new THREE.Color(0x8a7a68), deep = new THREE.Color(0x1d4e5e);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 110, z = pos.getZ(i);
      pos.setX(i, x);
      const h = heightAt(x, z);
      pos.setY(i, h);
      let c;
      if (h < -0.6) c = deep; else if (h < 0.35) c = sand;
      else if (h > 16) c = rock; else c = grass.clone().lerp(urban, clamp(1 - Math.hypot(x, z) / 430, 0, 0.75));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
  // ---- water ----
  {
    const geo = new THREE.PlaneGeometry(5200, 5200);
    geo.rotateX(-Math.PI / 2);
    state.water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x175d7d, transparent: true, opacity: 0.88, shininess: 120, specular: 0xff9a5c }));
    state.water.position.set(110, -1.15, 0);
    scene.add(state.water);
  }

  // ---- roads: ribbons along the curves ----
  {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2c2833 });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c98a });
    const dashes = [];
    for (const road of ROADS) {
      const pts = road.pts, verts = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const pn = pts[Math.min(i + 1, pts.length - 1)], pp = pts[Math.max(i - 1, 0)];
        let dx = pn.x - pp.x, dz = pn.z - pp.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        const px = -dz, pz = dx, hw = road.width / 2;
        const y1 = heightAt(p.x + px * hw, p.z + pz * hw) + 0.30, y2 = heightAt(p.x - px * hw, p.z - pz * hw) + 0.30;
        verts.push(p.x + px * hw, y1, p.z + pz * hw, p.x - px * hw, y2, p.z - pz * hw);
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        if (i % 3 === 0) dashes.push({ x: p.x, z: p.z, rot: Math.atan2(dx, dz) });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, mat));
    }
    const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3.4);
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    dashes.forEach((d, i) => {
      e.set(0, d.rot, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(d.x, heightAt(d.x, d.z) + 0.37, d.z), q, s);
      inst.setMatrixAt(i, m4);
    });
    scene.add(inst);
  }

  // ---- buildings (instanced, window texture, dusk emissive) ----
  {
    const tex = windowTexture();
    state.winMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffc37a, emissiveMap: tex, emissiveIntensity: 0.25 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, state.winMat, BUILDINGS.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    BUILDINGS.forEach((b, i) => {
      e.set(0, b.rot, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(b.x, heightAt(b.x, b.z) - 0.4, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, new THREE.Color(b.tone));
      colliders.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.60 });
    });
    scene.add(inst);
  }

  // ---- neon signs on boulevard buildings ----
  {
    const ring = ROADS[0].pts;
    const near = BUILDINGS.filter(b => ring.some((p, i) => i % 4 === 0 && (p.x - b.x) ** 2 + (p.z - b.z) ** 2 < 42 ** 2));
    NEON_SIGNS.forEach((name, i) => {
      const b = near[(i * 3) % Math.max(near.length, 1)] || BUILDINGS[i * 7 % BUILDINGS.length];
      if (!b) return;
      const col = NEON_COLORS[i % NEON_COLORS.length];
      const css = '#' + col.toString(16).padStart(6, '0');
      const mat = new THREE.MeshBasicMaterial({ map: signTexture(name, css), transparent: true, side: THREE.DoubleSide, fog: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(17, 3.2), mat);
      const toRoad = Math.atan2(-b.z, -b.x); // face island centre-ish / road
      sign.position.set(b.x + Math.cos(toRoad) * (b.w * 0.62), heightAt(b.x, b.z) + Math.min(b.h * 0.72, 15), b.z + Math.sin(toRoad) * (b.w * 0.62));
      sign.rotation.y = -toRoad + Math.PI / 2 + Math.PI;
      scene.add(sign);
      state.signs.push(mat);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.04, 0.35, b.d * 1.04),
        new THREE.MeshBasicMaterial({ color: col, fog: false }));
      strip.position.set(b.x, heightAt(b.x, b.z) + b.h - 0.2, b.z);
      strip.rotation.y = b.rot;
      scene.add(strip);
      state.signs.push(strip.material);
    });
  }

  // ---- palms + lamps (instanced) ----
  {
    const spots = [];
    ROADS[0].pts.forEach((p, i) => { if (i % 2 === 0) spots.push(p); });
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 5); trunkGeo.translate(0, 3.25, 0);
    const crownGeo = new THREE.ConeGeometry(3.4, 1.6, 7); crownGeo.translate(0, 6.9, 0);
    const trunkI = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5c40 }), spots.length);
    const crownI = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x3f8f4f }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    spots.forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      const x = p.x + side * 10.5, z = p.z + ((i * 37) % 13) - 6;
      e.set(rng.range(-0.06, 0.06), rng.range(0, 3), rng.range(-0.06, 0.06)); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(1, rng.range(0.85, 1.25), 1));
      trunkI.setMatrixAt(i, m4); crownI.setMatrixAt(i, m4);
    });
    scene.add(trunkI); scene.add(crownI);

    const lampPts = [];
    ROADS.forEach(r => r.pts.forEach((p, i) => { if (i % 5 === 0) lampPts.push(p); }));
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 4); poleGeo.translate(0, 2.8, 0);
    const bulbGeo = new THREE.SphereGeometry(0.34, 6, 5); bulbGeo.translate(0, 5.7, 0);
    state.lampMat = new THREE.MeshBasicMaterial({ color: 0xffca7a, fog: false });
    const poleI = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x333340 }), lampPts.length);
    const bulbI = new THREE.InstancedMesh(bulbGeo, state.lampMat, lampPts.length);
    lampPts.forEach((p, i) => {
      const x = p.x + ((i % 2) ? 7.6 : -7.6), z = p.z + ((i * 53) % 7) - 3;
      m4.compose(new THREE.Vector3(x, heightAt(x, z), z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      poleI.setMatrixAt(i, m4); bulbI.setMatrixAt(i, m4);
    });
    scene.add(poleI); scene.add(bulbI);
  }

  state.update = (t, dt) => {
    if (state.water) state.water.position.y = -1.15 + Math.sin(t * 0.5) * 0.08;
    const flick = 0.92 + 0.08 * Math.sin(t * 13.7) * Math.sin(t * 7.3);
    state.signs.forEach((m, i) => { if (m.opacity !== undefined) m.opacity = (i % 5 === 0 && Math.sin(t * 2.1 + i) < -0.92) ? 0.55 : flick; });
  };
  state.setDusk = (d) => {
    state.dusk = d;
    if (state.winMat) state.winMat.emissiveIntensity = lerp(0.06, 0.85, d);
    if (state.lampMat) state.lampMat.color.setScalar(0).offsetHSL(0.09, 0.75, lerp(0.25, 0.62, d));
    scene.fog.color.setHex(d > 0.75 ? 0x2a1440 : 0xd96a4e);
    state.sun.intensity = lerp(1.9, 1.15, d);
    state.hemi.intensity = lerp(1.05, 0.7, d);
  };
  state.setDusk(0.6);
  return state;
}

export function groundY(x, z) { return heightAt(x, z); }
