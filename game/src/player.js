// player.js — one job: Rico, the player. Third-person on-foot movement, entering and
// carjacking cars (traffic drivers get dragged out and run), driving through the vehicle
// physics, weapon selection and firing, health and death. Cash and respect live here and
// are written back to the save on every change.
import { clamp, angDiff, dist2d } from './rng.js';
import { makeFigure } from './pedestrians.js';
import { collideBuildings, stepVehicle } from './vehicles.js';
import { storeSave } from './save.js';

export function createPlayer(G) {
  const city = G.city;
  const garage = city.places.garage;
  const mesh = makeFigure(0x0e7d86, 0xc68863, 0x1a120a);
  const startX = garage.x + Math.sin(garage.ang) * -6, startZ = garage.z + Math.cos(garage.ang) * -6;
  mesh.position.set(startX, city.height(startX, startZ), startZ);
  G.scene.add(mesh);

  const player = {
    mesh, mode: 'foot', car: null, prevRole: null,
    pos: { x: startX, z: startZ },
    angle: garage.ang + Math.PI, speed: 0, health: 100, armour: 40,
    weapons: G.save.weapons.slice(), weapon: G.save.weapons.includes('smg') ? 'smg' : (G.save.weapons[1] || 'fists'),
    ammo: {
      pistol: { mag: 12, res: 60 },
      smg: { mag: 30, res: 120 },
      shotgun: { mag: 6, res: 24 },
      rifle: { mag: 30, res: 90 },
    },
    cash: G.save.cash, respect: G.save.respect,
    fireCd: 0, hurtT: 0, dead: false, legPhase: 0,
  };
  if (!player.weapons.includes(player.weapon)) player.weapon = 'fists';

  function persist() {
    G.save.cash = player.cash;
    G.save.respect = player.respect;
    G.save.weapons = player.weapons.slice();
    storeSave(G.save);
  }
  player.persist = persist;
  player.addCash = (n) => { player.cash += n; persist(); if (G.hud) G.hud.toast((n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US')); };
  player.addRespect = (n) => { player.respect += n; persist(); };

  player.hurt = (dmg, fromX, fromZ) => {
    if (player.dead || G.state !== 'play') return;
    // the vest eats half of everything until it is shredded
    if (player.armour > 0) {
      const absorbed = Math.min(player.armour, dmg * 0.5);
      player.armour -= absorbed;
      dmg -= absorbed;
    }
    player.health -= dmg;
    player.hurtT = 0;
    if (G.hud) G.hud.flashRed();
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      if (G.onWasted) G.onWasted();
    }
  };
  G.hurtPlayer = player.hurt;

  player.respawn = (at) => {
    if (player.mode === 'car' && player.car) { player.car.role = 'parked'; player.car = null; }
    player.mode = 'foot';
    player.dead = false;
    player.health = 100;
    player.armour = Math.max(player.armour, 40); // the clinic / the desk sergeant hands back a vest
    player.pos.x = at.x; player.pos.z = at.z;
    mesh.visible = true;
    mesh.rotation.x = 0;
    mesh.position.set(at.x, city.height(at.x, at.z), at.z);
  };

  function nearestVehicle(maxD) {
    let best = null, bd = maxD;
    for (const v of G.vehicles) {
      if (v.exploded) continue;
      const d = dist2d(player.pos.x, player.pos.z, v.mesh.position.x, v.mesh.position.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  player.nearestVehicle = nearestVehicle;

  function enterCar(v) {
    player.prevRole = v.role;
    if (v.role === 'traffic') {
      // carjack: the driver is dragged out and runs for it
      const door = { x: v.mesh.position.x - Math.cos(v.angle) * 1.4, z: v.mesh.position.z + Math.sin(v.angle) * 1.4 };
      const driver = G.peds.spawn(door.x, door.z);
      G.peds.flee(driver, player.pos.x, player.pos.z);
      G.police?.reportCrime('carjack', v.mesh.position.x, v.mesh.position.z, 0.9);
      if (G.audio) G.audio.doorSlam();
    } else if (v.role === 'parked') {
      G.police?.reportCrime('carjack', v.mesh.position.x, v.mesh.position.z, 0.35);
      if (G.audio) G.audio.doorSlam();
    }
    v.role = 'player';
    v.driver = player;
    player.car = v;
    player.mode = 'car';
    mesh.visible = false;
    if (G.audio) G.audio.startEngine();
  }
  player.enterCar = enterCar;

  function exitCar() {
    const v = player.car;
    if (!v) return;
    const side = { x: v.mesh.position.x - Math.cos(v.angle) * 1.7, z: v.mesh.position.z + Math.sin(v.angle) * 1.7 };
    if (city.height(side.x, side.z) < 0.1) { side.x = v.mesh.position.x + Math.cos(v.angle) * 1.7; side.z = v.mesh.position.z - Math.sin(v.angle) * 1.7; }
    v.role = v.exploded ? 'wreck' : 'parked';
    v.driver = null;
    player.car = null;
    player.mode = 'foot';
    player.pos.x = side.x; player.pos.z = side.z;
    mesh.visible = true;
    mesh.position.set(side.x, city.height(side.x, side.z), side.z);
    if (G.audio) G.audio.stopEngine();
  }
  player.exitCar = exitCar;

  function stepFoot(dt) {
    const input = G.input;
    const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    let mx = 0, mz = 0;
    const cy = G.camYaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    if (input.keys.has('KeyW')) { mx += fx; mz += fz; }
    if (input.keys.has('KeyS')) { mx -= fx; mz -= fz; }
    if (input.keys.has('KeyD')) { mx += rx; mz += rz; }
    if (input.keys.has('KeyA')) { mx -= rx; mz -= rz; }
    const moving = (mx !== 0 || mz !== 0);
    const aiming = input.mouseDown || input.keys.has('KeyJ');
    if (moving) {
      const l = Math.hypot(mx, mz);
      const spd = (run ? 7.6 : 4.3) * (aiming ? 0.55 : 1);
      const desired = Math.atan2(mx / l, mz / l);
      if (!aiming) player.angle += clamp(angDiff(desired, player.angle), -10 * dt, 10 * dt);
      let nx = player.pos.x + (mx / l) * spd * dt;
      let nz = player.pos.z + (mz / l) * spd * dt;
      if (city.height(nx, nz) < 0.05) { nx = player.pos.x; nz = player.pos.z; }
      const res = collideBuildings(city, nx, nz, 0.45);
      nx = res.x; nz = res.z;
      for (const v of G.vehicles) { // cars are solid on foot too
        const dx = nx - v.mesh.position.x, dz = nz - v.mesh.position.z;
        const rr = v.radius + 0.45, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-5) { const d = Math.sqrt(d2); nx = v.mesh.position.x + (dx / d) * rr; nz = v.mesh.position.z + (dz / d) * rr; }
      }
      player.pos.x = nx; player.pos.z = nz;
      player.speed = spd;
      player.legPhase += dt * spd * 2.6;
    } else player.speed = 0;
    if (aiming) player.angle = G.camYaw + Math.PI;
    mesh.position.set(player.pos.x, city.height(player.pos.x, player.pos.z) + Math.abs(Math.sin(player.legPhase)) * 0.04 * (player.speed > 0 ? 1 : 0), player.pos.z);
    mesh.rotation.y = player.angle;
    const swing = Math.sin(player.legPhase) * 0.5 * clamp(player.speed / 4, 0, 1);
    mesh.userData.legL.rotation.x = swing;
    mesh.userData.legR.rotation.x = -swing;
    // firing
    player.fireCd -= dt;
    const w = G.combat.WEAPONS[player.weapon];
    const wantFire = input.mouseDown || input.keys.has('KeyJ');
    if (wantFire && player.fireCd <= 0 && !player.dead) {
      player.fireCd = w.rate;
      const dir = G.camera.getWorldDirection(G.tmpVec);
      const origin = { x: player.pos.x, y: mesh.position.y + 1.42, z: player.pos.z };
      G.combat.fire({ isPlayer: true, pedRef: null, car: null }, origin, { x: dir.x, y: dir.y, z: dir.z }, player.weapon);
      if (player.weapon !== 'fists' && G.audio) { /* shot sound already played in combat */ }
    }
    // interact (consume the press: several fixed steps share one frame's input)
    if (input.pressed.has('KeyF') || input.pressed.has('KeyE')) {
      input.pressed.delete('KeyF');
      input.pressed.delete('KeyE');
      const v = nearestVehicle(3.6);
      if (v) enterCar(v);
      else if (G.onInteract) G.onInteract();
    }
  }

  function stepCar(dt) {
    const input = G.input;
    const v = player.car;
    if (!v) { player.mode = 'foot'; return; }
    if (v.exploded) { // thrown clear of the wreck
      exitCar();
      player.hurt(18, v.mesh.position.x, v.mesh.position.z);
      return;
    }
    const ctl = {
      throttle: (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0),
      steer: (input.keys.has('KeyA') ? 1 : 0) - (input.keys.has('KeyD') ? 1 : 0),
      brake: input.keys.has('Space'),
    };
    stepVehicle(G, v, dt, ctl);
    player.pos.x = v.mesh.position.x;
    player.pos.z = v.mesh.position.z;
    player.angle = v.angle;
    player.speed = Math.abs(v.speed);
    if (G.audio) G.audio.engineUpdate(Math.abs(v.speed) / 38, ctl.throttle !== 0);
    if (input.pressed.has('KeyF') || input.pressed.has('KeyE')) {
      input.pressed.delete('KeyF');
      input.pressed.delete('KeyE');
      if (Math.abs(v.speed) < 14) exitCar();
    }
    // firing from the driver's seat: drive-by with the SMG/pistol toward the camera aim
    player.fireCd -= dt;
    if ((input.mouseDown || input.keys.has('KeyJ')) && player.weapon !== 'fists' && player.fireCd <= 0) {
      const w = G.combat.WEAPONS[player.weapon];
      player.fireCd = w.rate * 1.25;
      const dir = G.camera.getWorldDirection(G.tmpVec);
      const origin = { x: player.pos.x + dir.x * 1.6, y: v.mesh.position.y + 1.25, z: player.pos.z + dir.z * 1.6 };
      G.combat.fire({ isPlayer: true, car: v }, origin, { x: dir.x, y: dir.y, z: dir.z }, player.weapon);
    }
  }

  player.update = (dt) => {
    if (player.dead) return;
    player.hurtT += dt;
    if (player.hurtT > 6 && player.health < 100) player.health = Math.min(100, player.health + dt * 3.2);
    if (player.mode === 'foot') stepFoot(dt);
    else stepCar(dt);
    // weapon select
    const input = G.input;
    if (input.pressed.has('Digit1') && player.weapons.includes('fists')) player.weapon = 'fists';
    if (input.pressed.has('Digit2') && player.weapons.includes('pistol')) player.weapon = 'pistol';
    if (input.pressed.has('Digit3') && player.weapons.includes('smg')) player.weapon = 'smg';
    if (input.pressed.has('Digit4') && player.weapons.includes('shotgun')) player.weapon = 'shotgun';
    if (input.pressed.has('Digit5') && player.weapons.includes('rifle')) player.weapon = 'rifle';
  };

  return player;
}
