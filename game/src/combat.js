// combat.js — one job: violence. Hitscan weapons (fists, pistol, SMG) with tracers, muzzle
// flash and impact puffs; ray tests against cars, people and building boxes; and the armed
// guards missions set against the player, who close in, strafe and fire back in bursts.
import * as THREE from '../vendor/three.module.js';
import { clamp, dist2d } from './rng.js';
import { makeFigure } from './pedestrians.js';
import { damageVehicle } from './vehicles.js';

export const WEAPONS = {
  fists: { name: 'Fists', dmg: 26, rate: 0.38, range: 2.4, auto: false, spread: 0 },
  pistol: { name: 'Pistol', dmg: 34, rate: 0.3, range: 110, auto: false, spread: 0.008 },
  smg: { name: 'SMG', dmg: 15, rate: 0.088, range: 95, auto: true, spread: 0.034 },
};

export function createCombat(G) {
  const tracers = [];
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    G.scene.add(line);
    tracers.push({ line, t: 1e9 });
  }
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,190,1)');
    grad.addColorStop(0.4, 'rgba(255,180,60,0.7)');
    grad.addColorStop(1, 'rgba(255,140,30,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const flashes = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(1.4, 1.4, 1);
    G.scene.add(s);
    flashes.push({ s, t: 1e9 });
  }
  let tracerHead = 0, flashHead = 0;
  const guards = [];

  function rayHit(origin, dir, maxDist, shooter) {
    let best = maxDist, hit = null;
    // vehicles: two spheres along the body
    for (const v of G.vehicles) {
      if (shooter && shooter.car === v) continue;
      const p = v.mesh.position;
      for (const off of [-0.9, 0.9]) {
        const cx = p.x + Math.sin(v.angle) * off, cz = p.z + Math.cos(v.angle) * off;
        const ox = origin.x - cx, oy = origin.y - (p.y + 0.85), oz = origin.z - cz;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - 1.55 * 1.55;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < best) { best = t; hit = { kind: 'car', v, t }; }
      }
    }
    // people
    const testPerson = (x, y, z, r, ref, kind) => {
      const ox = origin.x - x, oy = origin.y - y, oz = origin.z - z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) { best = t; hit = { kind, ref, t }; }
    };
    for (const ped of G.peds.list) {
      if (ped.dead || ped === shooter?.pedRef) continue;
      testPerson(ped.mesh.position.x, ped.mesh.position.y + 1.05, ped.mesh.position.z, 0.62, ped, 'ped');
    }
    for (const gd of guards) {
      if (gd.dead) continue;
      testPerson(gd.mesh.position.x, gd.mesh.position.y + 1.05, gd.mesh.position.z, 0.62, gd, 'guard');
    }
    // buildings: ray vs OBB slabs for boxes within range
    for (const col of G.city.colliders) {
      const dx = col.x - origin.x, dz = col.z - origin.z;
      if (dx * dx + dz * dz > (maxDist + col.hw + col.hd) * (maxDist + col.hw + col.hd)) continue;
      const cos = Math.cos(-col.rot), sin = Math.sin(-col.rot);
      const lox = dx * cos - dz * sin, loz = dx * sin + dz * cos;
      const ldx = dir.x * cos - dir.z * sin, ldz = dir.x * sin + dir.z * cos;
      let tmin = 0, tmax = best;
      let ok = true;
      for (const [o, d, e] of [[lox, ldx, col.hw], [loz, ldz, col.hd]]) {
        if (Math.abs(d) < 1e-8) { if (Math.abs(o) > e) { ok = false; break; } }
        else {
          let t1 = (-e - o) / d, t2 = (e - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin < best && tmin > 0) { best = tmin; hit = { kind: 'wall', t: tmin }; }
    }
    // ground: march until under the terrain
    {
      let t = 2;
      let px = origin.x, py = origin.y, pz = origin.z;
      while (t < best) {
        px = origin.x + dir.x * t; py = origin.y + dir.y * t; pz = origin.z + dir.z * t;
        if (py < G.city.height(px, pz)) { best = t; hit = { kind: 'ground', t }; break; }
        t += 1.6;
      }
    }
    const point = { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best };
    return { hit, point, dist: best };
  }

  /** Fire one shot. shooter: {pedRef?, car?, isPlayer}. Returns true if a shot happened. */
  function fire(shooter, origin, dirRaw, weaponKey) {
    const w = WEAPONS[weaponKey];
    if (!w) return false;
    if (weaponKey === 'fists') {
      const fx = dirRaw.x, fz = dirRaw.z;
      for (const ped of G.peds.list) {
        if (ped.dead) continue;
        const dx = ped.mesh.position.x - origin.x, dz = ped.mesh.position.z - origin.z;
        if (dx * fx + dz * fz > 0.4 && Math.hypot(dx, dz) < w.range) { G.peds.hurt(ped, w.dmg, origin.x, origin.z); break; }
      }
      for (const gd of guards) {
        if (gd.dead) continue;
        const dx = gd.mesh.position.x - origin.x, dz = gd.mesh.position.z - origin.z;
        if (dx * fx + dz * fz > 0.4 && Math.hypot(dx, dz) < w.range) { hurtGuard(gd, w.dmg, origin); break; }
      }
      if (G.audio) G.audio.punch();
      return true;
    }
    const dir = { ...dirRaw };
    dir.x += (Math.random() - 0.5) * 2 * w.spread;
    dir.y += (Math.random() - 0.5) * 2 * w.spread;
    dir.z += (Math.random() - 0.5) * 2 * w.spread;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;
    const { hit, point } = rayHit(origin, dir, w.range, shooter);
    // tracer + muzzle flash
    const tr = tracers[tracerHead]; tracerHead = (tracerHead + 1) % tracers.length;
    tr.t = 0;
    const posAttr = tr.line.geometry.attributes.position;
    posAttr.setXYZ(0, origin.x, origin.y, origin.z);
    posAttr.setXYZ(1, point.x, point.y, point.z);
    posAttr.needsUpdate = true;
    tr.line.material.opacity = 0.85;
    const fl = flashes[flashHead]; flashHead = (flashHead + 1) % flashes.length;
    fl.t = 0;
    fl.s.position.set(origin.x + dir.x * 0.4, origin.y + dir.y * 0.4, origin.z + dir.z * 0.4);
    fl.s.material.opacity = 0.95;
    if (G.audio) G.audio.shot(weaponKey);
    if (hit) {
      if (hit.kind === 'car') {
        damageVehicle(G, hit.v, w.dmg, 'shot');
        G.explosions.puff(point.x, point.y, point.z, 'fire');
        if (shooter.isPlayer) G.police?.reportCrime('carShot', point.x, point.z, 0.8);
      } else if (hit.kind === 'ped') {
        G.peds.hurt(hit.ref, w.dmg, origin.x, origin.z);
        if (shooter.isPlayer) G.police?.reportCrime('pedShot', point.x, point.z, 1);
      } else if (hit.kind === 'guard') {
        hurtGuard(hit.ref, w.dmg, origin);
      } else {
        G.explosions.puff(point.x, point.y, point.z, 'smoke');
      }
    }
    if (shooter.isPlayer) G.police?.reportCrime('shots', origin.x, origin.z, 0.55);
    // bystanders scatter
    for (const ped of G.peds.list) {
      if (!ped.dead && dist2d(ped.mesh.position.x, ped.mesh.position.z, origin.x, origin.z) < 17) G.peds.flee(ped, origin.x, origin.z);
    }
    return true;
  }

  function spawnGuard(x, z, opts = {}) {
    const mesh = makeFigure(opts.shirt ?? 0x23272e, opts.skin ?? 0xc68863, 0x101010);
    mesh.position.set(x, G.city.height(x, z), z);
    G.scene.add(mesh);
    const guard = {
      mesh, health: opts.health ?? 60, dead: false, angle: 0,
      burst: 0, burstWait: Math.random() * 1.2 + 0.4, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
      role: 'guard',
    };
    guards.push(guard);
    return guard;
  }
  function hurtGuard(guard, dmg, from) {
    if (guard.dead) return;
    guard.health -= dmg;
    if (guard.health <= 0) {
      guard.dead = true;
      guard.mesh.rotation.x = -Math.PI / 2;
      guard.mesh.position.y = G.city.height(guard.mesh.position.x, guard.mesh.position.z) + 0.24;
      if (G.onGuardDown) G.onGuardDown(guard);
    }
  }
  function clearGuards() {
    for (const gd of guards) G.scene.remove(gd.mesh);
    guards.length = 0;
  }
  function update(dt) {
    for (const tr of tracers) {
      if (tr.t > 0.07) { tr.line.material.opacity = 0; continue; }
      tr.t += dt;
      tr.line.material.opacity = 0.85 * (1 - tr.t / 0.07);
    }
    for (const fl of flashes) {
      if (fl.t > 0.05) { fl.s.material.opacity = 0; continue; }
      fl.t += dt;
      fl.s.material.opacity = 0.95 * (1 - fl.t / 0.05);
    }
    if (!G.player || G.player.health <= 0) return;
    const pp = G.playerPos();
    for (const gd of guards) {
      if (gd.dead) continue;
      const pos = gd.mesh.position;
      const d = dist2d(pos.x, pos.z, pp.x, pp.z);
      if (d > 60) continue;
      const desired = Math.atan2(pp.x - pos.x, pp.z - pos.z);
      gd.angle += clamp(((desired - gd.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -4 * dt, 4 * dt);
      gd.mesh.rotation.y = gd.angle;
      // keep a firing distance, strafing sideways
      gd.strafeT -= dt;
      if (gd.strafeT <= 0) { gd.strafeDir *= -1; gd.strafeT = 1.1 + Math.random() * 1.4; }
      let mx = 0, mz = 0;
      const fx = Math.sin(gd.angle), fz = Math.cos(gd.angle);
      if (d > 21) { mx = fx; mz = fz; }
      else if (d < 9) { mx = -fx; mz = -fz; }
      mx += -fz * gd.strafeDir * 0.7; mz += fx * gd.strafeDir * 0.7;
      const ml = Math.hypot(mx, mz) || 1;
      const nx = pos.x + (mx / ml) * 2.6 * dt, nz = pos.z + (mz / ml) * 2.6 * dt;
      if (G.city.height(nx, nz) > 0.1) { pos.x = nx; pos.z = nz; }
      pos.y = G.city.height(pos.x, pos.z);
      gd.mesh.userData.legL.rotation.x = Math.sin(performance.now() * 0.012) * 0.4;
      gd.mesh.userData.legR.rotation.x = -Math.sin(performance.now() * 0.012) * 0.4;
      // fire bursts at the player
      if (gd.burst > 0) {
        gd.burst -= dt;
        gd.burstAcc = (gd.burstAcc || 0) + dt;
        if (gd.burstAcc > 0.13) {
          gd.burstAcc = 0;
          const origin = { x: pos.x, y: pos.y + 1.35, z: pos.z };
          const target = { x: pp.x, y: pp.y + 1.1, z: pp.z };
          const dir = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
          const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
          dir.x /= l; dir.y /= l; dir.z /= l;
          const hitChance = clamp(0.62 - d * 0.008, 0.14, 0.6);
          const tr = tracers[tracerHead]; tracerHead = (tracerHead + 1) % tracers.length;
          tr.t = 0;
          const pa = tr.line.geometry.attributes.position;
          const end = Math.random() < hitChance ? target : { x: target.x + (Math.random() - 0.5) * 3, y: target.y + Math.random() * 1.4, z: target.z + (Math.random() - 0.5) * 3 };
          pa.setXYZ(0, origin.x, origin.y, origin.z);
          pa.setXYZ(1, end.x, end.y, end.z);
          pa.needsUpdate = true;
          tr.line.material.opacity = 0.7;
          if (G.audio) G.audio.shot('pistol');
          if (end === target && G.hurtPlayer) G.hurtPlayer(5.5, pos.x, pos.z);
        }
      } else {
        gd.burstWait -= dt;
        if (gd.burstWait <= 0 && d < 46) { gd.burst = 0.55; gd.burstWait = 1.1 + Math.random() * 1.3; gd.burstAcc = 0.2; }
      }
    }
  }

  return { fire, spawnGuard, hurtGuard, clearGuards, update, guards, WEAPONS };
}
