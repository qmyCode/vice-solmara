// police.js — one job: the law. A heat-and-stars wanted model fed by witnessed crimes, pursuit
// Interceptors that predict and ram, foot cops who pile out and bust you, roadblocks from
// 3 stars, a spotlight helicopter from 4, dispatch radio with callsigns and district names,
// and heat that bleeds off only when nobody — ground or air — has eyes on you.
import * as THREE from '../vendor/three.module.js';
import { clamp, angDiff, dist2d } from './rng.js';
import { createVehicle, stepVehicle } from './vehicles.js';
import { makeFigure } from './pedestrians.js';

const HEAT_FOR_STAR = [0, 40, 95, 160, 240, 340];
const CRIME_HEAT = { shots: 12, carShot: 20, carjack: 30, carjackQuiet: 12, pedShot: 55, pedHit: 60, copHit: 95, explosion: 45, guardDown: 40 };
const CALLSIGNS = ['GAVIOTA-2', 'HALCÓN-1', 'BRISA-4', 'MUELLE-3', 'FARO-2', 'CORAL-5', 'PALMA-1', 'VIGÍA-6'];
const COPS_BY_STAR = [0, 2, 3, 5, 6, 7];

export function createPolice(G, rng) {
  const city = G.city;
  const state = {
    heat: 0, stars: 0, seenT: 99, bustT: 0, boxT: 0,
    cars: [], foot: [], roadblockCd: 20, dispatchCd: 0, callsignI: 0,
    heli: null, heliActive: false, lostAnnounced: false,
  };
  const unitName = () => CALLSIGNS[state.callsignI++ % CALLSIGNS.length];
  function dispatch(text) {
    if (G.hud) G.hud.dispatch(text);
  }
  function witnessed(x, z, radius = 70) {
    for (const c of state.cars) if (dist2d(x, z, c.mesh.position.x, c.mesh.position.z) < radius) return true;
    for (const f of state.foot) if (dist2d(x, z, f.mesh.position.x, f.mesh.position.z) < radius * 0.7) return true;
    if (state.heliActive) return true;
    for (const ped of G.peds.list) if (!ped.dead && dist2d(x, z, ped.mesh.position.x, ped.mesh.position.z) < 24) return true;
    return false;
  }
  function reportCrime(kind, x, z, severity = 1) {
    const base = CRIME_HEAT[kind] || 10;
    const loud = kind === 'explosion' || kind === 'pedHit';
    if (!loud && !witnessed(x, z)) return;
    if (kind === 'carjack' && !witnessed(x, z, 40)) { state.heat += CRIME_HEAT.carjackQuiet; }
    else state.heat += base * severity;
    if (G.crew) G.crew.onCrime(x, z); // the district remembers what it saw
    state.heat = clamp(state.heat, 0, 420);
    const before = state.stars;
    recalcStars();
    if (state.stars > before) {
      const d = city.districtAt(x, z);
      dispatch(`${unitName()}: suspect escalated — ${state.stars} star${state.stars > 1 ? 's' : ''}, ${d ? d.name : 'Centro'}.`);
    } else if (kind === 'shots' && state.dispatchCd <= 0) {
      const d = city.districtAt(x, z);
      dispatch(`Dispatch: shots fired, ${d ? d.name : 'Centro'}. Units respond.`);
      state.dispatchCd = 9;
    }
  }
  function recalcStars() {
    let s = 0;
    for (let i = 1; i <= 5; i++) if (state.heat >= HEAT_FOR_STAR[i]) s = i;
    state.stars = s;
  }
  function setWanted(n) {
    state.heat = n <= 0 ? 0 : HEAT_FOR_STAR[n] + 1;
    recalcStars();
  }
  // The crew's plate swap: heat falls to just under the current star's threshold,
  // which costs the suspect exactly one star (or clears a lone star entirely).
  function dropStar() {
    if (state.stars <= 0) return;
    state.heat = Math.max(0, HEAT_FOR_STAR[state.stars] - 1);
    recalcStars();
  }
  function losBlocked(ax, az, bx, bz) {
    for (let s = 1; s <= 3; s++) {
      const x = ax + (bx - ax) * (s / 4), z = az + (bz - az) * (s / 4);
      for (const c of city.colliders) {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz > (c.hw + c.hd) * (c.hw + c.hd)) continue;
        const cos = Math.cos(-c.rot), sin = Math.sin(-c.rot);
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) return true;
      }
    }
    return false;
  }
  function playerSeen() {
    const pp = G.playerPos();
    for (const c of state.cars) {
      const d = dist2d(pp.x, pp.z, c.mesh.position.x, c.mesh.position.z);
      if (d < 88 && !losBlocked(pp.x, pp.z, c.mesh.position.x, c.mesh.position.z)) return true;
    }
    for (const f of state.foot) if (dist2d(pp.x, pp.z, f.mesh.position.x, f.mesh.position.z) < 46) return true;
    if (state.heliActive && dist2d(pp.x, pp.z, state.heli.mesh.position.x, state.heli.mesh.position.z) < 78) return true;
    return false;
  }
  function spawnCopCar() {
    const pp = G.playerPos();
    const minD = state.stars >= 3 ? 85 : 120; // hot pursuits roll in closer, so help arrives fast
    for (let tries = 0; tries < 20; tries++) {
      const n = city.randomNode();
      const d = dist2d(n.x, n.z, pp.x, pp.z);
      if (d > minD && d < 210 && city.height(n.x, n.z) > 0.3) {
        const car = createVehicle(city, 'interceptor', 0x1c1f24, n.x, n.z, Math.atan2(pp.x - n.x, pp.z - n.z), 'police');
        car.unit = unitName();
        car.stuckT = 0; car.path = null; car.pathI = 0; car.footOut = false;
        G.scene.add(car.mesh);
        G.vehicles.push(car);
        state.cars.push(car);
        return car;
      }
    }
    return null;
  }
  function spawnFootCop(fromCar) {
    const mesh = makeFigure(0x2456a8, 0xc68863, 0x0a0a12);
    const x = fromCar.mesh.position.x - Math.cos(fromCar.angle) * 1.6, z = fromCar.mesh.position.z + Math.sin(fromCar.angle) * 1.6;
    mesh.position.set(x, city.height(x, z), z);
    G.scene.add(mesh);
    const cop = { mesh, angle: fromCar.angle, fromCar, legPhase: 0 };
    state.foot.push(cop);
    return cop;
  }
  function buildHeli() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x22262e });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 3.4, 4, 10), mat);
    body.rotation.x = Math.PI / 2;
    grp.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), mat);
    tail.position.set(0, 0.25, -4.2);
    grp.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.7), mat);
    fin.position.set(0, 0.7, -6.3);
    grp.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.7), new THREE.MeshBasicMaterial({ color: 0x11131a }));
    rotor.position.y = 1.45;
    grp.add(rotor);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.02, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
    glass.position.set(0, 0.05, 2.1);
    grp.add(glass);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 42, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -21.5;
    grp.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 1400, 130, 0.34, 0.5, 1.1);
    grp.add(spot);
    grp.add(spot.target);
    spot.position.set(0, -0.6, 0.8);
    G.scene.add(grp);
    return { mesh: grp, rotor, spot, angle: 0, orbit: 0 };
  }
  function busted() {
    const fine = 120 + state.stars * 130;
    state.heat = 0;
    recalcStars();
    state.bustT = 0; state.boxT = 0;
    if (G.onBusted) G.onBusted(fine);
  }
  function setRoadblock() {
    const pp = G.playerPos();
    if (!G.player || G.player.mode !== 'car' || !G.player.car) return;
    const car = G.player.car;
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    for (let tries = 0; tries < 24; tries++) {
      const n = city.randomNode();
      const dx = n.x - pp.x, dz = n.z - pp.z, d = Math.hypot(dx, dz);
      if (d < 75 || d > 135) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.55) continue;
      if (city.height(n.x, n.z) < 0.3) continue;
      // two interceptors angled across the road at that node
      const ang = Math.atan2(dx, dz) + Math.PI / 2;
      for (const off of [-2.6, 2.6]) {
        const bx = n.x + Math.cos(ang) * off, bz = n.z - Math.sin(ang) * off;
        const blocker = createVehicle(city, 'interceptor', 0x1c1f24, bx, bz, ang + 0.5, 'roadblock');
        blocker.unit = unitName();
        blocker.blockT = 45;
        G.scene.add(blocker.mesh);
        G.vehicles.push(blocker);
        state.cars.push(blocker);
      }
      dispatch(`Dispatch: roadblock up ahead of the suspect, ${city.districtAt(n.x, n.z)?.name || 'Solmara'}.`);
      state.roadblockCd = 42;
      return;
    }
  }
  function updateCar(cop, dt) {
    const pp = G.playerPos();
    const pos = cop.mesh.position;
    const d = dist2d(pos.x, pos.z, pp.x, pp.z);
    if (cop.role === 'roadblock') {
      cop.blockT -= dt;
      flashLights(cop, dt);
      if (cop.blockT <= 0 || d < 12) { cop.role = 'police'; cop.stuckT = 0; cop.path = null; }
      return;
    }
    // follow a graph route when far or stuck, otherwise steer straight at the prediction
    const pv = G.playerVelocity();
    const tx = pp.x + pv.x * clamp(d * 0.02, 0, 0.65), tz = pp.z + pv.z * clamp(d * 0.02, 0, 0.65);
    if (Math.abs(cop.speed) < 0.8 && state.stars > 0) cop.stuckT += dt; else cop.stuckT = 0;
    if ((d > 115 || cop.stuckT > 2.2) && !cop.path) {
      cop.path = city.route(pos.x, pos.z, pp.x, pp.z);
      cop.pathI = 0;
      cop.stuckT = 0;
    }
    let target = { x: tx, z: tz };
    if (cop.path && cop.pathI < cop.path.length) {
      target = cop.path[cop.pathI];
      if (dist2d(pos.x, pos.z, target.x, target.z) < 8) cop.pathI++;
      if (cop.pathI >= cop.path.length || d < 60) cop.path = null;
    }
    const desired = Math.atan2(target.x - pos.x, target.z - pos.z);
    const steer = clamp(angDiff(desired, cop.angle) * 1.8, -1, 1);
    let throttle = 1;
    if (d < 9) throttle = 0.55;
    if (d < 4.2 && Math.abs(cop.speed) > Math.abs(G.playerSpeed()) + 2) throttle = -0.4;
    stepVehicle(G, cop, dt, { throttle, steer, brake: d < 3 && Math.abs(cop.speed) > 6 });
    flashLights(cop, dt);
    // pile out when the player is on foot and close
    if (!cop.footOut && G.player.mode === 'foot' && d < 15 && Math.abs(cop.speed) < 2.4 && state.foot.length < 4) {
      cop.footOut = true;
      spawnFootCop(cop);
      if (state.foot.length <= 2) spawnFootCop(cop);
    }
  }
  function flashLights(cop, dt) {
    const lb = cop.mesh.userData.lightbar;
    if (!lb) return;
    const t = performance.now() * 0.012;
    lb.red.color.setHex(0xff2a2a).multiplyScalar(Math.sin(t + cop.id) > 0 ? 2.8 : 0.3);
    lb.blue.color.setHex(0x2a6bff).multiplyScalar(Math.sin(t + cop.id) < 0 ? 2.8 : 0.3);
  }
  function update(dt) {
    state.dispatchCd -= dt;
    state.roadblockCd -= dt;
    const seen = state.stars > 0 && playerSeen();
    if (seen) {
      state.seenT = 0;
      if (state.lostAnnounced) { state.lostAnnounced = false; dispatch(`${unitName()}: visual re-acquired, ${city.districtAt(G.playerPos().x, G.playerPos().z)?.name || 'Centro'}.`); }
    } else if (state.stars > 0) {
      state.seenT += dt;
      if (state.seenT > 5 && !state.lostAnnounced) { state.lostAnnounced = true; dispatch('Dispatch: all units, we have lost visual on the suspect.'); }
      if (state.seenT > 7) { // the heat bleeds off a star at a time while nobody watches
        state.seenT = 3.5;
        state.heat = Math.max(0, state.heat - 62);
        recalcStars();
      }
    }
    // fleet size by stars — at 3+ stars the fleet musters in pairs per tick, so at
    // least three pursuers are on the suspect within moments instead of trickling in
    const want = COPS_BY_STAR[state.stars];
    const active = state.cars.filter((c) => c.role === 'police' && !c.exploded);
    if (active.length < want) {
      spawnCopCar();
      if (state.stars >= 3 && active.length + 1 < want) spawnCopCar();
    }
    for (let i = state.cars.length - 1; i >= 0; i--) {
      const cop = state.cars[i];
      const d = dist2d(cop.mesh.position.x, cop.mesh.position.z, G.playerPos().x, G.playerPos().z);
      if (cop.exploded || (state.stars === 0 && d > 130) || d > 620) {
        if (!cop.exploded) { G.scene.remove(cop.mesh); G.vehicles.splice(G.vehicles.indexOf(cop), 1); state.cars.splice(i, 1); }
        continue;
      }
      if (state.stars > 0) updateCar(cop, dt);
      else { stepVehicle(G, cop, dt, { throttle: 0.4, steer: 0, brake: false }); flashLights(cop, dt); }
    }
    if (state.stars === 0 && state.cars.length) { /* stragglers drive off and despawn above */ }
    // roadblocks
    if (state.stars >= 3 && state.roadblockCd <= 0) setRoadblock();
    // foot cops
    const pp = G.playerPos();
    for (let i = state.foot.length - 1; i >= 0; i--) {
      const cop = state.foot[i];
      const d = dist2d(cop.mesh.position.x, cop.mesh.position.z, pp.x, pp.z);
      if (G.player.mode === 'car' && d > 26 || state.stars === 0 && d > 20) {
        G.scene.remove(cop.mesh);
        state.foot.splice(i, 1);
        continue;
      }
      const desired = Math.atan2(pp.x - cop.mesh.position.x, pp.z - cop.mesh.position.z);
      cop.angle += clamp(angDiff(desired, cop.angle), -4.4 * dt, 4.4 * dt);
      const spd = G.player.mode === 'foot' ? 6.3 : 0;
      cop.mesh.position.x += Math.sin(cop.angle) * spd * dt;
      cop.mesh.position.z += Math.cos(cop.angle) * spd * dt;
      cop.mesh.position.y = city.height(cop.mesh.position.x, cop.mesh.position.z);
      cop.mesh.rotation.y = cop.angle;
      cop.legPhase += dt * 9;
      cop.mesh.userData.legL.rotation.x = Math.sin(cop.legPhase) * 0.6;
      cop.mesh.userData.legR.rotation.x = -Math.sin(cop.legPhase) * 0.6;
    }
    // bust logic
    if (G.state === 'play' && !G.player.dead && state.stars > 0) {
      if (G.player.mode === 'foot') {
        const near = state.foot.some((f) => dist2d(f.mesh.position.x, f.mesh.position.z, pp.x, pp.z) < 1.8);
        if (near && Math.abs(G.playerSpeed()) < 2.3) {
          state.bustT += dt;
          if (G.hud) G.hud.setBustMeter(state.bustT / 1.15);
          if (state.bustT > 1.15) busted();
        } else { state.bustT = Math.max(0, state.bustT - dt * 2); if (G.hud) G.hud.setBustMeter(state.bustT / 1.15); }
      } else {
        const boxers = state.cars.filter((c) => !c.exploded && dist2d(c.mesh.position.x, c.mesh.position.z, pp.x, pp.z) < 9.5).length;
        if (boxers >= 2 && Math.abs(G.playerSpeed()) < 1.6) {
          state.boxT += dt;
          if (G.hud) G.hud.setBustMeter(state.boxT / 2.2);
          if (state.boxT > 2.2) busted();
        } else { state.boxT = Math.max(0, state.boxT - dt * 2); if (G.hud) G.hud.setBustMeter(state.boxT / 2.2); }
      }
    }
    // helicopter
    if (state.stars >= 4 && !state.heli) {
      state.heli = buildHeli();
      state.heliActive = true;
      const p = G.playerPos();
      state.heli.mesh.position.set(p.x + 60, city.height(p.x, p.z) + 42, p.z + 60);
      dispatch('Dispatch: HALCÓN-9 airborne — spotlight on the suspect.');
    }
    if (state.heli) {
      const heli = state.heli;
      if (state.stars < 3) {
        heli.mesh.position.y += dt * 14;
        heli.mesh.position.x += dt * 30;
        if (heli.mesh.position.y > 130) { G.scene.remove(heli.mesh); state.heli = null; state.heliActive = false; }
      } else {
        state.heliActive = true;
        heli.orbit += dt * 0.24;
        const tx = pp.x + Math.cos(heli.orbit) * 13, tz = pp.z + Math.sin(heli.orbit) * 13;
        const ty = city.height(pp.x, pp.z) + 40;
        heli.mesh.position.x += (tx - heli.mesh.position.x) * Math.min(1, dt * 1.5);
        heli.mesh.position.z += (tz - heli.mesh.position.z) * Math.min(1, dt * 1.5);
        heli.mesh.position.y += (ty - heli.mesh.position.y) * Math.min(1, dt * 1.2);
        heli.mesh.lookAt(pp.x, heli.mesh.position.y - 6, pp.z);
        heli.rotor.rotation.y += dt * 28;
        heli.spot.target.position.set(pp.x - heli.mesh.position.x, -40, pp.z - heli.mesh.position.z);
      }
    }
  }

  return {
    update, reportCrime, setWanted, dropStar,
    get stars() { return state.stars; },
    get heat() { return state.heat; },
    get heliActive() { return state.heliActive; },
    // The spotlight has the suspect when the heli is up, near, and has line of sight.
    get heliLocked() {
      if (!state.heliActive || !state.heli) return false;
      const pp = G.playerPos();
      const h = state.heli.mesh.position;
      return dist2d(pp.x, pp.z, h.x, h.z) < 46 && !losBlocked(pp.x, pp.z, h.x, h.z);
    },
    get copCount() { return state.cars.filter((c) => !c.exploded).length + state.foot.length; },
    state,
  };
}
