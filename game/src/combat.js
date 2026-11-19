// combat.js — one job: gunfire. Hitscan weapons (pistol, SMG) with tracers,
// muzzle flash, impact sparks, and damage against cars, citizens and
// guards. Fists are a shove. Everything routes through hooks so missions
// and police can react to shots fired and things destroyed.

import * as THREE from 'three';
import { heightAt } from './city.js';
import { liveRng as rng } from './rng.js';

export const WEAPONS = [
  { name: 'PUÑOS', dmg: 6, range: 2.4, cooldown: 0.34, spread: 0 },
  { name: 'PISTOLA', dmg: 16, range: 70, cooldown: 0.30, spread: 0.016 },
  { name: 'SMG', dmg: 10, range: 62, cooldown: 0.085, spread: 0.045 },
];

export class Combat {
  constructor(scene, hooks) {
    this.scene = scene; this.hooks = hooks;
    this.tracers = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 14; i++) {
      const line = new THREE.Line(geo.clone(), new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, fog: false }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, t: 1e9 });
    }
    this.flash = new THREE.PointLight(0xffc37a, 0, 22);
    scene.add(this.flash);
    this.cooldowns = [0, 0, 0];
  }
  // Fire from (x,z) facing angle; returns true if a shot happened.
  shoot(dt, x, z, angle, weaponIdx, cars, peds) {
    this.cooldowns[weaponIdx] -= dt;
    if (this.cooldowns[weaponIdx] > 0) return false;
    const w = WEAPONS[weaponIdx];
    this.cooldowns[weaponIdx] = w.cooldown;
    const y = heightAt(x, z) + 1.45;
    const a = angle + rng.range(-w.spread, w.spread) * 8;
    const dx = -Math.sin(a), dz = -Math.cos(a);
    if (this.hooks.onShot) this.hooks.onShot(weaponIdx);
    if (weaponIdx === 0) { // fists: shove whatever is in front
      for (const p of peds) {
        if (Math.hypot(p.x - x, p.z - z) < w.range + 0.6) { p.hurt(w.dmg); if (this.hooks.onPedHit) this.hooks.onPedHit(p); }
      }
      return true;
    }
    // Nearest target along the ray.
    let bestT = w.range, bestCar = null, bestPed = null;
    for (const c of cars) {
      if (c.dead && c.burning <= 0) continue;
      const rx = c.x - x, rz = c.z - z;
      const t = rx * dx + rz * dz;
      if (t < 1 || t > bestT) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      if (Math.hypot(px, pz) < 2.1) { bestT = t; bestCar = c; bestPed = null; }
    }
    for (const p of peds) {
      if (p.state === 'down') continue;
      const rx = p.x - x, rz = p.z - z;
      const t = rx * dx + rz * dz;
      if (t < 1 || t > bestT) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      if (Math.hypot(px, pz) < 0.85) { bestT = t; bestPed = p; bestCar = null; }
    }
    const ex = x + dx * bestT, ez = z + dz * bestT, ey = heightAt(ex, ez) + 1.2;
    const tr = this.tracers.find(tr => tr.t > 0.12) || this.tracers[0];
    tr.t = 0;
    const pos = tr.line.geometry.attributes.position;
    pos.setXYZ(0, x + dx * 1.2, y, z + dz * 1.2);
    pos.setXYZ(1, ex, ey, ez);
    pos.needsUpdate = true;
    tr.line.material.opacity = 0.9;
    this.flash.position.set(x + dx * 1.4, y, z + dz * 1.4);
    this.flash.intensity = 40;
    if (bestCar) {
      bestCar.damage(w.dmg);
      if (this.hooks.onCarHit) this.hooks.onCarHit(bestCar);
    } else if (bestPed) {
      bestPed.hurt(w.dmg * 1.6);
      if (this.hooks.onPedHit) this.hooks.onPedHit(bestPed);
    }
    return true;
  }
  update(dt) {
    for (const tr of this.tracers) {
      if (tr.t > 0.12) { tr.line.material.opacity = 0; continue; }
      tr.t += dt;
      tr.line.material.opacity = Math.max(0, 0.9 * (1 - tr.t / 0.12));
    }
    this.flash.intensity *= Math.pow(0.0001, dt * 3);
  }
}
