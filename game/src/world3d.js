// world3d.js — one job: turn city.js data into the Three.js scene. Terrain from the analytic
// height function with painted vertex colours, a water plane, road ribbons with a canvas asphalt
// texture, instanced buildings (two window-grid textures, low and high rise), canvas-texture neon
// signs with halo sprites, instanced palms and lamps, named place buildings, and a day cycle
// that drifts from afternoon and settles into neon dusk.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, sstep, createRng } from './rng.js';

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
// Facade variants (V3 art pass): each variant is a seeded pastel base with its own window
// rhythm, lit/unlit mix, sign-strip and awning colours — so neighbouring buildings read as
// different buildings in one cohesive sunset palette instead of one grey box repeated.
// The ground floor is drawn as a storefront band (glass, sign strip, striped awning),
// which is what street-level cameras actually see.
const FACADE_BASES = ['#f4dcc8', '#eecdbd', '#dde9e2', '#f7e7b8', '#d7e5f2', '#f0d3e2', '#f5e6cf', '#dcedd8'];
const FACADE_SIGNS = ['#ff4fd8', '#22d3ee', '#ffb02e', '#ff5d5d', '#7CFC9a', '#b78bff'];
function facadeTexture(floors, cols, variant = 0) {
  let s = (variant * 7919 + floors * 131 + cols * 17 + 11) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = FACADE_BASES[variant % FACADE_BASES.length]; g.fillRect(0, 0, w, h);
    // faint vertical weathering so the wall is not one flat fill
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(120,90,60,${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * w, 0, 2 + rnd() * 5, h); }
    const shopH = Math.max(26, h / (floors + 1)); // ground-floor storefront band
    const winH = h - shopH, fh = winH / floors, cw = w / cols;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.2, y = f * fh + fh * 0.22, ww = cw * 0.6, hh = fh * 0.52;
      g.fillStyle = 'rgba(90,70,50,0.35)'; g.fillRect(x - 1.5, y - 1.5, ww + 3, hh + 3); // frame
      const r = rnd();
      g.fillStyle = r < 0.34 ? '#ffd98a' : r < 0.5 ? '#bfe3ff' : r < 0.6 ? '#e9f3f8' : '#39424f';
      g.fillRect(x, y, ww, hh);
      if (rnd() < 0.3) { g.fillStyle = 'rgba(70,50,40,0.5)'; g.fillRect(x, y + hh + 2, ww, 2.5); } // balcony / sill shadow
    }
    // storefront: sign strip, striped awning, glass doors/windows below
    const sy = h - shopH;
    const sign = FACADE_SIGNS[variant % FACADE_SIGNS.length];
    g.fillStyle = '#2c2f38'; g.fillRect(0, sy, w, shopH);
    g.fillStyle = sign; g.fillRect(0, sy, w, shopH * 0.3);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    const label = ['BAR', 'CAFÉ', 'HOTEL', 'TIENDA', 'CINE', 'MARISCOS', 'DISCO', 'FARMA'][variant % 8];
    g.font = `bold ${Math.max(9, shopH * 0.21)}px Arial`; g.textAlign = 'center';
    g.fillText(label, w / 2, sy + shopH * 0.23);
    const awnY = sy + shopH * 0.34;
    for (let x = 0; x < w; x += 10) { g.fillStyle = (x / 10) % 2 ? '#f2ede2' : sign; g.fillRect(x, awnY, 10, shopH * 0.16); }
    g.fillStyle = '#9fd4e8';
    for (let x = 6; x < w - 14; x += 24) { g.fillStyle = rnd() < 0.6 ? '#a8d8ea' : '#ffd98a'; g.fillRect(x, awnY + shopH * 0.22, 17, shopH * 0.4); }
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, h - 4, w, 4);
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
    // four facade variants per band, buildings dealt round-robin — per-building variety
    for (let v = 0; v < 4; v++) {
      fill(low.filter((_, i) => i % 4 === v), facadeTexture(4, 5, v));
      fill(high.filter((_, i) => i % 4 === v), facadeTexture(11, 6, v + 3));
    }
    // V3 roofline pass: a parapet cap on EVERY building (slightly overhanging slab at the
    // roof edge), a rooftop plant box on most, and a slanted shop awning over the ground
    // floor of low-rise fronts — the three cheapest silhouettes that kill the plain-box read.
    {
      const all = city.buildings;
      const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), all.length);
      const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x8d8578 }), all.length);
      const awns = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), all.length);
      let rc = 0, ac = 0;
      all.forEach((b, i) => {
        dummy.rotation.set(0, b.rot, 0);
        dummy.position.set(b.x, b.y + b.h + 0.18, b.z);
        dummy.scale.set(b.w + 0.55, 0.5, b.d + 0.55);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
        caps.setColorAt(i, col.setHex(b.tint).multiplyScalar(0.82));
        if (i % 5 !== 4) {
          dummy.position.set(b.x + Math.sin(i * 7.3) * b.w * 0.18, b.y + b.h + 0.75, b.z + Math.cos(i * 5.1) * b.d * 0.18);
          dummy.scale.set(b.w * 0.3, 1.1, b.d * 0.3);
          dummy.updateMatrix();
          roofs.setMatrixAt(rc, dummy.matrix);
          rc++;
        }
        if (b.h <= 20 && i % 4 !== 3) {
          const fx = Math.sin(b.rot), fz = Math.cos(b.rot);
          dummy.position.set(b.x + fx * (b.d / 2 + 0.75), b.y + 2.9, b.z + fz * (b.d / 2 + 0.75));
          dummy.rotation.set(0, b.rot, 0);
          dummy.rotateX(-0.42);
          dummy.scale.set(b.w * 0.74, 0.12, 1.9);
          dummy.updateMatrix();
          awns.setMatrixAt(ac, dummy.matrix);
          awns.setColorAt(ac, col.set(NEON_COLORS[(i + 1) % NEON_COLORS.length]));
          ac++;
        }
      });
      caps.count = all.length; roofs.count = rc; awns.count = ac;
      caps.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true; awns.instanceMatrix.needsUpdate = true;
      scene.add(caps); scene.add(roofs); scene.add(awns);
    }
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

  // street props (V3 density pass): crates, planters and striped barriers on the
  // sidewalks of every road, plus beach umbrellas on the sand side of the coast road —
  // deterministic placement, so every street (and every screenshot street) reads lived-in.
  {
    const prng = createRng(city.seed ^ 0x9e3779);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const spots = [];
    for (const road of city.roads) {
      for (let i = 2; i < road.pts.length - 1; i += 3) {
        if (!prng.chance(0.42)) continue;
        const p = road.pts[i], q = road.pts[i + 1];
        const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
        const side = prng.chance(0.5) ? 1 : -1;
        const off = road.width / 2 + prng.range(1.7, 2.7);
        const x = p.x + (-dz / len) * side * off, z = p.z + (dx / len) * side * off;
        const y = city.height(x, z);
        if (y < 0.35) continue;
        spots.push({ x, z, y, ang: Math.atan2(dx, dz), kind: prng.int(0, 2) });
      }
    }
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length)); m.count = 0; scene.add(m); return m; };
    const crates = mk(new THREE.BoxGeometry(0.95, 0.95, 0.95), new THREE.MeshLambertMaterial({ color: 0xa87f4f }));
    const planters = mk(new THREE.BoxGeometry(1.7, 0.62, 0.8), new THREE.MeshLambertMaterial({ color: 0xb8b0a2 }));
    const planterTop = mk(new THREE.BoxGeometry(1.6, 0.3, 0.7), new THREE.MeshLambertMaterial({ color: 0x3f7d3a }));
    const barriers = mk(new THREE.BoxGeometry(1.9, 0.55, 0.28), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    for (const s of spots) {
      dummy.rotation.set(0, s.ang + (s.kind === 2 ? 0.5 : 0), 0);
      if (s.kind === 0) {
        dummy.position.set(s.x, s.y + 0.48, s.z); dummy.scale.setScalar(1); dummy.updateMatrix();
        crates.setMatrixAt(crates.count++, dummy.matrix);
        if (s.ang > 1) { dummy.position.y = s.y + 1.4; dummy.rotation.y += 0.5; dummy.updateMatrix(); crates.setMatrixAt(crates.count++, dummy.matrix); }
      } else if (s.kind === 1) {
        dummy.position.set(s.x, s.y + 0.31, s.z); dummy.scale.setScalar(1); dummy.updateMatrix();
        planters.setMatrixAt(planters.count++, dummy.matrix);
        dummy.position.y = s.y + 0.72; dummy.updateMatrix();
        planterTop.setMatrixAt(planterTop.count++, dummy.matrix);
      } else {
        dummy.position.set(s.x, s.y + 0.62, s.z); dummy.scale.setScalar(1); dummy.updateMatrix();
        barriers.setMatrixAt(barriers.count, dummy.matrix);
        barriers.setColorAt(barriers.count, col.setHex(0xff7a2e));
        barriers.count++;
      }
    }
    for (const m of [crates, planters, planterTop, barriers]) m.instanceMatrix.needsUpdate = true;
    // beach umbrellas where the coast road meets sand (outward side, low ground)
    const coastRoad = city.roads[0];
    const umbSpots = [];
    for (let i = 0; i < coastRoad.pts.length; i += 4) {
      const p = coastRoad.pts[i];
      const ol = Math.hypot(p.x, p.z) || 1;
      const x = p.x + (p.x / ol) * (coastRoad.width / 2 + 5.5), z = p.z + (p.z / ol) * (coastRoad.width / 2 + 5.5);
      const y = city.height(x, z);
      if (y > -0.2 && y < 1.1) umbSpots.push({ x, z, y });
    }
    if (umbSpots.length) {
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }), umbSpots.length);
      const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 0.75, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), umbSpots.length);
      umbSpots.forEach((s, i) => {
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        dummy.position.set(s.x, s.y + 1.2, s.z); dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        dummy.position.y = s.y + 2.45; dummy.updateMatrix();
        canopies.setMatrixAt(i, dummy.matrix);
        canopies.setColorAt(i, col.setHex([0xff5d5d, 0xffb02e, 0x22d3ee, 0xff4fd8][i % 4]));
      });
      poles.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true;
      scene.add(poles); scene.add(canopies);
    }
  }

  // sun glare + the SOLMARA blimp (V3 sky pass): a two-layer glow sprite that rides the
  // real sun direction, and a slow dirigible with a lit sign on a circuit over the bay
  // and the south shore — a real scene object, visible in live play and in the cover.
  const glowTex = canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.38)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  });
  glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffbe78, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sunGlow.scale.set(330, 330, 1);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3d0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sunCore.scale.set(120, 120, 1);
  scene.add(sunCore);
  const blimp = new THREE.Group();
  {
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3.4, 12, 6, 12), new THREE.MeshLambertMaterial({ color: 0xf2a9c4, emissive: 0x5a3040 }));
    hull.rotation.x = Math.PI / 2;
    blimp.add(hull);
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(3.0, 11, 6, 12), new THREE.MeshLambertMaterial({ color: 0xf7e3c8, emissive: 0x4a3a26 }));
    belly.rotation.x = Math.PI / 2; belly.position.y = -0.9; belly.scale.set(0.92, 0.92, 0.96);
    blimp.add(belly);
    const finMat = new THREE.MeshLambertMaterial({ color: 0xe86ba0 });
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 2.4), finMat); finV.position.set(0, 1.2, -8.6); blimp.add(finV);
    const finH = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 2.4), finMat); finH.position.set(0, 0, -8.6); blimp.add(finH);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.2), new THREE.MeshLambertMaterial({ color: 0x37414a }));
    cab.position.set(0, -3.4, 1.2); blimp.add(cab);
    const signTex = neonTexture('SOLMARA', '#ffd166');
    for (const sx of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 2.5), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      sign.position.set(sx * 3.45, 0.1, 0);
      sign.rotation.y = sx * Math.PI / 2;
      blimp.add(sign);
    }
    blimp.scale.setScalar(1.5);
    blimp.position.set(-380, 96, -300);
    scene.add(blimp);
  }

  // day cycle — keyframes: phase 0.50 noon, 0.62 golden, 0.685 dusk, 0.78 night-lite
  // azim per key (V3): through the golden band the sun tracks to the north-west, low —
  // the direction the shore boulevard's traffic (and the cover camera) faces into, so
  // the glare sits in the frame the way the top-5 sunset covers have it.
  const KEYS = [
    { p: 0.46, sky: 0x5fb2e8, hor: 0xd8ecf2, fog: 0xbcd8e2, sun: 0xfff2d8, sunI: 1.55, hemi: 0.9, elev: 0.9, azim: 0.9 },
    { p: 0.60, sky: 0x4a6fd8, hor: 0xffab5e, fog: 0xe0aa7e, sun: 0xff9a4e, sunI: 1.55, hemi: 0.78, elev: 0.34, azim: 3.5 },
    { p: 0.685, sky: 0x323e78, hor: 0xff8a4e, fog: 0x74506a, sun: 0xff7a3c, sunI: 0.85, hemi: 0.54, elev: 0.05, azim: 3.8 },
    { p: 0.78, sky: 0x111a36, hor: 0x51386b, fog: 0x2c2438, sun: 0x8fa8ff, sunI: 0.22, hemi: 0.34, elev: -0.2, azim: 4.3 },
    { p: 0.92, sky: 0x3a6ea8, hor: 0xcfe0ea, fog: 0x9fc2d4, sun: 0xffe9c4, sunI: 1.1, hemi: 0.7, elev: 0.5, azim: 5.6 },
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
    const elev = lerp(a.elev, b.elev, t), azim = lerp(a.azim, b.azim, t);
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
      // sun glare rides the real sun direction, strongest in the golden band the
      // screenshots use, gone once the sun is below the horizon
      const sd = sun.position.clone().normalize();
      const glare = clamp(1 - Math.abs(phase - 0.63) / 0.16, 0, 1) * clamp(sd.y * 3.2, 0, 1);
      sunGlow.position.copy(camera.position).addScaledVector(sd, 1750);
      sunCore.position.copy(sunGlow.position);
      sunGlow.material.opacity = 0.55 * glare;
      sunCore.material.opacity = 0.95 * glare;
      sunGlow.visible = sunCore.visible = glare > 0.02;
      // the blimp drifts its slow circuit over the bay and the south shore
      const ba = 3.92 + elapsed * 0.011;
      const bx = Math.cos(ba) * 430, bz = -170 + Math.sin(ba) * 250;
      blimp.position.set(bx, 94 + Math.sin(elapsed * 0.11) * 3, bz);
      blimp.lookAt(bx - Math.sin(ba) * 60, blimp.position.y, bz + Math.cos(ba) * 60 * (250 / 430));
    },
  };
}
