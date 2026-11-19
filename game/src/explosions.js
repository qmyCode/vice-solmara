// explosions.js — one job: fire and destruction. A pooled particle engine (additive fire/sparks
// and soft smoke, drawn as shader points), tumbling debris, ground scorch marks, a shockwave
// ring and a reusable point-light flash. explode() builds a deliberately IRREGULAR fireball —
// clustered, anisotropic bursts of differently-sized flames — never a smooth sphere. Destroyed
// cars keep burning for half a minute and blast damage chains into whatever is parked nearby.

import * as THREE from 'three';
import { Rng } from './rng.js';

const rng = new Rng(4242);

function makePointPool(scene, max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const dat = new Float32Array(max * 4); // size, alpha, unused, unused
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aDat', new THREE.BufferAttribute(dat, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: [
      'attribute vec3 aColor; attribute vec4 aDat;',
      'varying vec3 vColor; varying float vAlpha;',
      'void main(){ vColor = aColor; vAlpha = aDat.y;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = aDat.x * (240.0 / max(1.0, -mv.z));',
      '  gl_Position = projectionMatrix * mv; }',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vColor; varying float vAlpha;',
      'void main(){',
      '  vec2 d = gl_PointCoord - 0.5;',
      '  float a = smoothstep(0.5, 0.08, length(d)) * vAlpha;',
      '  if (a < 0.01) discard;',
      '  gl_FragColor = vec4(vColor, a); }',
    ].join('\n'),
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return {
    geo, pos, col, dat, max, head: 0,
    parts: Array.from({ length: max }, () => ({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, grow: 0, fadePow: 1 })),
  };
}

