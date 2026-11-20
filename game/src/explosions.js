// explosions.js — one job: fire. A pooled particle system (fire, smoke, sparks), fireball
// meshes, a flash light, flying debris, scorch marks, and plume/burn emitters that keep
// developing after the first frame instead of peaking as one clean sphere. Blast damage
// falls off with distance and chains into nearby cars a beat later.
import * as THREE from '../vendor/three.module.js';
import { clamp } from './rng.js';

const MAX = 1100;

let spriteTex = null;
function softSprite() {
  if (spriteTex) return spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  spriteTex = new THREE.CanvasTexture(c);
  return spriteTex;
}

function makePoints(size, color, additive, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
  const mat = new THREE.PointsMaterial({ size, map: softSprite(), vertexColors: true, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

export function createExplosions(G) {
  const scene = G.scene;
  const pools = {
    fire: { points: makePoints(1.7, 0xffffff, true, 0.95), parts: [], head: 0 },
    smoke: { points: makePoints(3.1, 0xffffff, false, 0.3), parts: [], head: 0 },
    spark: { points: makePoints(0.55, 0xffffff, true, 1), parts: [], head: 0 },
  };
  for (const key of Object.keys(pools)) {
    const pool = pools[key];
    for (let i = 0; i < MAX; i++) pool.parts.push({ life: 0, max: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0 });
    scene.add(pool.points);
  }
  const flash = new THREE.PointLight(0xffa640, 0, 60, 1.6);
  scene.add(flash);
  const fireballs = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    fireballs.push({ mesh: m, t: 1e9 });
  }
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.2, 0.46), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }), 42);
  debris.frustumCulled = false;
  scene.add(debris);
  const debrisState = [];
  for (let i = 0; i < 42; i++) debrisState.push({ life: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, vrx: 0, vrz: 0 });
  const dummy = new THREE.Object3D();
  const scorches = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 18), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    scorches.push({ mesh: m, age: 1e9 });
  }
  const emitters = []; // {x,y,z,t,dur,kind,rate,acc}
  const delayed = []; // {t, fn}

  function spawn(kind, x, y, z, vx, vy, vz, life, r, g, b) {
    const pool = pools[kind];
    const p = pool.parts[pool.head];
    pool.head = (pool.head + 1) % MAX;
    p.life = life; p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.r = r; p.g = g; p.b = b;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function puff(x, y, z, kind) {
    if (kind === 'fire') spawn('fire', x, y, z, rnd(-0.5, 0.5), rnd(1.4, 2.6), rnd(-0.5, 0.5), rnd(0.3, 0.55), 1, 0.55, 0.16);
    else spawn('smoke', x, y, z, rnd(-0.4, 0.4), rnd(1, 2), rnd(-0.4, 0.4), rnd(0.9, 1.6), 0.16, 0.15, 0.15);
  }

  function boom(x, y, z, opts = {}) {
    const radius = opts.radius || 8.5;
    // fireball: fast core, then the plume emitter keeps feeding smoke and flame for ~1.2 s
    const fb = fireballs.reduce((a, b) => (a.t > b.t ? b : a));
    fb.t = 0; fb.mesh.visible = true;
    fb.mesh.position.set(x, y, z);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(1, 7);
      spawn('fire', x, y, z, Math.cos(a) * s, rnd(1.5, 6.5), Math.sin(a) * s, rnd(0.35, 0.8), 1, rnd(0.4, 0.65), 0.12);
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.5, 4);
      spawn('smoke', x, y + 0.5, z, Math.cos(a) * s, rnd(1.6, 3.4), Math.sin(a) * s, rnd(0.9, 1.7), 0.13, 0.12, 0.12);
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(5, 15);
      spawn('spark', x, y, z, Math.cos(a) * s, rnd(2, 10), Math.sin(a) * s, rnd(0.3, 0.8), 1, 0.8, 0.35);
    }
    emitters.push({ x, y, z, t: 0, dur: 1.25, kind: 'plume', rate: 65, acc: 0 });
    if (opts.car) emitters.push({ x, y: y - 0.2, z, t: 0, dur: 16, kind: 'burn', rate: 7, acc: 0, car: opts.car });
    let dn = 0;
    for (const d of debrisState) {
      if (dn >= 11) break;
      if (d.life > 0) continue;
      dn++;
      d.life = rnd(1.2, 2.4); d.x = x; d.y = y; d.z = z;
      const a = Math.random() * Math.PI * 2, s = rnd(3, 11);
      d.vx = Math.cos(a) * s; d.vz = Math.sin(a) * s; d.vy = rnd(5, 13);
      d.rx = rnd(0, 3); d.rz = rnd(0, 3); d.vrx = rnd(-7, 7); d.vrz = rnd(-7, 7);
    }
    flash.position.set(x, y + 1.5, z);
    flash.intensity = 260;
    const sc = scorches.reduce((a, b) => (a.age > b.age ? b : a));
    sc.age = 0; sc.mesh.visible = true;
    sc.mesh.position.set(x, G.city.height(x, z) + 0.16, z);
    sc.mesh.material.opacity = 0.55;
    if (G.audio) G.audio.boom();
    G.shake = Math.min(0.9, (G.shake || 0) + 0.5);
    // blast damage with falloff; cars chain a beat later so a row of wrecks goes up in sequence
    for (const v of G.vehicles) {
      if (opts.car && v === opts.car) continue;
      const d = Math.hypot(v.mesh.position.x - x, v.mesh.position.z - z);
      if (d < radius + 2) {
        const dmg = 85 * (1 - d / (radius + 3));
        if (dmg > 4) delayed.push({ t: 0.12 + d * 0.03, fn: () => G.damageVehicle(v, dmg, 'blast') });
      }
    }
    if (G.onBlast) G.onBlast(x, z, radius);
  }

  function update(dt) {
    for (let i = delayed.length - 1; i >= 0; i--) {
      delayed[i].t -= dt;
      if (delayed[i].t <= 0) { delayed[i].fn(); delayed.splice(i, 1); }
    }
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.t += dt;
      if (e.t > e.dur || (e.car && e.car.mesh.position.y < -5)) { emitters.splice(i, 1); continue; }
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        if (e.kind === 'plume') {
          const rise = e.t / e.dur;
          spawn('smoke', e.x + rnd(-1, 1), e.y + rise * 2, e.z + rnd(-1, 1), rnd(-0.5, 0.5), rnd(1.9, 3.1) * (1 - rise * 0.4), rnd(-0.5, 0.5), rnd(1.1, 1.9), 0.12 + rise * 0.05, 0.11, 0.11);
          if (rise < 0.55) spawn('fire', e.x + rnd(-0.8, 0.8), e.y + rnd(0, 1), e.z + rnd(-0.8, 0.8), rnd(-0.4, 0.4), rnd(2, 3.6), rnd(-0.4, 0.4), rnd(0.3, 0.6), 1, rnd(0.42, 0.6), 0.13);
        } else {
          puff(e.x + rnd(-0.7, 0.7), e.y + 0.5, e.z + rnd(-0.7, 0.7), Math.random() < 0.4 ? 'fire' : 'smoke');
        }
      }
    }
    updatePool('fire', dt, (p) => { p.vy += 2.2 * dt; p.vx *= 0.96; p.vz *= 0.96; });
    updatePool('smoke', dt, (p) => { p.vy += 0.5 * dt; p.vx *= 0.985; p.vz *= 0.985; });
    updatePool('spark', dt, (p) => { p.vy -= 16 * dt; });
    for (const fb of fireballs) {
      if (fb.t > 0.6) { fb.mesh.visible = false; continue; }
      fb.t += dt;
      const k = fb.t / 0.6;
      const s = 1.2 + k * 4.2;
      fb.mesh.scale.set(s, s * 0.82, s); // squashed burst, not a clean sphere
      fb.mesh.material.opacity = 0.55 * (1 - k);
      fb.mesh.position.y += dt * 2.4;
    }
    flash.intensity = Math.max(0, flash.intensity - dt * 620);
    debrisState.forEach((d, i) => {
      if (d.life > 0) {
        d.life -= dt;
        d.vy -= 19 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const ground = G.city.height(d.x, d.z) + 0.15;
        if (d.y < ground) { d.y = ground; d.vy *= -0.35; d.vx *= 0.7; d.vz *= 0.7; }
        d.rx += d.vrx * dt; d.rz += d.vrz * dt;
      }
      dummy.position.set(d.x, d.life > 0 ? d.y : -100, d.z);
      dummy.rotation.set(d.rx, 0, d.rz);
      dummy.updateMatrix();
      debris.setMatrixAt(i, dummy.matrix);
    });
    debris.instanceMatrix.needsUpdate = true;
    for (const sc of scorches) {
      if (sc.age > 70) { sc.mesh.visible = false; continue; }
      sc.age += dt;
      sc.mesh.material.opacity = 0.55 * clamp(1 - sc.age / 70, 0, 1);
    }
  }
  function updatePool(key, dt, drift) {
    const pool = pools[key];
    const pos = pool.points.geometry.attributes.position, col = pool.points.geometry.attributes.color;
    for (let i = 0; i < MAX; i++) {
      const p = pool.parts[i];
      if (p.life > 0) {
        p.life -= dt;
        drift(p);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const f = clamp(p.life / p.max, 0, 1);
        pos.setXYZ(i, p.x, p.y, p.z);
        col.setXYZ(i, p.r * f, p.g * f, p.b * f);
      } else {
        pos.setXYZ(i, 0, -100, 0);
        col.setXYZ(i, 0, 0, 0);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  return { boom, puff, update };
}
