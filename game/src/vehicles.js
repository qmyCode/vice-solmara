// vehicles.js — one job: cars. Seven body types built from boxes and cylinders (the Águila GT
// gets a spoiler and magenta underglow, the police Interceptor a light bar), arcade driving
// physics on the analytic terrain, building and car collisions, and health that burns, smokes
// and finally hands the car to the explosion system.
import * as THREE from '../vendor/three.module.js';
import { clamp, angDiff } from './rng.js';

export const CAR_TYPES = {
  sedan: { w: 1.82, l: 4.35, bodyH: 0.58, cabH: 0.5, cabBack: -0.25, top: 27, accel: 11.5, colors: [0xb8452e, 0x3e6fb0, 0xc0c4c9, 0x37414a, 0x7a4a8c, 0x2e7d5b, 0xd8d3c8] },
  taxi: { w: 1.82, l: 4.35, bodyH: 0.58, cabH: 0.5, cabBack: -0.25, top: 26, accel: 11, colors: [0xf2b21b] },
  hatch: { w: 1.72, l: 3.7, bodyH: 0.6, cabH: 0.52, cabBack: -0.5, top: 24, accel: 12, colors: [0xd8542e, 0x4a90c2, 0xdadada, 0x5ba24a, 0x8855aa] },
  pickup: { w: 1.9, l: 4.7, bodyH: 0.72, cabH: 0.55, cabBack: 0.55, top: 25, accel: 11, colors: [0x8c4a2e, 0x4a5a6a, 0xb0a890, 0x365a3c] },
  van: { w: 1.95, l: 4.9, bodyH: 1.05, cabH: 0.42, cabBack: -0.7, top: 23, accel: 9.5, colors: [0xd8d8d8, 0x7a8a99, 0xb8452e, 0x3e6fb0] },
  sports: { w: 1.92, l: 4.5, bodyH: 0.46, cabH: 0.4, cabBack: -0.35, top: 38, accel: 17, colors: [0xff8c1a, 0xe83e6b, 0x22b8cf, 0xf2e21b, 0x8c5bff] },
  interceptor: { w: 1.88, l: 4.6, bodyH: 0.56, cabH: 0.5, cabBack: -0.25, top: 34, accel: 15.5, colors: [0x1c1f24] },
};
let nextId = 1;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let sharedGlow = null;

function liveryTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8ecf0'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#16283e';
  g.font = '900 30px Arial';
  g.textAlign = 'center';
  g.fillText('POLICÍA', 128, 34);
  g.font = 'bold 15px Arial';
  g.fillStyle = '#3f8cff';
  g.fillText('· SOLMARA ·', 128, 55);
  return new THREE.CanvasTexture(c);
}
let sharedLivery = null;

