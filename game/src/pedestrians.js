// pedestrians.js — one job: people on the sidewalks. Low-poly Vice Solmara citizens stroll
// between junction-graph waypoints offset to the roadside, chat in pairs, and run screaming
// when violence breaks out near them. They are also witnesses: crimes in front of them are
// reported to the police system by the modules that commit them.

import * as THREE from 'three';
import { Rng, clamp, angDiff, dist2d } from './rng.js';

const SKIN = [0xf2c49b, 0xc98d5f, 0x8a5a34, 0x6e4226];
const SHIRTS = [0xff5a7a, 0x37b6ff, 0xffd23e, 0x7dff6a, 0xff8a3e, 0xc792ff, 0xf2f2f2, 0x2ee6a8];
const PANTS = [0x2c3550, 0x5a4632, 0x222222, 0x707a8c, 0x7a2f3a];

export function createPedestrians(G) {
  const { city } = G;
  const rng = new Rng(city.seed * 77 + 11);
  const peds = [];
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const legGeo = new THREE.BoxGeometry(0.44, 0.78, 0.28);
  const headGeo = new THREE.BoxGeometry(0.34, 0.38, 0.34);

  function buildMesh() {
    const grp = new THREE.Group();
    const legs = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) }));
    legs.position.y = 0.39;
    const torso = new THREE.Mesh(torsoGeo, new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) }));
    torso.position.y = 1.14;
    const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) }));
    head.position.y = 1.72;
    grp.add(legs, torso, head);
    grp.userData = { legs, torso, head };
    return grp;
  }

  function pickTarget(ped) {
    const node = city.nodes[rng.int(0, city.nodes.length - 1)];
    ped.tx = node.x + rng.range(-4, 4);
    ped.tz = node.z + rng.range(-4, 4);
  }

  for (let i = 0; i < 26; i++) {
    const node = city.nodes[rng.int(0, city.nodes.length - 1)];
    const ped = {
      x: node.x + rng.range(-4, 4), z: node.z + rng.range(-4, 4),
      heading: rng.range(0, Math.PI * 2), speed: 0, walkSpeed: rng.range(1.1, 1.7),
      state: 'walk', fleeT: 0, dead: false, health: 30, phase: rng.range(0, 6),
      mesh: buildMesh(),
    };
    ped.y = city.heightAt(ped.x, ped.z);
    pickTarget(ped);
    ped.mesh.position.set(ped.x, ped.y, ped.z);
    G.scene.add(ped.mesh);
    peds.push(ped);
  }

  /** Stage an extra citizen at an exact spot (the screenshot scenes dress their sidewalks). */
  function spawnAt(x, z) {
    const ped = {
      x, z, heading: rng.range(0, Math.PI * 2), speed: 0, walkSpeed: rng.range(1.1, 1.7),
      state: 'walk', fleeT: 0, dead: false, health: 30, phase: rng.range(0, 6),
      mesh: buildMesh(),
    };
    ped.y = city.heightAt(x, z);
    pickTarget(ped);
    ped.mesh.position.set(ped.x, ped.y, ped.z);
    G.scene.add(ped.mesh);
    peds.push(ped);
    return ped;
  }

  /** Violence at (x,z): everyone in earshot runs directly away for a few seconds. */
  function panic(x, z, radius = 26) {
    for (const ped of peds) {
      if (ped.dead) continue;
      if (dist2d(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee';
        ped.fleeT = rng.range(2.5, 4.5);
        ped.heading = Math.atan2(ped.z - z, ped.x - x);
      }
    }
  }

  function step(dt, tNow) {
    for (const ped of peds) {
      if (ped.dead) continue;
      let targetSpeed = ped.walkSpeed;
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        targetSpeed = 4.6;
        if (ped.fleeT <= 0) { ped.state = 'walk'; pickTarget(ped); }
      } else {
        const d = dist2d(ped.x, ped.z, ped.tx, ped.tz);
        if (d < 2.2) pickTarget(ped);
        const desired = Math.atan2(ped.tz - ped.z, ped.tx - ped.x);
        ped.heading += clamp(angDiff(ped.heading, desired), -2.4 * dt, 2.4 * dt);
      }
      ped.speed += (targetSpeed - ped.speed) * Math.min(1, dt * 5);
      const nx = ped.x + Math.cos(ped.heading) * ped.speed * dt;
      const nz = ped.z + Math.sin(ped.heading) * ped.speed * dt;
      if (!city.inWater(nx, nz)) { ped.x = nx; ped.z = nz; }
      else ped.heading += Math.PI * 0.9 * dt * 4;
      ped.y = city.heightAt(ped.x, ped.z);
      const bob = Math.abs(Math.sin(tNow * (ped.state === 'flee' ? 13 : 8) + ped.phase)) * 0.07;
      ped.mesh.position.set(ped.x, ped.y + bob, ped.z);
      ped.mesh.rotation.y = -ped.heading;
      ped.mesh.userData.legs.rotation.x = Math.sin(tNow * (ped.state === 'flee' ? 13 : 8) + ped.phase) * 0.4;
    }
  }

  function kill(ped) {
    ped.dead = true;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = ped.y + 0.25;
  }

  return { peds, panic, step, kill, spawnAt };
}
