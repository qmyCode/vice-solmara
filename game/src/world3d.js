// world3d.js — one job: turn city.js data into the visible Three.js world. A gradient sky dome
// with a sun glow, heightfield terrain painted sand/grass/concrete, an animated sea, asphalt
// ribbons with dashed centre lines following every curve, 200+ instanced buildings whose windows
// light up as dusk falls, instanced palms and street lamps with additive halos, and neon signs
// (original Vice Solmara names) that bloom over the boulevard. The day phase drives everything:
// golden hour saturates the sky orange-pink, then the city switches its lights on.

import * as THREE from 'three';
import { clamp, lerp } from './rng.js';

/** A soft radial glow sprite texture, shared by lamp halos, headlights and sign bloom. */
export function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Merge simple BufferGeometries (positions/normals/uvs) into one, for the palm fronds. */
function mergeGeoms(geoms) {
  let vtx = 0, idx = 0;
  const parts = geoms.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    vtx += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(vtx * 3), nor = new Float32Array(vtx * 3), uv = new Float32Array(vtx * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

const SKY_KEYS = [
  // phase, top, horizon, sun tint, sun strength, hemi strength, fog reach
  [0.0, 0x2e4a7d, 0xf2c99a, 0xffe9c4, 0.9, 0.75],
  [0.3, 0x3a7bd5, 0xbfe3ef, 0xfff3d6, 1.15, 0.9],
  [0.52, 0x4a5aa8, 0xffb347, 0xffd9a0, 1.25, 1.0],
  [0.6, 0x6a4a9e, 0xffa14f, 0xffb066, 1.45, 1.3],
  [0.68, 0x5a3d8a, 0xff9448, 0xff9a5a, 1.25, 1.08],
  [0.78, 0x38236e, 0xf065a7, 0xff6a8a, 0.58, 0.68],
  [0.88, 0x0b1030, 0x27335e, 0x7a86ff, 0.16, 0.34],
  [1.0, 0x2e4a7d, 0xf2c99a, 0xffe9c4, 0.9, 0.75],
];
function skyAt(phase) {
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 1; i < SKY_KEYS.length; i++) {
    if (phase <= SKY_KEYS[i][0]) { a = SKY_KEYS[i - 1]; b = SKY_KEYS[i]; break; }
  }
  const t = (phase - a[0]) / Math.max(0.0001, b[0] - a[0]);
  const mix = (ca, cb) => new THREE.Color(ca).lerp(new THREE.Color(cb), t);
  return {
    top: mix(a[1], b[1]), horizon: mix(a[2], b[2]), sun: mix(a[3], b[3]),
    sunI: lerp(a[4], b[4], t), hemiI: lerp(a[5], b[5], t),
  };
}

export function createWorld(scene, city) {
  const glowTex = makeGlowTexture();

  // ---- sky dome + lights + fog ----
  const skyUni = {
    topColor: { value: new THREE.Color(0x4a5aa8) },
    horizonColor: { value: new THREE.Color(0xffb347) },
    sunDir: { value: new THREE.Vector3(0, 0.3, -1) },
    sunColor: { value: new THREE.Color(0xffd9a0) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 24, 14),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyUni,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunDir; uniform vec3 sunColor;',
        'varying vec3 vDir;',
        'void main(){',
        '  float h = clamp(vDir.y, -0.08, 1.0);',
        '  vec3 col = mix(horizonColor, topColor, pow(max(h, 0.0), 0.55));',
        '  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
        '  col += sunColor * (pow(s, 220.0) * 1.6 + pow(s, 10.0) * 0.58);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    }),
  );
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.0);
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xffd9c0, 0x7a5a48, 0.8);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xffb347, 380, 2100);

  // ---- sea ----
  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = seaCanvas.height = 128;
  {
    const g = seaCanvas.getContext('2d');
    g.fillStyle = '#1d6f8e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${140 + Math.random() * 80},${200 + Math.random() * 40},230,${Math.random() * 0.16})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 1.4);
    }
  }
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(90, 90);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(5200, 5200),
    new THREE.MeshPhongMaterial({ map: seaTex, color: 0x9fd4e8, shininess: 160, specular: 0xffc9a0 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(100, -0.75, 0);
  scene.add(sea);

  // ---- terrain ----
  {
    const W = 1500, D = 1250, SX = 150, SZ = 125;
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xdcbd85), deep = new THREE.Color(0x8a7a56);
    const grass = new THREE.Color(0x5da24e), urban = new THREE.Color(0x8f8d88);
    const coastPts = [];
    for (let i = 0; i < city.coast.length; i += 5) coastPts.push(city.coast[i]);
    for (let i = 0; i < city.isleCoast.length; i += 5) coastPts.push(city.isleCoast[i]);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 100, z = pos.getZ(i);
      const h = city.heightAt(x, z);
      pos.setY(i, h);
      pos.setX(i, x);
      let dCoast = Infinity;
      for (const p of coastPts) { const d = Math.hypot(p.x - x, p.z - z); if (d < dCoast) dCoast = d; }
      if (h < -0.4) tmp.copy(deep);
      else if (dCoast < 12) tmp.copy(sand);
      else {
        const u = clamp(1.15 - dCoast / 230, 0, 1);
        tmp.copy(grass).lerp(urban, u * 0.75);
        if (h > 9) tmp.lerp(new THREE.Color(0xa8a284), 0.5);
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(terrain);
  }

  // ---- roads: asphalt ribbons + dashed centre lines along every curve ----
  {
    const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x4c424c });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
    const asphaltPos = [], dashPos = [], asphaltIdx = [], dashIdx = [];
    let vo = 0;
    const pushRibbon = (pts, width, y0, arr, idx, closed) => {
      const n = pts.length;
      const start = arr.length / 3;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % n], r = pts[(i - 1 + n) % n];
        const ref = closed || i < n - 1 ? q : p, refB = closed || i > 0 ? r : p;
        let dx = ref.x - refB.x, dz = ref.z - refB.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
        const px = -dz, pz = dx;
        arr.push(p.x + px * width / 2, city.heightAt(p.x + px * width / 2, p.z + pz * width / 2) + y0, p.z + pz * width / 2);
        arr.push(p.x - px * width / 2, city.heightAt(p.x - px * width / 2, p.z - pz * width / 2) + y0, p.z - pz * width / 2);
      }
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = start + i * 2, b = start + ((i + 1) % n) * 2;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      return start;
    };
    for (const road of city.roads) {
      // densify for smooth hill following
      const dense = [];
      for (let i = 0; i < road.pts.length; i++) {
        const p = road.pts[i], q = road.pts[(i + 1) % road.pts.length];
        dense.push(p);
        if (road.closed || i < road.pts.length - 1) dense.push({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
      }
      pushRibbon(dense, road.width, 0.09, asphaltPos, asphaltIdx, road.closed);
      // dashes on every other segment
      const dashPts = [];
      for (let i = 0; i < dense.length; i += 2) {
        const p = dense[i], q = dense[(i + 1) % dense.length];
        if (!road.closed && i >= dense.length - 1) break;
        dashPts.push({ x: p.x + (q.x - p.x) * 0.18, z: p.z + (q.z - p.z) * 0.18 });
        dashPts.push({ x: p.x + (q.x - p.x) * 0.62, z: p.z + (q.z - p.z) * 0.62 });
      }
      for (let i = 0; i + 1 < dashPts.length; i += 2) {
        pushRibbon([dashPts[i], dashPts[i + 1]], 0.42, 0.13, dashPos, dashIdx, false);
      }
    }
    const mk = (arr, idx, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      scene.add(mesh);
      return mesh;
    };
    mk(asphaltPos, asphaltIdx, asphaltMat);
    mk(dashPos, dashIdx, dashMat);
  }

  // ---- buildings: one instanced box, a painted facade, windows that light at dusk ----
  let facadeEmissiveMat;
  {
    const fw = 128, fh = 256;
    const face = document.createElement('canvas');
    face.width = fw; face.height = fh;
    const emiss = document.createElement('canvas');
    emiss.width = fw; emiss.height = fh;
    const gf = face.getContext('2d'), ge = emiss.getContext('2d');
    gf.fillStyle = '#c9ced6';
    gf.fillRect(0, 0, fw, fh);
    ge.fillStyle = '#000000';
    ge.fillRect(0, 0, fw, fh);
    let rs = 1234567;
    const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    for (let row = 0; row < 14; row++) for (let col = 0; col < 6; col++) {
      const x = 8 + col * 20, y = 10 + row * 17, w = 12, h = 10;
      const lit = rnd();
      gf.fillStyle = lit > 0.45 ? '#3a4152' : '#232833';
      gf.fillRect(x, y, w, h);
      if (lit > 0.45) {
        ge.fillStyle = rnd() > 0.82 ? '#9adcff' : '#ffc37a';
        ge.fillRect(x, y, w, h);
      }
    }
    const faceTex = new THREE.CanvasTexture(face);
    const emissTex = new THREE.CanvasTexture(emiss);
    facadeEmissiveMat = new THREE.MeshLambertMaterial({
      map: faceTex, emissiveMap: emissTex, emissive: 0xffc37a, emissiveIntensity: 0.0,
    });
    facadeEmissiveMat.color.setRGB(1.32, 1.2, 1.08); // warm lift: canyon walls never sit near-black
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(geo, facadeEmissiveMat, city.buildings.length);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    city.buildings.forEach((b, i) => {
      qt.setFromAxisAngle(up, b.rot);
      m4.compose(
        new THREE.Vector3(b.x, city.heightAt(b.x, b.z) - 0.4, b.z),
        qt,
        new THREE.Vector3(b.w, b.h + 0.4, b.d),
      );
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHex(b.color));
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  // ---- palms: bent trunks and drooping fronds, instanced ----
  {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.3, 5.8, 5, 4);
    trunkGeo.translate(0, 2.9, 0);
    {
      const p = trunkGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) + Math.pow(Math.max(0, y) / 5.8, 2) * 1.15);
      }
      trunkGeo.computeVertexNormals();
    }
    const frondParts = [];
    for (let k = 0; k < 7; k++) {
      const fg = new THREE.PlaneGeometry(3.9, 0.72, 4, 1);
      const p = fg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setY(i, p.getY(i) - Math.pow((x + 1.95) / 3.9, 2) * 1.25);
      }
      fg.translate(1.95, 0, 0);
      const m = new THREE.Matrix4()
        .makeRotationY((k / 7) * Math.PI * 2)
        .multiply(new THREE.Matrix4().makeTranslation(1.05, 5.75, 0));
      fg.applyMatrix4(m);
      frondParts.push(fg);
    }
    const frondGeo = mergeGeoms(frondParts);
    const trunkInst = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), city.palms.length);
    const frondInst = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: 0x2e7d32, side: THREE.DoubleSide }), city.palms.length);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    city.palms.forEach((palm, i) => {
      qt.setFromAxisAngle(up, palm.rot);
      m4.compose(
        new THREE.Vector3(palm.x, city.heightAt(palm.x, palm.z) - 0.1, palm.z),
        qt,
        new THREE.Vector3(palm.s, palm.s, palm.s),
      );
      trunkInst.setMatrixAt(i, m4);
      frondInst.setMatrixAt(i, m4);
    });
    scene.add(trunkInst);
    scene.add(frondInst);
  }

  // ---- street lamps: instanced poles, one Points cloud of halos ----
  let lampHaloMat;
  {
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.6, 5);
    poleGeo.translate(0, 2.8, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2c2f36 }), city.lamps.length);
    const m4 = new THREE.Matrix4();
    const haloPos = new Float32Array(city.lamps.length * 3);
    city.lamps.forEach((lamp, i) => {
      const y = city.heightAt(lamp.x, lamp.z);
      m4.makeTranslation(lamp.x, y, lamp.z);
      poles.setMatrixAt(i, m4);
      haloPos[i * 3] = lamp.x; haloPos[i * 3 + 1] = y + 5.65; haloPos[i * 3 + 2] = lamp.z;
    });
    scene.add(poles);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    lampHaloMat = new THREE.PointsMaterial({
      size: 6.5, map: glowTex, color: 0xffb36b, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    scene.add(new THREE.Points(hg, lampHaloMat));
  }

  // ---- neon signs: glowing canvas lettering on boulevard facades ----
  const signMats = [];
  for (const sign of city.signs) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 112);
    g.font = '900 62px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = sign.color;
    g.shadowBlur = 26;
    g.fillStyle = sign.color;
    g.fillText(sign.text, 256, 58);
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.85;
    g.fillText(sign.text, 256, 58);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.25, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sign.w, sign.h), mat);
    mesh.position.set(sign.x, city.heightAt(sign.x, sign.z) + sign.y, sign.z);
    mesh.rotation.y = sign.rotY;
    scene.add(mesh);
    signMats.push(mat);
  }

  // ---- the day phase drives sky, light, fog and every glow ----
  let phase = 0.6;
  function applyPhase(p, tNow) {
    phase = p;
    const skyCol = skyAt(p);
    skyUni.topColor.value.copy(skyCol.top);
    skyUni.horizonColor.value.copy(skyCol.horizon);
    skyUni.sunColor.value.copy(skyCol.sun);
    const dayFrac = clamp((p - 0.42) / 0.52, 0, 1);
    const elev = Math.sin(dayFrac * Math.PI) * 0.5 + 0.045;
    const azim = lerp(0.2 * Math.PI, 1.04 * Math.PI, dayFrac);
    const sd = new THREE.Vector3(Math.cos(azim) * Math.cos(elev), Math.sin(elev), Math.sin(azim) * Math.cos(elev));
    skyUni.sunDir.value.copy(sd);
    sun.position.copy(sd).multiplyScalar(1200);
    sun.color.copy(skyCol.sun);
    sun.intensity = skyCol.sunI;
    hemi.intensity = skyCol.hemiI;
    scene.fog.color.copy(skyCol.horizon);
    const dusk = clamp((p - 0.54) / 0.24, 0, 1); // 0 at golden hour, 1 at night
    facadeEmissiveMat.emissiveIntensity = dusk * 1.25;
    lampHaloMat.opacity = 0.22 + dusk * 0.68;
    signMats.forEach((m, i) => { m.opacity = 0.45 + dusk * (0.5 + 0.1 * Math.sin(tNow * 2.2 + i * 1.7)); });
    sea.material.color.copy(new THREE.Color(0x9fd4e8).lerp(new THREE.Color(0x35507a), dusk * 0.8));
    return dusk;
  }

  return {
    glowTex,
    applyPhase,
    get phase() { return phase; },
    update(dt, tNow) {
      seaTex.offset.x = (seaTex.offset.x + dt * 0.004) % 1;
      seaTex.offset.y = (seaTex.offset.y + dt * 0.0016) % 1;
    },
  };
}
