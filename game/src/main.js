// main.js — one job: conduct everything. Boot, the fixed-feel game loop,
// input, cameras (title orbit / on-foot follow / chase cam / shot pins),
// crime and consequence wiring between combat, police, traffic, missions
// and explosions, the day cycle, HUD refresh and saving.

import * as THREE from 'three';
import { PLACES, findRoute, districtAt, heightAt, graphAudit } from './city.js';
import { buildWorld, colliders } from './world3d.js';
import { Car } from './vehicles.js';
import { Traffic, allCars } from './traffic.js';
import { Crowd, Ped } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { ExplosionSystem } from './explosions.js';
import { Missions } from './missions.js';
import { Minimap } from './minimap.js';
import { HUD } from './hud.js';
import { loadSave, storeSave, wipeSave } from './save.js';
import { audio } from './audio.js';
import { stageShot, frameShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const world = buildWorld(scene);
let save = loadSave();
const hud = new HUD();
const minimap = new Minimap(document.getElementById('minimap'), document.getElementById('fullmap-canvas'));

const allPeds = [];
const G = {
  scene, hud, save, colliders, allCars, audio,
  camera,
  persist() { storeSave(save); },
  registerPed(p) { if (!allPeds.includes(p)) allPeds.push(p); },
  unregisterPed(p) { const i = allPeds.indexOf(p); if (i >= 0) allPeds.splice(i, 1); },
  spawnMissionCar(type, x, z) {
    const car = new Car(scene, type, type === 'van' ? 0x87a8b8 : 0x9a9aa2, x, z, 0);
    allCars.push(car);
    return car;
  },
  makeBeam() {
    const geo = new THREE.CylinderGeometry(1.6, 2.6, 18, 12, 1, true); geo.translate(0, 0, 0);
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    scene.add(beam);
    return beam;
  },
  enemyShot(fromPed, tx, tz) {
    audio.shot(false);
    const y1 = heightAt(fromPed.x, fromPed.z) + 1.5, y2 = heightAt(tx, tz) + 1.2;
    const pos = new Float32Array([fromPed.x, y1, fromPed.z, tx, y2, tz]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff9a7a, transparent: true, opacity: 0.85, fog: false }));
    scene.add(line);
    setTimeout(() => scene.remove(line), 70);
  },
};

const explosions = new ExplosionSystem(scene, {
  onBoom: (p) => audio.boom(p),
  onBlast: (x, z, r, dmg) => {
    for (const c of allCars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < r + 2) c.damage(dmg * Math.max(0.25, 1 - d / (r + 4)));
    }
    for (const p of allPeds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r * 0.7) p.hurt(40);
    }
    const P = G.player;
    const pd = Math.hypot((P.car ? P.car.x : P.x) - x, (P.car ? P.car.z : P.z) - z);
    if (pd < r && !SHOT) P.damage(26 * (1 - pd / r) + 4);
    crowd.scareAll(x, z, 44);
  },
});
G.explosions = explosions;

const player = new Player(scene, PLACES.clubFaro.x + 6, PLACES.clubFaro.z + 6);
G.player = player;
const traffic = new Traffic(scene, colliders);
G.traffic = traffic;
const crowd = new Crowd(scene);
crowd.peds.forEach(p => G.registerPed(p));
G.crowd = crowd;

let shotCrimeT = 0;
const police = new Police(scene, colliders, {
  playerPos: () => player.posInfo(),
  damagePlayer: (n) => { player.damage(n); },
  setSiren: (lvl) => audio.setSiren(lvl),
  onHeatLost: () => hud.toast('TE PERDIERON DE VISTA…'),
  onBusted: () => endRun('BUSTED'),
});
G.police = police;

const combat = new Combat(scene, {
  onShot: (w) => {
    audio.shot(w === 2);
    if (w > 0 && shotCrimeT <= 0) { police.crime('shot'); shotCrimeT = 2.5; }
    const pi = player.posInfo();
    crowd.scareAll(pi.x, pi.z, 30);
  },
  onCarHit: () => {},
  onPedHit: (p) => { if (p.role === 'citizen') police.crime('pedHit'); },
});
G.combat = combat;

const missions = new Missions(G);
G.missions = missions;
missions.placeMarina();

// ---------- state & input ----------
let state = SHOT ? 'shot' : 'title';
let mapOpen = false;
let dayMinutes = 19 * 60 + 47;
let hudT = 0, routeT = 0, currentRoute = null;
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  audio.init();
  if (state !== 'play') return;
  if (e.code === 'KeyM' || (e.code === 'Escape' && mapOpen)) { mapOpen = !mapOpen; document.getElementById('fullmap').classList.toggle('hidden', !mapOpen); }
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyR') { const tr = audio.cycleStation(); hud.setRadio(tr.label, tr.title); }
  if (e.code === 'Digit1') selectWeapon(0);
  if (e.code === 'Digit2') selectWeapon(1);
  if (e.code === 'Digit3') selectWeapon(2);
});
addEventListener('keyup', (e) => keys.delete(e.code));
document.getElementById('btn-new').addEventListener('click', () => { wipeSave(); location.href = location.pathname; });
document.getElementById('btn-continue').addEventListener('click', () => startPlay());
document.getElementById('btn-respawn').addEventListener('click', () => respawn());

