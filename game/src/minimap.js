// minimap.js — one job: the map in the corner and the map on the screen. The island chart is
// painted once from city.js data (water, land, every curved road) onto an offscreen canvas;
// the corner minimap then re-draws a window of that chart around Rico each frame with the GPS
// route, police blips and the objective, and the full-map overlay adds district names, place
// markers and a legend.

import { dist2d } from './rng.js';

const EXT = { x0: -500, z0: -500, x1: 740, z1: 540 }; // world extent the chart covers

export function createMinimap(G) {
  const { city } = G;
  const CW = 620, CH = 520;
  const chart = document.createElement('canvas');
  chart.width = CW;
  chart.height = CH;
  const w2cx = (x) => ((x - EXT.x0) / (EXT.x1 - EXT.x0)) * CW;
  const w2cy = (z) => ((z - EXT.z0) / (EXT.z1 - EXT.z0)) * CH;
  {
    const g = chart.getContext('2d');
    g.fillStyle = '#175d7d';
    g.fillRect(0, 0, CW, CH);
    const landPath = (pts) => {
      g.beginPath();
      pts.forEach((p, i) => { if (i === 0) g.moveTo(w2cx(p.x), w2cy(p.z)); else g.lineTo(w2cx(p.x), w2cy(p.z)); });
      g.closePath();
    };
    g.fillStyle = '#7d8f66';
    landPath(city.coast);
    g.fill();
    landPath(city.isleCoast);
    g.fill();
    g.strokeStyle = '#e8dfc8';
    g.lineWidth = 1.4;
    landPath(city.coast);
    g.stroke();
    landPath(city.isleCoast);
    g.stroke();
    // roads as pale ribbons
    for (const road of city.roads) {
      g.beginPath();
      road.pts.forEach((p, i) => { if (i === 0) g.moveTo(w2cx(p.x), w2cy(p.z)); else g.lineTo(w2cx(p.x), w2cy(p.z)); });
      if (road.closed) g.closePath();
      g.strokeStyle = '#d9d4c5';
      g.lineWidth = Math.max(1.6, road.width * (CW / (EXT.x1 - EXT.x0)) * 0.9);
      g.lineJoin = 'round';
      g.stroke();
    }
  }

  function blip(g, x, y, color, r = 4) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1;
    g.stroke();
  }

  /** The corner minimap: a 170-unit window, north up, Rico's arrow at the centre. */
  function drawMini(canvas, G2) {
    const g = canvas.getContext('2d');
    const S = canvas.width;
    const p = G2.player.state;
    const view = 175; // world units across
    const scale = S / view;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.clip();
    // chart window: chart pixels per world unit
    const cwPerUnit = CW / (EXT.x1 - EXT.x0);
    const srcSize = view * cwPerUnit;
    const sx = w2cx(p.x) - srcSize / 2, sy = w2cy(p.z) - srcSize / 2;
    g.drawImage(chart, sx, sy, srcSize, srcSize, 0, 0, S, S);
    const toMini = (x, z) => ({ x: S / 2 + (x - p.x) * scale, y: S / 2 + (z - p.z) * scale });
    // SEARCH ZONE: at 3+ stars the SMPD cordon shows as a red ring at sight radius around Rico
    if (G2.police && G2.police.stars >= 3) {
      const r = 55 * scale;
      g.beginPath();
      g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,45,45,0.10)';
      g.fill();
      g.setLineDash([7, 5]);
      g.lineDashOffset = -Date.now() / 90;
      g.strokeStyle = 'rgba(255,64,64,0.9)';
      g.lineWidth = 2;
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,90,90,0.95)';
      g.font = '900 8.5px Arial';
      g.textAlign = 'center';
      g.fillText('ZONA DE BÚSQUEDA', S / 2, S / 2 - r + 11);
    }
    // GPS route
    if (G2.routeWaypoints && G2.routeWaypoints.length > 1) {
      g.beginPath();
      G2.routeWaypoints.forEach((wp, i) => {
        const m = toMini(wp.x, wp.z);
        if (i === 0) g.moveTo(m.x, m.y); else g.lineTo(m.x, m.y);
      });
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.stroke();
    }
    // blips
    if (G2.objectivePos) {
      const m = toMini(G2.objectivePos.x, G2.objectivePos.z);
      blip(g, m.x, m.y, '#ffd23e', 5);
    }
    for (const cop of G2.police.state.cops) {
      const m = toMini(cop.car.x, cop.car.z);
      blip(g, m.x, m.y, '#3a86ff', 3.6);
    }
    if (G2.missions && G2.missions.S.guards) {
      for (const gd of G2.missions.S.guards) {
        if (!gd.alive) continue;
        const m = toMini(gd.x, gd.z);
        blip(g, m.x, m.y, '#ff3b30', 3.4);
      }
    }
    if (G2.missions && G2.missions.S.target) {
      const m = toMini(G2.missions.S.target.x, G2.missions.S.target.z);
      blip(g, m.x, m.y, '#ff8a3e', 4.4);
    }
    // Rico's arrow
    g.translate(S / 2, S / 2);
    g.rotate(-p.heading + Math.PI);
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.5, 6);
    g.lineTo(0, 2.6);
    g.lineTo(-5.5, 6);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.stroke();
    g.restore();
    // rim + north
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(10,12,20,0.85)';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#fff';
    g.font = '900 11px Arial';
    g.textAlign = 'center';
    g.fillText('N', S / 2, 15);
  }

  /** The full map: whole island, districts, places, legend, route and Rico. */
  function drawFull(canvas, G2) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    g.fillStyle = '#0d1520';
    g.fillRect(0, 0, W, H);
    const pad = 26;
    const scale = Math.min((W - pad * 2) / CW, (H - pad * 2) / CH);
    const ox = (W - CW * scale) / 2, oy = (H - CH * scale) / 2;
    g.drawImage(chart, ox, oy, CW * scale, CH * scale);
    const toMap = (x, z) => ({ x: ox + w2cx(x) * scale, y: oy + w2cy(z) * scale });
    if (G2.routeWaypoints && G2.routeWaypoints.length > 1) {
      g.beginPath();
      G2.routeWaypoints.forEach((wp, i) => {
        const m = toMap(wp.x, wp.z);
        if (i === 0) g.moveTo(m.x, m.y); else g.lineTo(m.x, m.y);
      });
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 3.4;
      g.lineJoin = 'round';
      g.stroke();
    }
    g.font = '700 12px Arial';
    g.textAlign = 'center';
    for (const d of city.districts) {
      const m = toMap(d.x, d.z);
      g.fillStyle = 'rgba(8,10,16,0.55)';
      const wText = g.measureText(d.name.toUpperCase()).width + 10;
      g.fillRect(m.x - wText / 2, m.y - 9, wText, 16);
      g.fillStyle = '#f5efe0';
      g.fillText(d.name.toUpperCase(), m.x, m.y + 3);
    }
    for (const key of Object.keys(city.places)) {
      const pl = city.places[key];
      const m = toMap(pl.x, pl.z);
      blip(g, m.x, m.y, '#ffb347', 3.4);
    }
    const p = G2.player.state;
    const pm = toMap(p.x, p.z);
    blip(g, pm.x, pm.y, '#ffffff', 5.5);
    if (G2.objectivePos) {
      const m = toMap(G2.objectivePos.x, G2.objectivePos.z);
      blip(g, m.x, m.y, '#ffd23e', 6);
    }
    for (const cop of G2.police.state.cops) {
      const m = toMap(cop.car.x, cop.car.z);
      blip(g, m.x, m.y, '#3a86ff', 3.6);
    }
    // legend
    g.textAlign = 'left';
    g.font = '600 12.5px Arial';
    g.fillStyle = 'rgba(8,12,20,0.72)';
    g.fillRect(14, H - 118, 196, 104);
    const items = [
      ['#ffffff', 'Rico'], ['#ffd23e', 'Objetivo · ruta GPS'], ['#3a86ff', 'SMPD'],
      ['#ffb347', 'Lugares'], ['#ff3b30', 'Hostiles'],
    ];
    items.forEach(([color, label], i) => {
      blip(g, 30, H - 96 + i * 19, color, 4);
      g.fillStyle = '#e8e4d8';
      g.fillText(label, 42, H - 92 + i * 19);
    });
    g.fillStyle = '#f5efe0';
    g.font = '900 17px Arial';
    g.fillText('VICE SOLMARA — ISLA DEL PONIENTE', 16, 24);
    g.font = '600 12px Arial';
    g.fillStyle = '#b8c4d4';
    g.fillText('M / ESC para cerrar', W - 130, 24);
    void dist2d;
  }

  return { chart, drawMini, drawFull };
}
