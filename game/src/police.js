// police.js — one job: the SMPD wanted system.
// Five stars of escalating response: routed pursuit cars with predictive
// steering, a dispatch feed (callsigns, distances, tactics), roadblocks
// from 3 stars, a spotlight helicopter from 4, and live fire at 5.
// Heat is lost by breaking line of sight; standing still next to a unit
// with your hands visible gets you busted.

import * as THREE from 'three';
import { NODES, findRoute, heightAt } from './city.js';
import { Car } from './vehicles.js';
import { allCars } from './traffic.js';
import { liveRng as rng, clamp } from './rng.js';

const PREFIXES = ['GAVIOTA', 'HALCÓN', 'FARO', 'BRISA', 'MUELLE', 'CORAL', 'PALMA', 'VIGÍA'];
const TACTIC_LINES = {
  PURSUIT: ['All units, suspect flagged — converge', 'In pursuit — do not let him reach the ring', 'Suspect vehicle matched — closing in'],
  ROADBLOCK: ['Roadblock staged ahead — box him in', 'Units holding the block — spike the exit', 'Block set — he has nowhere clean to go'],
  FIRING: ['Air unit weapons free — engage the suspect', 'Shots authorized — take him down', 'Five stars — lethal force approved'],
  SPOTLIGHT: ['Air unit has the light on him — ground units move', 'Spotlight locked — he cannot hide', 'Halcón Uno overhead, marking the suspect'],
};
const UNIT_COUNT = [0, 1, 2, 3, 5, 6];