export function makeCarMesh(type, colorHex) {
  const t = CAR_TYPES[type];
  const grp = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1d2b3a });
  const glassLite = new THREE.MeshLambertMaterial({ color: 0x51748c });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.bodyH, t.l), paint);
  body.position.y = 0.38 + t.bodyH / 2;
  grp.add(body);
  // hood scoop line + bumpers + side skirts: cheap boxes that break the slab silhouette
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.98, 0.16, 0.22), dark);
  bumperF.position.set(0, 0.42, t.l / 2 + 0.04);
  grp.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -t.l / 2 - 0.04;
  grp.add(bumperR);
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, t.l * 0.52), dark);
    skirt.position.set(sx * (t.w / 2 + 0.01), 0.3, 0);
    grp.add(skirt);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.16), paint);
    mirror.position.set(sx * (t.w * 0.46 + 0.06), 0.38 + t.bodyH + t.cabH * 0.55, t.cabBack + t.l * 0.2);
    grp.add(mirror);
  }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.82, t.cabH, t.l * 0.48), type === 'van' ? paint : glass);
  cab.position.set(0, 0.38 + t.bodyH + t.cabH / 2 - 0.04, t.cabBack);
  grp.add(cab);
  if (type !== 'van') {
    // raked windshield + rear glass in a lighter tone than the side glass
    const shield = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.76, 0.05, t.cabH * 1.15), glassLite);
    shield.position.set(0, 0.38 + t.bodyH + t.cabH * 0.52, t.cabBack + t.l * 0.26);
    shield.rotation.x = -0.62;
    grp.add(shield);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.76, 0.05, t.cabH * 1.05), glassLite);
    rearGlass.position.set(0, 0.38 + t.bodyH + t.cabH * 0.52, t.cabBack - t.l * 0.26);
    rearGlass.rotation.x = 0.62;
    grp.add(rearGlass);
    // roof panel in paint, so the glasshouse reads as glass band + roof, not one block
    const roof = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.8, 0.06, t.l * 0.3), paint);
    roof.position.set(0, 0.38 + t.bodyH + t.cabH + 0.0, t.cabBack);
    grp.add(roof);
  }
  if (type !== 'van') {
    // V3 shape pass — kill the slab read: a sloped hood panel dropping toward the nose,
    // a narrower tapered nose panel, a rounded roof dome over the glasshouse, and dark
    // fender trim over every wheel arch. All cheap boxes / one scaled sphere.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.88, 0.07, t.l * 0.3), paint);
    hood.position.set(0, 0.38 + t.bodyH + 0.005, t.l * 0.335);
    hood.rotation.x = 0.17;
    grp.add(hood);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.78, t.bodyH * 0.66, 0.26), paint);
    nose.position.set(0, 0.38 + t.bodyH * 0.42, t.l / 2 + 0.05);
    grp.add(nose);
    if (type !== 'pickup') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), paint);
      dome.scale.set(t.w * 0.37, 0.17, t.l * 0.16);
      dome.position.set(0, 0.38 + t.bodyH + t.cabH - 0.03, t.cabBack);
      grp.add(dome);
    }
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.92), dark);
      arch.position.set(sx * (t.w / 2 + 0.015), 0.6, sz * t.l * 0.31);
      grp.add(arch);
    }
  }
  if (type === 'interceptor') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.02, t.bodyH * 0.5, t.l * 0.5), new THREE.MeshLambertMaterial({ color: 0xe8ecf0 }));
    stripe.position.y = body.position.y;
    grp.add(stripe);
    if (!sharedLivery) sharedLivery = liveryTexture();
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(t.l * 0.44, t.bodyH * 0.52),
        new THREE.MeshBasicMaterial({ map: sharedLivery }));
      door.position.set(sx * (t.w / 2 + 0.015), body.position.y, 0);
      door.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      grp.add(door);
    }
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.4), dark);
    bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.36), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.28; bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.36), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.x = 0.28; bar.add(blue);
    bar.position.set(0, 0.38 + t.bodyH + t.cabH + 0.06, t.cabBack);
    grp.add(bar);
    grp.userData.lightbar = { red: red.material, blue: blue.material };
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
    sign.position.set(0, 0.38 + t.bodyH + t.cabH + 0.07, t.cabBack);
    grp.add(sign);
  }
  if (type === 'sports') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.92, 0.07, 0.42), dark);
    wing.position.set(0, 1.06, -t.l / 2 + 0.3);
    grp.add(wing);
    for (const sx of [-1, 1]) { // wing struts + a centre racing stripe + twin exhausts
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), dark);
      strut.position.set(sx * t.w * 0.3, 0.93, -t.l / 2 + 0.3);
      grp.add(strut);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 8), chrome);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * 0.32, 0.34, -t.l / 2 - 0.08);
      grp.add(pipe);
    }
    const stripeTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, t.l * 0.94), new THREE.MeshLambertMaterial({ color: 0x14161c }));
    stripeTop.position.set(0, 0.38 + t.bodyH + 0.015, 0);
    grp.add(stripeTop);
    if (!sharedGlow) sharedGlow = glowTexture();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(t.w + 1.6, t.l + 1.6),
      new THREE.MeshBasicMaterial({ map: sharedGlow, color: 0xff2fd6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.1;
    grp.add(glow);
    grp.userData.underglow = glow;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 6);
  rimGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(sx * (t.w / 2 - 0.05), 0.34, sz * t.l * 0.31);
    grp.add(w);
    const rim = new THREE.Mesh(rimGeo, chrome); // bright rim face so the wheels read as wheels
    rim.position.copy(w.position);
    grp.add(rim);
    wheels.push(w);
    wheels.push(rim);
  }
  grp.userData.wheels = wheels;
  const lightGeo = new THREE.BoxGeometry(0.34, 0.13, 0.05);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xfff6cf }));
    hl.position.set(sx * t.w * 0.32, 0.62, t.l / 2 + 0.02);
    grp.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xd82424 }));
    tl.position.set(sx * t.w * 0.26, 0.64, -t.l / 2 - 0.02);
    grp.add(tl);
  }
  // a full-width rear light bar on the hero car — its signature at chase distance
  if (type === 'sports') {
    const barLight = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.8, 0.09, 0.04), new THREE.MeshBasicMaterial({ color: 0xff3548 }));
    barLight.position.set(0, 0.78, -t.l / 2 - 0.02);
    grp.add(barLight);
  }
  grp.userData.paint = paint;
  return grp;
}