export function createExplosions(G) {
  const scene = G.scene;
  const fire = makePointPool(scene, 1000, true);
  const smoke = makePointPool(scene, 550, false);
  const flash = new THREE.PointLight(0xffa040, 0, 60, 1.6);
  scene.add(flash);
  const burners = []; // {x,y,z,t} — burning wrecks
  const scorches = [];

  // debris: instanced tumbling boxes
  const debrisMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.42, 0.3, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2e }), 42,
  );
  debrisMesh.frustumCulled = false;
  scene.add(debrisMesh);
  const debris = Array.from({ length: 42 }, () => ({ life: 0, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, sx: 1 }));
  let debrisHead = 0;

  // shockwave ring + core flash sprite
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringT = 1e9, ringPos = { x: 0, y: 0, z: 0 };
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: G.glowTex, color: 0xffc37a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(flashSprite);
  let flashT = 1e9;

  function spawn(pool, x, y, z, vx, vy, vz, life, size, r, g, b, alpha, grav, drag, grow) {
    const i = pool.head;
    pool.head = (pool.head + 1) % pool.max;
    const p = pool.parts[i];
    p.life = life; p.maxLife = life; p.vx = vx; p.vy = vy; p.vz = vz; p.grav = grav; p.drag = drag; p.grow = grow;
    pool.pos[i * 3] = x; pool.pos[i * 3 + 1] = y; pool.pos[i * 3 + 2] = z;
    pool.col[i * 3] = r; pool.col[i * 3 + 1] = g; pool.col[i * 3 + 2] = b;
    pool.dat[i * 4] = size; pool.dat[i * 4 + 1] = alpha;
  }

  /** A small generic burst: impact sparks, dust, muzzle smoke. */
  function burst(x, y, z, colorHex, n = 10, speed = 5, size = 2.2, life = 0.4) {
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), e = rng.range(-0.4, 1);
      const s = speed * rng.range(0.3, 1);
      spawn(fire, x, y, z, Math.cos(a) * s, e * s, Math.sin(a) * s,
        life * rng.range(0.6, 1.3), size * rng.range(0.6, 1.4), c.r, c.g, c.b, 0.9, -3, 1.5, 0);
    }
  }

  /** The full event: irregular fireball, smoke column, sparks, debris, ring, light, scorch. */
  function explode(x, y, z, scale = 1) {
    // 5 clustered lobes in random directions — the fireball silhouette is lumpy on purpose
    for (let lobe = 0; lobe < 5; lobe++) {
      const la = rng.range(0, Math.PI * 2), lx = Math.cos(la) * rng.range(0, 2.4) * scale, lz = Math.sin(la) * rng.range(0, 2.4) * scale;
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), e = rng.range(-0.2, 1.15);
        const s = rng.range(1.5, 6.5) * scale;
        const hot = rng.f();
        spawn(fire, x + lx, y + rng.range(0, 1.2), z + lz,
          Math.cos(a) * s * (0.5 + e * 0.4), e * s * 0.9 + 1.5, Math.sin(a) * s * (0.5 + e * 0.4),
          rng.range(0.35, 0.95), rng.range(5, 15) * scale,
          1, 0.42 + hot * 0.45, 0.1 + hot * 0.16, 0.95, 2.2, 1.6, 6);
      }
    }
    // white-hot core + sparks
    for (let i = 0; i < 12; i++) {
      spawn(fire, x, y + 0.6, z, rng.range(-2, 2), rng.range(1, 5), rng.range(-2, 2),
        rng.range(0.15, 0.3), rng.range(7, 12) * scale, 1, 0.95, 0.75, 1, 0, 1, 0);
    }
    for (let i = 0; i < 30; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(6, 17) * scale;
      spawn(fire, x, y + 0.5, z, Math.cos(a) * s, rng.range(2, 9), Math.sin(a) * s,
        rng.range(0.4, 0.9), rng.range(0.8, 1.6), 1, 0.75, 0.3, 1, -11, 0.4, 0);
    }
    // smoke
    for (let i = 0; i < 22; i++) {
      const shade = rng.range(0.08, 0.3);
      spawn(smoke, x + rng.range(-1.6, 1.6) * scale, y + rng.range(0.5, 2.6), z + rng.range(-1.6, 1.6) * scale,
        rng.range(-1, 1), rng.range(2.5, 5.5), rng.range(-1, 1),
        rng.range(1.6, 3.4), rng.range(7, 13) * scale, shade, shade, shade * 1.05, 0.42, 1.2, 0.6, 7);
    }
    // debris
    for (let i = 0; i < 10; i++) {
      const d = debris[debrisHead];
      debrisHead = (debrisHead + 1) % debris.length;
      const a = rng.range(0, Math.PI * 2);
      d.life = rng.range(1, 1.9);
      d.x = x; d.y = y + 0.8; d.z = z;
      d.vx = Math.cos(a) * rng.range(3, 11); d.vz = Math.sin(a) * rng.range(3, 11);
      d.vy = rng.range(6, 14); d.rx = rng.range(0, 3); d.rz = rng.range(0, 3); d.sx = rng.range(0.7, 1.8);
    }
    // ring, flash, light
    ringPos = { x, y, z };
    ringT = 0;
    ring.visible = true;
    flashT = 0;
    flashSprite.position.set(x, y + 1.2, z);
    flash.position.set(x, y + 2.5, z);
    flash.intensity = 260 * scale;
    // scorch mark
    if (scorches.length > 22) {
      const old = scorches.shift();
      scene.remove(old);
    }
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(rng.range(3.4, 4.6) * scale, 18),
      new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(x, G.city.heightAt(x, z) + 0.16, z);
    scene.add(scorch);
    scorches.push(scorch);
    if (G.audio) G.audio.boom();
    if (G.onExplosion) G.onExplosion(x, z, 10 * scale);
  }

  /** A wreck keeps burning: register an emitter at (x,y,z) for `dur` seconds. */
  function addBurning(x, y, z, dur = 26) {
    burners.push({ x, y, z, t: dur });
  }

  function stepPool(pool, dt) {
    const { parts, pos, dat } = pool;
    for (let i = 0; i < pool.max; i++) {
      const p = parts[i];
      if (p.life <= 0) { dat[i * 4 + 1] = 0; continue; }
      p.life -= dt;
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF; p.vz *= dragF;
      p.vy = p.vy * dragF + p.grav * dt;
      pos[i * 3] += p.vx * dt;
      pos[i * 3 + 1] += p.vy * dt;
      pos[i * 3 + 2] += p.vz * dt;
      const frac = Math.max(0, p.life / p.maxLife);
      dat[i * 4 + 1] = Math.min(1, frac * 1.6) * (pool === fire ? 0.95 : 0.42);
      dat[i * 4] += p.grow * dt;
    }
    pool.geo.attributes.position.needsUpdate = true;
    pool.geo.attributes.aDat.needsUpdate = true;
    pool.geo.attributes.aColor.needsUpdate = true;
  }

  const dummy = new THREE.Object3D();
  function update(dt) {
    stepPool(fire, dt);
    stepPool(smoke, dt);
    // burning wrecks breathe fire and smoke
    for (let i = burners.length - 1; i >= 0; i--) {
      const b = burners[i];
      b.t -= dt;
      if (b.t <= 0) { burners.splice(i, 1); continue; }
      if (rng.chance(0.5)) {
        spawn(fire, b.x + rng.range(-0.8, 0.8), b.y + 0.9, b.z + rng.range(-0.8, 0.8),
          rng.range(-0.4, 0.4), rng.range(2, 3.6), rng.range(-0.4, 0.4),
          rng.range(0.3, 0.6), rng.range(3.5, 6.5), 1, 0.55, 0.14, 0.9, 2.4, 0.8, 2);
      }
      if (rng.chance(0.35)) {
        const shade = rng.range(0.05, 0.2);
        spawn(smoke, b.x, b.y + 1.6, b.z, rng.range(-0.3, 0.3), rng.range(2.4, 4), rng.range(-0.3, 0.3),
          rng.range(1.6, 2.8), rng.range(5, 8), shade, shade, shade, 0.4, 1.4, 0.5, 6);
      }
    }
    // debris physics
    debris.forEach((d, i) => {
      if (d.life > 0) {
        d.life -= dt;
        d.vy -= 22 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const gy = G.city.heightAt(d.x, d.z) + 0.2;
        if (d.y < gy) { d.y = gy; d.vy *= -0.35; d.vx *= 0.7; d.vz *= 0.7; }
        d.rx += dt * 5; d.rz += dt * 4;
      }
      dummy.position.set(d.x, d.life > 0 ? d.y : -60, d.z);
      dummy.rotation.set(d.rx, 0, d.rz);
      dummy.scale.setScalar(d.sx);
      dummy.updateMatrix();
      debrisMesh.setMatrixAt(i, dummy.matrix);
    });
    debrisMesh.instanceMatrix.needsUpdate = true;
    // ring + flash + light decay
    if (ringT < 0.55) {
      ringT += dt;
      const t = ringT / 0.55;
      ring.position.set(ringPos.x, G.city.heightAt(ringPos.x, ringPos.z) + 0.3, ringPos.z);
      ring.scale.setScalar(1 + t * 15);
      ring.material.opacity = 0.75 * (1 - t);
      if (ringT >= 0.55) ring.visible = false;
    }
    if (flashT < 0.3) {
      flashT += dt;
      const t = flashT / 0.3;
      flashSprite.scale.setScalar(6 + t * 17);
      flashSprite.material.opacity = 0.95 * (1 - t);
      flash.intensity = Math.max(0, flash.intensity - dt * 1500);
    } else {
      flashSprite.material.opacity = 0;
      flash.intensity = 0;
    }
  }

  return { explode, burst, addBurning, update };
}
