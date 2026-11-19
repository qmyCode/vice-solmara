// combat.js — one job: gunfire. Hitscan weapons (fists, pistol, SMG) with tracers, muzzle
// flash and impact bursts, resolved against cars, pedestrians, mission targets and the terrain
// itself. Whoever pulls the trigger owns the consequences: this module reports what was hit and
// applies damage, and the caller (player, or a mission guard) reports the crime.

import * as THREE from 'three';

export const WEAPONS = {
  fists: { name: 'PUÑOS', melee: true, dmg: 26, rate: 0.42, range: 2.6 },
  pistol: { name: 'PISTOLA', dmg: 34, rate: 0.34, range: 95, spread: 0.008, auto: false },
  smg: { name: 'SMG', dmg: 15, rate: 0.088, range: 85, spread: 0.03, auto: true },
};

export function createCombat(G) {
  const scene = G.scene;
  const targets = []; // mission-registered shootables: {x,y,z,r,alive,hit(dmg)}

  // tracer pool
  const tracers = [];
  for (let i = 0; i < 26; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerHead = 0;
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({
    map: G.glowTex, color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  muzzle.scale.set(1.5, 1.5, 1);
  scene.add(muzzle);
  let muzzleT = 1;

  function drawTracer(a, b, color = 0xffd9a0) {
    const t = tracers[tracerHead];
    tracerHead = (tracerHead + 1) % tracers.length;
    const p = t.line.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z);
    p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.visible = true;
    t.life = 0.09;
  }

  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return -1;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 > r * r) return -1;
    return tca - Math.sqrt(r * r - d2);
  }

  /** Fire one shot from origin along dir (normalized). Returns what was hit. */
  function shoot(ox, oy, oz, dx, dy, dz, weaponKey) {
    const w = WEAPONS[weaponKey];
    if (w.melee) return melee(ox, oy, oz, dx, dz);
    let bestT = w.range;
    let hit = { kind: 'world', x: ox + dx * w.range, y: oy + dy * w.range, z: oz + dz * w.range };
    for (const car of G.vehicles.cars) {
      if (car.dead) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, car.x, car.y + 0.8, car.z, Math.max(car.spec.len, car.spec.wid) * 0.55);
      if (t > 0 && t < bestT) {
        bestT = t;
        hit = { kind: 'car', car, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
      }
    }
    for (const ped of G.peds.peds) {
      if (ped.dead) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, ped.x, ped.y + 1.05, ped.z, 0.85);
      if (t > 0 && t < bestT) {
        bestT = t;
        hit = { kind: 'ped', ped, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
      }
    }
    for (const tg of targets) {
      if (!tg.alive) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, tg.x, tg.y + 1.05, tg.z, tg.r || 0.95);
      if (t > 0 && t < bestT) {
        bestT = t;
        hit = { kind: 'target', target: tg, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t };
      }
    }
    // terrain: march the ray down to the ground
    {
      let t = 4;
      while (t < bestT) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < G.city.heightAt(x, z) + 0.1) {
          bestT = t;
          hit = { kind: 'world', x, y, z };
          break;
        }
        t += 2.5;
      }
    }
    const muzzlePos = { x: ox, y: oy, z: oz };
    drawTracer(muzzlePos, hit);
    muzzle.position.set(ox + dx * 0.7, oy + dy * 0.7, oz + dz * 0.7);
    muzzle.material.opacity = 0.95;
    muzzleT = 0;
    if (G.audio) G.audio.shot(weaponKey);
    if (hit.kind === 'car') {
      G.vehicles.damage(hit.car, w.dmg, G.onVehicleEvent);
      G.fx.burst(hit.x, hit.y, hit.z, 0xffb35a, 7, 6, 1.8, 0.3);
    } else if (hit.kind === 'ped') {
      hit.ped.health -= w.dmg;
      G.fx.burst(hit.x, hit.y, hit.z, 0xd93a3a, 8, 4, 2, 0.35);
      if (hit.ped.health <= 0) { G.peds.kill(hit.ped); hit.killed = true; }
    } else if (hit.kind === 'target') {
      hit.target.hit(w.dmg);
      G.fx.burst(hit.x, hit.y, hit.z, 0xd93a3a, 8, 4, 2, 0.35);
    } else {
      G.fx.burst(hit.x, hit.y, hit.z, 0xbfae96, 5, 3, 1.6, 0.3);
    }
    return hit;
  }

  /** A swing of the fists: the nearest living thing in front takes it. */
  function melee(ox, oy, oz, dx, dz) {
    let best = null, bestD = 2.6;
    for (const ped of G.peds.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - ox, ped.z - oz);
      const dot = (ped.x - ox) * dx + (ped.z - oz) * dz;
      if (d < bestD && dot > 0) { best = { kind: 'ped', ped, x: ped.x, y: ped.y + 1, z: ped.z }; bestD = d; }
    }
    for (const car of G.vehicles.cars) {
      if (car.dead) continue;
      const d = Math.hypot(car.x - ox, car.z - oz) - car.radius;
      if (d < bestD) { best = { kind: 'car', car, x: ox + dx * 2, y: oy, z: oz + dz * 2 }; bestD = d; }
    }
    if (!best) return { kind: 'none' };
    if (best.kind === 'ped') {
      best.ped.health -= WEAPONS.fists.dmg;
      G.fx.burst(best.x, best.y, best.z, 0xffffff, 4, 3, 1.6, 0.25);
      if (best.ped.health <= 0) { G.peds.kill(best.ped); best.killed = true; }
    } else {
      G.vehicles.damage(best.car, WEAPONS.fists.dmg * 0.4, G.onVehicleEvent);
      G.fx.burst(best.x, best.y, best.z, 0xffb35a, 5, 4, 1.6, 0.25);
    }
    if (G.audio) G.audio.punch();
    return best;
  }

  function update(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (muzzleT < 0.05) {
      muzzleT += dt;
      muzzle.material.opacity = 0.95 * (1 - muzzleT / 0.05);
    } else muzzle.material.opacity = 0;
  }

  return { shoot, melee, drawTracer, update, targets, WEAPONS };
}
