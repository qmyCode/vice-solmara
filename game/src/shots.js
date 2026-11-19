// shots.js — one job: stage the four dossier screenshots inside the real game (?shot=<name>).
// Each scene drives the actual systems — the player really sits in the hero GT while the SMPD
// converges for the cover, the chase autopilot really drives the boulevard at four stars with
// the helicopter overhead, and in the finale Rico really shoots a taxi until it blows. Nothing
// is composited: when a scene has settled, it raises window.__shotReady for the capture tool.

import { clamp, angDiff, dist2d } from './rng.js';

/** A point on a named road nearest to (x, z), with the road's direction there. */
function roadAnchor(city, roadName, x, z) {
  const road = city.roads.find((r) => r.name === roadName);
  let best = null, bestD = Infinity, bestI = 0;
  road.pts.forEach((p, i) => {
    const d = dist2d(x, z, p.x, p.z);
    if (d < bestD) { bestD = d; best = p; bestI = i; }
  });
  const next = road.pts[(bestI + 1) % road.pts.length];
  return { x: best.x, z: best.z, heading: Math.atan2(next.z - best.z, next.x - best.x), idx: bestI, road };
}

/**
 * A stream of traffic rolling along a road's points (kinematic dressing: the cars hold their
 * lane and speed so a staged frame stays composed). Returns a roll(dt) driver.
 */
function trafficStream(G, road, startIdx, count, spacing, speed) {
  const rollers = [];
  const types = ['sedan', 'taxi', 'hatch', 'sedan', 'pickup', 'hatch', 'taxi', 'sedan', 'van'];
  for (let k = 0; k < count; k++) {
    const i = Math.min(startIdx + k * spacing, road.pts.length - 2);
    const pt = road.pts[i], nx = road.pts[i + 1];
    const heading = Math.atan2(nx.z - pt.z, nx.x - pt.x);
    const lane = (k % 2 === 0 ? 1 : -1) * 1.9;
    const car = G.vehicles.spawn(types[k % types.length],
      pt.x - Math.sin(heading) * lane, pt.z + Math.cos(heading) * lane, heading, { driver: 'traffic' });
    car.speed = speed;
    rollers.push({ car, i, lane });
  }
  return function roll(dt) {
    for (const r of rollers) {
      const target = road.pts[Math.min(r.i + 1, road.pts.length - 1)];
      const tx = target.x - Math.sin(r.car.heading) * r.lane, tz = target.z + Math.cos(r.car.heading) * r.lane;
      const d = dist2d(r.car.x, r.car.z, tx, tz);
      if (d < 2.5 && r.i < road.pts.length - 2) { r.i++; continue; }
      const desired = Math.atan2(tz - r.car.z, tx - r.car.x);
      r.car.heading += clamp(angDiff(r.car.heading, desired), -1.4 * dt, 1.4 * dt);
      r.car.x += Math.cos(r.car.heading) * speed * dt;
      r.car.z += Math.sin(r.car.heading) * speed * dt;
      r.car.y = G.city.heightAt(r.car.x, r.car.z);
      r.car.speed = speed;
    }
  };
}

/** Citizens on both sidewalks around an anchor — the near-field life of a staged frame. */
function sidewalkPeds(G, ax, az, fx, fz, rx, rz, count = 5) {
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const along = -6 + i * 7;
    G.peds.spawnAt(ax + fx * along + rx * side * 7.4, az + fz * along + rz * side * 7.4);
  }
}

/** Write the mission panel directly (staging a mid-mission moment for the camera). */
function setPanel(G, ch, title, label, sub, pipCount, pipNow) {
  const els = G.hud.els;
  els.mpChapter.textContent = ch;
  els.mpTitle.textContent = title;
  els.mpLabel.textContent = label;
  els.mpSub.textContent = sub;
  els.mpPips.innerHTML = '';
  for (let i = 0; i < pipCount; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip' + (i < pipNow ? ' done' : i === pipNow ? ' now' : '');
    els.mpPips.appendChild(pip);
  }
}

/** Drive a car along a waypoint list like a calm traffic driver (the chase autopilot). */
function autopilot(G, car, dt, cruise) {
  if (!car.route || car.routeI >= car.route.length) {
    const target = G.objectivePos || { x: car.x + 60, z: car.z };
    car.route = G.city.route(car.x, car.z, target.x, target.z);
    car.routeI = 1;
  }
  let wp = car.route[car.routeI];
  while (car.routeI < car.route.length - 1 && dist2d(car.x, car.z, wp.x, wp.z) < 10) {
    car.routeI++;
    wp = car.route[car.routeI];
  }
  const desired = Math.atan2(wp.z - car.z, wp.x - car.x);
  const steer = clamp(angDiff(car.heading, desired) * 1.8, -1, 1);
  const throttle = car.speed < cruise ? 1 : 0.1;
  G.vehicles.stepCar(car, dt, { throttle, steer }, G.onVehicleEvent);
}

