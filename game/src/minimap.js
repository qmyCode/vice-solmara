// minimap.js — one job: navigation. A pre-rendered chart of the islands (coast, roads, isle)
// drawn once from city data; the corner minimap pans over it with the GPS route, cop blips and
// the objective marker; the full map screen adds district names and a legend.
import { dist2d } from './rng.js';

const WORLD = { x0: -580, z0: -580, x1: 780, z1: 580 };
const CHART_W = 1360, CHART_H = 1160;

export function createMinimap(G) {
  const city = G.city;
  const chart = document.createElement('canvas');
  chart.width = CHART_W; chart.height = CHART_H;
  const s = CHART_W / (WORLD.x1 - WORLD.x0);
  const cx = (x) => (x - WORLD.x0) * s;
  const cz = (z) => (z - WORLD.z0) * s;
  {
    const g = chart.getContext('2d');
    g.fillStyle = '#10405c';
    g.fillRect(0, 0, CHART_W, CHART_H);
    g.beginPath();
    city.coast.forEach((p, i) => (i ? g.lineTo(cx(p.x), cz(p.z)) : g.moveTo(cx(p.x), cz(p.z))));
    g.closePath();
    g.fillStyle = '#5d7d4c';
    g.fill();
    g.beginPath();
    g.arc(cx(city.isle.x), cz(city.isle.z), city.isle.r * s, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'round';
    for (const road of city.roads) {
      g.beginPath();
      road.pts.forEach((p, i) => (i ? g.lineTo(cx(p.x), cz(p.z)) : g.moveTo(cx(p.x), cz(p.z))));
      if (road.closed) g.closePath();
      g.strokeStyle = '#3c3f45';
      g.lineWidth = road.width * s;
      g.stroke();
      g.strokeStyle = '#cfc9ba';
      g.lineWidth = 1.1;
      g.stroke();
    }
    g.fillStyle = '#e8b23a';
    for (const key of ['garage', 'hotel', 'pier', 'mirador', 'showroom', 'safehouse', 'isleHouse', 'station']) {
      const p = city.places[key];
      g.beginPath(); g.arc(cx(p.x), cz(p.z), 4, 0, Math.PI * 2); g.fill();
    }
  }

  const mm = document.getElementById('minimap');
  const mg = mm.getContext('2d');
  const full = document.getElementById('mapcanvas');
  const fg = full.getContext('2d');
  let route = null, routeTargetKey = '', routeAge = 0, lastRoutePos = { x: 1e9, z: 0 };

  function currentRoute(dt) {
    routeAge += dt;
    const obj = G.missions ? G.missions.objective() : null;
    if (!obj) { route = null; routeTargetKey = ''; return null; }
    const key = Math.round(obj.x) + ',' + Math.round(obj.z);
    const pp = G.playerPos();
    if (key !== routeTargetKey || (routeAge > 1.6 && dist2d(pp.x, pp.z, lastRoutePos.x, lastRoutePos.z) > 26)) {
      route = city.route(pp.x, pp.z, obj.x, obj.z);
      routeTargetKey = key;
      routeAge = 0;
      lastRoutePos = { x: pp.x, z: pp.z };
    }
    return route;
  }
  function drawBlips(g, px, pz, scale) {
    // traffic — small amber dots, so the map reads as a living city, not an empty chart
    if (G.traffic) {
      g.fillStyle = 'rgba(255,190,90,0.85)';
      for (const c of G.traffic.cars) {
        if (c.exploded) continue;
        g.beginPath(); g.arc(px(c.mesh.position.x), pz(c.mesh.position.z), 2.1, 0, Math.PI * 2); g.fill();
      }
    }
    // cops
    if (G.police) {
      g.fillStyle = '#3f8cff';
      for (const c of G.police.state.cars) {
        if (c.exploded) continue;
        g.beginPath(); g.arc(px(c.mesh.position.x), pz(c.mesh.position.z), 3.8, 0, Math.PI * 2); g.fill();
      }
      if (G.police.heliActive && G.police.state.heli) {
        const h = G.police.state.heli.mesh.position;
        g.fillStyle = '#9fd4ff';
        g.beginPath(); g.arc(px(h.x), pz(h.z), 4, 0, Math.PI * 2); g.fill();
      }
    }
    const obj = G.missions ? G.missions.objective() : null;
    if (obj) {
      g.strokeStyle = '#ffc93c';
      g.lineWidth = 2.4;
      g.beginPath(); g.arc(px(obj.x), pz(obj.z), 6 + Math.sin(performance.now() * 0.006) * 1.6, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffc93c';
      g.beginPath(); g.arc(px(obj.x), pz(obj.z), 2.4, 0, Math.PI * 2); g.fill();
    }
    void scale;
  }
  function drawRoute(g, px, pz) {
    if (!route || route.length < 2) return;
    g.strokeStyle = '#ffd94a';
    g.lineWidth = 3;
    g.beginPath();
    route.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))));
    g.stroke();
  }
  function playerArrow(g, x, y, ang, color = '#ffffff') {
    // the chart maps +x east and +z south (screen-down); a world heading (sin a, cos a)
    // is the up-pointing triangle rotated by PI - a in canvas space
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI - ang);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(4.6, 5.4); g.lineTo(0, 2.6); g.lineTo(-4.6, 5.4);
    g.closePath(); g.fill();
    g.restore();
  }

  function update(dt) {
    currentRoute(dt);
    const W = mm.width, H = mm.height;
    const pp = G.playerPos();
    const zoom = 1.05; // chart px per world unit on the minimap
    mg.clearRect(0, 0, W, H);
    mg.save();
    mg.beginPath();
    mg.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    mg.clip();
    mg.fillStyle = '#10405c';
    mg.fillRect(0, 0, W, H);
    const ox = W / 2 - cx(pp.x) * (zoom / s), oy = H / 2 - cz(pp.z) * (zoom / s);
    mg.drawImage(chart, ox, oy, CHART_W * (zoom / s), CHART_H * (zoom / s));
    const px = (x) => W / 2 + (x - pp.x) * zoom, pz = (z) => H / 2 + (z - pp.z) * zoom;
    drawRoute(mg, px, pz);
    drawBlips(mg, px, pz, zoom);
    playerArrow(mg, W / 2, H / 2, G.playerAngle());
    mg.restore();
    mg.strokeStyle = 'rgba(255,255,255,0.35)';
    mg.lineWidth = 2;
    mg.beginPath(); mg.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); mg.stroke();
    mg.fillStyle = 'rgba(255,255,255,0.75)';
    mg.font = 'bold 10px Arial';
    mg.fillText('N', W / 2 - 3, 13);
  }

  function drawFull() {
    const W = full.width, H = full.height;
    fg.fillStyle = '#0b2233';
    fg.fillRect(0, 0, W, H);
    const fit = Math.min(W / CHART_W, H / CHART_H);
    const ox = (W - CHART_W * fit) / 2, oy = (H - CHART_H * fit) / 2;
    fg.drawImage(chart, ox, oy, CHART_W * fit, CHART_H * fit);
    const px = (x) => ox + cx(x) * fit, pz = (z) => oy + cz(z) * fit;
    drawRoute(fg, px, pz);
    drawBlips(fg, px, pz, fit);
    fg.font = 'bold 15px Arial';
    fg.textAlign = 'center';
    for (const d of city.districts) {
      fg.fillStyle = 'rgba(6,16,24,0.55)';
      const w = fg.measureText(d.name.toUpperCase()).width + 12;
      fg.fillRect(px(d.x) - w / 2, pz(d.z) - 11, w, 20);
      fg.fillStyle = '#ffe9b0';
      fg.fillText(d.name.toUpperCase(), px(d.x), pz(d.z) + 4);
    }
    fg.textAlign = 'left';
    fg.font = '12px Arial';
    fg.fillStyle = '#ffd94a';
    for (const key of Object.keys(city.places)) {
      const p = city.places[key];
      fg.fillText('◆ ' + p.name, px(p.x) + 8, pz(p.z) + 4);
    }
    const pp = G.playerPos();
    playerArrow(fg, px(pp.x), pz(pp.z), G.playerAngle(), '#ffffff');
    fg.fillStyle = 'rgba(255,255,255,0.85)';
    fg.font = '13px Arial';
    fg.fillText('★ objective    ● police    ◆ place    M / Esc — close', 16, H - 14);
  }

  return { update, drawFull, get route() { return route; } };
}
