// main.js — one job: bring Solmara together. Builds the city and every system, owns the input,
// the chase camera and the fixed-step loop, moves between title / play / map / pause / busted /
// wasted, wires the cross-system hooks (blast, busted, wasted, interact), stages ?shot= scenes
// for the screenshots, and exposes window.__game for automated play-tests.
import * as THREE from '../vendor/three.module.js';
import { createRng, clamp, angDiff } from './rng.js';
import { buildCity } from './city.js';
import { createWorld3d } from './world3d.js';
import { createExplosions } from './explosions.js';
import { damageVehicle, stepVehicle } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './pedestrians.js';
import { createCombat } from './combat.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createMinimap } from './minimap.js';
import { createCrew } from './crew.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261120;
const rng = createRng(seed);

const G = {
  state: shotName ? 'shot' : 'title',
  vehicles: [], shake: 0, camYaw: 2.4, camPitch: 0.34, tmpVec: new THREE.Vector3(),
  input: { keys: new Set(), pressed: new Set(), mouseDown: false },
};
G.city = buildCity(seed);
G.world = createWorld3d(G.city);
G.scene = G.world.scene;
G.camera = G.world.camera;
G.renderer = G.world.renderer;
G.save = loadSave();
G.audio = createAudio(G);
G.explosions = createExplosions(G);
G.damageVehicle = (v, amt, cause) => damageVehicle(G, v, amt, cause);
G.stepVehicle = (v, dt, ctl) => stepVehicle(G, v, dt, ctl);
G.peds = createPeds(G, rng);
G.combat = createCombat(G);
G.player = createPlayer(G);
G.playerPos = () => G.player.pos;
G.playerAngle = () => (G.player.mode === 'car' && G.player.car ? G.player.car.angle : G.player.angle);
G.playerSpeed = () => (G.player.mode === 'car' && G.player.car ? G.player.car.speed : G.player.speed);
G.playerVelocity = () => {
  const a = G.playerAngle(), s = G.playerSpeed();
  return { x: Math.sin(a) * s, z: Math.cos(a) * s };
};
G.traffic = createTraffic(G, rng);
G.police = createPolice(G, rng);
G.missions = createMissions(G);
G.crew = createCrew(G);
G.minimap = createMinimap(G);
G.hud = createHud(G);
G.onInteract = () => { G.missions.tryInteract(); };
G.onBlast = (x, z, radius) => {
  for (const ped of G.peds.list) if (!ped.dead) G.peds.flee(ped, x, z);
  G.police.reportCrime('explosion', x, z, 1);
};
G.onPedDown = () => {};

// ------------------------------------------------------------------ flow control
let overT = 0, overKind = null;
G.onBusted = (fine) => {
  if (G.state !== 'play') return;
  G.state = 'over'; overKind = 'busted'; overT = 2.4;
  G.player.cash = Math.max(0, G.player.cash - fine);
  G.player.persist();
  G.hud.showBanner('BUSTED');
  if (G.audio) G.audio.sting(false);
};
G.onWasted = () => {
  if (G.state !== 'play') return;
  G.state = 'over'; overKind = 'wasted'; overT = 2.4;
  G.hud.showBanner('WASTED');
  if (G.audio) G.audio.sting(false);
};
function finishOver() {
  G.hud.hideBanner();
  G.police.setWanted(0);
  if (G.missions.phase === 'active') G.missions.failMission('The job fell apart — see Marina again.');
  if (overKind === 'busted') {
    const st = G.city.places.station;
    G.player.respawn({ x: st.x + 4, z: st.z + 4 });
    G.hud.toast('Released — the fine is paid. Stay cleaner.');
  } else {
    const h = G.city.places.hospital;
    G.player.cash = Math.max(0, G.player.cash - 150);
    G.player.persist();
    G.player.respawn({ x: h.x + 4, z: h.z + 4 });
    G.hud.toast('Patched up at Clínica del Sol — $150.');
  }
  overKind = null;
  G.state = 'play';
}
function startGame() {
  if (G.state !== 'title') return;
  G.state = 'play';
  G.audio.unlock();
  G.hud.hideTitle();
  G.hud.showHud();
  G.hud.setMission(0, '', 'See Marina at Taller Marisol');
  document.getElementById('status').textContent = 'Solmara Nights. See Marina at Taller Marisol.';
}

