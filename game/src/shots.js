// shots.js — one job: stage the four dossier screenshots in the real game.
// Each scene is posed with live systems (real traffic, real police units,
// real explosions, the real HUD), then the camera is pinned. Density in
// frame is the point: traffic streams, a low helicopter, fire mid-frame.
// Triggered by ?shot=cover|dialogue|chase|explosion&seed=1.

import { ROADS, PLACES, heightAt } from './city.js';
import { Car } from './vehicles.js';
import { allCars } from './traffic.js';

function roadPose(roadIdx, ptIdx, back = 0) {
  const pts = ROADS[roadIdx].pts;
  const p = pts[ptIdx % pts.length];
  const pn = pts[(ptIdx + 1) % pts.length];
  const angle = Math.atan2(-(pn.x - p.x), -(pn.z - p.z));
  return { x: p.x, z: p.z, angle };
}

export function stageShot(name, G) {
  const { scene, player, police, hud, traffic } = G;
  G.shotMode = name;
  if (name === 'cover') {
    document.body.classList.add('shot-cover');
    const pose = roadPose(2, 26); // Anillo Centro — downtown canyon
    const hero = new Car(scene, 'sports', 0xe8232e, pose.x, pose.z, pose.angle);
    hero.driver = 'mission'; allCars.push(hero);
    const f = hero.forward();
    const sx = f.z, sz = -f.x; // side vector
    const cop1 = new Car(scene, 'police', 0x181820, pose.x + f.x * 6.5 + sx * 3.6, pose.z + f.z * 6.5 + sz * 3.6, pose.angle + 2.7);
    cop1.driver = 'police'; allCars.push(cop1);
    const cop2 = new Car(scene, 'police', 0x181820, pose.x - f.x * 10.5 - sx * 4.6, pose.z - f.z * 10.5 - sz * 4.6, pose.angle + 0.15);
    cop2.driver = 'police'; allCars.push(cop2);
    const van = new Car(scene, 'van', 0xe3ded2, pose.x + f.x * 13.5 - sx * 1.2, pose.z + f.z * 13.5 - sz * 1.2, pose.angle + 0.4);
    van.driver = 'mission'; allCars.push(van);
    van.damage(999); // wreck: burns continuously, chain-blooms in the loop
    G.shotVan = van; G.shotHero = hero;
    police.heli.active = true; police.heli.mesh.visible = true;
    police.heli.x = pose.x + f.x * 19 + sx * 7; police.heli.z = pose.z + f.z * 19 + sz * 7;
    G.shotCam = {
      pos: { x: pose.x - f.x * 9 - sx * 2.6, y: heightAt(pose.x, pose.z) + 1.7, z: pose.z - f.z * 9 - sz * 2.6 },
      look: { x: pose.x + f.x * 20, y: heightAt(pose.x, pose.z) + 3.4, z: pose.z + f.z * 20 },
    };
    G.explodeAt = { x: van.x, z: van.z, every: 0.95, t: 0.4 };
  }
  if (name === 'dialogue') {
    const p = PLACES.clubFaro;
    player.teleport(p.x + 2.5, p.z + 3.5);
    player.angle = Math.atan2(-(p.x - player.x), -(p.z - player.z));
    hud.setMission(1, 'PRIMER ENCARGO', 'Go to Club Faro', 'The package waits by the stage door', 195, 0.3);
    hud.setCash(120); hud.setStars(0, false); hud.setClock(1, 19 * 60 + 47);
    hud.showDialogue('Marina Vidal', 'LA JEFA · FIXER', 'So you are the new wheelman. I am Marina. In Vice Solmara, I am the phone that rings.', 'marina');
    const gt = new Car(scene, 'sports', 0xe8232e, p.x - 4, p.z - 5, 0.7);
    gt.driver = null; allCars.push(gt);
    G.shotCam = {
      pos: { x: player.x + 4.6, y: heightAt(player.x, player.z) + 2.1, z: player.z + 5.6 },
      look: { x: player.x - 1.5, y: heightAt(player.x, player.z) + 1.3, z: player.z - 1 },
    };
  }
  if (name === 'chase') {
    const pose = roadPose(0, 30); // Bulevar Costero, golden hour
    const hero = new Car(scene, 'sports', 0xe8232e, pose.x, pose.z, pose.angle);
    hero.driver = 'player'; hero.speed = 15;
    allCars.push(hero);
    player.enterCar(hero);
    const f = hero.forward();
    // Dense traffic stream ahead.
    const types = ['sedan', 'taxi', 'van', 'hatch', 'sedan', 'pickup', 'taxi', 'sedan', 'hatch'];
    types.forEach((tp, i) => {
      const c = new Car(scene, tp, [0xb8bcc4, 0xffc21f, 0xe3ded2, 0x5ea8d9, 0x4a6a9a, 0x6a7a8a, 0xffc21f, 0x7a3a4a, 0xe8e3d8][i],
        pose.x + f.x * (12 + i * 7.2) + (i % 2 ? 2.6 : -2.4) * f.z, pose.z + f.z * (12 + i * 7.2) - (i % 2 ? 2.6 : -2.4) * f.x, pose.angle);
      c.driver = 'mission'; c.speed = 9; allCars.push(c);
    });
    // Two interceptors right behind.
    [-1, 1].forEach((s, i) => {
      const cop = new Car(scene, 'police', 0x181820, pose.x - f.x * (9 + i * 6) + s * 2.2 * f.z, pose.z - f.z * (9 + i * 6) - s * 2.2 * f.x, pose.angle);
      cop.driver = 'police'; cop.callsign = ['GAVIOTA-5', 'FARO-5'][i]; cop.tactic = i ? 'ROADBLOCK' : 'FIRING';
      police.units.push(cop); allCars.push(cop);
    });
    police.setStars(5); police.seen = true; police.lastSeen = { x: hero.x, z: hero.z };
    // Helicopter LOW and LARGE: ahead-right, close.
    police.heli.active = true; police.heli.mesh.visible = true;
    police.heli.x = pose.x + f.x * 21 + f.z * 9;
    police.heli.z = pose.z + f.z * 21 - f.x * 9;
    hud.setMission(5, 'LUNA DE PAPEL', 'Lose the heat', 'They can see you · break line of sight', 45, 0.55);
    hud.setCash(120); hud.setClock(1, 20 * 60 + 45);
    hud.showDialogue('Marina Vidal', 'LA JEFA · FIXER', '¡No frenes, Rico! El helicóptero te tiene marcado — piérdete entre los callejones.', 'marina');
    G.shotHero = hero;
    G.shotCam = {
      pos: { x: pose.x - f.x * 8.2 + f.z * 1.6, y: heightAt(pose.x, pose.z) + 2.1, z: pose.z - f.z * 8.2 - f.x * 1.6 },
      look: { x: pose.x + f.x * 24, y: heightAt(pose.x, pose.z) + 3.4, z: pose.z + f.z * 24 },
    };
  }
  if (name === 'explosion') {
    const p = PLACES.mercado;
    const van = new Car(scene, 'van', 0x87a8b8, p.x + 6, p.z + 2, 2.2);
    van.driver = null; allCars.push(van);
    van.damage(999); // already blown: continuous fire + repeated blooms
    player.teleport(p.x - 3.5, p.z + 6.5);
    player.angle = Math.atan2(-(van.x - player.x), -(van.z - player.z));
    player.weapon = 2; hud.setWeapon(2);
    police.setStars(3); police.seen = true;
    const cop = new Car(scene, 'police', 0x181820, p.x - 22, p.z - 14, 0.8);
    cop.driver = 'police'; cop.callsign = 'GAVIOTA-1'; cop.tactic = 'PURSUIT';
    police.units.push(cop); allCars.push(cop);
    hud.setMission(5, 'LUNA DE PAPEL', 'Stop the van', 'The bag is by the stage door', 11, 0.4);
    hud.setCash(120); hud.setClock(1, 22 * 60 + 26);
    hud.showDialogue('Marina Vidal', 'LA JEFA · FIXER', '¡Eso es! Que arda, Rico — the whole barrio is watching.', 'marina');
    G.shotVan = van;
    G.explodeAt = { x: van.x, z: van.z, every: 0.95, t: 0.35 };
    G.shotCam = {
      pos: { x: player.x - 3.4, y: heightAt(player.x, player.z) + 2.3, z: player.z - 4.6 },
      look: { x: van.x, y: heightAt(van.x, van.z) + 1.6, z: van.z },
    };
  }
}

