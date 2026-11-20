// shots.js — one job: stage the four dossier screenshots as real scenes of the running game
// (?shot=cover|dialogue|chase|combat&seed=1). Each scene drives the actual systems — scripted
// cars on the real roads, the real explosion system (given time so its plume develops past a
// clean sphere), the real HUD, dialogue and dispatch — and main.js sets __shotReady when the
// scene has settled. Nothing here is composited.
import * as THREE from '../vendor/three.module.js';
import { createVehicle, damageVehicle } from './vehicles.js';
import { MISSIONS } from './missions.js';

function stuntHeli(G, x, y, z, coneR = 9.5, coneOp = 0.12) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 3.4, 4, 10), mat);
  body.rotation.x = Math.PI / 2;
  grp.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), mat);
  tail.position.set(0, 0.25, -4.2);
  grp.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.7), new THREE.MeshBasicMaterial({ color: 0x11131a }));
  rotor.position.y = 1.45;
  grp.add(rotor);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, 44, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: coneOp, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.position.y = -22.5;
  grp.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 1500, 140, 0.36, 0.5, 1.1);
  spot.position.set(0, -0.6, 0.8);
  grp.add(spot);
  grp.add(spot.target);
  grp.position.set(x, y, z);
  G.scene.add(grp);
  return { grp, rotor, spot };
}
function driveAlong(G, car, dt, tx, tz, cruise) {
  const dx = tx - car.mesh.position.x, dz = tz - car.mesh.position.z;
  const desired = Math.atan2(dx, dz);
  let diff = (desired - car.angle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.7));
  G.stepVehicle(car, dt, { throttle: car.speed > cruise ? 0 : 0.92, steer, brake: car.speed > cruise + 6 });
}
function roadTarget(city, roadName, t, ahead) {
  const road = city.roads.find((r) => r.name === roadName);
  const i = Math.min(road.pts.length - 1, Math.floor(t * (road.pts.length - 1)) + ahead);
  return road.pts[Math.max(0, i)];
}
function roadPointAt(city, roadName, t) {
  const road = city.roads.find((r) => r.name === roadName);
  const i = Math.min(road.pts.length - 1, Math.floor(t * (road.pts.length - 1)));
  const p = road.pts[i], q = road.pts[Math.min(road.pts.length - 1, i + 1)];
  return { x: p.x, z: p.z, ang: Math.atan2(q.x - p.x, q.z - p.z) };
}
// Path-following by point index: the target is always a few points ahead along the road, so
// staged cars stay ON the road instead of cutting corners toward a distant fixed target.
function roadFollower(city, roadName, t0) {
  const road = city.roads.find((r) => r.name === roadName);
  return { road, idx: Math.round(t0 * (road.pts.length - 1)) };
}
function followRoad(G, car, F, dirSign, cruise, dt) {
  const pts = F.road.pts;
  const cp = car.mesh.position;
  const cur = pts[F.idx];
  if (Math.hypot(cur.x - cp.x, cur.z - cp.z) < 5) F.idx = Math.max(0, Math.min(pts.length - 1, F.idx + dirSign));
  const ti = Math.max(0, Math.min(pts.length - 1, F.idx + dirSign * 6));
  driveAlong(G, car, dt, pts[ti].x, pts[ti].z, cruise);
}
// Dispatch lines expire after 8 real seconds; headless captures take longer, so scenes
// re-post their lines whenever the feed has run dry. Same text, still the real HUD.
function keepFeed(G, lines) {
  const el = document.getElementById('dispatch');
  if (el && el.children.length === 0) for (const line of lines) G.hud.dispatch(line);
}
// A point trailing behind a car: staged pursuers aim there so they trail the hero
// instead of ramming it off the road.
function trailPoint(car, dist) {
  return {
    x: car.mesh.position.x - Math.sin(car.angle) * dist,
    z: car.mesh.position.z - Math.cos(car.angle) * dist,
  };
}