export function createVehicle(city, type, colorHex, x, z, angle, role) {
  const mesh = makeCarMesh(type, colorHex);
  mesh.position.set(x, city.height(x, z) + 0.05, z);
  mesh.rotation.y = angle;
  return {
    id: nextId++, type, mesh, angle, speed: 0, steerVis: 0,
    health: 100, role, driver: null, wrecked: false, exploded: false,
    radius: Math.max(CAR_TYPES[type].w, CAR_TYPES[type].l) * 0.36,
    smokeAcc: 0, lastX: x, lastZ: z,
  };
}

/** Push a circle at (x,z) out of every building OBB it overlaps; returns impact speed into the wall (0 if none). */
export function collideBuildings(city, x, z, radius) {
  let impact = 0, px = x, pz = z;
  for (const c of city.colliders) {
    const dx = px - c.x, dz = pz - c.z;
    if (dx * dx + dz * dz > (radius + c.hw + c.hd) * (radius + c.hw + c.hd)) continue;
    const cos = Math.cos(-c.rot), sin = Math.sin(-c.rot);
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd);
    let ox = lx - qx, oz = lz - qz;
    let d2 = ox * ox + oz * oz;
    if (d2 > radius * radius) continue;
    if (d2 < 1e-6) { // centre inside the box: leave by the shallowest face
      const ex = c.hw - Math.abs(lx), ez = c.hd - Math.abs(lz);
      if (ex < ez) { ox = (lx > 0 ? 1 : -1) * (ex + radius); oz = 0; } else { ox = 0; oz = (lz > 0 ? 1 : -1) * (ez + radius); }
      d2 = ox * ox + oz * oz;
    }
    const d = Math.sqrt(d2), push = (radius - d) / (d || 1);
    const wx = ox * push, wz = oz * push;
    const cos2 = Math.cos(c.rot), sin2 = Math.sin(c.rot);
    px += wx * cos2 - wz * sin2;
    pz += wx * sin2 + wz * cos2;
    impact = Math.max(impact, 1);
  }
  return { x: px, z: pz, hit: impact > 0 };
}

export function damageVehicle(G, v, amount, cause) {
  if (v.exploded || amount <= 0) return;
  v.health -= amount;
  if (v.health <= 0) {
    v.exploded = true;
    v.wrecked = true;
    v.speed = 0;
    G.explosions.boom(v.mesh.position.x, v.mesh.position.y + 0.6, v.mesh.position.z, { car: v });
    v.mesh.userData.paint.color.setHex(0x232323);
    if (v.mesh.userData.underglow) v.mesh.userData.underglow.visible = false;
  } else if (v.health < 30 && !v.wrecked) {
    v.wrecked = true; // limping: smoke and a lower top speed from here on
  }
}

/**
 * Advance one car one step. ctl = { throttle: -1..1, steer: -1..1, brake: bool }.
 * hooks: { crash(intensity), splash() } via G.audio/G.fx as available.
 */