// Per-frame pinning for staged scenes (keeps the pose while systems run).
export function frameShot(name, G, t, dt) {
  if (!G.shotCam) return;
  const cam = G.camera;
  cam.position.set(G.shotCam.pos.x, G.shotCam.pos.y, G.shotCam.pos.z);
  cam.lookAt(G.shotCam.look.x, G.shotCam.look.y, G.shotCam.look.z);
  if (G.explodeAt) {
    G.explodeAt.t -= dt;
    if (G.explodeAt.t <= 0) {
      G.explodeAt.t = G.explodeAt.every;
      G.explosions.explode(G.explodeAt.x, G.explodeAt.z, 1.25);
    }
  }
  if (name === 'chase' && G.shotHero) {
    // Hold the hero and heli in their hero positions.
    const h = G.police.heli;
    h.mesh.position.set(h.x, heightAt(h.x, h.z) + 13.5, h.z);
    h.mesh.userData.rotor.rotation.y += dt * 40;
    const spot = h.mesh.userData.spot;
    spot.intensity = 380;
    spot.target.position.set(G.shotHero.x - h.x, -13.5 + heightAt(G.shotHero.x, G.shotHero.z) - heightAt(h.x, h.z), G.shotHero.z - h.z);
  }
  if (name === 'cover' && G.police.heli.mesh.visible) {
    const h = G.police.heli;
    h.mesh.position.set(h.x, heightAt(h.x, h.z) + 11.5, h.z);
    h.mesh.userData.rotor.rotation.y += dt * 40;
    const spot = h.mesh.userData.spot;
    spot.intensity = 520;
    if (G.shotHero) spot.target.position.set(G.shotHero.x - h.x, -11.5, G.shotHero.z - h.z);
  }
}
