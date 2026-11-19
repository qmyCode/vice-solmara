// vehicles.js — one job: cars. Seven body types built from boxes (sedan, taxi, hatch, pickup,
// van, the Águila GT sports car and the SMPD Interceptor), arcade driving physics, collision
// against the city's building colliders and against each other, damage, headlight/taillight
// materials, flashing light bars and the GT's neon underglow. Traffic, police and the player all
// drive through this one manager so every car on the street behaves the same way.

import * as THREE from 'three';
import { clamp, dist2d } from './rng.js';

export const CAR_TYPES = {
  sedan: { len: 4.3, wid: 1.9, bodyH: 0.62, top: 27, accel: 12, colors: [0xc0c6ce, 0x7a4a3a, 0x3a5a8c, 0x5a7a4a, 0x8c8c94, 0x703a5a] },
  taxi: { len: 4.3, wid: 1.9, bodyH: 0.62, top: 26, accel: 12, colors: [0xf2b234] },
  hatch: { len: 3.8, wid: 1.8, bodyH: 0.66, top: 24, accel: 12, colors: [0xb84a4a, 0x4a7ab8, 0xd9d9d9, 0x4ab87a] },
  pickup: { len: 4.9, wid: 2.0, bodyH: 0.78, top: 23, accel: 11, colors: [0x6a7a8c, 0x9a4a2f, 0x4f6152] },
  van: { len: 5.1, wid: 2.1, bodyH: 1.15, top: 21, accel: 10, colors: [0xd9d4c8, 0x8c97a5, 0xb85a3a] },
  gt: { len: 4.5, wid: 2.0, bodyH: 0.5, top: 37, accel: 18, colors: [0xd92323, 0xff7a1a, 0x8a2be2] },
  interceptor: { len: 4.6, wid: 2.0, bodyH: 0.6, top: 34, accel: 16, colors: [0xe8e8ec] },
};

const glassMat = new THREE.MeshLambertMaterial({ color: 0x141c26 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x22242a });