// ------------------------------------------------------------------ input
const canvas = document.getElementById('game');
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) G.input.pressed.add(e.code);
  G.input.keys.add(e.code);
  G.audio.unlock();
  if (G.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame();
  else if (G.state === 'play') {
    if (e.code === 'KeyM') { G.state = 'map'; G.hud.setMapOpen(true); G.minimap.drawFull(); }
    else if (e.code === 'KeyP') { G.state = 'pause'; G.hud.showPause(true); }
    else if (e.code === 'KeyR') G.audio.cycleStation();
  } else if (G.state === 'map' && (e.code === 'KeyM' || e.code === 'Escape')) { G.state = 'play'; G.hud.setMapOpen(false); }
  else if (G.state === 'pause' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter')) { G.state = 'play'; G.hud.showPause(false); }
});
window.addEventListener('keyup', (e) => G.input.keys.delete(e.code));
window.addEventListener('blur', () => { G.input.keys.clear(); G.input.mouseDown = false; });
canvas.addEventListener('mousedown', (e) => {
  G.audio.unlock();
  if (G.state === 'title') { startGame(); return; }
  if (e.button === 0) {
    G.input.mouseDown = true;
    if (G.state === 'play' && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch { /* headless or denied: mouse-look is optional */ }
    }
  }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) G.input.mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.state !== 'play') return;
  G.camYaw -= e.movementX * 0.0031;
  G.camPitch = clamp(G.camPitch + e.movementY * 0.0024, 0.08, 1.15);
  mouseIdle = 0;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.state === 'play' && !shotName && started) {
    G.state = 'pause';
    G.hud.showPause(true);
  }
});
let started = false;

// ------------------------------------------------------------------ camera
let mouseIdle = 99;
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = G.player;
  const focus = p.mode === 'car' && p.car ? p.car.mesh.position : p.mesh.position;
  camTarget.set(focus.x, focus.y + 1.7, focus.z);
  mouseIdle += dt;
  if (p.mode === 'car' && p.car && mouseIdle > 1.1 && G.state === 'play') {
    const behind = p.car.angle + Math.PI;
    G.camYaw += angDiff(behind, G.camYaw) * Math.min(1, dt * 2.4);
  }
  const aiming = p.mode === 'foot' && (G.input.mouseDown || G.input.keys.has('KeyJ'));
  const dist = p.mode === 'car' ? 9 + Math.abs(p.car.speed) * 0.1 : aiming ? 5 : 7.4;
  const elev = G.camPitch;
  const bx = Math.sin(G.camYaw) * Math.cos(elev), bz = Math.cos(G.camYaw) * Math.cos(elev), by = Math.sin(elev);
  const cxp = camTarget.x + bx * dist, czp = camTarget.z + bz * dist;
  let cyp = camTarget.y + by * dist;
  cyp = Math.max(cyp, G.city.height(cxp, czp) + 0.6);
  G.camera.position.set(cxp, cyp, czp);
  if (G.shake > 0.002) {
    G.camera.position.x += (Math.random() - 0.5) * G.shake;
    G.camera.position.y += (Math.random() - 0.5) * G.shake * 0.7;
    G.shake *= Math.exp(-dt * 5);
  }
  G.camera.fov = p.mode === 'car' ? 66 + Math.abs(p.car.speed) * 0.22 : 62;
  G.camera.updateProjectionMatrix();
  G.camera.lookAt(camTarget.x, camTarget.y + 0.4, camTarget.z);
}

// ------------------------------------------------------------------ stepping
const STEP = 1 / 60;
function stepWorld(dt, { live = true } = {}) {
  G.world.update(dt);
  G.traffic.update(dt);
  G.peds.update(dt);
  G.explosions.update(dt);
  G.combat.update(dt);
  if (!live) return;
  if (G.missions.dialogueOpen) {
    // the world breathes during dialogue, but Rico and the law hold still
    G.missions.update(dt);
    return;
  }
  G.player.update(dt);
  G.police.update(dt);
  G.missions.update(dt);
  G.crew.update(dt);
  G.audio.update(dt);
}

