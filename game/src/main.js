// main.js — one job: conduct. It builds the game object from every module (city, world,
// vehicles, traffic, pedestrians, explosions, combat, audio, player, police, missions,
// minimap, hud), wires the cross-module events (a car destroyed becomes an explosion, an
// explosion hurts everyone nearby, a bust or a death costs money and resets the heat), owns
// input and the third-person camera, and runs the fixed-step loop. In ?shot= mode it hands
// the stage to shots.js instead of the title screen.

import * as THREE from 'three';
import { createCity } from './city.js';
import { createWorld } from './world3d.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createExplosions } from './explosions.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createMinimap } from './minimap.js';
import { createHud } from './hud.js';
import { loadSave, storeSave, wipeSave } from './save.js';
import { stageShot } from './shots.js';
import { clamp, dist2d } from './rng.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 7);

// ------------------------------------------------------------------ assembly
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic lift: warm highlights, purple shadows, nothing sits near-black
renderer.toneMappingExposure = 1.22;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);
camera.position.set(0, 30, 60);

const G = {
  scene, camera, renderer,
  save: loadSave(),
  cash: 0, respect: 0,
  phase: 0.565, phaseFixed: false,
  screen: 'title',
  objectivePos: null, routeWaypoints: null,
  shotCamera: null,
  tNow: 0,
};
G.cash = G.save.cash;
G.respect = G.save.respect;
G.city = createCity(SEED);
G.groundY = (x, z) => G.city.heightAt(x, z);
G.world = createWorld(scene, G.city);
G.glowTex = G.world.glowTex;
G.vehicles = createVehicles(scene, G.city, G.glowTex);
G.audio = createAudio();
G.fx = createExplosions(G);
G.traffic = createTraffic(G);
G.peds = createPedestrians(G);
G.combat = createCombat(G);
G.player = createPlayer(G);
G.police = createPolice(G);
G.missions = createMissions(G);
G.minimap = createMinimap(G);
G.hud = createHud(G);

// ------------------------------------------------------------------ wiring
G.persist = () => {
  storeSave({
    cash: G.cash, respect: G.respect,
    missionIdx: G.missions.S.idx, weapons: G.player.state.weapons,
    storyDone: G.missions.S.done,
  });
};

let routeAnchor = null;
G.setObjective = (x, z) => {
  if (x === null || x === undefined) {
    G.objectivePos = null;
    G.routeWaypoints = null;
    routeAnchor = null;
    return;
  }
  G.objectivePos = { x, z };
  const p = G.player.state;
  G.routeWaypoints = G.city.route(p.x, p.z, x, z);
  routeAnchor = { x: p.x, z: p.z };
};

let explosionCrimeT = 0;
G.onExplosion = (x, z, radius) => {
  // blast damage: cars chain, people fall, Rico feels it
  for (const car of G.vehicles.cars.slice()) {
    if (car.dead) continue;
    const d = dist2d(x, z, car.x, car.z);
    if (d < radius + car.radius) G.vehicles.damage(car, 85 * (1 - d / (radius + car.radius)) + 12, G.onVehicleEvent);
  }
  for (const ped of G.peds.peds) {
    if (ped.dead) continue;
    const d = dist2d(x, z, ped.x, ped.z);
    if (d < radius * 0.55) G.peds.kill(ped);
    else if (d < radius * 1.6) { ped.health -= 12; }
  }
  G.peds.panic(x, z, radius * 3.2);
  const p = G.player.state;
  const dp = dist2d(x, z, p.x, p.z);
  if (dp < radius + 2 && !p.car) G.player.damagePlayer(Math.max(6, 40 * (1 - dp / (radius + 2))), x, z);
  if (G.tNow - explosionCrimeT > 1.2) {
    explosionCrimeT = G.tNow;
    G.police.reportCrime('vandalism', x, z, true);
    G.police.reportCrime('shots', x, z, true);
  }
};