export function stageShot(G, name) {
  const { city } = G;
  const p = G.player.state;
  G.phaseFixed = true;
  document.body.classList.add('shot-mode');

  if (name === 'cover') {
    G.phase = 0.615; // golden-hour peak
    // the canyon: Radial Brisa at Club Faro — facades hug both sides, the club's neon is at
    // street level, and the street runs full of traffic in both directions
    const club = city.places.club;
    const anchor = roadAnchor(city, 'Radial Brisa', club.x, club.z);
    const hero = G.vehicles.spawn('gt', anchor.x, anchor.z, anchor.heading - 0.32, { driver: 'player', color: 0xd92323 });
    G.player.state.car = hero;
    hero.driver = 'player';
    p.x = hero.x; p.z = hero.z; p.heading = anchor.heading;
    G.player.state.mesh.visible = false;
    hero.speed = 13;
    const fx = Math.cos(anchor.heading), fz = Math.sin(anchor.heading);
    const rx = -fz, rz = fx;
    const at = (fwd, side, ang = 0) => ({
      x: anchor.x + fx * fwd + rx * side, z: anchor.z + fz * fwd + rz * side, heading: anchor.heading + ang,
    });
    const c2p = at(6.5, -6.8, 0.45);
    const cop2 = G.vehicles.spawn('interceptor', c2p.x, c2p.z, c2p.heading, { driver: 'cop' });
    const c3p = at(11.5, 5.6, -0.5); // a second interceptor cutting in across the hero's nose
    const cop3 = G.vehicles.spawn('interceptor', c3p.x, c3p.z, c3p.heading, { driver: 'cop' });
    // the van that is about to burn, left of the title block against the neon facades
    const vanP = at(16, -4.6);
    const van = G.vehicles.spawn('van', vanP.x, vanP.z, anchor.heading, { driver: null, parked: true, color: 0xd9d4c8 });
    // a full street: eight cars rolling away ahead + two oncoming with their lights in our eyes
    const rollTraffic = trafficStream(G, anchor.road, anchor.idx + 3, 8, 2, 7);
    const oncoming = [];
    for (let i = 0; i < 2; i++) {
      const op = at(38 + i * 16, -3.1);
      const car = G.vehicles.spawn(i === 0 ? 'taxi' : 'hatch', op.x, op.z, anchor.heading + Math.PI, { driver: 'traffic' });
      car.speed = 6;
      oncoming.push(car);
    }
    sidewalkPeds(G, anchor.x, anchor.z, fx, fz, rx, rz, 6);
    G.police.state.level = 4.4; // stars so the helicopter joins the frame
    G.hud.showScreen('title');
    document.body.classList.add('cover-mode');
    let t = 0, blown = false;
    return {
      step(dt) {
        t += dt;
        // hold the cast in formation: hero rolls slowly, cops hold their marks
        hero.x += fx * 4.4 * dt; hero.z += fz * 4.4 * dt;
        hero.y = city.heightAt(hero.x, hero.z);
        cop2.x += fx * 4.2 * dt; cop2.z += fz * 4.2 * dt; cop2.y = city.heightAt(cop2.x, cop2.z);
        cop3.x += fx * 4.2 * dt; cop3.z += fz * 4.2 * dt; cop3.y = city.heightAt(cop3.x, cop3.z);
        rollTraffic(dt);
        for (const car of oncoming) {
          car.x -= fx * 5 * dt; car.z -= fz * 5 * dt;
          car.y = city.heightAt(car.x, car.z);
        }
        p.x = hero.x; p.z = hero.z;
        if (G.police.state.heli) {
          // the spotlight plays on the burning van, far enough that the beam stays a beam
          const heli = G.police.state.heli;
          heli.mesh.position.set(hero.x + fx * 14 - rx * 9, city.heightAt(hero.x, hero.z) + 13, hero.z + fz * 14 - rz * 9);
          heli.rotor.rotation.y += dt * 30;
        }
        if (!blown && t > 0.9) {
          blown = true;
          G.fx.explode(van.x, van.y + 0.6, van.z, 1.3);
          G.vehicles.wreckify(van);
          G.fx.addBurning(van.x, van.y, van.z, 30);
        }
        // low on the asphalt inside the canyon, hero three-quarter rear, neon on both walls
        const camX = hero.x - fx * 9 - rx * 3.8, camZ = hero.z - fz * 9 - rz * 3.8;
        G.shotCamera = {
          x: camX, y: city.heightAt(camX, camZ) + 1.45, z: camZ,
          lx: hero.x + fx * 12, ly: hero.y + 1.3, lz: hero.z + fz * 12, fov: 70,
        };
        return blown && t > 1.3;
      },
    };
  }

  if (name === 'dialogue') {
    G.phase = 0.575;
    const hotel = city.places.hotel;
    const anchor = roadAnchor(city, 'Bulevar Costero', hotel.x, hotel.z);
    p.x = anchor.x + 3.4; p.z = anchor.z + 2.4;
    p.y = city.heightAt(p.x, p.z);
    p.heading = 2.45;
    const gt = G.vehicles.spawn('gt', anchor.x - 2.5, anchor.z - 1.5, anchor.heading + 0.4, { driver: null, parked: true, color: 0xd92323 });
    void gt;
    G.hud.showScreen('play');
    G.missions.startMission();
    G.setObjective(city.places.club.x, city.places.club.z);
    setPanel(G, 'CH 1', 'PRIMER ENCARGO', 'Go to Club Faro', 'The package waits by the stage door', 2, 0);
    let t = 0;
    return {
      step(dt) {
        t += dt;
        setPanel(G, 'CH 1', 'PRIMER ENCARGO', 'Go to Club Faro', 'The package waits by the stage door', 2, 0);
        const camX = p.x + 5.6, camZ = p.z + 4.6;
        G.shotCamera = {
          x: camX, y: p.y + 1.65, z: camZ,
          lx: p.x - 1.5, ly: p.y + 1.25, lz: p.z - 1, fov: 55,
        };
        return t > 3.7;
      },
    };
  }

  if (name === 'chase') {
    G.phase = 0.615; // golden-hour peak
    // the canyon again: mid Radial Brisa, facades and neon on both walls, sidewalks busy.
    // The hero drives the road's own dense spline points (not the sparse GPS graph): pure
    // pursuit over graph nodes cuts chords across the facades the canyon is made of.
    const anchor = roadAnchor(city, 'Radial Brisa', 172, -106);
    const pts = anchor.road.pts;
    const club = city.places.club;
    const dirSgn = dist2d(club.x, club.z, pts[anchor.idx + 3].x, pts[anchor.idx + 3].z)
      < dist2d(club.x, club.z, pts[anchor.idx - 3].x, pts[anchor.idx - 3].z) ? 1 : -1;
    const route0 = [];
    for (let i = anchor.idx; i >= 0 && i < pts.length && route0.length < 60; i += dirSgn) route0.push(pts[i]);
    const startH = Math.atan2(route0[1].z - route0[0].z, route0[1].x - route0[0].x);
    const hero = G.vehicles.spawn('gt', route0[0].x, route0[0].z, startH, { driver: 'player', color: 0xd92323 });
    hero.route = route0;
    hero.routeI = 1;
    p.car = hero;
    hero.driver = 'player';
    p.x = hero.x; p.z = hero.z; p.heading = startH;
    G.player.state.mesh.visible = false;
    hero.speed = 14;
    G.setObjective(city.places.club.x, city.places.club.z);
    // a living street ahead: eight traffic cars rolling the same spline, well up the road
    const stream = [];
    const wps = route0;
    const streamTypes = ['sedan', 'taxi', 'hatch', 'pickup', 'sedan', 'taxi', 'hatch', 'sedan'];
    for (let k = 0; k < 8; k++) {
      const wi = 10 + k * 4;
      if (wi >= wps.length) break;
      const wp = wps[wi];
      const car = G.vehicles.spawn(streamTypes[k], wp.x, wp.z, startH, { driver: 'traffic' });
      car.route = wps;
      car.routeI = wi;
      stream.push(car);
    }
    // a staged roadblock across the road ahead: two interceptors angled nose-in
    if (wps.length > 24) {
      const bp = wps[24];
      const bx = Math.cos(startH), bz = Math.sin(startH);
      G.vehicles.spawn('interceptor', bp.x - bz * 2.7, bp.z + bx * 2.7, startH + 2.55, { driver: 'cop', parked: true });
      G.vehicles.spawn('interceptor', bp.x + bz * 2.7, bp.z - bx * 2.7, startH - 2.55 + Math.PI, { driver: 'cop', parked: true });
    }
    const fx0 = Math.cos(startH), fz0 = Math.sin(startH);
    sidewalkPeds(G, route0[0].x, route0[0].z, fx0, fz0, -fz0, fx0, 6);
    G.police.state.level = 4.25;
    if (G.audio) G.audio.setRadio(true, 0);
    G.hud.showScreen('play');
    // Marina rides the radio the whole chase — her line stays open over the action
    G.hud.showDialogue([{ who: 'marina', text: '¡No frenes, Rico! El helicóptero te tiene marcado — piérdete entre los callejones.' }], () => {});
    G.missions.S.dialogueOpen = true;
    let t = 0;
    return {
      step(dt) {
        t += dt;
        autopilot(G, hero, dt, 14);
        for (const car of stream) autopilot(G, car, dt, 12);
        p.x = hero.x; p.z = hero.z; p.heading = hero.heading;
        // the main loop re-derives the idle panel as the car moves; re-assert the staged one
        setPanel(G, 'CH 5', 'LUNA DE PAPEL', 'Lose the heat', 'They can see you · break line of sight', 3, 1);
        const fx = Math.cos(hero.heading), fz = Math.sin(hero.heading);
        // the helicopter LOW and CLOSE, upper-centre, its spotlight cone raking the street
        if (G.police.state.heli && G.police.state.heli.mesh) {
          const heli = G.police.state.heli;
          heli.mesh.position.set(hero.x + fx * 9.5 - fz * 1.5, hero.y + 7.5, hero.z + fz * 9.5 + fx * 1.5);
          heli.mesh.rotation.y = -hero.heading;
          heli.rotor.rotation.y += dt * 30;
          heli.x = heli.mesh.position.x; heli.z = heli.mesh.position.z;
        }
        // tight low chase cam: 5.5 m back, 1.1 m up, a shoulder to the side — the GT fills the frame
        G.shotCamera = {
          x: hero.x - fx * 5.5 - fz * 2.0, y: hero.y + 1.1, z: hero.z - fz * 5.5 + fx * 2.0,
          lx: hero.x + fx * 7, ly: hero.y + 1.3, lz: hero.z + fz * 7, fov: 72,
        };
        return t > 2.3;
      },
    };
  }

  // boom: Rico on foot in the old town, SMG out, a taxi about to burn, a dialogue line live
  G.phase = 0.685;
  const anchor = roadAnchor(city, 'Travesía 2', -190, -140);
  p.x = anchor.x; p.z = anchor.z;
  p.y = city.heightAt(p.x, p.z);
  const fx = Math.cos(anchor.heading), fz = Math.sin(anchor.heading);
  const taxi = G.vehicles.spawn('taxi', anchor.x + fx * 10.5, anchor.z + fz * 10.5, anchor.heading + 0.25, { driver: null, parked: true });
  taxi.health = 26;
  const copP = { x: anchor.x - fx * 13, z: anchor.z - fz * 13 };
  G.vehicles.spawn('interceptor', copP.x, copP.z, anchor.heading, { driver: 'cop', parked: true });
  if (!p.weapons.includes('smg')) p.weapons.push('smg');
  G.player.setWeapon('smg');
  p.heading = anchor.heading;
  G.police.state.level = 2.6;
  G.hud.showScreen('play');
  G.setObjective(taxi.x, taxi.z);
  setPanel(G, 'CH 5', 'LUNA DE PAPEL', 'Stop the van', 'The bag is by the stage door', 3, 0);
  G.hud.showDialogue([{ who: 'marina', text: '¡Eso es! Que arda, Rico — the whole barrio is watching.' }], () => {});
  G.missions.S.dialogueOpen = true;
  let t = 0, blownAt = -1;
  return {
    step(dt) {
      t += dt;
      setPanel(G, 'CH 5', 'LUNA DE PAPEL', 'Stop the van', 'The bag is by the stage door', 3, 0);
      if (t > 0.55 && blownAt < 0) {
        // fire real SMG bursts at the taxi until the tank goes
        p.fireT = 0;
        const dx = taxi.x - p.x, dz = taxi.z - p.z;
        const dy = (taxi.y + 0.6) - (p.y + 1.5);
        const len = Math.hypot(dx, dy, dz) || 1;
        const hit = G.combat.shoot(p.x, p.y + 1.5, p.z, dx / len, dy / len, dz / len, 'smg');
        if (hit.kind === 'car' && hit.car === taxi && taxi.health <= 0) blownAt = t;
        if (taxi.dead) blownAt = t;
      }
      const camX = p.x - fx * 7.6 - fz * 2.2, camZ = p.z - fz * 7.6 + fx * 2.2;
      G.shotCamera = {
        x: camX, y: p.y + 2.3, z: camZ,
        lx: taxi.x, ly: taxi.y + 1, lz: taxi.z, fov: 58,
      };
      return blownAt > 0 && t > blownAt + 0.34;
    },
  };
}
