// police.js — one job: the SMPD response. A floating wanted level fed by reported crimes
// becomes 0-5 stars; interceptors spawn on the road graph and hunt with predictive steering,
// dispatch gives every unit a callsign, a tactic and a distance for the HUD feed, roadblocks
// stage across the road at 3 stars, and at 4 stars the helicopter arrives with its spotlight
// (and starts shooting at 5). Heat cools only when nobody — ground unit or air unit — can see
// Rico; stand still next to a cop and the bust meter fills.

import * as THREE from 'three';
import { Rng, clamp, angDiff, dist2d } from './rng.js';

const CALLSIGNS = ['GAVIOTA', 'HALCÓN', 'BRISA', 'MUELLE', 'FARO', 'CORAL', 'PALMA', 'VIGÍA', 'LUNA', 'SIERRA'];
const CRIME_POINTS = {
  shots: 0.55, theft: 1.0, carjack: 1.6, vandalism: 0.7, assault: 1.3, murder: 2.1,
  crashCop: 1.4, copDown: 2.4, speeding: 0.3, mission: 1.0,
};

export function createPolice(G) {
  const { city } = G;
  const rng = new Rng(city.seed * 13 + 3);
  const state = {
    level: 0, stars: 0, cops: [], searchT: 0, bustT: 0, seen: false,
    heli: null, roadblock: null, roadblockT: 0, spawnT: 0,
  };
  let callsignIdx = 0;

  function reportCrime(kind, x, z, seen) {
    const pts = CRIME_POINTS[kind] || 0.5;
    state.level = clamp(state.level + (seen ? pts : pts * 0.35), 0, 5);
    if (seen) state.searchT = 0;
  }

  /** Line of sight: no building bulk between the two points. */
  function los(ax, az, bx, bz) {
    const d = dist2d(ax, az, bx, bz);
    if (d > 130) return false;
    const steps = Math.max(2, Math.floor(d / 7));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of city.colliders) {
        if (dist2d(x, z, c.x, c.z) < c.r * 0.92) return false;
      }
    }
    return true;
  }

  function spawnPoint(minD, maxD) {
    const p = G.player.state;
    for (let tries = 0; tries < 24; tries++) {
      const node = city.nodes[rng.int(0, city.nodes.length - 1)];
      const d = dist2d(p.x, p.z, node.x, node.z);
      if (d >= minD && d <= maxD) return node;
    }
    return city.nodes[city.nearestNode(p.x + 60, p.z)];
  }

  function spawnCop() {
    const node = spawnPoint(52, 95);
    const car = G.vehicles.spawn('interceptor', node.x, node.z, Math.atan2(G.player.state.z - node.z, G.player.state.x - node.x), { driver: 'cop' });
    const cop = {
      car, callsign: `${CALLSIGNS[callsignIdx % CALLSIGNS.length]}-${(callsignIdx % 9) + 1}`,
      tactic: 'PURSUIT', role: 'chase', stuckT: 0,
    };
    callsignIdx++;
    state.cops.push(cop);
    return cop;
  }

  function removeCop(cop) {
    G.vehicles.removeCar(cop.car);
    state.cops.splice(state.cops.indexOf(cop), 1);
  }

  function buildHeli() {
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.2, 2.6), bodyMat);
    grp.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 0.7), bodyMat);
    tail.position.set(-4.6, 0.5, 0);
    grp.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.4), bodyMat);
    fin.position.set(-6.7, 0.9, 0);
    grp.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.09, 0.55), new THREE.MeshLambertMaterial({ color: 0x0c0c0e }));
    rotor.position.y = 1.45;
    grp.add(rotor);
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 0.16), bodyMat);
    skidL.position.set(0, -1.5, 1.1);
    const skidR = skidL.clone();
    skidR.position.z = -1.1;
    grp.add(skidL, skidR);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7.5, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    cone.position.y = -18;
    grp.add(cone);
    const spot = new THREE.SpotLight(0xfff2c0, 2.2, 90, 0.32, 0.5, 0.6);
    grp.add(spot);
    grp.add(spot.target);
    G.scene.add(grp);
    return { mesh: grp, rotor, cone, spot, active: false, angle: 0, x: 0, y: 60, z: 0, fireT: 0 };
  }

  function stageRoadblock() {
    const p = G.player.state;
    // aim ahead of the player's travel: use the GPS route if one is set, else facing
    let tx, tz;
    if (G.routeWaypoints && G.routeWaypoints.length > 3) {
      const wp = G.routeWaypoints[Math.min(4, G.routeWaypoints.length - 1)];
      tx = wp.x; tz = wp.z;
    } else {
      const h = p.car ? p.car.heading : p.heading;
      tx = p.x + Math.cos(h) * 85; tz = p.z + Math.sin(h) * 85;
    }
    const node = city.nodes[city.nearestNode(tx, tz)];
    if (dist2d(p.x, p.z, node.x, node.z) < 40) return;
    const cars = [];
    for (let i = -1; i <= 1; i += 2) {
      const car = G.vehicles.spawn('interceptor', node.x + i * 3.4, node.z + i * 1.5, Math.PI / 3, { driver: 'cop', parked: true });
      const cop = { car, callsign: `FARO-${rng.int(2, 9)}`, tactic: 'ROADBLOCK', role: 'block', stuckT: 0 };
      state.cops.push(cop);
      cars.push(cop);
    }
    state.roadblock = { x: node.x, z: node.z, cops: cars };
    state.roadblockT = 40;
  }

  function clearRoadblock() {
    if (!state.roadblock) return;
    for (const cop of state.roadblock.cops) removeCop(cop);
    state.roadblock = null;
  }

  /** What the HUD dispatch feed shows: one line per notable unit. */
  function dispatch() {
    const p = G.player.state;
    const out = [];
    if (state.heli && state.heli.active) {
      out.push({
        callsign: 'GAVIOTA-5', tactic: state.stars >= 5 ? 'FIRING' : 'SPOTLIGHT',
        text: state.stars >= 5 ? 'Air unit weapons free — engage the suspect' : 'Air unit overhead — spotlight on the suspect, ground units converge',
        dist: Math.round(dist2d(p.x, p.z, state.heli.x, state.heli.z)),
      });
    }
    const sorted = state.cops.slice().sort((a, b) => dist2d(p.x, p.z, a.car.x, a.car.z) - dist2d(p.x, p.z, b.car.x, b.car.z));
    for (const cop of sorted.slice(0, 4)) {
      const d = Math.round(dist2d(p.x, p.z, cop.car.x, cop.car.z));
      let text;
      if (cop.role === 'block') text = 'Roadblock staged ahead — box him in';
      else if (cop.tactic === 'RAMMING') text = 'Suspect in reach — ram and spin him';
      else text = state.seen ? 'All units, suspect flagged — converge' : 'Searching the grid — report any sighting';
      out.push({ callsign: cop.callsign, tactic: cop.tactic, text, dist: d });
    }
    return out;
  }

  function desiredCops() {
    return [0, 2, 3, 4, 5, 7][state.stars] || 0;
  }

  function step(dt, tNow) {
    const p = G.player.state;
    state.stars = clamp(Math.ceil(state.level - 0.001), 0, 5);
    if (state.level <= 0.02) state.stars = 0;

    // who can see Rico right now?
    let seenNow = false;
    for (const cop of state.cops) {
      if (cop.car.dead) continue;
      const d = dist2d(p.x, p.z, cop.car.x, cop.car.z);
      cop.sees = d < 95 && los(cop.car.x, cop.car.z, p.x, p.z);
      if (cop.sees) seenNow = true;
    }
    if (state.heli && state.heli.active && dist2d(p.x, p.z, state.heli.x, state.heli.z) < 170) seenNow = true;
    state.seen = seenNow;
    if (seenNow) state.searchT = 0;
    else {
      state.searchT += dt;
      if (state.searchT > 5 && state.level > 0) {
        state.level = Math.max(0, state.level - dt * 0.055);
      }
    }

    // force size follows the stars
    state.spawnT -= dt;
    const want = desiredCops() + (state.roadblock ? 0 : 0);
    const chaseCops = state.cops.filter((c) => c.role === 'chase');
    if (state.stars > 0 && chaseCops.length < want && state.spawnT <= 0) {
      spawnCop();
      state.spawnT = 1.4;
    }
    // recycle: far-away chasers quietly reposition ahead of the player
    for (const cop of chaseCops) {
      const d = dist2d(p.x, p.z, cop.car.x, cop.car.z);
      if (d > 240 && !cop.car.dead) {
        const node = spawnPoint(60, 100);
        cop.car.x = node.x; cop.car.z = node.z;
        cop.car.speed = 0;
      }
    }
    if (state.stars === 0) {
      for (const cop of state.cops.slice()) removeCop(cop);
      clearRoadblock();
    }

    // roadblocks at 3+ stars while Rico drives
    state.roadblockT -= dt;
    if (state.stars >= 3 && p.car && !state.roadblock && state.roadblockT <= 0) {
      stageRoadblock();
      state.roadblockT = 30;
    }
    if (state.roadblock) {
      const d = dist2d(p.x, p.z, state.roadblock.x, state.roadblock.z);
      if (d > 150 || state.stars < 3) clearRoadblock();
    }

    // ---- drive the pursuit ----
    const pvx = p.car ? Math.cos(p.car.heading) * p.car.speed : 0;
    const pvz = p.car ? Math.sin(p.car.heading) * p.car.speed : 0;
    for (const cop of state.cops) {
      const car = cop.car;
      if (car.dead || cop.role === 'block') continue;
      const d = dist2d(p.x, p.z, car.x, car.z);
      // predictive intercept: aim where Rico will be, not where he is
      const predict = clamp(d / 26, 0.25, 1.5);
      const tx = p.x + pvx * predict, tz = p.z + pvz * predict;
      const desired = Math.atan2(tz - car.z, tx - car.x);
      let steer = clamp(angDiff(car.heading, desired) * 1.9, -1, 1);
      let throttle = 1;
      if (d < 7) { throttle = 0.55; cop.tactic = 'RAMMING'; }
      else cop.tactic = 'PURSUIT';
      if (Math.abs(angDiff(car.heading, desired)) > 2.4 && d < 12) throttle = -1; // reverse out of a nose-in
      G.vehicles.stepCar(car, dt, { throttle, steer }, G.onVehicleEvent);
      if (Math.abs(car.speed) < 0.5 && throttle > 0) {
        cop.stuckT += dt;
        if (cop.stuckT > 3.5) {
          cop.stuckT = 0;
          const node = spawnPoint(45, 80);
          car.x = node.x; car.z = node.z; car.speed = 0;
        }
      } else cop.stuckT = 0;
    }

    // ---- the helicopter ----
    if (state.stars >= 4 && !state.heli) state.heli = buildHeli();
    if (state.heli) {
      const heli = state.heli;
      heli.active = state.stars >= 4;
      heli.mesh.visible = heli.active;
      if (heli.active) {
        heli.angle += dt * 0.32;
        const hx = p.x + Math.cos(heli.angle) * 27;
        const hz = p.z + Math.sin(heli.angle) * 27;
        heli.x += (hx - heli.x) * Math.min(1, dt * 1.6);
        heli.z += (hz - heli.z) * Math.min(1, dt * 1.6);
        heli.y = city.heightAt(heli.x, heli.z) + 31;
        heli.mesh.position.set(heli.x, heli.y, heli.z);
        heli.mesh.rotation.y = -Math.atan2(p.z - heli.z, p.x - heli.x);
        heli.rotor.rotation.y += dt * 28;
        heli.spot.target.position.set(p.x - heli.x, -31, p.z - heli.z);
        heli.spot.target.updateMatrixWorld();
        // at 5 stars the air unit opens fire in bursts
        heli.fireT -= dt;
        if (state.stars >= 5 && heli.fireT <= 0 && dist2d(p.x, p.z, heli.x, heli.z) < 60) {
          heli.fireT = 2.3;
          for (let i = 0; i < 5; i++) {
            const spread = 2.6;
            const txp = p.x + rng.range(-spread, spread), tzp = p.z + rng.range(-spread, spread);
            G.combat.drawTracer(
              { x: heli.x, y: heli.y - 1, z: heli.z },
              { x: txp, y: (p.car ? p.car.y : p.y) + 0.8, z: tzp }, 0xff8855);
          }
          if (G.audio) G.audio.shot('smg');
          if (rng.chance(0.55)) {
            if (p.car) G.vehicles.damage(p.car, 5, G.onVehicleEvent);
            else G.player.damagePlayer(5, heli.x, heli.z);
          }
        }
      }
    }

    // ---- the bust meter ----
    let bustPressure = false;
    if (state.stars > 0 && state.seen) {
      if (!p.car) {
        for (const cop of state.cops) {
          if (!cop.car.dead && dist2d(p.x, p.z, cop.car.x, cop.car.z) < 6.5) bustPressure = true;
        }
      } else if (Math.abs(p.car.speed) < 1.6) {
        let near = 0;
        for (const cop of state.cops) if (dist2d(p.x, p.z, cop.car.x, cop.car.z) < 11) near++;
        if (near >= 2) bustPressure = true;
      }
    }
    if (bustPressure) {
      state.bustT += dt;
      if (state.bustT > 1.7 && G.onBusted) G.onBusted();
    } else state.bustT = Math.max(0, state.bustT - dt * 1.6);

    if (G.audio) {
      let sirenNear = false;
      for (const cop of state.cops) if (dist2d(p.x, p.z, cop.car.x, cop.car.z) < 48) sirenNear = true;
      G.audio.setSiren(sirenNear && state.stars > 0);
    }
  }

  function reset() {
    state.level = 0;
    state.stars = 0;
    state.bustT = 0;
    state.searchT = 0;
    for (const cop of state.cops.slice()) removeCop(cop);
    clearRoadblock();
    if (state.heli) state.heli.active = false;
    if (G.audio) G.audio.setSiren(false);
  }

  return {
    state, reportCrime, step, reset, dispatch, los,
    get stars() { return state.stars; },
    get level() { return state.level; },
  };
}