export function stageShot(G, name) {
  const city = G.city;
  G.world.setPhase(0.665);
  G.hud.hideTitle();
  G.hud.showHud();
  const S = { t: 0, name, boomed: false, boomed2: false, update: null };
  const finishAt = name === 'cover' ? 1.55 : name === 'dialogue' ? 0.7 : 1.5;

  if (name === 'cover') {
    // The south-shore boulevard (Bulevar Costero through the Bulevar del Sol district): a
    // real street canyon — buildings tight on both sides, the HOTEL BRISA neon sign on the
    // landward side, the bay opening out to seaward. The hero runs east along it with an
    // interceptor flanking each rear quarter and a van blowing up behind them, while the
    // camera rides low and close off the hero's front-seaward quarter: the Águila GT fills
    // the frame and the street, the law and the fire stream out behind it.
    const start = roadPointAt(city, 'Bulevar Costero', 0.738);
    const heroAng = start.ang; // travel with the road (increasing point index, eastward)
    const sf = { x: Math.sin(heroAng), z: Math.cos(heroAng) }; // forward
    const ss = { x: Math.cos(heroAng), z: -Math.sin(heroAng) }; // side (seaward on this shore)
    const hero = createVehicle(city, 'sports', 0xff8c1a, start.x, start.z, heroAng, 'parked');
    hero.speed = 8;
    G.scene.add(hero.mesh); G.vehicles.push(hero);
    const copA = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 6.5 - ss.x * 4.6, start.z - sf.z * 6.5 - ss.z * 4.6, heroAng, 'parked');
    copA.speed = 8;
    const copB = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 8 + ss.x * 3.8, start.z - sf.z * 8 + ss.z * 3.8, heroAng, 'parked');
    copB.speed = 8;
    G.scene.add(copA.mesh, copB.mesh); G.vehicles.push(copA, copB);
    // The van sits spun-out on the landward shoulder just ahead of the start point, so the
    // hero passes it in the first moments and it blows up close behind the hero's shoulder
    // — near enough that its plume towers into the sunset instead of reading as confetti.
    const van = createVehicle(city, 'van', 0x7a8a99,
      start.x + sf.x * 3 - ss.x * 5.2, start.z + sf.z * 3 - ss.z * 5.2, heroAng + 0.5, 'parked');
    G.scene.add(van.mesh); G.vehicles.push(van);
    const heli = stuntHeli(G, start.x - sf.x * 6 - ss.x * 14, city.height(start.x, start.z) + 29, start.z - sf.z * 6 - ss.z * 14, 8.5, 0.1);
    heli.spot.target.position.set(0, -29, -7);
    heli.spot.intensity = 700; // a rake of light behind the law, not a floodlight on the hero
    G.player.mesh.visible = false;
    G.hud.setCoverMode(true);
    const HF = roadFollower(city, 'Bulevar Costero', 0.738);
    S.update = (dt) => {
      followRoad(G, hero, HF, 1, 8, dt);
      const hp0 = hero.mesh.position;
      const fx = Math.sin(hero.angle), fz = Math.cos(hero.angle);
      const sx = Math.cos(hero.angle), sz = -Math.sin(hero.angle);
      // Flank targets: behind the hero, offset to each rear quarter. Cruise matched to
      // the hero's so the formation holds instead of the law rear-ending its quarry.
      driveAlong(G, copA, dt, hp0.x - fx * 6.5 - sx * 4.6, hp0.z - fz * 6.5 - sz * 4.6, 8.15);
      driveAlong(G, copB, dt, hp0.x - fx * 8 + sx * 3.8, hp0.z - fz * 8 + sz * 3.8, 8.1);
      heli.grp.position.x = hp0.x - fx * 6 - sx * 14;
      heli.grp.position.z = hp0.z - fz * 6 - sz * 14;
      heli.grp.position.y = city.height(hp0.x, hp0.z) + 29;
      heli.grp.lookAt(hp0.x, heli.grp.position.y - 8, hp0.z);
      heli.rotor.rotation.y += dt * 30;
      if (!S.boomed && S.t > 0.35) { S.boomed = true; damageVehicle(G, van, 500, 'shot'); }
      if (!S.boomed2 && S.t > 0.92) { S.boomed2 = true; G.explosions.boom(van.mesh.position.x, van.mesh.position.y + 1, van.mesh.position.z, { radius: 6 }); }
      // Low, close front three-quarter at a true 45°: the hero's face and seaward flank
      // fill the right of the frame (the poster title owns the lower-left), both
      // interceptors flanking behind it, the burning van over its landward shoulder,
      // neon-signed buildings lining the street beyond.
      const hp = hero.mesh.position;
      G.camera.position.set(hp.x + fx * 5.6 + sx * 5.2, hp.y + 1.6, hp.z + fz * 5.6 + sz * 5.2);
      G.camera.lookAt(hp.x - fx * 0.6, hp.y + 1.0, hp.z - fz * 0.6);
      G.camera.fov = 60; G.camera.updateProjectionMatrix();
    };
  } else if (name === 'dialogue') {
    // Staged on the Taller Marisol forecourt: the building's door and neon sign face along
    // +f (the place angle), the road lies toward +r. Both characters are placed in front of
    // the door with the Águila GT beside them, camera off to one side for a 3/4 two-shot.
    const g = city.places.garage;
    const fx = Math.sin(g.ang), fz = Math.cos(g.ang);
    const rx = fz, rz = -fx;
    const front = { x: g.x + fx * 10.6, z: g.z + fz * 10.6 };
    const hero = createVehicle(city, 'sports', 0xff8c1a, front.x + rx * 4.7 + fx * 1.1, front.z + rz * 4.7 + fz * 1.1, g.ang + 0.5, 'parked');
    G.scene.add(hero.mesh); G.vehicles.push(hero);
    const marina = G.peds.list.find((p) => p.npc);
    const mx = front.x + rx * 0.9, mz = front.z + rz * 0.9;
    if (marina) {
      marina.mesh.position.set(mx, city.height(mx, mz), mz);
      if ('x' in marina) { marina.x = mx; marina.z = mz; }
    }
    G.player.pos.x = front.x - rx * 1.2 + fx * 0.6; G.player.pos.z = front.z - rz * 1.2 + fz * 0.6;
    G.player.angle = Math.atan2(mx - G.player.pos.x, mz - G.player.pos.z);
    G.player.mesh.position.set(G.player.pos.x, city.height(G.player.pos.x, G.player.pos.z), G.player.pos.z);
    G.player.mesh.rotation.y = G.player.angle;
    if (marina) marina.mesh.rotation.y = Math.atan2(G.player.pos.x - mx, G.player.pos.z - mz);
    if (G.player.weapons.includes('pistol')) G.player.weapon = 'pistol';
    G.hud.setMission(1, 'First Wheels', 'Take the Águila GT to the Hotel Brisa Grande');
    G.hud.showDialogue(MISSIONS[0].intro[0]);
    S.update = () => {
      // Closer and lower than a gameplay two-shot: Rico and Marina fill the middle, the
      // GT crowds the right edge, and the low angle tips the glowing TALLER MARISOL sign
      // into the top of the frame above them.
      G.camera.position.set(front.x + fx * 6.2 + rx * 1.6, city.height(front.x, front.z) + 1.9, front.z + fz * 6.2 + rz * 1.6);
      G.camera.lookAt(front.x + rx * 1.0, city.height(front.x, front.z) + 2.3, front.z + rz * 1.0);
      G.camera.fov = 52; G.camera.updateProjectionMatrix();
    };
  } else if (name === 'chase') {
    const start = roadPointAt(city, 'Calzada del Este', 0.12);
    const hero = createVehicle(city, 'sports', 0xe83e6b, start.x, start.z, start.ang, 'parked');
    hero.speed = 27; // already at speed when the shutter opens
    G.scene.add(hero.mesh); G.vehicles.push(hero);
    G.player.enterCar(hero);
    const copA = createVehicle(city, 'interceptor', 0x1c1f24, start.x - Math.sin(start.ang) * 14, start.z - Math.cos(start.ang) * 14, start.ang, 'parked');
    copA.speed = 27.5;
    const copB = createVehicle(city, 'interceptor', 0x1c1f24, start.x - Math.sin(start.ang) * 23 - 2, start.z - Math.cos(start.ang) * 23, start.ang, 'parked');
    copB.speed = 27;
    G.scene.add(copA.mesh, copB.mesh); G.vehicles.push(copA, copB);
    const blockPt = roadPointAt(city, 'Calzada del Este', 0.3);
    for (const off of [-2.7, 2.7]) {
      const b = createVehicle(city, 'interceptor', 0x1c1f24, blockPt.x + Math.cos(blockPt.ang) * off, blockPt.z - Math.sin(blockPt.ang) * off, blockPt.ang + Math.PI / 2 + 0.4, 'parked');
      G.scene.add(b.mesh); G.vehicles.push(b);
    }
    const heli = stuntHeli(G, start.x + 20, city.height(start.x, start.z) + 36, start.z + 14);
    heli.spot.target.position.set(-6, -36, -4);
    G.police.setWanted(4);
    G.hud.setMission(6, 'Night Run to Isla Chica', 'Run the luggage to the Refugio de la Isla');
    const FEED = [
      'HALCÓN-9: spotlight on the suspect, Calzada del Este.',
      'Dispatch: roadblock up ahead of the suspect, Bahía Este.',
      'GAVIOTA-2: in pursuit — speeds over 110, repeat, over 110.',
    ];
    for (const line of FEED) G.hud.dispatch(line);
    const HF = roadFollower(city, 'Calzada del Este', 0.12);
    S.update = (dt) => {
      G.hud.setMission(6, 'Night Run to Isla Chica', 'Run the luggage to the Refugio de la Isla');
      keepFeed(G, FEED);
      followRoad(G, hero, HF, 1, 33, dt);
      const tA = trailPoint(hero, 12), tB = trailPoint(hero, 22);
      driveAlong(G, copA, dt, tA.x, tA.z, 33.4);
      driveAlong(G, copB, dt, tB.x, tB.z, 33.2);
      G.player.pos.x = hero.mesh.position.x; G.player.pos.z = hero.mesh.position.z;
      heli.grp.position.set(hero.mesh.position.x + 17, hero.mesh.position.y + 35, hero.mesh.position.z + 12);
      heli.grp.lookAt(hero.mesh.position.x, heli.grp.position.y - 8, hero.mesh.position.z);
      heli.rotor.rotation.y += dt * 30;
      const hp = hero.mesh.position;
      const fx = Math.sin(hero.angle), fz = Math.cos(hero.angle);
      G.camera.position.set(hp.x - fx * 10.5 + fz * 1.6, hp.y + 3.4, hp.z - fz * 10.5 - fx * 1.6);
      G.camera.lookAt(hp.x + fx * 14, hp.y + 1, hp.z + fz * 14);
      G.camera.fov = 68; G.camera.updateProjectionMatrix();
    };
  } else if (name === 'combat') {
    const base = roadPointAt(city, 'Muelle Uno', 0.45); // the open pier: sky, water, dock lamps
    const px = base.x, pz = base.z;
    G.player.pos.x = px; G.player.pos.z = pz;
    G.player.health = 100000;
    if (!G.player.weapons.includes('smg')) G.player.weapons.push('smg');
    G.player.weapon = 'smg';
    const aimAng = base.ang; // fire along the street so the road reads in frame
    G.player.angle = aimAng;
    G.player.mesh.position.set(px, city.height(px, pz), pz);
    G.player.mesh.rotation.y = aimAng;
    const fx = Math.sin(aimAng), fz = Math.cos(aimAng);
    const taxi = createVehicle(city, 'taxi', 0xf2b21b, px + fx * 13, pz + fz * 13, aimAng + 2.6, 'parked');
    G.scene.add(taxi.mesh); G.vehicles.push(taxi);
    const sedan = createVehicle(city, 'sedan', 0x3e6fb0, px + fx * 19 - fz * 6, pz + fz * 19 + fx * 6, aimAng + 1.2, 'parked');
    G.scene.add(sedan.mesh); G.vehicles.push(sedan);
    G.combat.spawnGuard(px + fx * 16 + fz * 5, pz + fz * 16 - fx * 5);
    G.combat.spawnGuard(px + fx * 10 - fz * 7, pz + fz * 10 + fx * 7);
    G.police.setWanted(3);
    G.hud.setMission(4, 'Dockside Noise', 'Clear the dock crew — 2 left');
    const FEED = [
      'BRISA-4: shots fired, Centro Neón. Moving in.',
      'Dispatch: suspect is armed — SMG, repeat, SMG.',
    ];
    for (const line of FEED) G.hud.dispatch(line);
    S.update = (dt) => {
      G.hud.setMission(4, 'Dockside Noise', 'Clear the dock crew — 2 left');
      keepFeed(G, FEED);
      if (!S.boomed && S.t > 0.5) { S.boomed = true; damageVehicle(G, taxi, 500, 'shot'); }
      // keep firing so a tracer and muzzle flash live in the captured frame; denser
      // in the last stretch so one is almost certainly mid-flight at the shutter
      if (S.t > 0.3) {
        G.player.fireCd -= dt;
        if (G.player.fireCd <= 0) {
          G.player.fireCd = S.t > 1.25 ? 0.05 : 0.11;
          const origin = { x: px, y: city.height(px, pz) + 1.42, z: pz };
          const tp = taxi.mesh.position;
          const dir = { x: tp.x - px, y: 0.25, z: tp.z - pz };
          const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
          G.combat.fire({ isPlayer: true, car: null }, origin, { x: dir.x / l, y: dir.y / l, z: dir.z / l }, 'smg');
        }
      }
      G.camera.position.set(px - fx * 6.8 + fz * 1.5, city.height(px, pz) + 2.5, pz - fz * 6.8 - fx * 1.5);
      G.camera.lookAt(px + fx * 12, city.height(px, pz) + 1.1, pz + fz * 12);
      G.camera.fov = 62; G.camera.updateProjectionMatrix();
    };
  } else {
    S.update = () => {};
  }
  S.finishAt = finishAt;
  return S;
}
