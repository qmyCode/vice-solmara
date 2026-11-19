// pedestrians.js — one job: people on the pavements of Solmara.
// Low-poly walkers stroll along road offsets, cross between wander points,
// and flee from gunfire, explosions and speeding cars. Marina Vidal and
// mission guards are special pedestrians driven by missions.js.

import * as THREE from 'three';
import { nearestRoadPoint, heightAt } from './city.js';
import { liveRng as rng, clamp } from './rng.js';

const SHIRTS = [0xe86a92, 0x4db2ff, 0xffd166, 0x7ee2a8, 0xf5ead9, 0xb18cff, 0xff8a5c, 0x3fd0c9];
const SKINS = [0xf2c79b, 0xc98a5a, 0x8a5a34, 0x6e4023, 0xffdbb0];

export function createPersonMesh(shirt, skin, opts = {}) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.24), new THREE.MeshLambertMaterial({ color: opts.pants || 0x2c3040 }));
  legs.position.y = 0.38;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.28), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.66;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.12, 0.37), new THREE.MeshLambertMaterial({ color: opts.hair || 0x2a1a12 }));
  hair.position.y = 1.87;
  g.add(legs, torso, head, hair);
  g.userData.legs = legs; g.userData.torso = torso;
  return g;
}

let nextPedId = 1;
export class Ped {
  constructor(scene, x, z, opts = {}) {
    this.id = nextPedId++;
    this.mesh = createPersonMesh(opts.shirt ?? rng.pick(SHIRTS), opts.skin ?? rng.pick(SKINS), opts);
    this.x = x; this.z = z;
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = 0; this.walkPhase = rng.range(0, 6);
    this.state = 'wander'; // wander | flee | stand | guard | down
    this.target = null;
    this.fleeFrom = null; this.fleeT = 0;
    this.health = 30;
    this.role = opts.role || 'citizen'; // citizen | marina | guard
    this.syncMesh(0);
    scene.add(this.mesh);
  }
  syncMesh(t) {
    this.mesh.position.set(this.x, heightAt(this.x, this.z), this.z);
    this.mesh.rotation.y = this.angle;
    if (this.state === 'down') { this.mesh.rotation.x = Math.PI / 2; this.mesh.position.y += 0.2; return; }
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.06 * Math.min(1, Math.abs(this.speed));
    this.mesh.position.y += bob;
    this.mesh.userData.legs.rotation.x = Math.sin(this.walkPhase) * 0.5 * Math.min(1, Math.abs(this.speed));
  }
  scare(x, z, radius = 26) {
    if (this.role !== 'citizen' || this.state === 'down') return;
    if (Math.hypot(this.x - x, this.z - z) < radius) { this.state = 'flee'; this.fleeFrom = { x, z }; this.fleeT = rng.range(2, 4); }
  }
  hurt(n) {
    this.health -= n;
    if (this.health <= 0 && this.state !== 'down') { this.state = 'down'; this.speed = 0; if (this.onDown) this.onDown(this); }
    else if (this.role === 'citizen') this.scare(this.x, this.z, 4);
  }
  update(dt, t) {
    if (this.state === 'down') { this.syncMesh(t); return; }
    let wantSpeed = 0;
    if (this.state === 'wander') {
      if (!this.target || Math.hypot(this.target.x - this.x, this.target.z - this.z) < 2) {
        const rp = nearestRoadPoint(this.x + rng.range(-60, 60), this.z + rng.range(-60, 60));
        const side = rng.sign() * rng.range(7.5, 10);
        this.target = { x: rp.x + side, z: rp.z + rng.range(-4, 4) };
      }
      wantSpeed = 1.35;
    } else if (this.state === 'flee') {
      this.fleeT -= dt;
      if (this.fleeT <= 0 || !this.fleeFrom) { this.state = 'wander'; this.target = null; }
      else {
        this.target = { x: this.x + (this.x - this.fleeFrom.x), z: this.z + (this.z - this.fleeFrom.z) };
        wantSpeed = 3.6;
      }
    } else if (this.state === 'guard') {
      wantSpeed = 0; // missions drive guard movement explicitly
    }
    if (this.target && this.state !== 'guard' && this.state !== 'stand') {
      const want = Math.atan2(-(this.target.x - this.x), -(this.target.z - this.z));
      let diff = want - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += clamp(diff, -3.2 * dt, 3.2 * dt);
    }
    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 5);
    this.x += -Math.sin(this.angle) * this.speed * dt;
    this.z += -Math.cos(this.angle) * this.speed * dt;
    if (heightAt(this.x, this.z) < -0.5) { this.angle += Math.PI * dt * 2; } // not into the sea
    this.walkPhase += dt * (4 + Math.abs(this.speed) * 2.4);
    this.syncMesh(t);
  }
  dispose(scene) { scene.remove(this.mesh); }
}

export class Crowd {
  constructor(scene) {
    this.peds = [];
    for (let i = 0; i < 30; i++) {
      const rp = nearestRoadPoint(rng.range(-380, 380), rng.range(-380, 380));
      this.peds.push(new Ped(scene, rp.x + rng.range(-9, 9), rp.z + rng.range(-9, 9)));
    }
  }
  update(dt, t) { for (const p of this.peds) p.update(dt, t); }
  scareAll(x, z, r) { for (const p of this.peds) p.scare(x, z, r); }
}
