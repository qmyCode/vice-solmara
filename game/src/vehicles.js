// vehicles.js — one job: car meshes and arcade car physics.
// Seven body types built from boxes (body, cabin, wheels, lights), damage
// states (smoke, fire, wreck), and a simple kinematic drive model shared by
// the player, traffic AI and police — only the steering inputs differ.

import * as THREE from 'three';
import { heightAt } from './city.js';
import { clamp } from './rng.js';

export const CAR_TYPES = {
  sedan:  { name: 'Sedán Brisa', w: 1.9, l: 4.3, h: 0.62, cabH: 0.55, top: 34, accel: 15, colors: [0xb8bcc4, 0x4a6a9a, 0x7a3a4a, 0x3f7a5e, 0x8a8f3a] },
  taxi:   { name: 'Taxi Sol', w: 1.9, l: 4.3, h: 0.62, cabH: 0.55, top: 32, accel: 14, colors: [0xffc21f] },
  hatch:  { name: 'Pico 3p', w: 1.75, l: 3.6, h: 0.66, cabH: 0.6, top: 30, accel: 14, colors: [0xd96a4e, 0x5ea8d9, 0xe8e3d8, 0x9a5ec9] },
  pickup: { name: 'Mula 4x4', w: 2.0, l: 4.8, h: 0.85, cabH: 0.6, top: 29, accel: 13, colors: [0x6a7a8a, 0x9a4a2e, 0x4e6a3a] },
  van:    { name: 'Furgón Marea', w: 2.05, l: 5.2, h: 1.15, cabH: 0.5, top: 27, accel: 11, colors: [0xe3ded2, 0x87a8b8, 0xc9b458] },
  sports: { name: 'Águila GT', w: 1.95, l: 4.5, h: 0.5, cabH: 0.42, top: 46, accel: 22, colors: [0xe8232e, 0xff7a1a, 0x23232e] },
  police: { name: 'Interceptor SMPD', w: 1.95, l: 4.6, h: 0.6, cabH: 0.55, top: 42, accel: 20, colors: [0x181820] },
};

const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x14141c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2c3e });
const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf2f0ea });
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
wheelGeo.rotateX(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c10 });

export function createCarMesh(type, color) {
  const t = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.l), paint);
  body.position.y = 0.36 + t.h / 2;
  g.add(body);
  if (type === 'police') {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.02, t.h * 0.55, t.l * 0.4), whiteMat);
    hood.position.set(0, 0.36 + t.h * 0.72, -t.l * 0.18);
    g.add(hood);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2a3c, fog: false }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2a6aff, fog: false }));
    blue.position.x = 0.3;
    bar.add(red, blue);
    bar.position.set(0, 0.36 + t.h + t.cabH + 0.1, 0.1);
    g.add(bar);
    g.userData.lightbar = bar;
  }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.82, t.cabH, t.l * 0.44), type === 'van' ? paint : glassMat);
  cab.position.set(0, 0.36 + t.h + t.cabH / 2, type === 'pickup' ? -t.l * 0.12 : -t.l * 0.03);
  g.add(cab);
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe98a, fog: false }));
    sign.position.set(0, 0.36 + t.h + t.cabH + 0.1, 0);
    g.add(sign);
  }
  if (type === 'sports') {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(t.w + 0.35, t.l + 0.35),
      new THREE.MeshBasicMaterial({ color: 0xff2fd8, transparent: true, opacity: 0.30, fog: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.07;
    g.add(glow);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.9, 0.08, 0.4), darkMat);
    wing.position.set(0, 0.36 + t.h + 0.28, t.l * 0.44);
    g.add(wing);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.78, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false }));
  hl.position.set(0, 0.62, -t.l / 2 - 0.02);
  g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.78, 0.13, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3040, fog: false }));
  tl.position.set(0, 0.64, t.l / 2 + 0.02);
  g.add(tl);
  const wheels = [];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(sx * (t.w / 2 - 0.05), 0.36, sz * (t.l / 2 - 0.85));
    g.add(w); wheels.push(w);
  });
  g.userData.wheels = wheels;
  return g;
}

