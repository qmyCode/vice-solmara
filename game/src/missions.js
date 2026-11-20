// missions.js — one job: the story. Eight jobs from fixer Marina Vidal — canvas-drawn
// portraits, typed dialogue, chapter cards — over a stage engine of go-to, drive, pickup,
// timed delivery, tail, chase, shootout, steal and escape stages, with cash and respect
// rewards and a gold beacon + GPS objective the HUD and minimap read.
import * as THREE from '../vendor/three.module.js';
import { clamp, dist2d } from './rng.js';
import { createVehicle } from './vehicles.js';

export const CHARACTERS = {
  marina: { name: 'Marina Vidal', shirt: 0x7a1f3d, skin: 0xc68863, hair: 0x180a0c, style: 'long', lip: '#b03050', jewel: true },
  rico: { name: 'Rico', shirt: 0x0e7d86, skin: 0xc68863, hair: 0x1a120a, style: 'short' },
  elias: { name: 'Elías Ferrer', shirt: 0x4a4238, skin: 0x8d5524, hair: 0xbdbdbd, style: 'cap', beard: true },
  tuerta: { name: 'La Tuerta', shirt: 0x23272e, skin: 0xf2c49b, hair: 0x3a2410, style: 'bun', patch: true },
  aurelio: { name: 'Don Aurelio (phone)', shirt: 0x1d2733, skin: 0xf2c49b, hair: 0x0c0c0c, style: 'slick', shades: true },
};