G.onVehicleEvent = (ev) => {
  const car = ev.car;
  if (ev.kind === 'crash') {
    if (G.audio) G.audio.crash(Math.min(1, ev.impact / 22));
    const p = G.player.state;
    if (car.type === 'interceptor' && p.car && dist2d(p.x, p.z, car.x, car.z) < 14) {
      if (!car.crimeCd || G.tNow - car.crimeCd > 4) {
        car.crimeCd = G.tNow;
        G.police.reportCrime('crashCop', car.x, car.z, true);
      }
    }
    return;
  }
  if (ev.kind === 'destroyed') {
    G.fx.explode(car.x, car.y + 0.7, car.z, car.type === 'van' ? 1.25 : 1);
    G.vehicles.wreckify(car);
    G.fx.addBurning(car.x, car.y, car.z, 26);
    if (car.type === 'interceptor') G.police.reportCrime('copDown', car.x, car.z, true);
    if (G.player.state.car === car) {
      // thrown clear of his own bursting car, hurt but alive
      G.player.exitCar();
      G.player.damagePlayer(16, car.x, car.z);
    }
  }
};

G.onPlayerShot = () => {};
G.onBusted = () => {
  if (G.screen !== 'play') return;
  const fine = Math.min(G.cash, 150 + G.police.stars * 45);
  G.cash -= fine;
  document.getElementById('bustedSub').textContent =
    `La SMPD te lleva a la Comisaría Central. Multa de $${fine} — estrellas limpias, bolsillo vacío.`;
  G.police.reset();
  G.player.revive();
  G.persist();
  setScreen('busted');
  if (G.audio) G.audio.bustedJingle();
  setTimeout(() => { if (G.screen === 'busted') setScreen('play'); }, 3000);
};
G.onPlayerDeath = () => {
  if (G.screen !== 'play') return;
  const bill = Math.min(G.cash, 220);
  G.cash -= bill;
  document.getElementById('wastedSub').textContent =
    `Despiertas en el hospital de Centro. Factura de $${bill}. La ciudad no perdona, pero cobra.`;
  G.police.reset();
  G.player.revive();
  G.persist();
  setScreen('wasted');
  setTimeout(() => { if (G.screen === 'wasted') setScreen('play'); }, 3000);
};

// objective beacon: a pillar of gold light over whatever Rico is chasing
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 0.85, 30, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
);
beacon.visible = false;
scene.add(beacon);

// ------------------------------------------------------------------ input
const keys = new Set();
let firing = false;
let camYaw = G.player.state.heading;
let camPitch = 0.06;
let settler = null;

function setScreen(name) {
  G.screen = name;
  G.hud.showScreen(name === 'shot' ? 'play' : name);
  if (name === 'play') G.hud.refreshObjective();
}

function enterPlay() {
  G.audio.init();
  if (titleAnchor && !G.playStarted) {
    // Rico leaves the title backdrop and starts his day at the Taller Marisol
    G.playStarted = true;
    const gp = G.city.places.garage;
    const p = G.player.state;
    p.x = gp.x + 3; p.z = gp.z + 2;
    p.y = G.city.heightAt(p.x, p.z);
    p.heading = -0.6;
    camYaw = p.heading;
    camPos.set(p.x - 8, p.y + 3, p.z - 8);
  }
  setScreen('play');
  G.hud.refreshWeapons();
  G.hud.toast(G.save.missionIdx > 0 || G.save.storyDone ? 'Bienvenido de vuelta, Rico' : 'Vice Solmara es tuya, Rico', 2400);
}

document.getElementById('btnContinue').addEventListener('click', enterPlay);
document.getElementById('btnNew').addEventListener('click', () => { wipeSave(); location.reload(); });
document.getElementById('btnResume').addEventListener('click', () => setScreen('play'));
document.getElementById('btnToTitle').addEventListener('click', () => setScreen('title'));
{
  const note = document.getElementById('saveNote');
  if (G.save.storyDone) note.textContent = 'Partida guardada · Historia completa · Rueda libre y encargos';
  else if (G.save.missionIdx > 0) note.textContent = `Partida guardada · Capítulo ${G.save.missionIdx + 1} · $${G.save.cash.toLocaleString('en-US')}`;
  else note.textContent = 'Sin partida guardada — empieza el Capítulo 1';
}

