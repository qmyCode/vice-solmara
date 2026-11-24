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
function followRoad(G, car, F, dirSign, cruise, dt, ahead = 6) {
  const pts = F.road.pts;
  const cp = car.mesh.position;
  const cur = pts[F.idx];
  if (Math.hypot(cur.x - cp.x, cur.z - cp.z) < 5) F.idx = Math.max(0, Math.min(pts.length - 1, F.idx + dirSign));
  const ti = Math.max(0, Math.min(pts.length - 1, F.idx + dirSign * ahead));
  driveAlong(G, car, dt, pts[ti].x, pts[ti].z, cruise);
}
// Pure-pursuit along the road polyline: the target is a fixed arc distance ahead of the
// car's nearest point ON the path, so a fast car tracks the road through bends instead
// of cutting corners into the buildings (the index-based follower above is fine at
// cruise speeds, but at ~28 m/s its raw point targets pulled the V2 cover hero off the
// boulevard and wedged it against a facade).
function pathFollower(city, roadName, t0) {
  const road = city.roads.find((r) => r.name === roadName);
  const F = { pts: road.pts, idx: Math.round(t0 * (road.pts.length - 1)) };
  F.target = (car, look) => {
    const cp = car.mesh.position;
    while (F.idx < F.pts.length - 2 &&
      Math.hypot(F.pts[F.idx + 1].x - cp.x, F.pts[F.idx + 1].z - cp.z) < Math.hypot(F.pts[F.idx].x - cp.x, F.pts[F.idx].z - cp.z)) F.idx++;
    let remain = look, i = F.idx, px = cp.x, pz = cp.z;
    while (i < F.pts.length - 1) {
      const q = F.pts[i + 1];
      const d = Math.hypot(q.x - px, q.z - pz);
      if (d >= remain) { const f = d > 0 ? remain / d : 0; return { x: px + (q.x - px) * f, z: pz + (q.z - pz) * f }; }
      remain -= d; px = q.x; pz = q.z; i++;
    }
    return F.pts[F.pts.length - 1];
  };
  return F;
}
// Dispatch lines expire after 8 real seconds, and headless frames can take seconds of
// real time each — at that frame rate even a late-posted feed can expire into a
// long-lived empty frame right at the shutter. So inside the last 0.4 sim-seconds the
// scenes re-post their lines EVERY frame: the HUD's own 4-line cap keeps exactly the
// latest set on screen, freshly stamped, in every rendered frame. Same lines, still
// the real HUD.
function keepFeed(G, lines, S) {
  if (S && S.t < S.finishAt - 0.4) return;
  for (const line of lines) G.hud.dispatch(line);
}
// Shared mid-campaign staging for the V2 scenes: bankroll, respect, a vest, the radio
// on, and crew cooldowns mid-sweep — all written into the real player/crew/audio state
// the HUD renders, exactly where live play would have put them.
function stageProgression(G, { cash, respect, health, armour, station, cds, standing }) {
  G.player.cash = cash;
  G.player.respect = respect;
  G.player.health = health;
  G.player.armour = armour;
  if (!G.player.weapons.includes('smg')) G.player.weapons.push('smg');
  G.audio.setStation(station);
  G.crew.members.forEach((m, i) => { m.cd = cds[i] || 0; });
  if (standing) for (const [d, v] of Object.entries(standing)) G.crew.standing[d] = v;
}

