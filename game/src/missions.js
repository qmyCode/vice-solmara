// missions.js — one job: Marina Vidal's eight-chapter story.
// A small stage engine (talk / goto / chase / escape / shootout / timed)
// drives every job: dialogue with portraits, GPS objectives, fleeing
// couriers, guard shootouts, heat escapes and one timed causeway run to
// Isla Chica. Finishing a chapter pays cash + respect and saves the game.

import { PLACES, findRoute, heightAt } from './city.js';
import { Ped } from './pedestrians.js';
import { liveRng as rng, clamp } from './rng.js';

const M = (who, text) => ({ who, text });
const MARINA = { name: 'Marina Vidal', role: 'LA JEFA · FIXER', portrait: 'marina' };
const RICO = { name: 'Rico', role: 'EL CONDUCTOR', portrait: 'rico' };

export const MISSION_DEFS = [
  {
    name: 'PRIMER ENCARGO', pay: 250, respect: 6,
    stages: [
      { type: 'goto', at: 'clubFaro', obj: 'Go to Club Faro', sub: 'The package waits by the stage door', r: 7 },
      { type: 'talk', lines: [
        M('marina', 'So you are the new wheelman. I am Marina. In Vice Solmara, I am the phone that rings.'),
        M('rico', 'Rico. I drive, I don\'t ask. That\'s the whole résumé.'),
        M('marina', 'Perfecto. Take the envelope to Taller Marisol, then drop the keys at Hotel Brisa. Quiet streets, quiet money.'),
      ] },
      { type: 'goto', at: 'taller', obj: 'Deliver the envelope to Taller Marisol', sub: 'Marisol owes Marina two favours and one engine', r: 8 },
      { type: 'goto', at: 'hotelBrisa', obj: 'Drop the keys at Hotel Brisa Grande', sub: 'Valet stand, no questions', r: 8 },
      { type: 'talk', lines: [M('marina', 'Clean work, Rico. Solmara noticed. Come by the club when you want more.')] },
    ],
  },
  {
    name: 'LA ENTREGA', pay: 400, respect: 7,
    stages: [
      { type: 'goto', at: 'mercado', obj: 'Meet the courier at Mercado Luna', sub: 'He drives a grey Pico. He is nervous.', r: 8 },
      { type: 'talk', lines: [
        M('marina', 'The courier got cold feet and ran with my merchandise. ¡No lo pierdas, Rico!'),
        M('rico', 'Nobody outruns me on my own island.'),
      ] },
      { type: 'chase', obj: 'Stop the courier', sub: 'Ram him or box him in — get the goods back', carType: 'hatch' },
      { type: 'goto', at: 'clubFaro', obj: 'Bring the goods back to Club Faro', sub: 'Marina is waiting', r: 8 },
    ],
  },
  {
    name: 'SIRENAS', pay: 550, respect: 8,
    stages: [
      { type: 'goto', at: 'marinaDock', obj: 'Pick up the dock package at Muelle Sur', sub: 'Fast hands, faster exit', r: 8 },
      { type: 'talk', lines: [
        M('marina', '¡No frenes, Rico! El helicóptero te tiene marcado — piérdete entre los callejones.'),
        M('rico', 'Three stars already? You really know how to throw a welcome party.'),
      ] },
      { type: 'escape', at: 'safehouse', stars: 3, obj: 'Lose the heat and reach Piso Franco', sub: 'Break line of sight, then slip home' },
    ],
  },
  {
    name: 'PLATA O PLOMO', pay: 700, respect: 9, unlockSMG: true,
    stages: [
      { type: 'goto', at: 'casino', obj: 'Go to Casino Coral', sub: 'Marina has a problem with the competition', r: 8 },
      { type: 'talk', lines: [
        M('marina', 'The Coral\'s hired guns shook down my runners at Puerto Viejo. Take this SMG. Send a message.'),
        M('rico', 'Message received. Loud and clear.'),
      ] },
      { type: 'shootout', at: 'taller', count: 4, obj: 'Clear the hired guns at Puerto Viejo', sub: 'Four of them. Make it count.' },
    ],
  },
  {
    name: 'LUNA DE PAPEL', pay: 850, respect: 9,
    stages: [
      { type: 'goto', at: 'casino', obj: 'Pick up the moon-paper at Casino Coral', sub: 'It burns fast. So should you.', r: 8 },
      { type: 'timed', at: 'islaBar', seconds: 165, obj: 'Deliver to Bar La Gaviota, Isla Chica', sub: 'Across the Calzada del Este — before it burns' },
      { type: 'talk', lines: [M('marina', '¡Eso es! Que arda, Rico — the whole barrio is watching.')] },
    ],
  },
  {
    name: 'FUEGO CRUZADO', pay: 1000, respect: 10,
    stages: [
      { type: 'goto', at: 'mercado', obj: 'Ambush the convoy at Mercado Luna', sub: 'Their cars burn beautifully, I hear', r: 9 },
      { type: 'shootout', at: 'mercado', count: 5, obj: 'Wipe out the convoy crew', sub: 'Exploding cars do half the work' },
      { type: 'escape', at: 'safehouse', stars: 0, obj: 'Vanish to Piso Franco', sub: 'Any heat you earned has to die first' },
    ],
  },
  {
    name: 'EL ÚLTIMO PUERTO', pay: 1200, respect: 11,
    stages: [
      { type: 'goto', at: 'hotelBrisa', obj: 'Tail the money van from Hotel Brisa', sub: 'It leaves for Muelle Sur any minute', r: 9 },
      { type: 'chase', obj: 'Stop the money van', sub: 'Heavy van, heavier doors — ram it hard', carType: 'van' },
      { type: 'escape', at: 'mirador', stars: 4, obj: 'Escape to the Mirador de la Colina', sub: 'Four stars. The switchback hides a good driver' },
    ],
  },
  {
    name: 'REINA DEL PONIENTE', pay: 2000, respect: 16,
    stages: [
      { type: 'goto', at: 'casino', obj: 'Final meeting at Casino Coral', sub: 'Wear something that survives a chase', r: 8 },
      { type: 'talk', lines: [
        M('marina', 'One last run, Rico. Every patrulla on the island will come. Five stars, mi rey.'),
        M('rico', 'Then let\'s give Solmara a story worth singing about.'),
        M('marina', 'Bring it home to Club Faro. And Rico — come back alive.'),
      ] },
      { type: 'escape', at: 'clubFaro', stars: 5, obj: 'Survive. Reach Club Faro clean', sub: 'The whole SMPD is coming — lose them all' },
      { type: 'talk', lines: [
        M('marina', 'You did it. The island is ours, wheelman. Vice Solmara has a new king.'),
        M('rico', 'And a queen who never stopped ringing. Gracias, Marina.'),
      ] },
    ],
  },
];