/** Draw a character portrait into a 2D context at (0,0,96,96): shoulders, face, hair style, marks. */
export function drawPortrait(g, who) {
  const c = CHARACTERS[who];
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, '#3a2b4a'); grad.addColorStop(1, '#191423');
  g.fillStyle = grad; g.fillRect(0, 0, 96, 96);
  g.fillStyle = '#' + c.shirt.toString(16).padStart(6, '0');
  g.beginPath(); g.moveTo(14, 96); g.quadraticCurveTo(48, 62, 82, 96); g.closePath(); g.fill();
  g.fillStyle = '#' + c.skin.toString(16).padStart(6, '0');
  g.fillRect(43, 52, 10, 12);
  g.beginPath(); g.ellipse(48, 40, 17, 20, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#' + c.hair.toString(16).padStart(6, '0');
  if (c.style === 'long') { g.fillRect(29, 16, 38, 52); g.beginPath(); g.ellipse(48, 26, 18, 12, 0, Math.PI, 0); g.fill(); g.fillStyle = '#' + c.skin.toString(16).padStart(6, '0'); g.beginPath(); g.ellipse(48, 42, 14.5, 17, 0, 0, Math.PI * 2); g.fill(); }
  else if (c.style === 'cap') { g.beginPath(); g.ellipse(48, 24, 18, 9, 0, Math.PI, 0); g.fill(); g.fillRect(28, 22, 40, 5); }
  else if (c.style === 'bun') { g.beginPath(); g.arc(48, 15, 7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(48, 27, 17, 10, 0, Math.PI, 0); g.fill(); }
  else if (c.style === 'slick') { g.beginPath(); g.ellipse(48, 25, 17, 10, 0, Math.PI, 0); g.fill(); }
  else { g.beginPath(); g.ellipse(48, 26, 17, 10, 0, Math.PI, 0); g.fill(); }
  g.fillStyle = '#1c1410';
  if (c.patch) { g.beginPath(); g.arc(41, 40, 5.4, 0, Math.PI * 2); g.fill(); g.fillRect(38, 24, 26, 2.4); }
  else g.beginPath(), g.arc(41, 40, 2.1, 0, Math.PI * 2), g.fill();
  g.beginPath(); g.arc(55, 40, 2.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,10,8,0.65)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(37, 33); g.lineTo(45, 32.4); g.stroke();
  g.beginPath(); g.moveTo(51, 32.4); g.lineTo(59, 33); g.stroke();
  if (c.beard) { g.fillStyle = '#bdbdbd'; g.beginPath(); g.ellipse(48, 54, 10, 6.5, 0, 0, Math.PI); g.fill(); }
  g.fillStyle = c.lip || '#8a4a3a';
  g.beginPath(); g.ellipse(48, 52.5, 4.6, 1.9, 0, 0, Math.PI * 2); g.fill();
  if (c.shades) { g.fillStyle = '#0c0e12'; g.fillRect(31, 36, 15, 7); g.fillRect(50, 36, 15, 7); g.fillRect(45, 38.4, 6, 2); }
  if (c.jewel) { g.fillStyle = '#ffd94a'; g.beginPath(); g.arc(30.5, 47, 1.9, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(65.5, 47, 1.9, 0, Math.PI * 2); g.fill(); }
}

const L = (who, text) => ({ who, text });
export const MISSIONS = [
  {
    ch: 1, title: 'First Wheels', reward: { cash: 450, respect: 10 },
    intro: [
      L('marina', 'Rico. You look like a man who can drive and keep his mouth shut. I am Marina Vidal — I fix problems for people with money.'),
      L('rico', 'And I am the solution, is that it?'),
      L('marina', 'You are the audition. That Águila GT by the door — take it to the Hotel Brisa Grande, park it pretty, do not scratch it. The owner counts the scratches.'),
      L('rico', 'And if it goes well?'),
      L('marina', 'Then Solmara starts paying you. Go.'),
    ],
    stages: [{ type: 'drive', at: 'hotel', r: 9, label: 'Take the Águila GT to the Hotel Brisa Grande', heroCar: true }],
    outro: [L('marina', 'Parked pretty and not a scratch. The owner is pleased — which means I am pleased. There will be more work, Rico.')],
  },
  {
    ch: 2, title: 'Package for the Pier', reward: { cash: 600, respect: 12 },
    intro: [
      L('marina', 'A package waits in Puerto Viejo, by the old streets. Papers that cannot fly, if you understand me.'),
      L('rico', 'Papers. Sure.'),
      L('marina', 'Pick it up, carry it to Elías at the Muelle de Carga. The tide — and his boat — will not wait. Fast, but whole.'),
    ],
    stages: [{ type: 'deliver', pickupAt: 'viejo', dropAt: 'pier', timer: 165, label: 'Carry the package to Elías at the pier' }],
    outro: [L('elias', 'Whole and dry. Marina chose well this time.'), L('marina', 'Elías does not compliment people, Rico. Remember that feeling.')],
  },
  {
    ch: 3, title: 'Tail the Courier', reward: { cash: 750, respect: 14, unlock: 'smg' },
    intro: [
      L('marina', 'A courier leaves Club Faro within the hour, carrying a case that belongs to my client. I need to know where it sleeps.'),
      L('rico', 'So I follow him. Quietly.'),
      L('marina', 'Close enough to see, far enough to be weather. If he smells you, he runs — and you start over. When he stops, walk up and take the case.'),
    ],
    stages: [{ type: 'tail', spawnAt: 'club', destAt: 'muelle', label: 'Tail the courier — stay close, stay unseen' }],
    outro: [L('marina', 'The case sleeps at the harbour, and now we know it. Take this SMG — the next jobs are louder.')],
  },
  {
    ch: 4, title: 'Dockside Noise', reward: { cash: 950, respect: 18 },
    intro: [
      L('tuerta', 'Marina sends a boy to do dock work? Hm. The crew at Muelle Uno stopped paying their harbour dues — four of them, all armed, all stupid.'),
      L('rico', 'And you want them educated.'),
      L('tuerta', 'I want them gone. Then you disappear to the Casa Segura before the law finds its boots.'),
    ],
    stages: [
      { type: 'goto', at: 'pier', r: 26, label: 'Go to Muelle Uno' },
      { type: 'shootout', at: 'pier', guards: 4, label: 'Clear the dock crew' },
      { type: 'escape', at: 'safehouse', r: 9, heat: 2, label: 'Lose the heat — reach the Casa Segura' },
    ],
    outro: [L('tuerta', 'Loud. Effective. Marina, your boy has a future.'), L('marina', 'He has a present, Tuerta. I will decide about the future.')],
  },
  {
    ch: 5, title: 'The Collector', reward: { cash: 1100, respect: 20 },
    intro: [
      L('aurelio', 'A gambler owes me money and thinks a fast car makes him invisible. He is leaving Vitral Motors now, in a red sports car.'),
      L('marina', 'Stop the car, Rico. Bring me the case from its trunk. Try not to bring me the whole police force as well.'),
    ],
    stages: [{ type: 'chase', spawnAt: 'showroom', destAt: 'jardines', carType: 'sports', label: 'Stop the debtor’s car and take the case' }],
    outro: [L('aurelio', 'The case, complete. You drive like a debt, señor — impossible to escape.'), L('marina', 'Compliments from Don Aurelio are currency, Rico. Spend them nowhere.')],
  },
  {
    ch: 6, title: 'Night Run to Isla Chica', reward: { cash: 1400, respect: 24 },
    intro: [
      L('marina', 'The hotel has a guest who never checked in and luggage that cannot be searched. It goes to the Refugio on Isla Chica tonight.'),
      L('rico', 'Across the causeway. With the police watching the bay.'),
      L('marina', 'Which is why it pays what it pays. The moment you touch that luggage, every badge in Solmara will want you. Drive like the tide is behind you.'),
    ],
    stages: [{ type: 'deliver', pickupAt: 'hotel', dropAt: 'isleHouse', timer: 230, heat: 3, label: 'Run the luggage to the Refugio de la Isla' }],
    outro: [L('marina', 'The causeway at night, three stars, and you arrive smiling. I begin to understand you, Rico.')],
  },
  {
    ch: 7, title: 'Mirador Ambush', reward: { cash: 1750, respect: 28 },
    intro: [
      L('tuerta', 'A meet at the Mirador, above the city. My contact sells names — the names of everyone who has been robbing Marina’s people.'),
      L('rico', 'Let me guess. It is a trap.'),
      L('tuerta', 'It is always a trap, boy. Go armed, keep the car close, and come down the switchbacks alive.'),
    ],
    stages: [
      { type: 'drive', at: 'mirador', r: 12, label: 'Drive up to the Mirador de la Colina' },
      { type: 'shootout', at: 'mirador', guards: 5, label: 'Survive the ambush' },
      { type: 'escape', at: 'garage', r: 10, heat: 3, label: 'Escape — get back to Taller Marisol' },
    ],
    outro: [L('tuerta', 'Five men went up that hill professionally angry, and one driver came down. I will tell Marina.'), L('marina', 'She already did. One more job, Rico — the biggest.')],
  },
  {
    ch: 8, title: 'Bay of Sirens', reward: { cash: 2600, respect: 40 },
    intro: [
      L('marina', 'Vitral Motors keeps a prototype in the showroom — one of one, worth more than this street. Tonight it becomes ours.'),
      L('rico', 'Steal the prototype, cross the city, deliver it to your garage. Simple.'),
      L('marina', 'The whole bay will sing for you — sirens, Rico, every kind. Bring her home and Solmara is yours.'),
    ],
    stages: [
      { type: 'goto', at: 'showroom', r: 14, label: 'Go to Vitral Motors' },
      { type: 'steal', at: 'showroom', carType: 'sports', label: 'Steal the prototype Águila' },
      { type: 'escape', at: 'garage', r: 10, heat: 4, label: 'Bring the prototype to Taller Marisol' },
    ],
    outro: [
      L('marina', 'One of one, delivered without a scratch that matters. Don Aurelio sends his respects; Elías sends his; mine you already had.'),
      L('rico', 'So what now, Marina?'),
      L('marina', 'Now, Rico — Solmara Nights are yours. The city stays open. It always needs a driver.'),
    ],
  },
];

export function createMissions(G) {
  const city = G.city;
  const marinaPed = G.peds.spawn(city.places.garage.x - 3.4, city.places.garage.z + 5.5, { stand: true, npc: true, name: 'Marina Vidal', shirt: 0x7a1f3d, skin: 0xc68863, hair: 0x180a0c });
  marinaPed.mesh.rotation.y = city.places.garage.ang + Math.PI;

  // gold beacon at the current objective
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 30, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beacon.visible = false;
  G.scene.add(beacon);
  const chevron = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
  chevron.visible = false;
  G.scene.add(chevron);
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.44), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  caseMesh.visible = false;
  G.scene.add(caseMesh);

  const snap = (x, z) => { const n = city.nodes[city.nearestNode(x, z)]; return { x: n.x, z: n.z }; };
  const SPOTS = {
    viejo: () => snap(city.districts[0].x, city.districts[0].z),
    muelle: () => snap(city.districts[4].x, city.districts[4].z),
    jardines: () => snap(city.districts[7].x, city.districts[7].z),
  };
  function resolveAt(at) {
    if (typeof at === 'string') {
      if (city.places[at]) { const p = city.places[at]; return { x: p.x, z: p.z }; }
      if (SPOTS[at]) return SPOTS[at]();
    }
    return at;
  }

  const M = {
    index: G.save.mission || 0,
    phase: 'idle', // idle | card | dialogue | active | outro
    stageI: 0, stage: null, stageState: null,
    dialogue: null, dialogueI: 0, cardT: 0,
    targetCar: null, caseAt: null, timer: 0, finished: !!G.save.finished,
    get dialogueOpen() { return M.phase === 'dialogue' || M.phase === 'outro'; },
    objective() {
      if (M.phase === 'idle' && !M.finished) return { x: city.places.garage.x, z: city.places.garage.z, label: 'See Marina at Taller Marisol', dist: 0 };
      if (M.phase !== 'active' || !M.stage) return null;
      const s = M.stageState;
      if (!s) return null;
      return { x: s.tx, z: s.tz, label: M.stage.label, dist: 0 };
    },
  };

  function cleanupStage() {
    G.combat.clearGuards();
    if (M.targetCar) {
      if (M.targetCar.role !== 'player') {
        G.scene.remove(M.targetCar.mesh);
        const i = G.vehicles.indexOf(M.targetCar);
        if (i >= 0) G.vehicles.splice(i, 1);
      }
      M.targetCar = null;
    }
    caseMesh.visible = false;
    M.caseAt = null;
  }
  function failMission(reason) {
    cleanupStage();
    M.phase = 'idle';
    M.stage = null;
    if (G.hud) G.hud.toast(reason || 'The job fell apart — see Marina again.');
    if (G.audio) G.audio.sting(false);
  }
  M.failMission = failMission;

  function startMission() {
    const def = MISSIONS[M.index];
    if (!def) { M.finished = true; return; }
    M.phase = 'card';
    M.cardT = 2.4;
    if (G.hud) G.hud.showChapter(def.ch, def.title);
    if (G.audio) G.audio.sting(true);
  }
  function beginStages() {
    M.stageI = 0;
    setupStage();
    M.phase = 'active';
  }
  function setupStage() {
    cleanupStage();
    const def = MISSIONS[M.index];
    const stage = def.stages[M.stageI];
    M.stage = stage;
    const S = { tx: 0, tz: 0, done: false, t: 0 };
    M.stageState = S;
    const at = resolveAt(stage.at || stage.dropAt || stage.pickupAt);
    switch (stage.type) {
      case 'goto': case 'drive': case 'escape': {
        S.tx = at.x; S.tz = at.z;
        if (stage.type === 'escape' && stage.heat) G.police.setWanted(stage.heat);
        if (stage.heroCar) {
          const g = city.places.garage;
          const car = createVehicle(city, 'sports', 0xff8c1a, g.x + Math.sin(g.ang) * 7, g.z + Math.cos(g.ang) * 7, g.ang, 'parked');
          car.hero = true;
          G.scene.add(car.mesh);
          G.vehicles.push(car);
          M.targetCar = car;
        }
        break;
      }
      case 'pickup': { S.tx = at.x; S.tz = at.z; showCase(at.x, at.z); break; }
      case 'deliver': {
        const pk = resolveAt(stage.pickupAt);
        S.phase = 'pickup'; S.tx = pk.x; S.tz = pk.z;
        showCase(pk.x, pk.z);
        break;
      }
      case 'tail': case 'chase': {
        const from = resolveAt(stage.spawnAt), to = resolveAt(stage.destAt);
        const type = stage.carType || 'sedan';
        const car = createVehicle(city, type, type === 'sports' ? 0xd82424 : 0x8a8f96, from.x, from.z, 0, 'mission');
        G.scene.add(car.mesh);
        G.vehicles.push(car);
        M.targetCar = car;
        S.path = city.route(from.x, from.z, to.x, to.z);
        S.pathI = 0; S.dest = to; S.spook = 0; S.lost = 0; S.hold = 0; S.arrived = false;
        S.tx = from.x; S.tz = from.z;
        break;
      }
      case 'shootout': {
        S.tx = at.x; S.tz = at.z;
        S.guardsLeft = stage.guards;
        for (let i = 0; i < stage.guards; i++) {
          const a = (i / stage.guards) * Math.PI * 2 + 0.5;
          G.combat.spawnGuard(at.x + Math.cos(a) * (7 + (i % 3) * 3), at.z + Math.sin(a) * (7 + (i % 3) * 3));
        }
        break;
      }
      case 'steal': {
        const car = createVehicle(city, stage.carType || 'sports', 0x22b8cf, at.x + 4, at.z + 3, 0.8, 'mission');
        car.prototype = true;
        G.scene.add(car.mesh);
        G.vehicles.push(car);
        M.targetCar = car;
        S.tx = car.mesh.position.x; S.tz = car.mesh.position.z;
        break;
      }
    }
    if (G.hud) G.hud.setMission(def.ch, def.title, stage.label);
  }
  function showCase(x, z) {
    M.caseAt = { x, z };
    caseMesh.visible = true;
    caseMesh.position.set(x, city.height(x, z) + 0.65, z);
  }
  function completeStage() {
    const def = MISSIONS[M.index];
    M.stageI++;
    if (M.stageI >= def.stages.length) { completeMission(); return; }
    setupStage();
  }
  function completeMission() {
    const def = MISSIONS[M.index];
    cleanupStage();
    G.player.addCash(def.reward.cash);
    G.player.addRespect(def.reward.respect);
    if (def.reward.unlock && !G.player.weapons.includes(def.reward.unlock)) {
      G.player.weapons.push(def.reward.unlock);
      G.player.persist();
      if (G.hud) G.hud.toast('Weapon unlocked: ' + def.reward.unlock.toUpperCase() + ' (key 3)');
    }
    M.index++;
    G.save.mission = M.index;
    if (M.index >= MISSIONS.length) {
      M.finished = true;
      G.save.finished = true;
      G.player.persist();
      M.phase = 'outro';
      M.dialogue = def.outro; M.dialogueI = 0;
      if (G.hud) { G.hud.showDialogue(def.outro[0]); G.hud.showEnd(); }
      return;
    }
    G.player.persist();
    M.phase = 'outro';
    M.dialogue = def.outro; M.dialogueI = 0;
    if (G.hud) G.hud.showDialogue(def.outro[0]);
    if (G.audio) G.audio.sting(true);
  }

  M.tryInteract = () => {
    if (M.dialogueOpen) { advanceDialogue(); return true; }
    if (M.phase === 'idle' && !M.finished) {
      const d = dist2d(G.player.pos.x, G.player.pos.z, marinaPed.mesh.position.x, marinaPed.mesh.position.z);
      if (d < 4.2) { startMission(); return true; }
    }
    return false;
  };
  function advanceDialogue() {
    const def = MISSIONS[Math.min(M.index, MISSIONS.length - 1)];
    M.dialogueI++;
    const lines = M.phase === 'outro' ? def.outro : def.intro;
    if (M.dialogueI >= lines.length) {
      if (G.hud) G.hud.hideDialogue();
      M.dialogue = null;
      if (M.phase === 'outro') { M.phase = 'idle'; if (G.hud) G.hud.setMission(0, '', M.finished ? 'Solmara is yours — free roam' : 'See Marina at Taller Marisol'); }
      else beginStages();
    } else if (G.hud) G.hud.showDialogue(lines[M.dialogueI]);
  }
  M.advanceDialogue = advanceDialogue;

  function driveTargetCar(dt, speedMul = 1) {
    const S = M.stageState, car = M.targetCar;
    if (!car || car.exploded) return;
    if (!S.path || S.pathI >= S.path.length) { S.arrived = true; return; }
    const target = S.path[S.pathI];
    const dx = target.x - car.mesh.position.x, dz = target.z - car.mesh.position.z;
    if (Math.hypot(dx, dz) < 7) { S.pathI++; return; }
    const desired = Math.atan2(dx, dz);
    const steer = clamp(((desired - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1, 1) * 1.7;
    const cruise = 12.5 * speedMul;
    const throttle = car.speed > cruise ? 0 : 0.85;
    G.stepVehicle(car, dt, { throttle, steer: clamp(steer, -1, 1), brake: car.speed > cruise + 5 });
  }

  function update(dt) {
    // beacon follows the objective
    const obj = M.objective();
    if (obj && G.state === 'play') {
      beacon.visible = chevron.visible = true;
      beacon.position.set(obj.x, city.height(obj.x, obj.z) + 15, obj.z);
      chevron.position.set(obj.x, city.height(obj.x, obj.z) + 4.6 + Math.sin(performance.now() * 0.004) * 0.5, obj.z);
      chevron.rotation.x = Math.PI;
      beacon.material.opacity = 0.22 + Math.sin(performance.now() * 0.003) * 0.08;
    } else beacon.visible = chevron.visible = false;
    if (caseMesh.visible) { caseMesh.rotation.y += dt * 1.6; caseMesh.position.y += Math.sin(performance.now() * 0.005) * 0.0016; }

    if (M.phase === 'card') {
      M.cardT -= dt;
      if (M.cardT <= 0) {
        if (G.hud) G.hud.hideChapter();
        M.phase = 'dialogue';
        M.dialogue = MISSIONS[M.index].intro;
        M.dialogueI = 0;
        if (G.hud) G.hud.showDialogue(M.dialogue[0]);
      }
      return;
    }
    if (M.phase !== 'active' || !M.stage) return;
    const stage = M.stage, S = M.stageState;
    const pp = G.player.pos;
    S.t += dt;
    switch (stage.type) {
      case 'goto':
        if (dist2d(pp.x, pp.z, S.tx, S.tz) < (stage.r || 8)) completeStage();
        break;
      case 'drive': case 'escape':
        if (G.player.mode === 'car' && dist2d(pp.x, pp.z, S.tx, S.tz) < (stage.r || 9)) completeStage();
        break;
      case 'pickup':
        if (G.player.mode === 'foot' && dist2d(pp.x, pp.z, S.tx, S.tz) < 2.2) { caseMesh.visible = false; completeStage(); }
        break;
      case 'deliver': {
        if (S.phase === 'pickup') {
          if (dist2d(pp.x, pp.z, S.tx, S.tz) < 3.2) {
            caseMesh.visible = false;
            S.phase = 'drop';
            const drop = resolveAt(stage.dropAt);
            S.tx = drop.x; S.tz = drop.z;
            M.timer = stage.timer || 180;
            if (stage.heat) G.police.setWanted(stage.heat);
            if (G.hud) G.hud.toast('Package on board — move!');
          }
        } else {
          M.timer -= dt;
          if (G.hud) G.hud.setTimer(M.timer);
          if (M.timer <= 0) { if (G.hud) G.hud.setTimer(null); failMission('Too slow — the job fell apart. See Marina again.'); return; }
          if (dist2d(pp.x, pp.z, S.tx, S.tz) < (stage.type === 'deliver' ? 9 : 9)) { if (G.hud) G.hud.setTimer(null); completeStage(); }
        }
        break;
      }
      case 'tail': {
        const car = M.targetCar;
        if (!car) { failMission(); return; }
        S.tx = car.mesh.position.x; S.tz = car.mesh.position.z;
        if (!S.arrived) {
          driveTargetCar(dt, 0.82);
          const d = dist2d(pp.x, pp.z, S.tx, S.tz);
          if (d < 9) { S.spook += dt; if (S.spook > 2.6) { failMission('The courier smelled you. See Marina again.'); return; } }
          else S.spook = Math.max(0, S.spook - dt);
          if (d > 58) { S.lost += dt; if (S.lost > 5) { failMission('You lost the courier. See Marina again.'); return; } }
          else S.lost = Math.max(0, S.lost - dt * 2);
          if (G.hud) G.hud.setMission(MISSIONS[M.index].ch, MISSIONS[M.index].title, `Tail the courier — ${Math.round(d)} m ${S.spook > 1 ? '— TOO CLOSE' : S.lost > 2 ? '— LOSING HIM' : ''}`);
        } else {
          if (dist2d(pp.x, pp.z, S.tx, S.tz) < 3.4 && G.player.mode === 'foot') completeStage();
          else if (G.hud) G.hud.setMission(MISSIONS[M.index].ch, MISSIONS[M.index].title, 'Take the case from the courier’s car');
        }
        break;
      }
      case 'chase': {
        const car = M.targetCar;
        if (!car) { failMission(); return; }
        S.tx = car.mesh.position.x; S.tz = car.mesh.position.z;
        if (car.health < 35) S.gaveUp = true; // beaten cars stop running
        if (!S.arrived && !car.exploded && !S.gaveUp) driveTargetCar(dt, 1.12);
        const d = dist2d(pp.x, pp.z, S.tx, S.tz);
        const stopped = car.exploded || (S.gaveUp && Math.abs(car.speed) < 1.2);
        if (stopped) {
          if (d < 4.5 && G.player.mode === 'foot') completeStage();
          else if (G.hud) G.hud.setMission(MISSIONS[M.index].ch, MISSIONS[M.index].title, 'The car is stopped — grab the case on foot');
        } else if (S.arrived && d > 30) {
          failMission('The debtor got away. See Marina again.');
          return;
        }
        break;
      }
      case 'shootout': {
        S.guardsLeft = G.combat.guards.filter((g) => !g.dead).length;
        if (G.hud) G.hud.setMission(MISSIONS[M.index].ch, MISSIONS[M.index].title, `${stage.label} — ${S.guardsLeft} left`);
        if (S.guardsLeft <= 0) completeStage();
        break;
      }
      case 'steal': {
        const car = M.targetCar;
        if (car) { S.tx = car.mesh.position.x; S.tz = car.mesh.position.z; }
        if (G.player.mode === 'car' && G.player.car === car) completeStage();
        break;
      }
    }
  }

  M.update = update;
  G.onGuardDown = () => { G.police?.reportCrime('guardDown', G.player.pos.x, G.player.pos.z, 0.8); };
  return M;
}