export function stageShot(G, name) {
  const city = G.city;
  // V2 lighting: BRIGHT golden hour (0.605–0.615), not the old murky 0.665 dusk key —
  // facades, liveries and palms read clearly, the way the top-5 covers are lit.
  const PHASES = { cover: 0.605, dialogue: 0.615, chase: 0.61, combat: 0.615 };
  G.world.setPhase(PHASES[name] ?? 0.61);
  G.hud.hideTitle();
  G.hud.showHud();
  const S = { t: 0, name, boomed: false, boomed2: false, boomed3: false, update: null };
  const finishAt = name === 'cover' ? 1.7 : name === 'dialogue' ? 1.1 : 1.5;

  if (name === 'cover') {
    // The south-shore boulevard (Bulevar Costero through the Bulevar del Sol district),
    // staged at t=0.79 — measured as the densest canyon stretch on the shore road:
    // buildings tight on BOTH sides, the 27 m Hotel Brisa Grande tower (the mission's own
    // destination, cyan HOTEL BRISA sign) standing at t=0.78 on the landward side, three
    // neon-signed facades within 80 m, palms and lamps along the kerbs, and a near-flat
    // grade (slope 1.2 over the measured window) so the asphalt ribbon — edge lines and
    // centre dashes — reads clean under the cars instead of sinking into a hillside.
    // (The old t=0.738 staging sat on a grassy slope where the frame read as open field.)
    // The hero runs east along it with an
    // interceptor flanking each rear quarter and a van blowing up behind them, while the
    // camera rides low and close off the hero's front-seaward quarter: the Águila GT fills
    // the frame and the street, the law and the fire stream out behind it. Overhaul: this
    // is now the DENSEST frame, not a poster — Rico is IN the car, wanted is 4 stars, and
    // the full HUD (stars, mission panel, dispatch feed, minimap with police/traffic
    // blips, speedo) stays on screen so every system reads in the one big frame.
    const start = roadPointAt(city, 'Bulevar Costero', 0.79);
    const heroAng = start.ang; // travel with the road (increasing point index, eastward)
    const sf = { x: Math.sin(heroAng), z: Math.cos(heroAng) }; // forward
    const ss = { x: Math.cos(heroAng), z: -Math.sin(heroAng) }; // side (seaward on this shore)
    const hero = createVehicle(city, 'sports', 0xff8c1a, start.x, start.z, heroAng, 'parked');
    hero.speed = 28.5; // staged AT SPEED — the speedo reads ~103 km/h in the frame
    hero.health = 72; // a dented hero: the vehicle card reads real vehicle health
    G.scene.add(hero.mesh); G.vehicles.push(hero);
    G.player.enterCar(hero);
    // Mid-campaign progression, staged on the real player state the HUD renders.
    stageProgression(G, {
      cash: 4850, respect: 137, health: 84, armour: 55, station: 1,
      cds: [0, 21, 0], standing: { 'Bulevar del Sol': 58 },
    });
    G.player.weapon = 'smg';
    // A healthy mid-tier loadout in the frame: SMG selected with a full mag and deep
    // reserve, the pistol visibly stocked beside it (the rack reads stocked, not bare).
    G.player.ammo.smg = { mag: 30, res: 120 };
    G.player.ammo.pistol = { mag: 12, res: 60 };
    // Flanks sit wide of the van's blast line: the landward unit trails further back,
    // because a tighter landward flank gets chain-cooked by the van explosion and the
    // frame loses a pursuer (and its minimap blip / response-panel row).
    const copA = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 8 + ss.x * 3.8, start.z - sf.z * 8 + ss.z * 3.8, heroAng, 'parked');
    copA.speed = 28.5;
    const copB = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 10.5 - ss.x * 3.8, start.z - sf.z * 10.5 - ss.z * 3.8, heroAng, 'parked');
    copB.speed = 28.5;
    const copC = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 16 + ss.x * 0.5, start.z - sf.z * 16 + ss.z * 0.5, heroAng, 'parked');
    copC.speed = 28.5;
    // V3: two more units trail the formation so the response panel lists FIVE ground
    // rows under the air row — the top-5 covers all show a full response, and the V2
    // cover's three rows read thin next to them.
    const copD = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 23 - ss.x * 3.2, start.z - sf.z * 23 - ss.z * 3.2, heroAng, 'parked');
    copD.speed = 28.5;
    const copE = createVehicle(city, 'interceptor', 0x1c1f24,
      start.x - sf.x * 26 + ss.x * 3.4, start.z - sf.z * 26 + ss.z * 3.4, heroAng, 'parked');
    copE.speed = 28.5;
    // Stunt armour for the law: a chain blast must not write a unit out of the frame
    // (and out of the response panel) before the shutter — they still burn and smoke.
    copA.health = 400; copB.health = 400; copC.health = 400; copD.health = 400; copE.health = 400;
    G.scene.add(copA.mesh, copB.mesh, copC.mesh, copD.mesh, copE.mesh); G.vehicles.push(copA, copB, copC, copD, copE);
    // Register the staged law with the real police state so the minimap draws their
    // blips and the response panel lists them (police.update never runs in shot mode,
    // so this is display-only). Callsigns come from the game's own dispatch pool.
    copA.role = 'police'; copB.role = 'police'; copC.role = 'police'; copD.role = 'police'; copE.role = 'police';
    copA.unit = 'GAVIOTA-2'; copB.unit = 'BRISA-4'; copC.unit = 'CORAL-5'; copD.unit = 'PALMA-1'; copE.unit = 'VIGÍA-6';
    G.police.state.cars.push(copA, copB, copC, copD, copE);
    // Parked cars lining both kerbs of the boulevard stretch in frame — a working
    // street, not an emptied set (V3 density pass). Offset ±10.6: fully off the
    // carriageway, so the formation's corner-cutting steering never snags on them.
    for (const [along, side, type, color] of [[7, 10.6, 'sedan', 0x3e6fb0], [-13, -10.6, 'hatch', 0x5ba24a], [-24, 10.6, 'pickup', 0x8c4a2e], [-33, -10.6, 'sedan', 0xc0c4c9]]) {
      const pk = createVehicle(city, type, color,
        start.x + sf.x * along + ss.x * side, start.z + sf.z * along + ss.z * side,
        side > 0 ? heroAng : heroAng + Math.PI, 'parked');
      G.scene.add(pk.mesh); G.vehicles.push(pk);
    }
    // Ambient traffic sharing the boulevard: two cars trailing the pack down the same
    // road (the camera looks back along the road, so the queue behind the law is what
    // reads in frame), both following the real road.
    const behindPt = roadPointAt(city, 'Bulevar Costero', 0.766);
    const behind = createVehicle(city, 'hatch', 0xd8d3c8, behindPt.x, behindPt.z, behindPt.ang, 'parked');
    behind.speed = 28;
    const behind2Pt = roadPointAt(city, 'Bulevar Costero', 0.7745);
    const behind2 = createVehicle(city, 'taxi', 0xf2b21b, behind2Pt.x, behind2Pt.z, behind2Pt.ang, 'parked');
    behind2.speed = 28;
    G.scene.add(behind.mesh, behind2.mesh); G.vehicles.push(behind, behind2);
    const BF = roadFollower(city, 'Bulevar Costero', 0.766);
    const BF2 = roadFollower(city, 'Bulevar Costero', 0.7745);
    // Pedestrians on the sidewalks BEHIND the hero — the stretch of street the camera
    // actually sees — so the boulevard reads lived-in, not emptied for the shot.
    for (const [along, side] of [[-6, 8.6], [-9, -8.2], [-11, 8.2], [-15, -8.6], [-17, 8.8], [-20, -8.3], [-23, -8.5], [-26, 8.5], [-28, 8.4], [-31, -8.7], [-34, -8.8], [5, -8.4]]) {
      G.peds.spawn(start.x + sf.x * along + ss.x * side, start.z + sf.z * along + ss.z * side);
    }
    // The van sits spun-out on the landward lane ahead of the start point. Placement
    // was solved from a measured projection, not by eye: at +34 f / +7.5 s the wreck
    // projects off the RIGHT edge at the shutter (the boulevard's curve rotates the
    // hero's frame ~11° over the take); at +34 f / −7 s it lands mid-frame, ~17 m
    // behind the hero, as the hero passes it and it blows up in the mid-frame. Its
    // blasts land when the hero is 5–20 m past, and the hero's staged health floor
    // absorbs the splash.
    const van = createVehicle(city, 'van', 0x7a8a99,
      start.x + sf.x * 34 - ss.x * 7, start.z + sf.z * 34 - ss.z * 7, heroAng + 0.5, 'parked');
    G.scene.add(van.mesh); G.vehicles.push(van);
    // V3 heli: FAR behind the formation and lower than V2, so the cone shaft crosses
    // the frame instead of hovering above it — the cone base lands ON the asphalt
    // behind the hero, entering from the top edge over the trailing units.
    const heli = stuntHeli(G, start.x - sf.x * 30 - ss.x * 5, city.height(start.x, start.z) + 25, start.z - sf.z * 30 - ss.z * 5, 11, 0.2);
    heli.spot.target.position.set(2, -25, 6);
    heli.spot.intensity = 1100; // the pool lands on the road behind the hero, not on the hero
    G.police.state.heli = { mesh: heli.grp };
    G.police.state.heliActive = true; // minimap heli blip (display-only, as above)
    G.police.setWanted(4);
    G.hud.setMission(5, 'Golden Hour Run', 'Outrun the interceptors — reach the Hotel Brisa Grande',
      { stage: 2, total: 3, next: 'Lose the tail — park it clean at the Hotel Brisa Grande' });
    // The crew talks in the cover, the way the top-5 covers do: Santi on the radio,
    // portrait chip and all, through the game's real dialogue box.
    G.hud.showDialogue({ who: 'santi', text: 'Plates are hot and the Brisa is two blocks up — punch it, Rico. Say the word and I burn the heat.' });
    const FEED = [
      'HALCÓN-9: airborne — spotlight on the orange Águila, Bulevar Costero.',
      'Dispatch: van fire on the boulevard — suspect is running east.',
      'GAVIOTA-2: flanking the suspect, requesting a second unit.',
    ];
    const HP = pathFollower(city, 'Bulevar Costero', 0.79);
    S.update = (dt) => {
      keepFeed(G, FEED, S);
      G.hud.setTimer(Math.max(0, 214 - Math.floor(S.t))); // the run is against the clock
      const ht = HP.target(hero, 15);
      driveAlong(G, hero, dt, ht.x, ht.z, 28.5);
      followRoad(G, behind, BF, 1, 27.9, dt);
      followRoad(G, behind2, BF2, 1, 28, dt);
      // The staged dent is the floor: blast and bumper noise may not write the hero
      // down past it mid-take (the same pinning the frame's 4 stars already use).
      // The wrecked flag is pinned too: one transient dip under 30 health would
      // otherwise latch the limp cap (top speed × 0.55) and the speedo would fall
      // out of the >100 km/h staging for the rest of the take.
      if (!hero.exploded) {
        if (hero.health < 72) hero.health = 72;
        hero.wrecked = false;
        // A blast-clamped speed may not sag the take below the staged pace either:
        // the run is staged AT 102 km/h, so the floor holds it there.
        if (hero.speed < 27.8) hero.speed = 28.5;
      }
      const hp0 = hero.mesh.position;
      G.player.pos.x = hp0.x; G.player.pos.z = hp0.z;
      const fx = Math.sin(hero.angle), fz = Math.cos(hero.angle);
      const sx = Math.cos(hero.angle), sz = -Math.sin(hero.angle);
      // Flank targets: behind the hero, offset to each rear quarter. Cruise matched to
      // the hero's so the formation holds instead of the law rear-ending its quarry.
      driveAlong(G, copA, dt, hp0.x - fx * 8 + sx * 3.8, hp0.z - fz * 8 + sz * 3.8, 28.7);
      driveAlong(G, copB, dt, hp0.x - fx * 10.5 - sx * 3.8, hp0.z - fz * 10.5 - sz * 3.8, 28.6);
      driveAlong(G, copC, dt, hp0.x - fx * 16 + sx * 0.5, hp0.z - fz * 16 + sz * 0.5, 28.65);
      driveAlong(G, copD, dt, hp0.x - fx * 23 - sx * 3.2, hp0.z - fz * 23 - sz * 3.2, 28.6);
      driveAlong(G, copE, dt, hp0.x - fx * 26 + sx * 3.4, hp0.z - fz * 26 + sz * 3.4, 29.1);
      heli.grp.position.x = hp0.x - fx * 30 - sx * 5;
      heli.grp.position.z = hp0.z - fz * 30 - sz * 5;
      heli.grp.position.y = city.height(hp0.x, hp0.z) + 25;
      heli.grp.lookAt(hp0.x, heli.grp.position.y - 8, hp0.z);
      heli.rotor.rotation.y += dt * 30;
      if (!S.boomed && S.t > 1.25) { S.boomed = true; damageVehicle(G, van, 500, 'shot'); }
      if (!S.boomed2 && S.t > 1.45) { S.boomed2 = true; G.explosions.boom(van.mesh.position.x, van.mesh.position.y + 1, van.mesh.position.z, { radius: 6 }); }
      // A third, bigger cook-off late in the take: at the shutter the fireball is still
      // young and LARGE over the van, on top of the developed plume from the first two.
      if (!S.boomed3 && S.t > 1.58) { S.boomed3 = true; G.explosions.boom(van.mesh.position.x, van.mesh.position.y + 1.2, van.mesh.position.z, { radius: 7.5 }); }
      // The blast's own heat reports (and any staged ped incident) stack past the staged
      // level — clamp the heat every frame so the frame can never cross into 5 stars
      // and post a contradicting "escalated" line into the feed.
      if (G.police.stars !== 4 || G.police.heat > 260) G.police.setWanted(4);
      // A unit's straight-line steering can snag on street furniture and lag out of
      // the formation — if any unit falls well behind its station, quietly re-place
      // it on station (off-frame staging; the unit, its blip and its panel row stay
      // the real thing).
      for (const [cop, back, side] of [[copA, 8, 3.8], [copB, 10.5, -3.8], [copC, 16, 0.5], [copD, 23, -3.2], [copE, 26, 3.4]]) {
        const tx = hp0.x - fx * back + sx * side, tz = hp0.z - fz * back + sz * side;
        if (Math.hypot(cop.mesh.position.x - tx, cop.mesh.position.z - tz) > 26) {
          cop.mesh.position.set(tx, city.height(tx, tz) + 0.05, tz);
          cop.angle = hero.angle;
          cop.speed = 28.5;
        }
      }
      // V3: lower and closer than V2 — the hero looms BIG in the right of the frame,
      // five interceptors stream out behind it under the heli cone, the burning van's
      // fireball towers over its landward shoulder, parked cars and pedestrians line
      // both kerbs, facade-rich buildings canyon the street beyond — HUD throughout.
      const hp = hero.mesh.position;
      G.camera.position.set(hp.x + fx * 4.9 + sx * 3.6, hp.y + 1.28, hp.z + fz * 4.9 + sz * 3.6);
      G.camera.lookAt(hp.x - fx * 1.1, hp.y + 0.88, hp.z - fz * 1.1);
      G.camera.fov = 58; G.camera.updateProjectionMatrix();
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
    stageProgression(G, {
      cash: 900, respect: 18, health: 100, armour: 40, station: 2,
      cds: [0, 0, 12], standing: { 'Puerto Viejo': 62 },
    });
    G.hud.setMission(1, 'First Wheels', 'Take the Águila GT to the Hotel Brisa Grande',
      { stage: 1, total: 1, next: 'Park it pretty at the Hotel Brisa Grande' });
    G.hud.showDialogue(MISSIONS[0].intro[0]);
    // The street lives behind the two-shot: a taxi cruises along the forecourt lane
    // between the garage door and the characters (along the r axis, visible in the
    // gap behind them from this camera), and two pedestrians stroll the door corners.
    const passer = createVehicle(city, 'taxi', 0xf2b21b, front.x - rx * 15 - fx * 2.6, front.z - rz * 15 - fz * 2.6, g.ang + Math.PI / 2, 'parked');
    passer.speed = 10;
    G.scene.add(passer.mesh); G.vehicles.push(passer);
    G.peds.spawn(front.x + fx * 0.5 - rx * 7.5, front.z + fz * 0.5 - rz * 7.5);
    G.peds.spawn(front.x + fx * 0.5 + rx * 7.5, front.z + fz * 0.5 + rz * 7.5);
    S.update = (dt) => {
      driveAlong(G, passer, dt, front.x + rx * 34 - fx * 2.6, front.z + rz * 34 - fz * 2.6, 10.5);
      // Wider than the old two-shot: Rico and Marina hold the middle, the GT crowds the
      // right edge, the glowing TALLER MARISOL sign tips into the top of the frame, and
      // the street — passing taxi, strolling pedestrians, neon storefronts — fills the
      // background behind them.
      G.camera.position.set(front.x + fx * 9.4 + rx * 2.2, city.height(front.x, front.z) + 2.1, front.z + fz * 9.4 + rz * 2.2);
      G.camera.lookAt(front.x + rx * 0.2, city.height(front.x, front.z) + 2.1, front.z + rz * 0.2);
      G.camera.fov = 56; G.camera.updateProjectionMatrix();
    };
  } else if (name === 'chase') {
    const start = roadPointAt(city, 'Calzada del Este', 0.22);
    const hero = createVehicle(city, 'sports', 0xe83e6b, start.x, start.z, start.ang, 'parked');
    hero.speed = 27; // already at speed when the shutter opens
    hero.health = 84;
    G.scene.add(hero.mesh); G.vehicles.push(hero);
    G.player.enterCar(hero);
    // Same mid-campaign progression as the cover: bankroll, respect, full weapon rack.
    stageProgression(G, {
      cash: 4850, respect: 137, health: 91, armour: 48, station: 3,
      cds: [0, 9, 0], standing: { 'Bahía Este': 47 },
    });
    G.player.weapon = 'smg';
    G.crew.eyesOutT = 16; // Luna is watching: the roadblock ahead shows on the minimap
    const copA = createVehicle(city, 'interceptor', 0x1c1f24, start.x - Math.sin(start.ang) * 8 + Math.cos(start.ang) * 4.2, start.z - Math.cos(start.ang) * 8 - Math.sin(start.ang) * 4.2, start.ang, 'parked');
    copA.speed = 32.5; // already in formation at speed, so the shutter catches them in frame
    const copB = createVehicle(city, 'interceptor', 0x1c1f24, start.x - Math.sin(start.ang) * 5 - Math.cos(start.ang) * 4.2, start.z - Math.cos(start.ang) * 5 + Math.sin(start.ang) * 4.2, start.ang, 'parked');
    copB.speed = 32.5;
    const copC = createVehicle(city, 'interceptor', 0x1c1f24, start.x - Math.sin(start.ang) * 12 - Math.cos(start.ang) * 0.5, start.z - Math.cos(start.ang) * 12 + Math.sin(start.ang) * 0.5, start.ang, 'parked');
    copC.speed = 32.5;
    G.scene.add(copA.mesh, copB.mesh, copC.mesh); G.vehicles.push(copA, copB, copC);
    const blockPt = roadPointAt(city, 'Calzada del Este', 0.58);
    const blockUnits = ['MUELLE-3', 'FARO-2'];
    [-2.7, 2.7].forEach((off, i) => {
      const b = createVehicle(city, 'interceptor', 0x1c1f24, blockPt.x + Math.cos(blockPt.ang) * off, blockPt.z - Math.sin(blockPt.ang) * off, blockPt.ang + Math.PI / 2 + 0.4, 'parked');
      b.role = 'roadblock';
      b.unit = blockUnits[i];
      G.scene.add(b.mesh); G.vehicles.push(b);
      G.police.state.cars.push(b); // minimap blip + response panel (display-only in shot mode)
    });
    copA.role = 'police'; copB.role = 'police'; copC.role = 'police';
    copA.unit = 'GAVIOTA-2'; copB.unit = 'CORAL-5'; copC.unit = 'PALMA-1';
    G.police.state.cars.push(copA, copB, copC);
    // Civilian traffic ahead on the calzada — the chase threads through a living road.
    const trafPt = roadPointAt(city, 'Calzada del Este', 0.61);
    const traf = createVehicle(city, 'sedan', 0xd8d3c8, trafPt.x, trafPt.z, trafPt.ang, 'parked');
    traf.speed = 24;
    G.scene.add(traf.mesh); G.vehicles.push(traf);
    // V3 density: parked cars on the causeway shoulders + bystanders near the start,
    // so the chase frame carries the same street life as the cover.
    for (const [tt, side, type, color] of [[0.33, 8.6, 'hatch', 0xd8542e], [0.42, -8.6, 'sedan', 0x4a90c2]]) {
      const pp2 = roadPointAt(city, 'Calzada del Este', tt);
      const pk = createVehicle(city, type, color, pp2.x + Math.cos(pp2.ang) * side, pp2.z - Math.sin(pp2.ang) * side, pp2.ang, 'parked');
      G.scene.add(pk.mesh); G.vehicles.push(pk);
    }
    G.peds.spawn(start.x + Math.cos(start.ang) * 9, start.z - Math.sin(start.ang) * 9);
    G.peds.spawn(start.x - Math.sin(start.ang) * 14 - Math.cos(start.ang) * 9, start.z - Math.cos(start.ang) * 14 + Math.sin(start.ang) * 9);
    const TF = roadFollower(city, 'Calzada del Este', 0.61);
    const heli = stuntHeli(G, start.x + 20, city.height(start.x, start.z) + 36, start.z + 14);
    heli.spot.target.position.set(-6, -36, -4);
    G.police.state.heli = { mesh: heli.grp };
    G.police.state.heliActive = true;
    G.police.setWanted(4);
    G.hud.setMission(6, 'Night Run to Isla Chica', 'Run the luggage to the Refugio de la Isla',
      { stage: 1, total: 1, next: 'Lose the tail before the Refugio gates' });
    const FEED = [
      'HALCÓN-9: spotlight on the suspect, Calzada del Este.',
      'Dispatch: roadblock up ahead of the suspect, Bahía Este.',
      'GAVIOTA-2: in pursuit — speeds over 110, repeat, over 110.',
    ];
    const HF = roadFollower(city, 'Calzada del Este', 0.22);
    S.update = (dt) => {
      keepFeed(G, FEED, S);
      followRoad(G, hero, HF, 1, 33, dt);
      followRoad(G, traf, TF, 1, 26, dt);
      // Pursuers trail at the hero's rear quarters with a lateral offset each, and the
      // camera rides further back than the old staging — so the law is IN the frame at
      // the bottom corners instead of hidden behind the camera.
      const hp0 = hero.mesh.position;
      const fx0 = Math.sin(hero.angle), fz0 = Math.cos(hero.angle);
      const sx0 = Math.cos(hero.angle), sz0 = -Math.sin(hero.angle);
      driveAlong(G, copA, dt, hp0.x - fx0 * 7 + sx0 * 4.2, hp0.z - fz0 * 7 + sz0 * 4.2, 35);
      driveAlong(G, copB, dt, hp0.x - fx0 * 2.5 - sx0 * 4.2, hp0.z - fz0 * 2.5 - sz0 * 4.2, 34.6);
      driveAlong(G, copC, dt, hp0.x - fx0 * 12 - sx0 * 0.5, hp0.z - fz0 * 12 - sz0 * 0.5, 34.8);
      G.player.pos.x = hero.mesh.position.x; G.player.pos.z = hero.mesh.position.z;
      heli.grp.position.set(hero.mesh.position.x + 17, hero.mesh.position.y + 35, hero.mesh.position.z + 12);
      heli.grp.lookAt(hero.mesh.position.x, heli.grp.position.y - 8, hero.mesh.position.z);
      heli.rotor.rotation.y += dt * 30;
      const hp = hero.mesh.position;
      const fx = Math.sin(hero.angle), fz = Math.cos(hero.angle);
      G.camera.position.set(hp.x - fx * 15.5 + fz * 1.6, hp.y + 4.4, hp.z - fz * 15.5 - fx * 1.6);
      G.camera.lookAt(hp.x + fx * 14, hp.y + 1, hp.z + fz * 14);
      G.camera.fov = 68; G.camera.updateProjectionMatrix();
    };
  } else if (name === 'combat') {
    const base = roadPointAt(city, 'Muelle Uno', 0.45); // the open pier: sky, water, dock lamps
    const px = base.x, pz = base.z;
    G.player.pos.x = px; G.player.pos.z = pz;
    // Shot mode cannot hurt the player (hurt() only acts in live play), so the staged
    // vitals simply hold: a fight already in progress — health 76, vest half-shredded.
    stageProgression(G, {
      cash: 3200, respect: 84, health: 76, armour: 38, station: 2,
      cds: [12, 0, 26], standing: { 'Centro Neón': 41 },
    });
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
    // The law answers the gunfire: two interceptors roll in down the pier toward the
    // fight — the near one in frame, the second still listed live in the response panel.
    const law = createVehicle(city, 'interceptor', 0x1c1f24, px + fx * 28 + fz * 9, pz + fz * 28 - fx * 9, aimAng + Math.PI, 'parked');
    law.speed = 11;
    law.role = 'police';
    law.unit = 'BRISA-4';
    G.scene.add(law.mesh); G.vehicles.push(law);
    G.police.state.cars.push(law); // minimap blip (display-only in shot mode)
    const law2 = createVehicle(city, 'interceptor', 0x1c1f24, px + fx * 62 - fz * 7, pz + fz * 62 + fx * 7, aimAng + Math.PI, 'parked');
    law2.speed = 13;
    law2.role = 'police';
    law2.unit = 'MUELLE-3';
    G.scene.add(law2.mesh); G.vehicles.push(law2);
    G.police.state.cars.push(law2);
    // A parked hatch crowds the pier edge — one more shape in the combat frame.
    const pierPark = createVehicle(city, 'hatch', 0xdadada, px - fx * 4 + fz * 8, pz - fz * 4 - fx * 8, aimAng + 0.4, 'parked');
    G.scene.add(pierPark.mesh); G.vehicles.push(pierPark);
    // Bystanders caught behind the fight — they bolt when the taxi goes up.
    const fleerA = G.peds.spawn(px + fx * 21 + fz * 4, pz + fz * 21 - fx * 4);
    const fleerB = G.peds.spawn(px + fx * 24 - fz * 6, pz + fz * 24 + fx * 6);
    G.peds.spawn(px + fx * 8 + fz * 9, pz + fz * 8 - fx * 9);
    G.police.setWanted(3);
    G.hud.setMission(4, 'Dockside Noise', 'Clear the dock crew — 2 left',
      { stage: 2, total: 3, next: 'Lose the heat — reach the Casa Segura' });
    const FEED = [
      'BRISA-4: shots fired, Centro Neón. Moving in.',
      'Dispatch: suspect is armed — SMG, repeat, SMG.',
    ];
    S.update = (dt) => {
      keepFeed(G, FEED, S);
      // Sustained SMG fire keeps reporting heat — pin the frame at the staged 3 stars.
      if (G.police.stars > 3) G.police.setWanted(3);
      driveAlong(G, law, dt, px + fx * 7 + fz * 3, pz + fz * 7 - fx * 3, 12);
      driveAlong(G, law2, dt, px + fx * 20 - fz * 5, pz + fz * 20 + fx * 5, 13.5);
      if (!S.boomed && S.t > 0.5) {
        S.boomed = true;
        damageVehicle(G, taxi, 500, 'shot');
        damageVehicle(G, sedan, 72, 'shot'); // the sedan catches fire too — smoke, not a second blast
        G.peds.flee(fleerA, px, pz);
        G.peds.flee(fleerB, px, pz);
      }
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