function selectWeapon(i) {
  if (!save.weapons[i]) { hud.toast(i === 2 ? 'SMG BLOQUEADA — Marina la tiene (CH 4)' : 'Arma no disponible'); return; }
  player.weapon = i;
  hud.setWeapon(i);
}
function nearestCar(maxD) {
  const pi = player.posInfo();
  let best = null, bd = maxD;
  for (const c of allCars) { const d = Math.hypot(c.x - pi.x, c.z - pi.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function interact() {
  if (missions.advanceDialogue()) return;
  if (player.car) {
    const wasPolice = player.car.type === 'police';
    player.exitCar(scene);
    hud.setSpeed('', 0, 0, false);
    return;
  }
  const car = nearestCar(3.8);
  if (!car || car.dead) return;
  const wasDriven = car.driver === 'traffic';
  if (wasDriven) {
    // Carjacking: the driver bails and runs.
    const victim = new Ped(scene, car.x + 2, car.z + 1, {});
    victim.state = 'flee'; victim.fleeFrom = { x: car.x, z: car.z }; victim.fleeT = 4;
    crowd.peds.push(victim); G.registerPed(victim);
    police.crime('carjack');
    save.stats.carsStolen++;
  } else if (car.type === 'police') police.crime('theft');
  else if (!car.driver) save.stats.carsStolen += 0; // parked: quiet borrow
  player.enterCar(car);
  audio.init();
}
function startPlay() {
  audio.init();
  hud.showGame();
  state = 'play';
  hud.setCash(save.cash);
  hud.setRadio(...(function () { const t = audio.currentTrack(); return [t.label, t.title]; })());
  hud.setWeapon(player.weapon);
  if (save.missionIndex > 0 && !missions.complete) hud.toast('BIENVENIDO DE NUEVO, RICO');
}
function endRun(kind) {
  if (state !== 'play') return;
  state = 'over';
  police.clear();
  const fine = Math.floor(save.cash * 0.1);
  if (kind === 'BUSTED') { save.cash -= fine; save.stats.busts++; }
  else save.cash -= Math.floor(save.cash * 0.05);
  G.persist();
  hud.endScreen(kind, kind === 'BUSTED'
    ? 'La SMPD te cobró $' + fine + ' de fianza. Marina no está contenta.'
    : 'Despertaste en la clínica del puerto. La cuenta se llevó el 5%.');
}
function respawn() {
  hud.hideEnd();
  player.health = 100;
  if (player.car) player.exitCar(scene);
  player.teleport(PLACES.clubFaro.x + 6, PLACES.clubFaro.z + 6);
  hud.setCash(save.cash);
  state = 'play';
}

// ---------- cameras ----------
let camYaw = 0;
const camPos = new THREE.Vector3(140, 60, 220);
function updateCamera(dt, t) {
  if (SHOT) { frameShot(SHOT, G, t, dt); return; }
  if (state === 'title') {
    const a = t * 0.045;
    camPos.set(Math.cos(a) * 150, 42 + Math.sin(t * 0.2) * 6, Math.sin(a) * 150);
    camera.position.lerp(camPos, Math.min(1, dt * 2));
    camera.lookAt(0, 14, 0);
    return;
  }
  const pi = player.posInfo();
  if (player.car) {
    const c = player.car;
    const back = 8.6 + Math.abs(c.speed) * 0.14;
    const fx = -Math.sin(c.angle), fz = -Math.cos(c.angle);
    camPos.set(c.x - fx * back, heightAt(c.x, c.z) + 3.1, c.z - fz * back);
    camera.position.lerp(camPos, Math.min(1, dt * 5.5));
    camera.lookAt(c.x + fx * 9, heightAt(c.x, c.z) + 1.6, c.z + fz * 9);
    camYaw = c.angle;
  } else {
    const fx = -Math.sin(player.angle), fz = -Math.cos(player.angle);
    camPos.set(player.x - fx * 6.8, heightAt(player.x, player.z) + 3.0, player.z - fz * 6.8);
    camera.position.lerp(camPos, Math.min(1, dt * 7));
    camera.lookAt(player.x + fx * 4, heightAt(player.x, player.z) + 1.5, player.z + fz * 4);
    camYaw = player.angle;
  }
}

// ---------- per-frame HUD ----------
function refreshHUD(dt) {
  hudT -= dt;
  const pi = player.posInfo();
  if (hudT <= 0) {
    hudT = 0.15;
    hud.setCash(save.cash);
    hud.setClock(save.day, dayMinutes);
    hud.setStars(police.stars, police.seen);
    hud.setDistrict(districtAt(pi.x, pi.z).name);
    hud.setVitals(player.health, save.respect);
    hud.setDispatch(police.stars > 0 ? police.dispatchRows(pi.x, pi.z) : null);
    if (player.car) hud.setSpeed(player.car.def.name, Math.abs(player.car.speed) * 3.6, player.car.health / 100, true);
    else hud.setSpeed('', 0, 0, false);
    const tr = audio.currentTrack();
    hud.setRadio(tr.label, tr.title);
  }
  routeT -= dt;
  const obj = missions.objective || (missions.stage && missions.stage.type === 'chase' && missions.targetCar ? { x: missions.targetCar.x, z: missions.targetCar.z } : null);
  if (routeT <= 0) {
    routeT = 1.1;
    currentRoute = obj ? findRoute(pi.x, pi.z, obj.x, obj.z) : null;
  }
  const mmState = {
    px: pi.x, pz: pi.z, pangle: pi.heading, route: currentRoute, objective: obj,
    cops: police.units.map(u => ({ x: u.x, z: u.z })),
    cars: [],
    searchZone: police.stars > 0 && police.lastSeen ? { x: police.lastSeen.x, z: police.lastSeen.z, r: 46 } : null,
  };
  minimap.drawMini(mmState);
  if (mapOpen) minimap.drawFull(mmState);
  // Interact prompt.
  if (state === 'play' && !missions.dialogue) {
    if (player.car) hud.setInteract('E — Salir del coche');
    else {
      const car = nearestCar(3.8);
      hud.setInteract(car && !car.dead ? (car.driver === 'traffic' ? 'E — ¡Robar coche!' : 'E — Entrar · ' + car.def.name) : null);
    }
  } else hud.setInteract(null);
  hud.setCrosshair(state === 'play' && !player.car && player.weapon > 0);
}

// ---------- main loop ----------
const clockT = new THREE.Clock();
let elapsed = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clockT.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  shotCrimeT -= dt;
  if (state === 'play' && !mapOpen) {
    // Input → movement.
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (player.car) {
      const c = player.car;
      const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      c.drive(dt, fwd, steer, colliders, allCars);
      player.update(dt, 0, 0, false, colliders);
      save.stats.distanceKm += Math.abs(c.speed) * dt / 1000;
    } else {
      // Camera-relative wish direction (camera sits behind the player).
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const mx = strafe * cos - fwd * sin * -1 * -1; // resolved below with moveZ
      const wishX = (strafe * Math.cos(camYaw)) + (fwd * -Math.sin(camYaw));
      const wishZ = (strafe * -Math.sin(camYaw)) + (fwd * -Math.cos(camYaw));
      void mx;
      player.update(dt, wishX, wishZ, keys.has('ShiftLeft') || keys.has('ShiftRight'), colliders);
      if (keys.has('KeyF')) {
        combat.shoot(dt, player.x, player.z, player.angle, player.weapon, allCars, allPeds);
      }
    }
    if (keys.has('KeyF') && player.car) { /* no drive-by: keep hands on the wheel */ }
    traffic.update(dt);
    crowd.update(dt, t);
    police.update(dt, t);
    missions.update(dt);
    combat.update(dt);
    audio.setEngine(player.car ? Math.abs(player.car.speed) / player.car.def.top : 0, !!player.car);
    if (player.car) audio.updateRadio(dt);
    if (player.health <= 0) endRun('WASTED');
    dayMinutes += dt * 0.5;
    if (dayMinutes >= 1440) { dayMinutes -= 1440; save.day++; }
    const hour = dayMinutes / 60;
    const dusk = hour < 6 ? 0.95 : hour < 9 ? 0.35 : hour < 16 ? 0.12 : hour < 18.5 ? 0.3 : hour < 20.5 ? 0.62 : hour < 22.5 ? 0.9 : 0.97;
    world.setDusk(dusk);
  } else if (state === 'shot') {
    traffic.update(dt);
    crowd.update(dt, t);
    combat.update(dt);
    // Missions deliberately not updated: staged HUD/dialogue must hold.
  }
  // Burning / destroyed cars: fire, chain explosions.
  for (const c of allCars) {
    if (c.dead && !c.explodedFlag) {
      c.explodedFlag = true;
      save.stats.explosions++;
      explosions.explode(c.x, c.z, c.type === 'van' ? 1.3 : 1);
      if (!SHOT) police.crime('explosion');
    }
    if (c.dead || c.burning > 0) explosions.emitFire(c.x, c.z, dt, c.dead);
    if (c.burning > 0 && !c.dead) { c.burning -= dt; if (c.burning <= 0) c.damage(120); }
  }
  explosions.update(dt);
  world.update(t, dt);
  traffic.recycleNear(player.x, player.z);
  hud.update(dt);
  if (state === 'play' || state === 'shot') refreshHUD(dt);
  updateCamera(dt, t);
  renderer.render(scene, camera);
}

if (SHOT) {
  hud.showGame();
  if (SHOT === 'cover') { hud.el.title.classList.remove('hidden'); document.getElementById('hud').classList.add('hidden'); }
  stageShot(SHOT, G);
  world.setDusk(SHOT === 'explosion' ? 0.85 : 0.58);
}
console.info('Vice Solmara graph audit:', graphAudit());
window.__game = G;
loop();