window.addEventListener('keydown', (e) => {
  G.audio.init();
  if (e.code === 'Enter' && G.screen === 'title') { enterPlay(); return; }
  keys.add(e.code);
  // screen toggles first: map and pause open AND close from here, in one place
  if (e.code === 'KeyM') {
    if (G.screen === 'play') { setScreen('map'); return; }
    if (G.screen === 'map') { setScreen('play'); return; }
  }
  if (e.code === 'Escape') {
    if (G.screen === 'play') { setScreen('pause'); return; }
    if (G.screen === 'pause' || G.screen === 'map') { setScreen('play'); return; }
  }
  if (G.screen !== 'play') return;
  if (e.code === 'KeyE') {
    if (G.hud.dialogueOpen) { G.hud.advanceDialogue(); return; }
    const p = G.player.state;
    if (p.car) G.player.exitCar();
    else {
      const near = G.player.nearestCar(3.4);
      if (near) G.player.enterCar(near);
    }
  }
  if (e.code === 'KeyR' && G.player.state.car) {
    G.audio.setRadio(true, G.audio.stationIdx + 1);
    G.hud.toast(`♪ ${G.audio.station.name} — ${G.audio.station.track}`, 1800);
  }
  if (e.code === 'Digit1') G.player.setWeapon('fists');
  if (e.code === 'Digit2') G.player.setWeapon('pistol');
  if (e.code === 'Digit3') G.player.setWeapon('smg');
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

renderer.domElement.addEventListener('click', () => {
  if (G.screen === 'play' && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camYaw -= e.movementX * 0.0028;
  camPitch = clamp(camPitch - e.movementY * 0.0028, -0.42, 0.6);
});
window.addEventListener('mousedown', (e) => { if (e.button === 0 && G.screen === 'play') firing = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// crosshair
{
  const cross = document.createElement('div');
  cross.style.cssText = 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:rgba(255,255,255,0.85);box-shadow:0 0 6px rgba(0,0,0,0.8);z-index:6;pointer-events:none;';
  cross.id = 'crosshair';
  document.body.appendChild(cross);
}

function readInput() {
  const k = (code) => keys.has(code);
  return {
    mx: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0),
    mz: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0),
    fwd: k('KeyW'), back: k('KeyS'), left: k('KeyA'), right: k('KeyD'),
    brake: k('Space'), sprint: k('ShiftLeft') || k('ShiftRight'),
  };
}

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(0, 26, 60);
function updateCamera(dt) {
  if (G.shotCamera) {
    const s = G.shotCamera;
    camera.position.set(s.x, s.y, s.z);
    camera.lookAt(s.lx, s.ly, s.lz);
    camera.fov = s.fov || 62;
    camera.updateProjectionMatrix();
    return;
  }
  camera.fov = 62;
  camera.updateProjectionMatrix();
  const p = G.player.state;
  if (G.screen === 'title') {
    const c = titleAnchor || G.city.places.garage;
    const a = G.tNow * 0.07;
    const tx = c.x + Math.cos(a) * 12.5, tz = c.z + Math.sin(a) * 12.5;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 2);
    camPos.z += (tz - camPos.z) * Math.min(1, dt * 2);
    camPos.y += ((G.city.heightAt(c.x, c.z) + 3.6) - camPos.y) * Math.min(1, dt * 2);
    camera.position.copy(camPos);
    camera.lookAt(c.x, G.city.heightAt(c.x, c.z) + 1.4, c.z);
    return;
  }
  const inCar = !!p.car;
  const dist = inCar ? 12.5 + Math.abs(p.car.speed) * 0.14 : 8.6;
  const height = inCar ? 4.4 : 2.9;
  const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
  const tx = p.x - fx * dist, tz = p.z - fz * dist;
  const ty = Math.max(G.city.heightAt(tx, tz) + 0.7, p.y + height);
  const blend = 1 - Math.exp(-dt * 5.2);
  camPos.x += (tx - camPos.x) * blend;
  camPos.z += (tz - camPos.z) * blend;
  camPos.y += (ty - camPos.y) * blend;
  camera.position.copy(camPos);
  camera.lookAt(p.x + fx * 3.5, p.y + 1.55 + camPitch * 5.5, p.z + fz * 3.5);
}

// ------------------------------------------------------------------ boot mode
let titleAnchor = null;
const shotName = params.get('shot');
if (shotName) {
  G.screen = 'shot';
  settler = stageShot(G, shotName);
  window.__shotReady = false;
} else {
  G.hud.showScreen('title');
  // the title backdrop: the hero GT parked on the boulevard bend by the Hotel Brisa,
  // palms and skyline behind it, Rico standing at its door
  const road = G.city.roads.find((r) => r.name === 'Bulevar Costero');
  const hotel = G.city.places.hotel;
  let bi = 0, bd = Infinity;
  road.pts.forEach((pt, i) => {
    const d = dist2d(hotel.x, hotel.z, pt.x, pt.z);
    if (d < bd) { bd = d; bi = i; }
  });
  const bp = road.pts[bi], bn = road.pts[(bi + 1) % road.pts.length];
  const heading = Math.atan2(bn.z - bp.z, bn.x - bp.x);
  G.vehicles.spawn('gt', bp.x, bp.z, heading, { driver: null, parked: true, color: 0xd92323 });
  titleAnchor = { x: bp.x, z: bp.z };
  const p = G.player.state;
  p.x = bp.x - Math.sin(heading) * 3.2;
  p.z = bp.z + Math.cos(heading) * 3.2;
  p.y = G.city.heightAt(p.x, p.z);
  p.heading = heading + 2.6;
}
G.hud.refreshObjective();
G.hud.refreshWeapons();
window.__game = G;

// ------------------------------------------------------------------ the loop
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dtRaw = Math.min(0.1, (now - last) / 1000);
  last = now;
  G.tNow += dtRaw;
  const simActive = G.screen === 'play' || G.screen === 'shot';
  if (simActive) {
    acc += dtRaw;
    let n = 0;
    while (acc >= STEP && n < 3) {
      acc -= STEP;
      n++;
      if (!G.phaseFixed) G.phase = Math.min(0.885, G.phase + STEP / 1500);
      if (G.screen === 'play') {
        const input = readInput();
        G.player.step(STEP, input, camYaw, camPitch);
        if (firing) G.player.tryFire(camYaw, camPitch);
      }
      G.traffic.step(STEP);
      G.peds.step(STEP, G.tNow);
      G.police.step(STEP, G.tNow);
      G.missions.step(STEP);
      G.combat.update(STEP);
      G.fx.update(STEP);
      if (settler && settler.step(STEP)) {
        window.__shotReady = true;
        settler = null;
      }
    }
    if (n === 3) acc = 0;
    // GPS route follows Rico
    if (G.objectivePos && routeAnchor && dist2d(G.player.state.x, G.player.state.z, routeAnchor.x, routeAnchor.z) > 30) {
      G.setObjective(G.objectivePos.x, G.objectivePos.z);
    }
  } else if (G.screen === 'title') {
    G.traffic.step(STEP);
    G.peds.step(STEP, G.tNow);
    G.fx.update(STEP);
  }
  const dusk = G.world.applyPhase(G.phase, G.tNow);
  G.world.update(dtRaw, G.tNow);
  G.vehicles.updateVisuals(dtRaw, G.tNow, dusk);
  G.player.updateVisual(G.tNow);
  // beacon over the objective (or the next story marker when roaming)
  const marker = G.objectivePos || (G.screen === 'play' ? G.missions.idleMarker() : null);
  if (marker) {
    beacon.visible = true;
    beacon.position.set(marker.x, G.city.heightAt(marker.x, marker.z) + 15, marker.z);
    beacon.material.opacity = 0.26 + 0.1 * Math.sin(G.tNow * 2.4);
  } else beacon.visible = false;
  updateCamera(dtRaw);
  if (G.screen === 'play' || G.screen === 'map' || G.screen === 'shot') G.hud.update(dtRaw);
  document.getElementById('crosshair').style.display =
    G.screen === 'play' && !G.player.state.car && G.player.state.weapon !== 'fists' ? 'block' : 'none';
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