// ------------------------------------------------------------------ shot mode
if (shotName) {
  const scene = stageShot(G, shotName);
  let simT = 0, frames = 0;
  G.hud.update(0);
  function shotFrame() {
    requestAnimationFrame(shotFrame);
    const dt = 1 / 30;
    simT += dt;
    scene.t = simT;
    scene.update(dt);
    stepWorld(dt, { live: false });
    G.minimap.update(dt);
    G.hud.update(dt);
    G.renderer.render(G.scene, G.camera);
    frames++;
    if (simT >= scene.finishAt && frames > 10) window.__shotReady = true;
  }
  requestAnimationFrame(shotFrame);
} else {
  // ------------------------------------------------------------------ game loop
  started = true;
  let last = performance.now(), acc = 0, prevMouseDown = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const ft = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (G.state === 'play' || G.state === 'title' || G.state === 'over') {
      acc += ft;
      let n = 0;
      while (acc >= STEP && n < 5) {
        stepWorld(STEP, { live: G.state === 'play' });
        acc -= STEP;
        n++;
      }
      if (n === 5) acc = 0;
      if (G.state === 'over') {
        overT -= ft;
        if (overT <= 0) finishOver();
      }
      if (G.state === 'title') {
        // slow cinematic orbit of the bay while the title is up
        const t = now * 0.00004;
        G.camera.position.set(Math.cos(t) * 260, 95, Math.sin(t) * 260);
        G.camera.lookAt(0, 6, 0);
        G.camera.fov = 58; G.camera.updateProjectionMatrix();
      } else updateCamera(ft);
      G.minimap.update(ft);
    } else if (G.state === 'map') {
      G.minimap.drawFull();
    }
    if (G.state !== 'title') G.hud.update(ft);
    G.renderer.render(G.scene, G.camera);
    // dialogue advance + interact edges live outside the fixed steps (mouse = click edge only)
    const mouseEdge = G.input.mouseDown && !prevMouseDown;
    prevMouseDown = G.input.mouseDown;
    if (G.state === 'play' && G.missions.dialogueOpen && (G.input.pressed.has('KeyE') || G.input.pressed.has('KeyF') || mouseEdge)) {
      G.missions.advanceDialogue();
    }
    G.input.pressed.clear();
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ play-test hooks
window.__game = {
  G,
  start: startGame,
  setWanted: (n) => G.police.setWanted(n),
  teleport(x, z) {
    if (G.player.mode === 'car' && G.player.car) {
      G.player.car.mesh.position.set(x, G.city.height(x, z) + 0.05, z);
      G.player.car.speed = 0;
    }
    G.player.pos.x = x; G.player.pos.z = z;
    G.player.mesh.position.set(x, G.city.height(x, z), z);
  },
  fireOnce() {
    const dir = { x: Math.sin(G.player.angle), y: 0, z: Math.cos(G.player.angle) };
    const origin = { x: G.player.pos.x, y: G.player.mesh.position.y + 1.42, z: G.player.pos.z };
    G.combat.fire({ isPlayer: true, car: G.player.car }, origin, dir, G.player.weapon === 'fists' ? 'pistol' : G.player.weapon);
  },
  snapshot() {
    return {
      state: G.state,
      mode: G.player.mode,
      missionPhase: G.missions.phase,
      missionIndex: G.missions.index,
      stars: G.police.stars,
      heli: G.police.heliActive,
      cops: G.police.copCount,
      vehicles: G.vehicles.length,
      peds: G.peds.list.length,
      playerPos: { x: Math.round(G.player.pos.x), z: Math.round(G.player.pos.z) },
      health: Math.round(G.player.health),
      armour: Math.round(G.player.armour),
      cash: G.player.cash,
      respect: G.player.respect,
      weapon: G.player.weapon,
      ammo: G.player.ammo[G.player.weapon] || null,
      carHealth: G.player.car ? Math.round(G.player.car.health) : null,
      carSpeedKmh: G.player.car ? Math.round(Math.abs(G.player.car.speed) * 3.6) : 0,
      crewCds: G.crew.members.map((m) => Math.round(m.cd * 10) / 10),
      eyesOut: G.crew.eyesOutT > 0,
      district: G.crew.currentStanding(),
      rank: G.crew.rankFor(G.player.respect).title,
      station: G.audio.currentStation ? G.audio.currentStation.name : null,
      heliLocked: G.police.heliLocked,
    };
  },
};
