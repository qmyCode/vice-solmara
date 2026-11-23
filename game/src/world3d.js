// world3d.js — one job: turn city.js data into the Three.js scene. Terrain from the analytic
// height function with painted vertex colours, a water plane, road ribbons with a canvas asphalt
// texture, instanced buildings (two window-grid textures, low and high rise), canvas-texture neon
// signs with halo sprites, instanced palms and lamps, named place buildings, and a day cycle
// that drifts from afternoon and settles into neon dusk.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, sstep } from './rng.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
function asphaltTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#33343b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${140 + Math.random() * 60},${140 + Math.random() * 60},${150 + Math.random() * 60},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = 'rgba(235,235,225,0.85)'; g.fillRect(3, 0, 3, h); g.fillRect(w - 6, 0, 3, h);
    g.fillStyle = 'rgba(250,205,90,0.9)';
    for (let y = 8; y < h; y += 42) g.fillRect(w / 2 - 2, y, 4, 22);
  });
}
function facadeTexture(floors, cols) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#cfc8bd'; g.fillRect(0, 0, w, h);
    const fh = h / floors, cw = w / cols;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.42;
      g.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd98a' : '#bfe3ff') : '#3a4150';
      g.fillRect(c * cw + cw * 0.22, f * fh + fh * 0.24, cw * 0.56, fh * 0.5);
    }
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, h - 5, w, 5);
  });
}
function neonTexture(text, color) {
  const tex = canvasTexture(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // shrink the font until long names fit the canvas instead of clipping at the edges
    let fs = 64;
    g.font = `bold ${fs}px Arial, sans-serif`;
    while (g.measureText(text).width > w - 20 && fs > 18) { fs -= 4; g.font = `bold ${fs}px Arial, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 26;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 8; g.fillStyle = '#ffffff';
    g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
const NEON_COLORS = ['#ff4fd8', '#22d3ee', '#ffb02e', '#7CFC9a', '#ff5d5d', '#b78bff'];

export function createWorld3d(city) {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, 1, 0.3, 2400);
  scene.fog = new THREE.Fog(0xbcd8e2, 240, 1500);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404860, 0.35));

  // sky dome with a two-stop gradient we re-tint through the day
  const skyUni = { top: { value: new THREE.Color(0x6fb7e8) }, horizon: { value: new THREE.Color(0xd8ecf2) } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2100, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyUni,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(t, 0.75)), 1.0); }',
    }),
  );
  scene.add(sky);

  // terrain
  {
    const SIZE = 1500, SEG = 120;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xcdb287), cGrass = new THREE.Color(0x67914e), cGrass2 = new THREE.Color(0x7ba257),
      cRock = new THREE.Color(0x8a7f74), cUrban = new THREE.Color(0x8d887c), cSea = new THREE.Color(0x9a8a68);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = city.height(x, z);
      pos.setY(i, h);
      const n = Math.sin(x * 0.11 + z * 0.07) * Math.sin(x * 0.031 - z * 0.043);
      if (h < -0.6) tmp.copy(cSea);
      else if (h < 0.9) tmp.copy(cSand);
      else if (h > 27) tmp.copy(cRock).lerp(cGrass, 0.25);
      else { tmp.copy(cGrass).lerp(cGrass2, 0.5 + n * 0.5); const urb = sstep(230, 120, Math.hypot(x, z)); tmp.lerp(cUrban, urb * 0.55); }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
  // water
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x166b84, transparent: true, opacity: 0.93, shininess: 120, specular: 0x99ccdd });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.75;
  scene.add(water);

  // roads
  {
    const tex = asphaltTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    for (const road of city.roads) {
      const pts = road.pts, n = pts.length;
      const verts = new Float32Array(n * 2 * 3), uvs = new Float32Array(n * 2 * 2), idx = [];
      let cum = 0;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n], o = pts[Math.max(0, i - 1)];
        let dx = q.x - o.x, dz = q.z - o.z;
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        if (i > 0) cum += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
        const hw = road.width / 2;
        for (const s of [-1, 1]) {
          const x = p.x + -dz * s * hw, z = p.z + dx * s * hw;
          verts.set([x, city.height(x, z) + 0.14, z], (i * 2 + (s + 1) / 2) * 3);
          uvs.set([cum / 15, s < 0 ? 0 : 1], (i * 2 + (s + 1) / 2) * 2);
        }
        // Winding matters: (a, a+1, b) / (b, a+1, b+1) puts the ribbon's face UP. The old
        // order faced every road DOWN — backface-culled from any above-ground camera, so
        // no road ever rendered in 3D and every street scene read as cars on grass.
        if (i < n - 1 || road.closed) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, mat));
    }
  }

  // buildings (instanced, two facade bands) + neon + roof strips
  const neonSigns = [];
  {
    const low = city.buildings.filter((b) => b.h <= 20), high = city.buildings.filter((b) => b.h > 20);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const fill = (list, tex) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ map: tex }), list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, b.rot, 0);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.setHex(b.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    };
    fill(low, facadeTexture(4, 5));
    fill(high, facadeTexture(11, 6));
    // neon signs + roof strips
    const stripGeo = new THREE.BoxGeometry(1, 0.28, 1);
    const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, city.buildings.length));
    let stripCount = 0;
    city.buildings.forEach((b, i) => {
      if (b.neon) {
        const color = NEON_COLORS[i % NEON_COLORS.length];
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(b.w * 0.94, 15), 2.6),
          new THREE.MeshBasicMaterial({ map: neonTexture(b.neon, color), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
        );
        const fx = Math.sin(b.rot), fz = Math.cos(b.rot);
        sign.position.set(b.x + fx * (b.d / 2 + 0.25), b.y + b.h * 0.72, b.z + fz * (b.d / 2 + 0.25));
        sign.rotation.y = b.rot;
        scene.add(sign);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.position.copy(sign.position);
        halo.scale.set(20, 7, 1);
        scene.add(halo);
        neonSigns.push({ sign, halo, phase: i * 1.7, flicker: i % 9 === 4 });
        dummy.position.set(b.x, b.y + b.h + 0.15, b.z);
        dummy.rotation.set(0, b.rot, 0);
        dummy.scale.set(b.w * 0.98, 1, b.d * 0.98);
        dummy.updateMatrix();
        strips.setMatrixAt(stripCount, dummy.matrix);
        strips.setColorAt(stripCount, col.set(NEON_COLORS[(i + 2) % NEON_COLORS.length]));
        stripCount++;
      }
    });
    strips.count = stripCount;
    strips.instanceMatrix.needsUpdate = true;
    scene.add(strips);
    var stripMesh = strips;
  }
  function haloTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
  }

  // named places: distinct low buildings with signs (and colliders)
  {
    const defs = [
      { at: city.places.garage, w: 19, h: 6.5, d: 13, color: 0xd8cfc0, sign: 'TALLER MARISOL', signColor: '#ffb02e', door: true },
      { at: city.places.hotel, w: 17, h: 27, d: 17, color: 0xe6d9c4, sign: 'HOTEL BRISA', signColor: '#22d3ee' },
      { at: city.places.showroom, w: 21, h: 7, d: 15, color: 0x9fc4d8, sign: 'VITRAL MOTORS', signColor: '#ff4fd8' },
      { at: city.places.station, w: 17, h: 9, d: 13, color: 0xb9c2cc, sign: 'COMISARÍA', signColor: '#7db4ff' },
      { at: city.places.hospital, w: 18, h: 12, d: 14, color: 0xf0f0ea, sign: 'CLÍNICA DEL SOL', signColor: '#ff5d5d' },
      { at: city.places.club, w: 16, h: 10, d: 14, color: 0x8a7f95, sign: 'CLUB FARO', signColor: '#ff4fd8' },
      { at: city.places.safehouse, w: 11, h: 6, d: 10, color: 0xcbb59a, sign: null },
      { at: city.places.isleHouse, w: 10, h: 5.5, d: 9, color: 0xd8c9a8, sign: null },
    ];
    for (const def of defs) {
      const at = def.at;
      const y = city.height(at.x, at.z);
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), new THREE.MeshLambertMaterial({ color: def.color, map: facadeTexture(3, 5) }));
      body.position.y = def.h / 2 - 0.3;
      grp.add(body);
      if (def.door) {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.6), new THREE.MeshBasicMaterial({ color: 0x2a2d33 }));
        door.position.set(0, 2, def.d / 2 + 0.06);
        grp.add(door);
      }
      if (def.sign) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(def.w * 0.92, 16), 2.4),
          new THREE.MeshBasicMaterial({ map: neonTexture(def.sign, def.signColor), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        sign.position.set(0, def.h - 1.2, def.d / 2 + 0.3);
        grp.add(sign);
        neonSigns.push({ sign, halo: null, phase: def.w, flicker: false });
      }
      grp.position.set(at.x, y - 0.2, at.z);
      grp.rotation.y = at.ang || 0;
      scene.add(grp);
      city.colliders.push({ x: at.x, z: at.z, hw: def.w / 2, hd: def.d / 2, rot: at.ang || 0 });
    }
    // mirador platform
    const m = city.places.mirador;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 1.2, 20), new THREE.MeshLambertMaterial({ color: 0x9a938a }));
    disc.position.set(m.x, city.height(m.x, m.z) + 0.2, m.z);
    scene.add(disc);
  }

  // palms + lamps (instanced)
  {
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7.5, 5);
    trunkGeo.translate(0, 3.75, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6f4d }), city.palms.length);
    const frondTex = canvasTexture(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = '#3f7d3a'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.beginPath(); g.moveTo(64, 64);
        g.quadraticCurveTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 30 - 12, 64 + Math.cos(a) * 58, 64 + Math.sin(a) * 52 + 14);
        g.stroke();
      }
    });
    frondTex.wrapS = frondTex.wrapT = THREE.ClampToEdgeWrapping;
    const frondGeo = new THREE.PlaneGeometry(8.6, 8.6);
    const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ map: frondTex, alphaTest: 0.35, side: THREE.DoubleSide }), city.palms.length * 2);
    city.palms.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.2, p.z);
      dummy.rotation.set(p.lean, i * 1.3, p.lean * 0.7);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y - 0.2 + 7.3 * p.s;
      dummy.rotation.set(-Math.PI / 2 + 0.5, 0, i * 1.3);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * 2, dummy.matrix);
      dummy.rotation.set(-Math.PI / 2 - 0.5, 0, i * 2.1);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * 2 + 1, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    scene.add(trunks); scene.add(fronds);

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
    poleGeo.translate(0, 2.8, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3c4148 }), city.lamps.length);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 6, 5), bulbMat, city.lamps.length);
    city.lamps.forEach((l, i) => {
      dummy.position.set(l.x, l.y - 0.1, l.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.y = l.y + 5.5;
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    scene.add(poles); scene.add(bulbs);
    var lampBulbs = bulbMat;
  }

  // day cycle — keyframes: phase 0.50 noon, 0.62 golden, 0.685 dusk, 0.78 night-lite
  const KEYS = [
    { p: 0.46, sky: 0x5fb2e8, hor: 0xd8ecf2, fog: 0xbcd8e2, sun: 0xfff2d8, sunI: 1.55, hemi: 0.9, elev: 0.9 },
    { p: 0.60, sky: 0x5f8fd0, hor: 0xffcf96, fog: 0xd8b490, sun: 0xffa860, sunI: 1.5, hemi: 0.75, elev: 0.34 },
    { p: 0.685, sky: 0x2c3e70, hor: 0xff9558, fog: 0x6b4a5e, sun: 0xff7a3c, sunI: 0.82, hemi: 0.52, elev: 0.05 },
    { p: 0.78, sky: 0x111a36, hor: 0x51386b, fog: 0x2c2438, sun: 0x8fa8ff, sunI: 0.22, hemi: 0.34, elev: -0.2 },
    { p: 0.92, sky: 0x3a6ea8, hor: 0xcfe0ea, fog: 0x9fc2d4, sun: 0xffe9c4, sunI: 1.1, hemi: 0.7, elev: 0.5 },
  ];
  const cA = new THREE.Color(), cB = new THREE.Color();
  function keyLerp(key, a, b, t, target) { target.copy(cA.setHex(a[key])).lerp(cB.setHex(b[key]), t); }
  let phase = 0.56, elapsed = 0;
  function setPhase(p) {
    phase = p;
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = clamp((p - a.p) / (b.p - a.p || 1), 0, 1);
    keyLerp('sky', a, b, t, skyUni.top.value);
    keyLerp('hor', a, b, t, skyUni.horizon.value);
    keyLerp('fog', a, b, t, scene.fog.color);
    keyLerp('sun', a, b, t, sun.color);
    sun.intensity = lerp(a.sunI, b.sunI, t);
    hemi.intensity = lerp(a.hemi, b.hemi, t);
    const elev = lerp(a.elev, b.elev, t), azim = lerp(0.7, 2.4, p);
    sun.position.set(Math.cos(azim) * 300, Math.max(elev, -0.1) * 320 + 20, Math.sin(azim) * 300);
    const dark = sstep(0.6, 0.685, p) * (1 - sstep(0.85, 0.95, p));
    waterMat.color.setHex(0x166b84).lerp(cA.setHex(0x0d3350), dark);
    return dark;
  }
  let dark = setPhase(phase);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera,
    get phase() { return phase; },
    get dark() { return dark; },
    setPhase(p) { dark = setPhase(p); },
    update(dt) {
      elapsed += dt;
      // drift from afternoon and settle into dusk, hovering there with a slow breathing wobble
      const target = 0.685 + Math.sin(elapsed * 0.013) * 0.012;
      if (Math.abs(phase - target) > 0.0005) dark = setPhase(phase + clamp(target - phase, -dt * 0.0016, dt * 0.0016));
      water.position.y = -0.75 + Math.sin(elapsed * 0.7) * 0.05;
      const glow = 0.45 + dark * 0.6;
      for (const s of neonSigns) {
        const flick = s.flicker && Math.sin(elapsed * 31 + s.phase) > 0.86 ? 0.25 : 1;
        s.sign.material.opacity = glow * flick;
        if (s.halo) s.halo.material.opacity = 0.44 * dark * flick * (0.9 + 0.1 * Math.sin(elapsed * 2 + s.phase));
      }
      if (stripMesh) stripMesh.material.color.setScalar(0.35 + dark * 0.75);
      if (lampBulbs) lampBulbs.color.setHex(0xffe9b0).multiplyScalar(0.35 + dark * 0.85);
      sky.position.copy(camera.position);
    },
  };
}