let nextCarId = 1;
export class Car {
  constructor(scene, type, color, x, z, angle = 0) {
    this.id = nextCarId++;
    this.type = type;
    this.def = CAR_TYPES[type];
    this.mesh = createCarMesh(type, color);
    this.x = x; this.z = z; this.angle = angle;
    this.speed = 0; this.steerVis = 0;
    this.health = 100; this.dead = false; this.burning = 0; this.smokeT = 0;
    this.driver = null; // 'player' | 'traffic' | 'police' | 'mission' | null (parked)
    this.route = null; this.routeI = 0;
    this.syncMesh(0);
    scene.add(this.mesh);
  }
  get pos() { return this.mesh.position; }
  forward() { return { x: -Math.sin(this.angle), z: -Math.cos(this.angle) }; }
  syncMesh(t = 0) {
    const y = heightAt(this.x, this.z);
    this.mesh.position.set(this.x, y + 0.06, this.z);
    this.mesh.rotation.set(0, this.angle, this.dead ? 0.04 : Math.sin(t * 30) * Math.abs(this.speed) * 0.0006);
    const spin = this.speed * 0.12;
    this.mesh.userData.wheels.forEach((w, i) => { w.rotation.z -= spin * 0.16; if (i < 2) w.rotation.y = this.steerVis * 0.5; });
    if (this.mesh.userData.lightbar) this.mesh.userData.lightbar.visible = Math.sin(t * 10) > -0.2;
  }
  // Arcade drive: throttle -1..1, steer -1..1. Returns nothing; mutates state.
  drive(dt, throttle, steer, colliders, allCars) {
    if (this.dead) { this.speed *= (1 - 2.4 * dt); }
    else {
      const top = this.def.top * (this.health < 30 ? 0.55 : 1);
      if (throttle > 0) this.speed += this.def.accel * throttle * dt * (1 - Math.max(0, this.speed) / (top * 1.25));
      else if (throttle < 0) this.speed += (this.speed > 0.5 ? -26 : -9) * dt * -throttle * (this.speed < -8 ? 0 : 1);
      else this.speed -= this.speed * 0.55 * dt;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * dt); // rolling drag
    }
    this.speed = clamp(this.speed, -11, this.def.top * 1.15);
    this.steerVis += ((steer || 0) - this.steerVis) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.2) {
      const turn = this.steerVis * clamp(Math.abs(this.speed) / 9, 0, 1.15) * 1.05 * dt * Math.sign(this.speed);
      this.angle += turn;
    }
    const f = this.forward();
    let nx = this.x + f.x * this.speed * dt;
    let nz = this.z + f.z * this.speed * dt;
    // Building collision: circle push-out + damage.
    if (colliders) for (const c of colliders) {
      const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), rr = c.r + 1.4;
      if (d < rr && d > 0.001) {
        nx = c.x + (dx / d) * rr; nz = c.z + (dz / d) * rr;
        if (Math.abs(this.speed) > 7) this.damage(Math.abs(this.speed) * 0.55);
        this.speed *= 0.35;
      }
    }
    // Car-to-car: soft push + damage on hard hits.
    if (allCars) for (const o of allCars) {
      if (o === this) continue;
      const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz);
      if (d < 3.1 && d > 0.001) {
        nx = o.x + (dx / d) * 3.1; nz = o.z + (dz / d) * 3.1;
        const rel = Math.abs(this.speed - o.speed);
        if (rel > 6) { this.damage(rel * 0.5); o.damage(rel * 0.4); if (o.onRam) o.onRam(this); }
        this.speed = o.speed * 0.7 + this.speed * 0.2;
      }
    }
    // Keep cars on the island / out of deep water.
    const shore = Math.hypot(nx, nz);
    this.x = nx; this.z = nz;
    if (heightAt(this.x, this.z) < -0.8) { this.speed *= (1 - 3 * dt); this.damage(6 * dt); }
    this.syncMesh(performance.now() / 1000);
  }
  damage(n) {
    if (this.dead) return;
    this.health -= n;
    if (this.health <= 0) { this.health = 0; this.dead = true; this.burning = 2.6; if (this.onDestroyed) this.onDestroyed(this); }
  }
  dispose(scene) { scene.remove(this.mesh); }
}
