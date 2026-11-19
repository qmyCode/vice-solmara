// explosions.js — one job: things blowing up, convincingly.
// A pooled particle system (fire, smoke, sparks), rigid debris chunks with
// gravity, a shockwave ring, a point-light flash, scorch marks on the
// ground, and blast damage with vehicle chain reactions.

import * as THREE from 'three';
import { heightAt } from './city.js';
import { liveRng as rng } from './rng.js';

const MAXP = 900;
export class ExplosionSystem {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks; // { onBlast(x,z,r,power), onBoom(intensity) }
    // Particle pool as THREE.Points with per-particle velocity/life in JS arrays.
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.maxLife = new Float32Array(MAXP);
    this.kind = new Uint8Array(MAXP); // 0 fire, 1 smoke, 2 spark
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    // Debris chunks.
    this.debris = [];
    const dGeo = new THREE.BoxGeometry(0.55, 0.4, 0.7);
    for (let i = 0; i < 42; i++) {
      const m = new THREE.Mesh(dGeo, new THREE.MeshLambertMaterial({ color: 0x2a2a33 }));
      m.visible = false;
      scene.add(m);
      this.debris.push({ mesh: m, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, life: 0 });
    }
    // Shockwave rings + lights + fireballs.
    this.rings = [];
    const rGeo = new THREE.RingGeometry(0.8, 1, 40); rGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ color: 0xffc37a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.rings.push({ mesh: m, t: 1e9, x: 0, z: 0, power: 1 });
    }
    this.balls = [];
    const bGeo = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xffa63f, transparent: true, opacity: 0, fog: false }));
      m.visible = false; scene.add(m);
      const l = new THREE.PointLight(0xff8a3f, 0, 60); scene.add(l);
      this.balls.push({ mesh: m, light: l, t: 1e9, power: 1 });
    }
    this.scorches = [];
    const sGeo = new THREE.CircleGeometry(1, 20); sGeo.rotateX(-Math.PI / 2);
    this.scorchMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(sGeo, this.scorchMat);
      m.visible = false; scene.add(m); this.scorches.push(m);
    }
    this.scorchI = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, kind, r, g, b) {
    const i = this.head; this.head = (this.head + 1) % MAXP;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.kind[i] = kind;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
  }
  explode(x, z, power = 1) {
    const y = heightAt(x, z) + 1;
    const n = Math.floor(90 * power);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), sp = rng.range(1, 9) * power, up = rng.range(2, 11) * power;
      const fire = i < n * 0.55;
      this.spawn(x, y + rng.range(0, 1.4), z, Math.cos(a) * sp, up, Math.sin(a) * sp,
        rng.range(0.4, 1.1), fire ? 0 : 2,
        fire ? 1 : 1, fire ? rng.range(0.45, 0.75) : 0.95, fire ? 0.12 : 0.55);
    }
    for (let i = 0; i < 26 * power; i++) { // smoke
      const a = rng.range(0, Math.PI * 2), sp = rng.range(0.5, 3);
      this.spawn(x, y + rng.range(0.5, 2.5), z, Math.cos(a) * sp, rng.range(2.5, 6), Math.sin(a) * sp,
        rng.range(1.4, 2.8), 1, 0.16, 0.14, 0.16);
    }
    let dn = 0;
    for (const d of this.debris) {
      if (dn >= 9 * power) break;
      if (d.life > 0) continue;
      dn++;
      d.life = rng.range(1.2, 2.4);
      d.mesh.visible = true;
      d.mesh.position.set(x + rng.range(-1, 1), y + 0.5, z + rng.range(-1, 1));
      const a = rng.range(0, Math.PI * 2), sp = rng.range(3, 11) * power;
      d.vx = Math.cos(a) * sp; d.vz = Math.sin(a) * sp; d.vy = rng.range(6, 14) * power;
      d.rx = rng.range(-6, 6); d.rz = rng.range(-6, 6);
      d.mesh.material.color.setHex(rng.pick([0x2a2a33, 0x4a2c1c, 0x63351f, 0x1c1c22]));
    }
    const ring = this.rings.find(r => r.t > 1) || this.rings[0];
    ring.t = 0; ring.x = x; ring.z = z; ring.power = power; ring.mesh.visible = true;
    const ball = this.balls.find(b => b.t > 1) || this.balls[0];
    ball.t = 0; ball.power = power;
    ball.mesh.visible = true;
    ball.mesh.position.set(x, y + 0.8, z);
    ball.light.position.set(x, y + 2.5, z);
    const sc = this.scorches[this.scorchI++ % this.scorches.length];
    sc.visible = true;
    sc.scale.setScalar(4.4 * power);
    sc.position.set(x, heightAt(x, z) + 0.16, z);
    if (this.hooks.onBlast) this.hooks.onBlast(x, z, 11 * power, 65 * power);
    if (this.hooks.onBoom) this.hooks.onBoom(power);
  }
  // Continuous emitter for burning wrecks.
  emitFire(x, z, dt, big = false) {
    if (rng.chance(big ? 0.95 : 0.6)) {
      const y = heightAt(x, z) + 1.1;
      this.spawn(x + rng.range(-0.7, 0.7), y, z + rng.range(-0.7, 0.7),
        rng.range(-0.4, 0.4), rng.range(2.5, 5), rng.range(-0.4, 0.4),
        rng.range(0.3, 0.7), 0, 1, rng.range(0.4, 0.65), 0.1);
    }
    if (rng.chance(0.5)) {
      const y = heightAt(x, z) + 2;
      this.spawn(x, y, z, rng.range(-0.3, 0.3), rng.range(2, 4), rng.range(-0.3, 0.3),
        rng.range(1.2, 2.2), 1, 0.15, 0.13, 0.15);
    }
  }
  update(dt) {
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt;
      const k = this.kind[i];
      this.vel[i * 3 + 1] += (k === 1 ? 1.6 : k === 0 ? 2.6 : -16) * dt;
      this.vel[i * 3] *= (1 - 1.4 * dt); this.vel[i * 3 + 2] *= (1 - 1.4 * dt);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (k !== 1) { // fire/spark cool toward smoke grey
        const f = Math.max(0, this.life[i] / this.maxLife[i]);
        if (k === 0) { this.col[i * 3 + 1] = 0.55 * f + 0.08; }
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const d of this.debris) {
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      d.life -= dt;
      d.vy -= 22 * dt;
      d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
      const gy = heightAt(d.mesh.position.x, d.mesh.position.z) + 0.25;
      if (d.mesh.position.y < gy) { d.mesh.position.y = gy; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; }
      d.mesh.rotation.x += d.rx * dt; d.mesh.rotation.z += d.rz * dt;
    }
    for (const r of this.rings) {
      if (r.t > 1) { r.mesh.visible = false; continue; }
      r.t += dt * 1.9;
      const s = 1 + r.t * 26 * r.power;
      r.mesh.scale.setScalar(s);
      r.mesh.position.set(r.x, heightAt(r.x, r.z) + 0.3, r.z);
      r.mesh.material.opacity = Math.max(0, 0.65 * (1 - r.t));
    }
    for (const b of this.balls) {
      if (b.t > 1) { b.mesh.visible = false; b.light.intensity = 0; continue; }
      b.t += dt * 2.6;
      const s = (0.6 + Math.sin(Math.min(b.t, 1) * Math.PI * 0.5) * 4.6) * b.power;
      b.mesh.scale.setScalar(Math.max(0.01, s * (1 - b.t * 0.55)));
      b.mesh.material.opacity = Math.max(0, 0.9 * (1 - b.t));
      b.mesh.material.color.setHSL(0.07 - b.t * 0.045, 1, 0.55 - b.t * 0.12);
      b.light.intensity = Math.max(0, 260 * (1 - b.t)) * b.power;
    }
  }
}