export class Police {
  constructor(scene, colliders, hooks) {
    this.scene = scene; this.colliders = colliders; this.hooks = hooks;
    this.stars = 0; this.units = []; this.blockCars = [];
    this.seen = false; this.lastSeen = null; this.unseenT = 0;
    this.blockCooldown = 0; this.bustMeter = 0; this.fireT = 0;
    this.csCounter = 1;
    this.heli = null;
    this.buildHeli();
  }
  buildHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 4.6), new THREE.MeshLambertMaterial({ color: 0x22222e }));
    body.position.y = 0;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.6), new THREE.MeshLambertMaterial({ color: 0x22222e }));
    tail.position.set(0, 0.25, 3.6);
    const rotor = new THREE.Group();
    const rb1 = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.07, 0.42), new THREE.MeshLambertMaterial({ color: 0x111118 }));
    const rb2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 10.4), new THREE.MeshLambertMaterial({ color: 0x111118 }));
    rotor.add(rb1, rb2);
    rotor.position.y = 1.15;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 4.64), new THREE.MeshBasicMaterial({ color: 0xffcf3f, fog: false }));
    stripe.position.y = -0.3;
    g.add(body, tail, rotor, stripe);
    g.userData.rotor = rotor;
    // Spotlight: real SpotLight + visible cone.
    const spot = new THREE.SpotLight(0xfff2c0, 0, 190, 0.36, 0.45, 0.6);
    g.add(spot); g.add(spot.target);
    const coneGeo = new THREE.ConeGeometry(9, 34, 18, 1, true); coneGeo.translate(0, -17, 0);
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    g.add(cone);
    g.userData.spot = spot; g.userData.cone = cone;
    g.visible = false;
    this.scene.add(g);
    this.heli = { mesh: g, x: 0, z: 0, angle: 0, active: false };
  }
  crime(kind) {
    const heat = { carjack: 1, shot: 1, explosion: 2, copHit: 2, pedHit: 1, mission: 1, theft: 1 }[kind] || 1;
    this.setStars(this.stars + heat);
  }
  setStars(n) {
    this.stars = clamp(Math.round(n), 0, 5);
    if (this.stars > 0 && !this.lastSeen) this.lastSeen = { ...this.hooks.playerPos() };
  }
  clear() { this.setStars(0); this.unseenT = 0; }
  spawnUnit(px, pz) {
    let node = null;
    for (let k = 0; k < 14; k++) {
      const cand = NODES[(Math.random() * NODES.length) | 0];
      const d = Math.hypot(cand.x - px, cand.z - pz);
      if (d > 95 && d < 210) { node = cand; break; }
    }
    if (!node) node = NODES[(Math.random() * NODES.length) | 0];
    const car = new Car(this.scene, 'police', 0x181820, node.x, node.z, rng.range(0, 6.28));
    car.driver = 'police';
    car.callsign = PREFIXES[(this.csCounter - 1) % PREFIXES.length] + '-' + this.csCounter;
    this.csCounter++;
    car.tactic = 'PURSUIT';
    car.route = null; car.routeI = 0; car.repathT = 0;
    this.units.push(car); allCars.push(car);
    return car;
  }
  despawn(car) {
    this.scene.remove(car.mesh);
    const i = this.units.indexOf(car); if (i >= 0) this.units.splice(i, 1);
    const j = allCars.indexOf(car); if (j >= 0) allCars.splice(j, 1);
  }
  stageRoadblock(px, pz, heading) {
    const ahead = { x: px - Math.sin(heading) * 78, z: pz - Math.cos(heading) * 78 };
    let node = null, bd = 1e12;
    for (const n of NODES) { const d = (n.x - ahead.x) ** 2 + (n.z - ahead.z) ** 2; if (d < bd) { bd = d; node = n; } }
    if (!node) return;
    for (let i = 0; i < 2; i++) {
      const car = new Car(this.scene, 'police', 0x181820, node.x + (i - 0.5) * 5.2, node.z + (i % 2) * 2.4, heading + Math.PI / 2);
      car.driver = 'police'; car.tactic = 'ROADBLOCK';
      car.callsign = 'FARO-' + (this.csCounter++);
      car.isBlock = true;
      this.units.push(car); this.blockCars.push(car); allCars.push(car);
    }
    this.blockCooldown = 26;
  }
  update(dt, t) {
    const P = this.hooks.playerPos(); // {x,z,speed,onFoot,heading,velX,velZ}
    this.blockCooldown -= dt;
    // Desired strength.
    const want = UNIT_COUNT[this.stars] || 0;
    const active = this.units.filter(u => !u.isBlock);
    if (this.stars > 0 && active.length < want) this.spawnUnit(P.x, P.z);
    for (const u of [...this.units]) {
      if (!u.isBlock && Math.hypot(u.x - P.x, u.z - P.z) > 460 && this.units.length > want) this.despawn(u);
    }
    if (this.stars === 0) {
      for (const u of [...this.units]) this.despawn(u);
      this.blockCars = [];
      this.heli.active = false; this.heli.mesh.visible = false;
      this.seen = false;
      return;
    }
    // Line of sight: any unit (or the heli) close enough sees the player.
    let seen = false;
    for (const u of this.units) if (Math.hypot(u.x - P.x, u.z - P.z) < 62) { seen = true; break; }
    if (this.heli.active && Math.hypot(this.heli.x - P.x, this.heli.z - P.z) < 95) seen = true;
    this.seen = seen;
    if (seen) { this.lastSeen = { x: P.x, z: P.z }; this.unseenT = 0; }
    else {
      this.unseenT += dt;
      const need = 7 + this.stars * 1.6;
      if (this.unseenT > need) { this.setStars(this.stars - 1); this.unseenT = 0; if (this.hooks.onHeatLost) this.hooks.onHeatLost(this.stars); }
    }
    // Roadblocks at 3+.
    if (this.stars >= 3 && this.blockCooldown <= 0 && this.blockCars.filter(c => !c.dead).length < 2 && P.speed > 6) {
      this.stageRoadblock(P.x, P.z, P.heading);
    }
    this.blockCars = this.blockCars.filter(c => !c.dead && Math.hypot(c.x - P.x, c.z - P.z) < 320);
    // Pursuit driving with prediction.
    for (const u of this.units) {
      if (u.isBlock || u.dead) { u.drive(dt, 0, 0, this.colliders, allCars); continue; }
      const lead = clamp(Math.hypot(u.x - P.x, u.z - P.z) / 26, 0, 1.4);
      const tx = (this.seen ? P.x : (this.lastSeen ? this.lastSeen.x : P.x)) + (P.velX || 0) * lead;
      const tz = (this.seen ? P.z : (this.lastSeen ? this.lastSeen.z : P.z)) + (P.velZ || 0) * lead;
      u.repathT -= dt;
      if (!u.route || u.repathT <= 0) { u.route = findRoute(u.x, u.z, tx, tz); u.routeI = 0; u.repathT = 1.6; }
      let target = u.route[Math.min(u.routeI, u.route.length - 1)] || { x: tx, z: tz };
      let d = Math.hypot(target.x - u.x, target.z - u.z);
      while (d < 10 && u.routeI < u.route.length - 1) { u.routeI++; target = u.route[u.routeI]; d = Math.hypot(target.x - u.x, target.z - u.z); }
      if (Math.hypot(tx - u.x, tz - u.z) < 22) target = { x: tx, z: tz }; // final approach: direct
      const wantA = Math.atan2(-(target.x - u.x), -(target.z - u.z));
      let diff = wantA - u.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.7, -1, 1);
      let throttle = 1;
      if (Math.abs(diff) > 1.2) throttle = 0.3;
      const pd = Math.hypot(P.x - u.x, P.z - u.z);
      if (pd < 7 && P.speed < 4) throttle = 0.1;
      u.tactic = this.stars >= 5 && pd < 46 ? 'FIRING' : 'PURSUIT';
      u.drive(dt, throttle, steer, this.colliders, allCars);
    }
    // Helicopter at 4+.
    const heliOn = this.stars >= 4;
    this.heli.active = heliOn;
    this.heli.mesh.visible = heliOn;
    if (heliOn) {
      const h = this.heli;
      const tx = P.x + Math.sin(t * 0.35) * 16, tz = P.z + Math.cos(t * 0.35) * 16;
      h.x += (tx - h.x) * Math.min(1, dt * 1.4);
      h.z += (tz - h.z) * Math.min(1, dt * 1.4);
      h.angle = Math.atan2(-(P.x - h.x), -(P.z - h.z));
      const hy = heightAt(h.x, h.z) + 30;
      h.mesh.position.set(h.x, hy, h.z);
      h.mesh.rotation.y = h.angle;
      h.mesh.userData.rotor.rotation.y += dt * 42;
      const spot = h.mesh.userData.spot;
      spot.intensity = 900;
      spot.position.set(0, -0.5, 0);
      spot.target.position.set(P.x - h.x, -30 + (heightAt(P.x, P.z) - hy), P.z - h.z);
      h.mesh.userData.cone.visible = true;
    }
    // Live fire at 5 stars.
    if (this.stars >= 5 && this.seen) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.5;
        const near = this.units.some(u => Math.hypot(u.x - P.x, u.z - P.z) < 42) || this.heli.active;
        if (near && this.hooks.damagePlayer) this.hooks.damagePlayer(rng.range(2, 5));
      }
    }
    // Bust logic: slow / on foot + adjacent unit.
    const nearUnit = this.units.some(u => Math.hypot(u.x - P.x, u.z - P.z) < 5.2);
    if (nearUnit && P.speed < 1.6) {
      this.bustMeter += dt;
      if (this.bustMeter > 1.4) { this.bustMeter = 0; if (this.hooks.onBusted) this.hooks.onBusted(); }
    } else this.bustMeter = Math.max(0, this.bustMeter - dt * 2);
    if (this.hooks.setSiren) this.hooks.setSiren(this.stars > 0 && this.seen ? 0.03 : this.stars > 0 ? 0.012 : 0);
  }
  // Dispatch feed rows for the HUD.
  dispatchRows(px, pz) {
    const rows = this.units.map(u => ({
      cs: u.callsign || 'UNIDAD',
      dist: Math.round(Math.hypot(u.x - px, u.z - pz)),
      tactic: u.isBlock ? 'ROADBLOCK' : u.tactic,
      line: TACTIC_LINES[u.isBlock ? 'ROADBLOCK' : u.tactic][(u.id + this.stars) % 3],
    }));
    if (this.heli.active) rows.unshift({
      cs: 'HALCÓN-1', dist: Math.round(Math.hypot(this.heli.x - px, this.heli.z - pz)),
      tactic: this.stars >= 5 ? 'FIRING' : 'SPOTLIGHT',
      line: TACTIC_LINES[this.stars >= 5 ? 'FIRING' : 'SPOTLIGHT'][1],
    });
    rows.sort((a, b) => a.dist - b.dist);
    return rows.slice(0, 5);
  }
}
