// player.js — one job: Rico, the man himself. Third-person on-foot movement with building and
// car collision, entering and stealing cars (parked ones quietly, moving ones by force),
// switching between fists, pistol and SMG, firing through combat.js, taking damage, and dying
// to a hospital bill. Every crime he commits in front of a witness is reported to police.js.

import * as THREE from 'three';
import { clamp, angDiff, dist2d } from './rng.js';
import { WEAPONS } from './combat.js';

export function createPlayer(G) {
  const { city } = G;
  const start = city.places.garage;
  const player = {
    x: start.x + 3, z: start.z + 2, y: 0, heading: -0.6,
    health: 100, car: null, weapon: 'fists', weapons: G.save.weapons.slice(),
    fireT: 0, hurtT: 0, dead: false, walkPhase: 0, speedNow: 0,
  };
  player.y = city.heightAt(player.x, player.z);

  // ---- Rico's mesh: burnt-orange tee, dark trousers, cap, gun in hand when armed ----
  const grp = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x23232a }));
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.74, 0.32), new THREE.MeshLambertMaterial({ color: 0xe8641e }));
  torso.position.y = 1.17;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.36), new THREE.MeshLambertMaterial({ color: 0xc98d5f }));
  head.position.y = 1.78;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x14213d }));
  cap.position.y = 2.0;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x111114 }));
  gun.position.set(0.34, 1.22, 0.3);
  gun.visible = false;
  grp.add(legs, torso, head, cap, gun);
  G.scene.add(grp);
  player.mesh = grp;

  /** Is anyone close enough to see a crime at (x, z)? Cops always count. */
  function witnessed(x, z, radius = 34) {
    for (const ped of G.peds.peds) if (!ped.dead && dist2d(x, z, ped.x, ped.z) < radius) return true;
    if (G.police) for (const cop of G.police.state.cops) if (dist2d(x, z, cop.car.x, cop.car.z) < radius + 8) return true;
    return false;
  }

  function report(kind, x = player.x, z = player.z) {
    if (G.police) G.police.reportCrime(kind, x, z, witnessed(x, z));
  }

  function nearestCar(maxD = 3.4) {
    let best = null, bestD = maxD;
    for (const car of G.vehicles.cars) {
      if (car.dead) continue;
      const d = dist2d(player.x, player.z, car.x, car.z) - car.radius;
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  function enterCar(car) {
    if (car.driver === 'traffic') {
      // yank the driver out: the car is ours, the crime is loud
      car.driver = null;
      report('carjack', car.x, car.z);
      G.peds.panic(car.x, car.z, 18);
    } else if (car.parked) {
      G.traffic.claimParked(car);
      car.parked = false;
      report('theft', car.x, car.z);
    }
    car.driver = 'player';
    player.car = car;
    grp.visible = false;
    if (G.audio) { G.audio.setEngine(true, 0); G.audio.setRadio(true); }
    if (G.hud) G.hud.toast(car.type === 'gt' ? 'ÁGUILA GT — qué máquina' : 'Coche robado', 1400);
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = null;
    if (Math.abs(car.speed) < 0.6) {
      car.parked = true;
      G.traffic.releaseParked(car);
    }
    // step out on the left side
    const sx = Math.cos(car.heading + Math.PI / 2), sz = Math.sin(car.heading + Math.PI / 2);
    player.x = car.x + sx * (car.spec.wid / 2 + 1.1);
    player.z = car.z + sz * (car.spec.wid / 2 + 1.1);
    if (city.inWater(player.x, player.z)) { player.x = car.x - sx * 3; player.z = car.z - sz * 3; }
    player.y = city.heightAt(player.x, player.z);
    player.heading = car.heading;
    player.car = null;
    grp.visible = true;
    if (G.audio) { G.audio.setEngine(false); G.audio.setRadio(false); }
  }

  function collideWorld(nx, nz) {
    // buildings push out
    for (const c of city.colliders) {
      const d = dist2d(nx, nz, c.x, c.z);
      const min = c.r + 0.55;
      if (d < min && d > 0.001) {
        nx = c.x + ((nx - c.x) / d) * min;
        nz = c.z + ((nz - c.z) / d) * min;
      }
    }
    return { x: nx, z: nz };
  }

  /** input: {mx, mz} move axes in camera space, sprint, plus the camera yaw for aiming. */
  function step(dt, input, camYaw, camPitch) {
    player.fireT -= dt;
    player.hurtT += dt;
    if (player.dead) return;
    if (player.car) {
      const car = player.car;
      G.vehicles.stepCar(car, dt, {
        throttle: (input.fwd ? 1 : 0) + (input.back ? -1 : 0),
        steer: (input.right ? 1 : 0) + (input.left ? -1 : 0),
        brake: input.brake, handbrake: input.brake,
      }, G.onVehicleEvent);
      player.x = car.x; player.z = car.z; player.y = car.y;
      player.heading = car.heading;
      if (G.audio) G.audio.setEngine(true, Math.abs(car.speed) / car.spec.top);
      if (Math.abs(car.speed) > 24 && G.missions) G.missions.notify('speeding', { car });
      return;
    }
    // on foot
    const mx = input.mx || 0, mz = input.mz || 0;
    const moving = Math.abs(mx) > 0.01 || Math.abs(mz) > 0.01;
    const sprint = input.sprint ? 1.55 : 1;
    if (moving) {
      const wx = Math.cos(camYaw) * mz - Math.sin(camYaw) * mx;
      const wz = Math.sin(camYaw) * mz + Math.cos(camYaw) * mx;
      const targetHeading = Math.atan2(wz, wx);
      player.heading += clamp(angDiff(player.heading, targetHeading), -11 * dt, 11 * dt);
      const speed = 5.4 * sprint;
      player.speedNow = speed;
      let nx = player.x + Math.cos(player.heading) * speed * dt;
      let nz = player.z + Math.sin(player.heading) * speed * dt;
      if (!city.inWater(nx, nz)) {
        const solved = collideWorld(nx, nz);
        player.x = solved.x; player.z = solved.z;
      }
      player.walkPhase += dt * (input.sprint ? 13 : 9.5);
    } else player.speedNow = 0;
    player.y = city.heightAt(player.x, player.z);
    // slow regen after a quiet spell
    if (player.hurtT > 6 && player.health > 0 && player.health < 100) {
      player.health = Math.min(100, player.health + dt * 4);
    }
  }

  /** Fire the current weapon toward the camera's aim. Called while the trigger is held. */
  function tryFire(camYaw, camPitch) {
    if (player.dead || player.car) return;
    const w = WEAPONS[player.weapon];
    if (player.fireT > 0) return;
    player.fireT = w.rate;
    const dx = Math.cos(camPitch) * Math.cos(camYaw);
    const dz = Math.cos(camPitch) * Math.sin(camYaw);
    const dy = Math.sin(camPitch);
    const ox = player.x + dx * 0.5, oy = player.y + 1.5, oz = player.z + dz * 0.5;
    const hit = G.combat.shoot(ox, oy, oz, dx, dy, dz, player.weapon);
    if (player.weapon !== 'fists') {
      report('shots');
      G.peds.panic(player.x, player.z, 24);
    }
    if (hit.kind === 'ped') report(hit.killed ? 'murder' : 'assault', hit.ped.x, hit.ped.z);
    else if (hit.kind === 'car') report('vandalism', hit.car.x, hit.car.z);
    else if (hit.kind === 'ped' || hit.kind === 'target') { /* missions read G.onPlayerShot */ }
    if (G.onPlayerShot) G.onPlayerShot(hit);
    return hit;
  }

  function setWeapon(key) {
    if (!player.weapons.includes(key)) return false;
    player.weapon = key;
    gun.visible = key !== 'fists';
    if (G.hud) G.hud.refreshWeapons();
    return true;
  }

  function damagePlayer(amount, srcX, srcZ) {
    if (player.dead) return;
    player.health -= amount;
    player.hurtT = 0;
    if (G.hud) G.hud.damageFlash();
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      if (G.onPlayerDeath) G.onPlayerDeath();
    }
  }

  function revive() {
    player.dead = false;
    player.health = 100;
    const st = city.places.station;
    if (player.car) { player.car.driver = null; player.car = null; grp.visible = true; }
    player.x = st.x + 4; player.z = st.z + 3;
    player.y = city.heightAt(player.x, player.z);
    if (G.audio) { G.audio.setEngine(false); G.audio.setRadio(false); }
  }

  function updateVisual(tNow) {
    grp.position.set(player.x, player.y, player.z);
    grp.rotation.y = -player.heading;
    const swing = player.speedNow > 0.2 ? Math.sin(player.walkPhase) * 0.45 : 0;
    legs.rotation.x = swing;
    torso.rotation.x = player.speedNow > 0.2 ? 0.08 : 0;
    gun.visible = player.weapon !== 'fists' && !player.car;
  }

  return {
    state: player, step, tryFire, setWeapon, damagePlayer, revive, updateVisual,
    enterCar, exitCar, nearestCar, witnessed, report,
    get x() { return player.x; }, get z() { return player.z; },
  };
}
