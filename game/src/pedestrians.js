// pedestrians.js — one job: people. Low-poly figures (capsule body, sphere head, swinging leg
// boxes) who wander between graph nodes, flee gunfire and explosions, and can be spawned as
// named stand-ins (Marina at her garage) or ejected drivers. They are also the city's eyes:
// the police ask them what they saw.
import * as THREE from '../vendor/three.module.js';
import { clamp, angDiff, dist2d } from './rng.js';
import { collideBuildings } from './vehicles.js';

const SHIRTS = [0xe8e3d8, 0xc23b4e, 0x2e6fb0, 0xf2b21b, 0x39b56b, 0x8c5bff, 0xe86ba0, 0x37414a, 0xff8c1a, 0xdadada];
const SKINS = [0xf2c49b, 0xc68863, 0x8d5524, 0xffdbac, 0x6b4423];

export function makeFigure(shirt, skin, hairColor = 0x2a1c10) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.72, 3, 8), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 0.95;
  grp.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.68;
  grp.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, 1.4), new THREE.MeshLambertMaterial({ color: hairColor }));
  hair.position.y = 1.71;
  grp.add(hair);
  const legGeo = new THREE.BoxGeometry(0.15, 0.55, 0.17);
  legGeo.translate(0, -0.27, 0);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3038 });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.58, 0);
  grp.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.13, 0.58, 0);
  grp.add(legR);
  grp.userData = { legL, legR, body };
  return grp;
}

export function createPeds(G, rng) {
  const city = G.city;
  const list = [];

  function spawn(x, z, opts = {}) {
    const mesh = makeFigure(opts.shirt ?? rng.pick(SHIRTS), opts.skin ?? rng.pick(SKINS), opts.hair);
    mesh.position.set(x, city.height(x, z), z);
    mesh.rotation.y = rng.range(0, Math.PI * 2);
    G.scene.add(mesh);
    const ped = {
      mesh, angle: mesh.rotation.y, speed: 0, health: 70, dead: false,
      state: opts.stand ? 'stand' : 'walk', target: null, fleeT: 0, threat: null,
      legPhase: rng.range(0, 6), npc: !!opts.npc, name: opts.name || null,
      update(dt) { stepPed(ped, dt); },
    };
    list.push(ped);
    return ped;
  }
  function pickTarget(ped) {
    for (let tries = 0; tries < 10; tries++) {
      const n = city.randomNode();
      if (dist2d(n.x, n.z, ped.mesh.position.x, ped.mesh.position.z) < 130 && city.height(n.x, n.z) > 0.3) {
        ped.target = { x: n.x + rng.range(-4, 4), z: n.z + rng.range(-4, 4) };
        return;
      }
    }
    ped.target = null;
  }
  function stepPed(ped, dt) {
    if (ped.dead) return;
    const pos = ped.mesh.position;
    if (ped.state === 'stand') { idle(ped, dt); return; }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) { ped.state = 'walk'; ped.target = null; }
    }
    if (!ped.target) pickTarget(ped);
    if (!ped.target) { idle(ped, dt); return; }
    const dx = ped.target.x - pos.x, dz = ped.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.4) { ped.target = null; ped.speed = 0; idle(ped, dt); return; }
    const desired = Math.atan2(dx, dz);
    ped.angle += clamp(angDiff(desired, ped.angle), -3.4 * dt, 3.4 * dt);
    const run = ped.state === 'flee';
    const targetSpeed = run ? 5.6 : 1.5;
    ped.speed += clamp(targetSpeed - ped.speed, -8 * dt, 3 * dt);
    let nx = pos.x + Math.sin(ped.angle) * ped.speed * dt;
    let nz = pos.z + Math.cos(ped.angle) * ped.speed * dt;
    if (city.height(nx, nz) < 0.1) { ped.target = null; nx = pos.x; nz = pos.z; }
    const res = collideBuildings(city, nx, nz, 0.42);
    pos.x = res.x; pos.z = res.z;
    pos.y = city.height(pos.x, pos.z);
    ped.legPhase += dt * ped.speed * 3.4;
    const swing = Math.sin(ped.legPhase) * 0.55 * clamp(ped.speed / 2, 0, 1);
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.rotation.y = ped.angle;
    pos.y += Math.abs(Math.sin(ped.legPhase)) * 0.03;
  }
  function idle(ped, dt) {
    ped.mesh.userData.legL.rotation.x *= 0.8;
    ped.mesh.userData.legR.rotation.x *= 0.8;
    ped.mesh.position.y = city.height(ped.mesh.position.x, ped.mesh.position.z) + Math.sin(performance.now() * 0.002 + ped.legPhase) * 0.012;
  }
  function hurt(ped, dmg, fromX, fromZ) {
    if (ped.dead) return;
    ped.health -= dmg;
    if (ped.health <= 0) {
      ped.dead = true;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = city.height(ped.mesh.position.x, ped.mesh.position.z) + 0.24;
      if (G.onPedDown) G.onPedDown(ped);
    } else {
      flee(ped, fromX, fromZ);
    }
  }
  function flee(ped, fromX, fromZ) {
    if (ped.dead || ped.state === 'stand') return;
    ped.state = 'flee';
    ped.fleeT = 4;
    const dx = ped.mesh.position.x - fromX, dz = ped.mesh.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    ped.target = { x: ped.mesh.position.x + (dx / d) * 34, z: ped.mesh.position.z + (dz / d) * 34 };
  }
  // the crowd around the player's usual haunts
  const anchors = [city.places.garage, city.places.hotel, city.places.club, city.places.station, city.districts[1], city.districts[0], city.districts[5]];
  for (let i = 0; i < 32; i++) {
    const a = anchors[i % anchors.length];
    const x = a.x + rng.range(-46, 46), z = a.z + rng.range(-46, 46);
    if (city.height(x, z) > 0.3) spawn(x, z);
  }
  function update(dt) {
    for (const ped of list) ped.update(dt);
    // run over by a moving car
    for (const ped of list) {
      if (ped.dead) continue;
      for (const v of G.vehicles) {
        if (Math.abs(v.speed) < 3.5 || v.exploded) continue;
        if (dist2d(ped.mesh.position.x, ped.mesh.position.z, v.mesh.position.x, v.mesh.position.z) < v.radius + 0.5) {
          hurt(ped, 80, v.mesh.position.x, v.mesh.position.z);
          if (v.role === 'player') G.police?.reportCrime('pedHit', ped.mesh.position.x, ped.mesh.position.z, 1);
          break;
        }
      }
    }
  }
  return { list, spawn, hurt, flee, update };
}