export function stepVehicle(G, v, dt, ctl) {
  const city = G.city, t = CAR_TYPES[v.type];
  if (v.exploded) { v.speed = 0; return; }
  const topSpeed = t.top * (v.wrecked ? 0.55 : 1);
  const fwd = Math.sign(v.speed) || 1;
  if (ctl.brake && Math.abs(v.speed) > 0.5) {
    v.speed -= Math.sign(v.speed) * 22 * dt;
  } else if (ctl.throttle > 0) {
    v.speed += t.accel * ctl.throttle * dt * (1 - Math.max(0, v.speed) / (topSpeed * 1.15));
  } else if (ctl.throttle < 0) {
    if (v.speed > 0.5) v.speed -= 20 * dt;
    else v.speed = Math.max(v.speed + t.accel * 0.55 * ctl.throttle * dt, -8);
  } else {
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 3.2 * dt); // engine drag
  }
  v.speed -= v.speed * 0.12 * dt; // rolling resistance
  if (Math.abs(v.speed) < 0.04 && !ctl.throttle) v.speed = 0;
  v.speed = clamp(v.speed, -8, topSpeed);
  const steerTarget = ctl.steer * 0.52 * clamp(1 - Math.abs(v.speed) / 60, 0.35, 1);
  v.steerVis += (steerTarget - v.steerVis) * Math.min(1, dt * 7);
  if (v.speed !== 0) v.angle += v.steerVis * (Math.abs(v.speed) / 4.4) * dt * fwd * clamp(Math.abs(v.speed) / 6, 0, 1);
  const fx = Math.sin(v.angle), fz = Math.cos(v.angle);
  let nx = v.mesh.position.x + fx * v.speed * dt;
  let nz = v.mesh.position.z + fz * v.speed * dt;
  // water is a wall: the bay is for boats
  if (city.height(nx, nz) < -0.55) {
    if (G.audio) G.audio.splash();
    v.speed *= -0.25;
    nx = v.mesh.position.x; nz = v.mesh.position.z;
  }
  const res = collideBuildings(city, nx, nz, v.radius);
  if (res.hit) {
    const impact = Math.abs(v.speed);
    if (impact > 5) {
      damageVehicle(G, v, (impact - 4) * 1.5, 'crash');
      if (G.audio) G.audio.crash(Math.min(1, impact / 26));
      if (v.role === 'player') G.shake = Math.min(0.6, (G.shake || 0) + impact * 0.012);
    }
    v.speed *= 0.25;
  }
  nx = res.x; nz = res.z;
  v.mesh.position.x = nx;
  v.mesh.position.z = nz;
  const h = city.height(nx, nz);
  v.mesh.position.y = h + 0.05;
  // orient to the ground: sample ahead and across
  const ha = city.height(nx + fx * 2, nz + fz * 2), hb = city.height(nx - fx * 2, nz - fz * 2);
  const hl = city.height(nx - fz * 1.4, nz + fx * 1.4), hr = city.height(nx + fz * 1.4, nz - fx * 1.4);
  v.mesh.rotation.set(0, 0, 0);
  v.mesh.rotateY(v.angle);
  v.mesh.rotateX(Math.atan2(hb - ha, 4));
  v.mesh.rotateZ(Math.atan2(hl - hr, 2.8));
  // wheels
  const wheels = v.mesh.userData.wheels;
  if (wheels) for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x += (v.speed * dt) / 0.34;
    if (i < 4) wheels[i].rotation.y = v.steerVis * 0.9; // front axle: tyre + rim pairs
  }
  // damage smoke / fire from the engine bay
  if (!v.exploded && v.health < 45) {
    v.smokeAcc += dt * (v.health < 22 ? 22 : 9);
    while (v.smokeAcc > 1) {
      v.smokeAcc -= 1;
      G.explosions.puff(nx + fx * 1.4, h + 1.1, nz + fz * 1.4, v.health < 22 ? 'fire' : 'smoke');
    }
  }
}

/** Circle push-apart between two cars; returns true on a hard hit (damage already applied). */
export function collideVehicles(G, a, b, dt) {
  if (a === b || a.exploded && b.exploded) return false;
  const dx = b.mesh.position.x - a.mesh.position.x, dz = b.mesh.position.z - a.mesh.position.z;
  const rr = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 > rr * rr || d2 < 1e-6) return false;
  const d = Math.sqrt(d2), ux = dx / d, uz = dz / d, overlap = rr - d;
  const rel = Math.abs(a.speed - b.speed);
  const pushA = a.exploded ? 0 : 0.5, pushB = b.exploded ? 0 : 0.5;
  a.mesh.position.x -= ux * overlap * pushA; a.mesh.position.z -= uz * overlap * pushA;
  b.mesh.position.x += ux * overlap * pushB; b.mesh.position.z += uz * overlap * pushB;
  if (rel > 4) {
    damageVehicle(G, a, (rel - 3) * 1.1, 'ram');
    damageVehicle(G, b, (rel - 3) * 1.1, 'ram');
    if (G.audio) G.audio.crash(Math.min(1, rel / 24));
    const transfer = (a.speed - b.speed) * 0.3;
    if (!a.exploded) a.speed -= transfer;
    if (!b.exploded) b.speed += transfer;
    return true;
  }
  return false;
}

export function vehicleForward(v) {
  return { x: Math.sin(v.angle), z: Math.cos(v.angle) };
}
export { angDiff };