export function createVehicles(scene, city, glowTex) {
  const cars = [];
  // spatial hash of building colliders for cheap collision checks
  const colHash = new Map();
  city.colliders.forEach((c, i) => {
    const key = `${Math.floor(c.x / 22)},${Math.floor(c.z / 22)}`;
    if (!colHash.has(key)) colHash.set(key, []);
    colHash.get(key).push(i);
  });

  function buildMesh(type, colorHex, isCop) {
    const spec = CAR_TYPES[type];
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.len, spec.bodyH, spec.wid), bodyMat);
    body.position.y = 0.38 + spec.bodyH / 2;
    grp.add(body);
    if (type === 'van') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, spec.wid * 0.94), glassMat);
      cab.position.set(spec.len * 0.32, 0.38 + spec.bodyH + 0.22, 0);
      grp.add(cab);
    } else if (type === 'pickup') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, spec.wid * 0.9), bodyMat);
      cab.position.set(spec.len * 0.14, 0.38 + spec.bodyH + 0.3, 0);
      grp.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, spec.wid * 0.92), glassMat);
      win.position.copy(cab.position);
      win.position.y += 0.08;
      grp.add(win);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.len * 0.48, 0.52, spec.wid * 0.86), glassMat);
      cabin.position.set(-spec.len * 0.05, 0.38 + spec.bodyH + 0.24, 0);
      grp.add(cabin);
    }
    if (type === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
      sign.position.set(0, 0.38 + spec.bodyH + 0.62, 0);
      grp.add(sign);
    }
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    wheelGeo.rotateX(Math.PI / 2);
    const wheels = [];
    const wx = spec.len / 2 - 0.85, wz = spec.wid / 2 + 0.02;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.position.set(wx * sx, 0.36, wz * sz);
      grp.add(w);
      wheels.push(w);
    }
    // lights: headlights + taillights as small emissive boxes, one shared halo sprite up front
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.42), headMat);
      h.position.set(spec.len / 2 + 0.03, 0.72, s * spec.wid * 0.32);
      grp.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.46), tailMat);
      t.position.set(-spec.len / 2 - 0.03, 0.74, s * spec.wid * 0.32);
      grp.add(t);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffe9b0, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.scale.set(3.4, 1.7, 1);
    halo.position.set(spec.len / 2 + 0.7, 0.72, 0);
    grp.add(halo);
    let lightBar = null, underglow = null;
    if (isCop) {
      lightBar = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.13, 0.5), darkMat);
      lightBar.add(base);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.44), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.x = -0.28;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.44), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      blue.position.x = 0.28;
      lightBar.add(red);
      lightBar.add(blue);
      lightBar.position.set(-0.2, 0.38 + spec.bodyH + 0.6, 0);
      lightBar.userData = { red, blue };
      grp.add(lightBar);
      const band = new THREE.Mesh(new THREE.BoxGeometry(spec.len * 0.99, 0.3, spec.wid + 0.02), darkMat);
      band.position.y = 0.68;
      grp.add(band);
    }
    if (type === 'gt') {
      underglow = new THREE.Mesh(
        new THREE.PlaneGeometry(spec.len + 1.6, spec.wid + 1.7),
        new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff2fd6, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      underglow.rotation.x = -Math.PI / 2;
      underglow.position.y = 0.14;
      grp.add(underglow);
    }
    grp.traverse((o) => { o.frustumCulled = true; });
    return { grp, wheels, lightBar, halo, bodyMat, tailMat };
  }

  function spawn(type, x, z, heading, opts = {}) {
    const spec = CAR_TYPES[type];
    const colorHex = opts.color !== undefined ? opts.color
      : spec.colors[Math.floor((opts.rng ? opts.rng.f() : Math.random()) * spec.colors.length)];
    const built = buildMesh(type, colorHex, type === 'interceptor');
    const car = {
      type, spec, x, z, y: city.heightAt(x, z), heading, speed: 0, steer: 0,
      health: 100, maxHealth: 100, dead: false, burning: 0, driver: opts.driver || null,
      parked: !!opts.parked, route: null, routeI: 0, stuckT: 0,
      mesh: built.grp, wheels: built.wheels, lightBar: built.lightBar, halo: built.halo,
      bodyMat: built.bodyMat, tailMat: built.tailMat, colorHex,
      radius: spec.len * 0.42, crimeT: 0, id: cars.length,
    };
    built.grp.position.set(x, car.y, z);
    built.grp.rotation.y = -heading;
    scene.add(built.grp);
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  /** Arcade physics for one car under a control input {throttle, steer, brake}. */
  function stepCar(car, dt, ctl, onEvent) {
    if (car.dead) return;
    const spec = car.spec;
    const throttle = clamp(ctl.throttle || 0, -1, 1);
    const steer = clamp(ctl.steer || 0, -1, 1);
    car.steer += (steer - car.steer) * Math.min(1, dt * 8);
    if (ctl.brake && car.speed > 0.5) {
      car.speed = Math.max(0, car.speed - 26 * dt);
    } else {
      car.speed += throttle * spec.accel * dt;
    }
    car.speed -= car.speed * 0.55 * dt; // drag
    if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 2.2 * dt);
    const topSpeed = throttle < 0 ? 9 : spec.top;
    car.speed = clamp(car.speed, -9, topSpeed);
    if (Math.abs(car.speed) > 0.15) {
      const turn = car.steer * 1.75 * clamp(car.speed / spec.top, -1, 1) * (car.speed < 0 ? -1 : 1);
      car.heading += turn * dt * (ctl.handbrake ? 1.5 : 1);
    }
    const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    car.y = city.heightAt(car.x, car.z);
    // building collisions: circle push-out with impact damage
    const cx = Math.floor(car.x / 22), cz = Math.floor(car.z / 22);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const bucket = colHash.get(`${ix},${iz}`);
      if (!bucket) continue;
      for (const i of bucket) {
        const c = city.colliders[i];
        const d = dist2d(car.x, car.z, c.x, c.z);
        const min = c.r + car.radius * 0.8;
        if (d < min && d > 0.001) {
          const push = min - d;
          car.x += ((car.x - c.x) / d) * push;
          car.z += ((car.z - c.z) / d) * push;
          const impact = Math.abs(car.speed);
          if (impact > 7) {
            damage(car, (impact - 6) * 1.6, onEvent);
            if (onEvent) onEvent({ kind: 'crash', car, impact });
          }
          car.speed *= 0.35;
        }
      }
    }
    // water: heavy drag, cars do not swim
    if (city.inWater(car.x, car.z)) {
      car.speed *= Math.max(0, 1 - 3.2 * dt);
      if (onEvent && Math.abs(car.speed) > 2) onEvent({ kind: 'splash', car });
    }
  }

  function damage(car, amount, onEvent) {
    if (car.dead) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true; // dead BEFORE the event fires: the blast handler damages this car again
      if (onEvent) onEvent({ kind: 'destroyed', car });
    }
  }

  /** Turn a destroyed car into a blackened, smoking wreck shell. */
  function wreckify(car) {
    car.dead = true;
    car.speed = 0;
    car.bodyMat.color.setHex(0x1b1b1e);
    if (car.halo) car.halo.material.opacity = 0;
  }

  /** Per-frame visuals: mesh transform, wheel spin/steer, light bars, halos. */
  function updateVisuals(dt, tNow, dusk) {
    for (const car of cars) {
      car.mesh.position.set(car.x, car.y, car.z);
      car.mesh.rotation.y = -car.heading;
      const spin = (car.speed * dt) / 0.36;
      car.wheels.forEach((w, i) => {
        w.rotation.z -= spin;
        if (i < 2) w.rotation.y = -car.steer * 0.42;
      });
      if (car.lightBar) {
        const phase = Math.floor(tNow * 6) % 2 === 0;
        car.lightBar.userData.red.material.color.setHex(phase ? 0xff2222 : 0x551111);
        car.lightBar.userData.blue.material.color.setHex(phase ? 0x112266 : 0x3388ff);
        car.lightBar.visible = !car.dead;
      }
      car.halo.material.opacity = car.dead ? 0 : 0.18 + dusk * 0.62;
    }
    // gentle car-car separation so traffic never overlaps
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.dead) continue;
        const d = dist2d(a.x, a.z, b.x, b.z);
        const min = a.radius + b.radius + 0.4;
        if (d < min && d > 0.001) {
          const push = (min - d) / 2;
          const nx = (a.x - b.x) / d, nz = (a.z - b.z) / d;
          if (!a.parked) { a.x += nx * push; a.z += nz * push; }
          if (!b.parked) { b.x -= nx * push; b.z -= nz * push; }
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 8) {
            damage(a, 2, null);
            damage(b, 2, null);
            a.speed *= 0.6; b.speed *= 0.6;
          }
        }
      }
    }
  }

  return { cars, spawn, removeCar, stepCar, damage, wreckify, updateVisuals, CAR_TYPES };
}