export class Missions {
  constructor(G) {
    this.G = G; // game context: {scene, player, police, hud, save, hooks...}
    this.index = G.save.missionIndex || 0;
    this.stageI = 0;
    this.stage = null;
    this.dialogue = null; this.dlgI = 0;
    this.objective = null; // {x,z}
    this.guards = [];
    this.targetCar = null;
    this.timer = 0; this.holdT = 0;
    this.marinaPed = null;
    this.complete = this.index >= MISSION_DEFS.length;
    this.beam = G.makeBeam();
    if (!this.complete) this.startMission(this.index, true);
  }
  def() { return MISSION_DEFS[this.index]; }
  placeOf(stage) { return PLACES[stage.at]; }
  startMission(i, silent = false) {
    this.index = i; this.stageI = 0;
    const def = this.def();
    if (!silent) this.G.hud.chapterCard(i + 1, def.name);
    if (this.G.audio) this.G.audio.cash();
    this.setupStage();
  }
  setupStage() {
    const def = this.def();
    const st = def.stages[this.stageI];
    this.stage = st;
    this.timer = st.seconds || 0;
    this.holdT = 0;
    this.cleanupStage();
    const P = this.G.player;
    if (st.type === 'goto' || st.type === 'timed') {
      const p = this.placeOf(st);
      this.objective = { x: p.x, z: p.z };
    } else if (st.type === 'escape') {
      const p = this.placeOf(st);
      this.objective = { x: p.x, z: p.z };
      if (st.stars) this.G.police.setStars(Math.max(this.G.police.stars, st.stars));
    } else if (st.type === 'talk') {
      this.objective = null;
      this.dialogue = st.lines; this.dlgI = 0;
      this.showLine();
    } else if (st.type === 'chase') {
      const spawnAt = PLACES.hotelBrisa;
      const car = this.G.spawnMissionCar(st.carType || 'hatch', P.x + 26, P.z + 18);
      car.driver = 'mission';
      car.health = st.carType === 'van' ? 170 : 95;
      this.targetCar = car;
      const dest = PLACES.marinaDock;
      car.route = findRoute(car.x, car.z, dest.x, dest.z);
      car.routeI = 0; car.cruise = st.carType === 'van' ? 15.5 : 17;
      this.objective = null;
      this.G.police.crime('theft');
    } else if (st.type === 'shootout') {
      const p = this.placeOf(st);
      this.objective = { x: p.x, z: p.z };
      for (let i = 0; i < st.count; i++) {
        const guard = new Ped(this.G.scene, p.x + rng.range(-13, 13), p.z + rng.range(-13, 13), { role: 'guard', shirt: 0x30303c, skin: undefined });
        guard.role = 'guard'; guard.health = 42; guard.shootT = rng.range(0.6, 1.6);
        guard.onDown = () => { this.G.audio.cash(); };
        this.guards.push(guard); this.G.registerPed(guard);
      }
    }
    this.refreshPanel(0);
  }
  cleanupStage() {
    for (const g of this.guards) { g.dispose(this.G.scene); this.G.unregisterPed(g); }
    this.guards = [];
    if (this.targetCar && this.targetCar.driver === 'mission') this.targetCar.driver = 'traffic';
    this.targetCar = null;
    this.G.hud.hideDialogue();
    this.dialogue = null;
  }
  showLine() {
    const line = this.dialogue[this.dlgI];
    const who = line.who === 'marina' ? MARINA : RICO;
    this.G.hud.showDialogue(who.name, who.role, line.text, who.portrait);
  }
  advanceDialogue() {
    if (!this.dialogue) return false;
    this.dlgI++;
    if (this.dlgI >= this.dialogue.length) { this.G.hud.hideDialogue(); this.dialogue = null; this.nextStage(); }
    else this.showLine();
    return true;
  }
  refreshPanel(dist) {
    const def = this.def(); if (!def) return;
    const st = this.stage;
    let obj = st.obj || '', sub = st.sub || '';
    if (st.type === 'talk') { obj = 'Escucha a Marina'; sub = 'Pulsa E para seguir'; }
    if (st.type === 'timed') sub = 'Quedan ' + Math.ceil(this.timer) + ' s — ' + sub;
    if (st.type === 'shootout') sub = 'Quedan ' + this.guards.filter(g => g.state !== 'down').length + ' — ' + sub;
    if (st.type === 'escape') sub = (this.G.police.stars > (st.stars ? 1 : 0) ? 'Pierde las estrellas primero · ' : 'Llega limpio · ') + sub;
    const total = def.stages.length;
    this.G.hud.setMission(this.index + 1, def.name, obj, sub, dist, (this.stageI + 0.15) / total);
  }
  nextStage() {
    const def = this.def();
    this.stageI++;
    if (this.stageI >= def.stages.length) { this.finishMission(); return; }
    this.setupStage();
  }
  finishMission() {
    const def = this.def();
    const S = this.G.save;
    S.cash += def.pay; S.respect = clamp(S.respect + def.respect, 0, 100);
    S.missionIndex = this.index + 1; S.stats.missionsDone++;
    if (def.unlockSMG) { S.weapons[2] = true; this.G.hud.toast('SMG DESBLOQUEADA — pulsa 3'); }
    else this.G.hud.toast('MISIÓN COMPLETA · +$' + def.pay + ' · +RESPETO');
    this.G.audio.cash();
    this.G.persist();
    this.cleanupStage();
    if (this.index + 1 >= MISSION_DEFS.length) {
      this.complete = true;
      this.G.hud.toast('HISTORIA COMPLETA — Vice Solmara es tuya. Free roam, rey.', 5);
      this.G.hud.hideMission();
      this.objective = null;
      this.beam.visible = false;
      return;
    }
    this.startMission(this.index + 1);
  }
  failStage(msg) {
    this.G.hud.toast(msg + ' — otra vez');
    this.setupStage();
  }
  update(dt) {
    if (this.complete || !this.stage) return;
    const G = this.G, P = G.player;
    const px = P.car ? P.car.x : P.x, pz = P.car ? P.car.z : P.z;
    const st = this.stage;
    // Objective beam follows the current objective (or target car).
    const objPos = st.type === 'chase' && this.targetCar ? { x: this.targetCar.x, z: this.targetCar.z } : this.objective;
    if (objPos) {
      this.beam.visible = true;
      this.beam.position.set(objPos.x, heightAt(objPos.x, objPos.z) + 9, objPos.z);
      this.beam.material.opacity = 0.35 + 0.15 * Math.sin(performance.now() / 300);
      var dist = Math.hypot(objPos.x - px, objPos.z - pz);
    } else { this.beam.visible = false; var dist = null; }
    this.refreshPanel(dist);
    if (this.dialogue) return; // world waits while they talk (mostly)
    switch (st.type) {
      case 'goto':
        if (dist < (st.r || 8)) this.nextStage();
        break;
      case 'timed':
        this.timer -= dt;
        if (this.timer <= 0) { this.failStage('EL PAPEL SE QUEMÓ'); break; }
        if (dist < 9) this.nextStage();
        break;
      case 'chase': {
        const car = this.targetCar;
        if (!car) { this.nextStage(); break; }
        // Flee along route.
        if (car.route && car.routeI < car.route.length) {
          let target = car.route[car.routeI];
          let d = Math.hypot(target.x - car.x, target.z - car.z);
          while (d < 9 && car.routeI < car.route.length - 1) { car.routeI++; target = car.route[car.routeI]; d = Math.hypot(target.x - car.x, target.z - car.z); }
          const want = Math.atan2(-(target.x - car.x), -(target.z - car.z));
          let diff = want - car.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          car.drive(dt, car.health < 30 ? 0.2 : 0.95, clamp(diff * 1.7, -1, 1), G.colliders, G.allCars);
          if (car.routeI >= car.route.length - 1 && d < 10) car.route = findRoute(car.x, car.z, PLACES.clubFaro.x, PLACES.clubFaro.z), car.routeI = 0;
        }
        if (car.health <= 25 || car.dead) { car.driver = null; this.G.police.crime('theft'); this.nextStage(); }
        else if (dist < 9.5) { this.holdT += dt; if (this.holdT > 2.5) { car.driver = null; this.nextStage(); } }
        else this.holdT = Math.max(0, this.holdT - dt);
        break;
      }
      case 'escape': {
        const cleanEnough = G.police.stars <= (st.stars ? 1 : 0);
        if (dist < 9 && cleanEnough) this.nextStage();
        break;
      }
      case 'shootout': {
        let alive = 0;
        for (const g of this.guards) {
          if (g.state === 'down') continue;
          alive++;
          const d = Math.hypot(g.x - px, g.z - pz);
          const want = Math.atan2(-(px - g.x), -(pz - g.z));
          g.angle = want;
          if (d > 15) { // close in
            g.x += -Math.sin(g.angle) * 2.6 * dt;
            g.z += -Math.cos(g.angle) * 2.6 * dt;
            g.walkPhase += dt * 7;
          }
          g.shootT -= dt;
          if (g.shootT <= 0 && d < 34) {
            g.shootT = rng.range(0.9, 1.7);
            G.enemyShot(g, px, pz);
            if (rng.chance(0.55)) P.damage(rng.range(2, 5));
          }
          g.syncMesh(performance.now() / 1000);
        }
        if (alive === 0) { G.police.crime('shot'); this.nextStage(); }
        break;
      }
    }
  }
  // Marina stands at Club Faro between jobs so the world feels anchored.
  placeMarina() {
    const p = PLACES.clubFaro;
    if (!this.marinaPed) {
      this.marinaPed = new Ped(this.G.scene, p.x + 3, p.z + 2, { role: 'marina', shirt: 0x123f36, hair: 0x8a4a2e });
      this.marinaPed.state = 'stand';
      this.G.registerPed(this.marinaPed);
    }
    return this.marinaPed;
  }
}
