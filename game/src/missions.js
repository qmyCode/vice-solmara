// missions.js — one job: the story. Eight jobs for fixer Marina Vidal and the people of Vice
// Solmara — deliveries against the clock, a stolen car to recover, a boulevard race, port and
// club shootouts with guards who shoot back, a four-star manhunt to shake, and one last night.
// Missions are data: intro dialogue (with canvas-drawn portraits), a chain of stages (go-to,
// timed delivery, chase, escape, shootout), outro dialogue, and cash + respect rewards. After
// the finale the fixer keeps handing out repeatable courier work.

import * as THREE from 'three';
import { Rng, clamp, angDiff, dist2d } from './rng.js';

export const CHARACTERS = {
  marina: { name: 'Marina Vidal', role: 'LA JEFA · FIXER', skin: 0xd9a066, hair: '#4a2418', top: '#0f766e', bg: ['#134e4a', '#0b2e2b'], style: 'long' },
  rico: { name: 'Rico', role: 'EL NUEVO · DRIVER', skin: 0xc98d5f, hair: '#14213d', top: '#e8641e', bg: ['#7c2d12', '#431407'], style: 'cap' },
  paco: { name: 'Paco', role: 'EL PUERTO · BOSS', skin: 0x8a5a34, hair: '#1c1c1e', top: '#374151', bg: ['#1f2937', '#030712'], style: 'shades' },
  santi: { name: 'Santi', role: 'EL PRIMO · RACER', skin: 0xf2c49b, hair: '#b91c1c', top: '#2563eb', bg: ['#1e3a8a', '#172554'], style: 'hawk' },
  vera: { name: 'Vera Luna', role: 'CLUB FARO · OWNER', skin: 0xf2c49b, hair: '#e7e5e4', top: '#be185d', bg: ['#831843', '#500724'], style: 'bob' },
};

/** Draw one flat-shaded portrait per character onto a small canvas; the HUD shows it in dialogue. */
export function drawPortrait(key) {
  const ch = CHARACTERS[key];
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, ch.bg[0]);
  grad.addColorStop(1, ch.bg[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  const skin = `#${ch.skin.toString(16).padStart(6, '0')}`;
  // shoulders + neck
  g.fillStyle = ch.top;
  g.fillRect(22, 74, 52, 22);
  g.fillStyle = skin;
  g.fillRect(42, 62, 12, 14);
  // face
  g.beginPath();
  g.ellipse(48, 44, 17, 20, 0, 0, Math.PI * 2);
  g.fill();
  // hair by style
  g.fillStyle = ch.hair;
  if (ch.style === 'long') {
    g.fillRect(28, 20, 8, 52);
    g.fillRect(60, 20, 8, 52);
    g.beginPath(); g.ellipse(48, 27, 18, 10, 0, Math.PI, Math.PI * 2); g.fill();
  } else if (ch.style === 'bob') {
    g.fillRect(29, 22, 7, 34);
    g.fillRect(60, 22, 7, 34);
    g.beginPath(); g.ellipse(48, 27, 18, 10, 0, Math.PI, Math.PI * 2); g.fill();
  } else if (ch.style === 'hawk') {
    g.fillRect(43, 12, 10, 18);
  } else if (ch.style === 'cap') {
    g.fillRect(30, 22, 36, 8);
    g.fillRect(58, 28, 14, 4);
  }
  // eyes / shades
  if (ch.style === 'shades') {
    g.fillStyle = '#0a0a0a';
    g.fillRect(33, 40, 30, 8);
    g.fillStyle = '#3f3f46';
    g.fillRect(28, 62, 40, 12); // beard
  } else {
    g.fillStyle = '#ffffff';
    g.fillRect(38, 41, 7, 5);
    g.fillRect(52, 41, 7, 5);
    g.fillStyle = '#1c1917';
    g.fillRect(40, 42, 3, 3);
    g.fillRect(54, 42, 3, 3);
  }
  // mouth
  g.fillStyle = key === 'vera' ? '#dc2645' : '#8a5a34';
  g.fillRect(43, 56, 10, 3);
  if (key === 'marina') { g.fillStyle = '#fbbf24'; g.fillRect(29, 58, 3, 5); g.fillRect(64, 58, 3, 5); }
  return c.toDataURL();
}

const go = (place, label, sub, timer = 0) => ({ kind: 'goto', place, label, sub, timer });
const chase = (label, sub, carType = 'sedan') => ({ kind: 'chase', label, sub, carType });
const escapeStage = (label, sub, stars) => ({ kind: 'escape', label, sub, stars });
const shoot = (place, count, label, sub) => ({ kind: 'shootout', place, count, label, sub });

export const STORY = [
  {
    id: 'encargo', ch: 'CH 1', title: 'PRIMER ENCARGO', from: 'marina', place: 'garage',
    intro: [
      { who: 'marina', text: 'So you are the new wheelman. I am Marina. In Vice Solmara, I am the phone that rings.' },
      { who: 'rico', text: 'I drive, I do not ask. That is the whole résumé.' },
      { who: 'marina', text: 'Good. A package sleeps at Club Faro. Take it to the Hotel Brisa before the ice melts, sí?' },
    ],
    stages: [
      go('club', 'Go to Club Faro', 'The package waits by the stage door'),
      go('hotel', 'Deliver to Hotel Brisa Grande', 'Fast and clean — the clock is running', 170),
    ],
    outro: [
      { who: 'marina', text: 'On time, no dents, no police. You may survive this city, Rico.' },
    ],
    reward: { cash: 250, respect: 40 },
  },
  {
    id: 'coche', ch: 'CH 2', title: 'EL COCHE DE SANTI', from: 'santi', place: 'garage',
    intro: [
      { who: 'santi', text: 'Primo! Some rat took my hatch from the Desguace. My whole life is in that car. Mostly the seats.' },
      { who: 'marina', text: 'The thief is joyriding near Muelle Viejo. Recover it, Rico. However your conscience allows.' },
    ],
    stages: [
      chase('Stop the stolen hatch', 'Ram it, box it, or shoot out the tyres — bring it home', 'hatch'),
      escapeStage('Lose the heat', 'Break line of sight and let the stars cool', 2),
      go('chopshop', 'Return to the Desguace', 'Santi is pacing holes in the concrete'),
    ],
    outro: [
      { who: 'santi', text: '¡Mi coche! You drive like the devil owes you money. I love it.' },
    ],
    reward: { cash: 400, respect: 60 },
  },
  {
    id: 'carrera', ch: 'CH 3', title: 'CARRERA DEL MALECÓN', from: 'santi', place: 'club',
    intro: [
      { who: 'santi', text: 'Boulevard race, four gates, one envelope of cash. The whole barrio is watching, primo.' },
      { who: 'rico', text: 'Gates, plural. You just want to see the Águila stretch its legs.' },
    ],
    stages: [
      go('hotel', 'Gate 1 — Hotel Brisa', 'Beat the clock to the next gate', 55),
      go('marina', 'Gate 2 — Marina del Sur', 'Across the city, keep it lit', 65),
      go('port', 'Gate 3 — the Port', 'Watch the harbour traffic', 60),
      go('club', 'Final gate — Club Faro', 'Bring it home', 70),
    ],
    outro: [
      { who: 'santi', text: 'Did you SEE the boulevard bend? This city has no straight lines and neither do you.' },
    ],
    reward: { cash: 500, respect: 80 },
  },
  {
    id: 'puerto', ch: 'CH 4', title: 'EL PUERTO PAGA', from: 'paco', place: 'port',
    intro: [
      { who: 'paco', text: 'My warehouse pays rent to ghosts. Three men with guns moved in and stopped answering the phone.' },
      { who: 'marina', text: 'Clear the Almacén, Rico. Paco pays double and asks nothing. My favourite combination.' },
    ],
    stages: [
      shoot('port', 3, 'Clear the warehouse crew', 'Three hostiles inside the Almacén del Puerto'),
      go('marina', 'Report to the Marina', 'Paco is already counting your money'),
    ],
    outro: [
      { who: 'paco', text: 'The port pays its debts. Tell Marina the dock is open to her people.' },
    ],
    reward: { cash: 650, respect: 100 },
  },
  {
    id: 'luna', ch: 'CH 5', title: 'LUNA DE PAPEL', from: 'vera', place: 'club',
    intro: [
      { who: 'vera', text: 'A van left my club with a bag that sings my name. I want the bag, not the van, not the driver.' },
      { who: 'marina', text: 'It is running the boulevard now. Stop it, take the bag to the hotel, and smile for no cameras.' },
    ],
    stages: [
      chase('Stop the van', 'The bag is by the stage door — disable the van', 'van'),
      go('hotel', 'Take the bag to Hotel Brisa', 'No stops. The city is watching', 150),
    ],
    outro: [
      { who: 'vera', text: 'The bag, the whole bag. You are wasted on driving, Rico. Almost.' },
    ],
    reward: { cash: 800, respect: 120 },
  },
  {
    id: 'deuda', ch: 'CH 6', title: 'LA DEUDA DE VERA', from: 'marina', place: 'bank',
    intro: [
      { who: 'marina', text: 'Vera owes the bank, the bank owes me, and tonight everyone settles. Cash waits at the Banco.' },
      { who: 'marina', text: 'Take it across the causeway to Bar La Ola on Isla Chica. Her creditors have guns and opinions.' },
    ],
    stages: [
      go('isleBar', 'Cross to Bar La Ola, Isla Chica', 'The long causeway drive — stay ahead of trouble', 260),
      shoot('isleBar', 3, 'Deal with the creditors', 'They came to collect. Collect them first'),
    ],
    outro: [
      { who: 'marina', text: 'Debts closed on two islands in one night. Take this SMG — you have earned louder arguments.' },
    ],
    reward: { cash: 1000, respect: 150 }, unlock: 'smg',
  },
  {
    id: 'cielo', ch: 'CH 7', title: 'CIELO ROJO', from: 'marina', place: 'station',
    intro: [
      { who: 'marina', text: 'The SMPD built a whole operation around your photograph, Rico. Four stars of love.' },
      { who: 'rico', text: 'Let me guess. I shake them, I live. I do not, I become paperwork.' },
      { who: 'marina', text: 'Shake them, then come to the Mirador. The city looks innocent from up there.' },
    ],
    stages: [
      escapeStage('Shake the manhunt', 'Four stars — break line of sight and stay broken', 4),
      go('mirador', 'Meet Marina at the Mirador', 'The switchback, all the way up'),
    ],
    outro: [
      { who: 'marina', text: 'You see? From here it is just lights and water. Tomorrow we take the lights.' },
    ],
    reward: { cash: 1100, respect: 170 },
  },
  {
    id: 'ultima', ch: 'CH 8', title: 'LA ÚLTIMA NOCHE', from: 'paco', place: 'port',
    intro: [
      { who: 'paco', text: 'One shipment, one night, every gun in the Puerto. After this, the dock answers to us.' },
      { who: 'marina', text: 'Clear the warehouse, stop the courier GT, and finish it at the club. History, Rico.' },
    ],
    stages: [
      shoot('port', 5, 'Clear the Almacén — final crew', 'Five hostiles. This is the whole war'),
      chase('Stop the courier GT', 'The Águila carries the ledger — do not let it leave', 'gt'),
      go('club', 'Finish at Club Faro', 'Where the night began'),
    ],
    outro: [
      { who: 'marina', text: 'The port, the club, the island — yours, Rico. Vice Solmara has a new name on the door.' },
      { who: 'rico', text: 'Then let the city keep its curves. I am not done driving them.' },
    ],
    reward: { cash: 2000, respect: 300 },
  },
];

// ------------------------------------------------------------------ runtime

export function createMissions(G) {
  const { city } = G;
  const rng = new Rng(city.seed * 41 + 9);
  const S = {
    idx: G.save.missionIdx || 0, active: false, stage: null, stageI: 0,
    done: !!G.save.storyDone, dialogueOpen: false, guards: [], target: null,
    stageT: 0, jobT: 0, job: null, boxedT: 0, failT: 0,
  };

  const objective = () => {
    if (!S.active || !S.stage) return null;
    const st = S.stage;
    const place = st.place ? city.places[st.place] : null;
    return {
      title: `${STORY[S.idx] ? STORY[S.idx].ch : 'EN'} ${STORY[S.idx] ? STORY[S.idx].title : 'ENCARGO'}`,
      label: st.label, sub: st.sub,
      x: st.x !== undefined ? st.x : place ? place.x : null,
      z: st.z !== undefined ? st.z : place ? place.z : null,
      timer: st.timer > 0 ? Math.max(0, st.timer - S.stageT) : null,
      stageI: S.stageI, stageCount: STORY[S.idx] ? STORY[S.idx].stages.length : 1,
    };
  };

  function setStage(i) {
    S.stageI = i;
    S.stageT = 0;
    S.boxedT = 0;
    S.failT = 0;
    const mission = STORY[S.idx];
    if (!mission || i >= mission.stages.length) { finishMission(); return; }
    S.stage = mission.stages[i];
    const st = S.stage;
    if (st.kind === 'chase') spawnChaseTarget(st);
    if (st.kind === 'shootout') spawnGuards(st);
    if (st.kind === 'escape') {
      G.police.state.level = Math.max(G.police.state.level, st.stars);
      G.police.reportCrime('mission', G.player.state.x, G.player.state.z, true);
    }
    refreshObjective();
  }

  function refreshObjective() {
    const o = objective();
    if (o && o.x !== null && o.x !== undefined) G.setObjective(o.x, o.z);
    else if (S.stage && S.stage.kind === 'chase' && S.target) G.setObjective(S.target.x, S.target.z);
    else if (S.stage && S.stage.kind === 'escape') G.setObjective(null);
    if (G.hud) G.hud.refreshObjective();
  }

  function startMission() {
    const mission = STORY[S.idx];
    if (!mission) return;
    S.active = true;
    S.dialogueOpen = true;
    G.hud.showDialogue(mission.intro, () => {
      S.dialogueOpen = false;
      setStage(0);
    });
    if (G.hud) G.hud.showChapter(mission.ch, mission.title);
  }

  function finishMission() {
    const mission = STORY[S.idx];
    cleanupStage();
    S.active = false;
    S.stage = null;
    if (!mission) return;
    S.dialogueOpen = true;
    G.hud.showDialogue(mission.outro, () => { S.dialogueOpen = false; });
    G.cash += mission.reward.cash;
    G.respect += mission.reward.respect;
    if (mission.unlock && !G.player.state.weapons.includes(mission.unlock)) {
      G.player.state.weapons.push(mission.unlock);
      G.hud.toast(`Nueva arma: ${G.combat.WEAPONS[mission.unlock].name}`, 2600);
    }
    if (G.audio) G.audio.coin();
    G.hud.toast(`+$${mission.reward.cash} · Respeto +${mission.reward.respect}`, 2800);
    S.idx++;
    if (S.idx >= STORY.length) { S.done = true; }
    G.persist();
    G.setObjective(null);
    if (G.hud) G.hud.refreshObjective();
  }

  function cleanupStage() {
    for (const gd of S.guards) {
      gd.target.alive = false;
      if (gd.mesh) G.scene.remove(gd.mesh);
      const ti = G.combat.targets.indexOf(gd.target);
      if (ti >= 0) G.combat.targets.splice(ti, 1);
    }
    S.guards = [];
    if (S.target) {
      if (S.target.driver === 'flee') S.target.driver = 'traffic';
      S.target = null;
    }
  }

  function failStage(reason) {
    G.hud.toast(reason || 'Encargo fallido — otra vez', 2400);
    cleanupStage();
    setStage(S.stageI);
  }

  // ---- chase target: a car that runs ----
  function spawnChaseTarget(st) {
    const p = G.player.state;
    const node = city.nodes[city.nearestNode(p.x + rng.range(50, 80), p.z + rng.range(-40, 40))];
    const car = G.vehicles.spawn(st.carType, node.x, node.z, rng.range(0, Math.PI * 2), { driver: 'flee', rng });
    car.cruise = st.carType === 'gt' ? 24 : 19;
    car.route = null;
    S.target = car;
  }

  function driveFlee(car, dt) {
    if (!car.route || car.routeI >= car.route.length) {
      // run toward whatever is far from Rico
      const p = G.player.state;
      let best = null, bestD = -1;
      for (let i = 0; i < 8; i++) {
        const node = city.nodes[rng.int(0, city.nodes.length - 1)];
        const d = dist2d(p.x, p.z, node.x, node.z);
        if (d > bestD) { bestD = d; best = node; }
      }
      car.route = city.route(car.x, car.z, best.x, best.z);
      car.routeI = 1;
    }
    const wp = car.route[car.routeI];
    if (dist2d(car.x, car.z, wp.x, wp.z) < 9) { car.routeI++; return; }
    const desired = Math.atan2(wp.z - car.z, wp.x - car.x);
    const steer = clamp(angDiff(car.heading, desired) * 1.8, -1, 1);
    G.vehicles.stepCar(car, dt, { throttle: 1, steer }, G.onVehicleEvent);
  }

  // ---- shootout guards: armed men who keep their distance and fire back ----
  function spawnGuards(st) {
    const place = city.places[st.place];
    G.police.state.level = Math.max(G.police.state.level, 2);
    for (let i = 0; i < st.count; i++) {
      const a = (i / st.count) * Math.PI * 2;
      const x = place.x + Math.cos(a) * rng.range(6, 13);
      const z = place.z + Math.sin(a) * rng.range(6, 13);
      const grp = new THREE.Group();
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x1f2430 }));
      legs.position.y = 0.4;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.74, 0.32), new THREE.MeshLambertMaterial({ color: 0x3f4a3a }));
      torso.position.y = 1.17;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.36), new THREE.MeshLambertMaterial({ color: 0x8a5a34 }));
      head.position.y = 1.78;
      const gunM = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.46), new THREE.MeshLambertMaterial({ color: 0x111114 }));
      gunM.position.set(0.34, 1.22, 0.3);
      grp.add(legs, torso, head, gunM);
      grp.position.set(x, city.heightAt(x, z), z);
      G.scene.add(grp);
      const guard = {
        x, z, y: city.heightAt(x, z), heading: rng.range(0, 6), health: 60, alive: true,
        fireT: rng.range(0.8, 2), strafe: rng.chance(0.5) ? 1 : -1, mesh: grp, target: null,
      };
      guard.target = {
        x, y: guard.y, z, r: 0.95, alive: true,
        hit(dmg) {
          guard.health -= dmg;
          G.fx.burst(guard.x, guard.y + 1.2, guard.z, 0xd93a3a, 6, 3.5, 1.8, 0.3);
          if (guard.health <= 0 && guard.alive) {
            guard.alive = false;
            guard.target.alive = false;
            grp.rotation.x = -Math.PI / 2;
            grp.position.y = guard.y + 0.25;
            G.player.report('murder', guard.x, guard.z);
          }
        },
      };
      G.combat.targets.push(guard.target);
      S.guards.push(guard);
    }
    if (G.hud) G.hud.toast('¡Emboscada! Acaba con ellos', 2200);
  }

  function stepGuards(dt) {
    const p = G.player.state;
    for (const gd of S.guards) {
      if (!gd.alive) continue;
      const d = dist2d(p.x, p.z, gd.x, gd.z);
      const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
      const dd = dist2d(px, pz, gd.x, gd.z);
      gd.heading = Math.atan2(pz - gd.z, px - gd.x);
      let mx = 0, mz = 0;
      if (dd > 19) { mx = Math.cos(gd.heading); mz = Math.sin(gd.heading); }
      else if (dd < 8) { mx = -Math.cos(gd.heading); mz = -Math.sin(gd.heading); }
      else { mx = -Math.sin(gd.heading) * gd.strafe * 0.6; mz = Math.cos(gd.heading) * gd.strafe * 0.6; if (rng.chance(0.004)) gd.strafe *= -1; }
      const nx = gd.x + mx * 2.6 * dt, nz = gd.z + mz * 2.6 * dt;
      if (!city.inWater(nx, nz)) { gd.x = nx; gd.z = nz; }
      gd.y = city.heightAt(gd.x, gd.z);
      gd.mesh.position.set(gd.x, gd.y, gd.z);
      gd.mesh.rotation.y = -gd.heading;
      gd.target.x = gd.x; gd.target.y = gd.y; gd.target.z = gd.z;
      // fire in bursts when the shot is on
      gd.fireT -= dt;
      if (gd.fireT <= 0 && dd < 46 && G.police.los(gd.x, gd.z, px, pz)) {
        gd.fireT = rng.range(1.3, 2.4);
        const ty = (p.car ? p.car.y : p.y) + 1;
        for (let s = 0; s < 3; s++) {
          G.combat.drawTracer(
            { x: gd.x, y: gd.y + 1.35, z: gd.z },
            { x: px + rng.range(-1.6, 1.6), y: ty, z: pz + rng.range(-1.6, 1.6) }, 0xffa050);
        }
        if (G.audio) G.audio.shot('pistol');
        const hitChance = clamp(0.62 - dd * 0.009, 0.14, 0.6);
        if (rng.chance(hitChance)) {
          if (p.car) G.vehicles.damage(p.car, rng.range(3, 6), G.onVehicleEvent);
          else G.player.damagePlayer(rng.range(4, 7), gd.x, gd.z);
        }
      }
    }
  }

  // ---- repeatable courier work after the finale ----
  function maybeJob(dt) {
    if (!S.done || S.active || S.job) return;
    S.jobT -= dt;
    if (S.jobT > 0) return;
    const keys = Object.keys(city.places);
    const key = rng.pick(keys);
    const place = city.places[key];
    S.job = { place: key, x: place.x, z: place.z, timer: 200, t: 0 };
    if (G.hud) G.hud.toast(`Encargo: lleva el paquete a ${place.label}`, 2600);
    G.setObjective(place.x, place.z);
  }

  function step(dt) {
    if (S.dialogueOpen) return;
    if (!S.active) {
      maybeJob(dt);
      if (S.job) {
        S.job.t += dt;
        const p = G.player.state;
        if (dist2d(p.x, p.z, S.job.x, S.job.z) < 10) {
          const pay = 120 + Math.round(G.respect * 0.2);
          G.cash += pay;
          if (G.audio) G.audio.coin();
          if (G.hud) G.hud.toast(`Encargo completo · +$${pay}`, 2200);
          S.job = null;
          S.jobT = 14;
          G.setObjective(null);
          G.persist();
        } else if (S.job.t > S.job.timer) {
          S.job = null;
          S.jobT = 8;
          G.setObjective(null);
        }
        return;
      }
      // idle: is Rico at the next story marker?
      const mission = STORY[S.idx];
      if (mission) {
        const place = city.places[mission.place];
        const p = G.player.state;
        if (dist2d(p.x, p.z, place.x, place.z) < 8 && !p.car) startMission();
        else if (dist2d(p.x, p.z, place.x, place.z) < 11 && p.car) startMission();
      }
      return;
    }
    const st = S.stage;
    if (!st) return;
    S.stageT += dt;
    const p = G.player.state;
    if (st.kind === 'goto') {
      const place = city.places[st.place];
      if (dist2d(p.x, p.z, place.x, place.z) < 10) { setStage(S.stageI + 1); return; }
      if (st.timer > 0 && S.stageT > st.timer) { failStage('Sin tiempo — el encargo se enfría'); return; }
    } else if (st.kind === 'chase') {
      const t = S.target;
      if (t) {
        driveFlee(t, dt);
        G.setObjective(t.x, t.z);
        const d = dist2d(p.x, p.z, t.x, t.z);
        if (t.dead || t.health < 22) { cleanupTargetOnly(); setStage(S.stageI + 1); return; }
        if (Math.abs(t.speed) < 0.7 && d < 13) {
          S.boxedT += dt;
          if (S.boxedT > 2.6) { cleanupTargetOnly(); setStage(S.stageI + 1); return; }
        } else S.boxedT = 0;
        if (d > 300) {
          S.failT += dt;
          if (S.failT > 9) { failStage('Lo perdiste — de vuelta a la caza'); return; }
        } else S.failT = 0;
      }
    } else if (st.kind === 'escape') {
      if (G.police.stars === 0) { setStage(S.stageI + 1); return; }
    } else if (st.kind === 'shootout') {
      stepGuards(dt);
      if (S.guards.every((gd) => !gd.alive)) { setStage(S.stageI + 1); return; }
    }
    if (G.hud) G.hud.refreshObjective();
  }

  function cleanupTargetOnly() {
    if (S.target) {
      if (S.target.driver === 'flee') S.target.driver = 'traffic';
      S.target = null;
    }
  }

  /** The idle-world marker: where the next chapter begins (or a job drop). */
  function idleMarker() {
    if (S.job) return { x: S.job.x, z: S.job.z, label: city.places[S.job.place].label };
    const mission = STORY[S.idx];
    if (!mission || S.active) return null;
    const place = city.places[mission.place];
    return { x: place.x, z: place.z, label: `${mission.ch} · ${mission.title}` };
  }

  return { S, STORY, step, objective, idleMarker, startMission, refreshObjective };
}
