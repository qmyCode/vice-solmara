// minimap.js — one job: navigation. The whole island chart is pre-rendered
// once to an offscreen canvas (coast, curved roads, district tints); the
// corner minimap shows a player-centred crop with GPS route, objective,
// police blips and the red search circle, and the M key opens the full
// chart with district names and a legend.

import { COAST, ISLE_COAST, ROADS, DISTRICTS } from './city.js';

const EXT = { x0: -490, z0: -490, x1: 650, z1: 490 }; // world extent on the chart
const W = EXT.x1 - EXT.x0, H = EXT.z1 - EXT.z0;

export class Minimap {
  constructor(miniCanvas, fullCanvas) {
    this.mini = miniCanvas.getContext('2d');
    this.full = fullCanvas.getContext('2d');
    this.fullCanvas = fullCanvas;
    this.chart = document.createElement('canvas');
    this.chart.width = W; this.chart.height = H;
    this.renderChart();
  }
  wx(x) { return x - EXT.x0; }
  wz(z) { return z - EXT.z0; }
  renderChart() {
    const g = this.chart.getContext('2d');
    g.fillStyle = '#17384e'; g.fillRect(0, 0, W, H); // sea
    const land = (coast, fill) => {
      g.beginPath();
      coast.forEach((p, i) => i ? g.lineTo(this.wx(p.x), this.wz(p.z)) : g.moveTo(this.wx(p.x), this.wz(p.z)));
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    land(COAST, '#4c6444');
    land(ISLE_COAST, '#4c6444');
    for (const d of DISTRICTS) { // district tint
      g.beginPath(); g.arc(this.wx(d.x), this.wz(d.z), d.r, 0, 7);
      g.fillStyle = 'rgba(255,170,90,0.07)'; g.fill();
    }
    g.lineCap = 'round';
    for (const road of ROADS) {
      g.beginPath();
      road.pts.forEach((p, i) => i ? g.lineTo(this.wx(p.x), this.wz(p.z)) : g.moveTo(this.wx(p.x), this.wz(p.z)));
      if (road.name.startsWith('Bulevar') || road.name.startsWith('Anillo')) g.closePath();
      g.strokeStyle = '#cbb98a'; g.lineWidth = road.width * 0.55; g.stroke();
      g.strokeStyle = '#3a3644'; g.lineWidth = road.width * 0.42; g.stroke();
    }
  }
  drawBlips(g, sx, sz, state, scale) {
    const px = (x) => sx + (this.wx(x) - this.wx(state.px)) * scale;
    const pz = (z) => sz + (this.wz(z) - this.wz(state.pz)) * scale;
    if (state.searchZone) {
      g.beginPath(); g.arc(px(state.searchZone.x), pz(state.searchZone.z), state.searchZone.r * scale, 0, 7);
      g.fillStyle = 'rgba(255,45,45,0.20)'; g.fill();
      g.strokeStyle = 'rgba(255,60,60,0.85)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
    }
    if (state.route && state.route.length > 1) {
      g.beginPath();
      state.route.forEach((p, i) => i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z)));
      g.strokeStyle = '#ffcf3f'; g.lineWidth = 3; g.stroke();
    }
    if (state.objective) {
      g.beginPath(); g.arc(px(state.objective.x), pz(state.objective.z), 6, 0, 7);
      g.fillStyle = '#ffe14d'; g.fill(); g.strokeStyle = '#7a5b00'; g.lineWidth = 2; g.stroke();
    }
    for (const c of state.cops || []) {
      g.beginPath(); g.arc(px(c.x), pz(c.z), 4, 0, 7);
      g.fillStyle = '#3f7dff'; g.fill(); g.strokeStyle = '#dbe8ff'; g.lineWidth = 1.4; g.stroke();
    }
    for (const c of state.cars || []) {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(px(c.x) - 1.6, pz(c.z) - 1.6, 3.2, 3.2);
    }
    // Player arrow.
    g.save();
    g.translate(px(state.px), pz(state.pz));
    g.rotate(-state.pangle);
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5.4, 6); g.lineTo(0, 3); g.lineTo(-5.4, 6); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#20304a'; g.lineWidth = 1.6; g.stroke();
    g.restore();
  }
  drawMini(state) {
    const g = this.mini, S = 344, RANGE = 200;
    const scale = S / (RANGE * 2);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.clip();
    g.fillStyle = '#17384e'; g.fillRect(0, 0, S, S);
    const srcX = this.wx(state.px) - RANGE, srcY = this.wz(state.pz) - RANGE;
    g.drawImage(this.chart, srcX, srcY, RANGE * 2, RANGE * 2, 0, 0, S, S);
    this.drawBlips(g, S / 2, S / 2, state, scale);
    g.fillStyle = '#ffe6bd'; g.font = '700 17px Arial'; g.textAlign = 'center';
    g.fillText('N', S / 2, 22);
    g.restore();
  }
  drawFull(state) {
    const g = this.full, S = this.fullCanvas.width;
    const scale = S / W;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.chart, 0, 0, S, S * (H / W));
    const st = { ...state, px: state.px, pz: state.pz };
    // Re-centre blips on the full chart: draw with origin transform.
    g.save();
    g.translate(0, 0);
    const px = (x) => this.wx(x) * scale, pz = (z) => this.wz(z) * scale;
    if (state.route) {
      g.beginPath();
      state.route.forEach((p, i) => i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z)));
      g.strokeStyle = '#ffcf3f'; g.lineWidth = 3; g.stroke();
    }
    if (state.objective) { g.beginPath(); g.arc(px(state.objective.x), pz(state.objective.z), 7, 0, 7); g.fillStyle = '#ffe14d'; g.fill(); }
    for (const d of DISTRICTS) {
      g.fillStyle = 'rgba(255,240,210,0.92)'; g.font = '700 13px Arial'; g.textAlign = 'center';
      g.fillText(d.name, px(d.x), pz(d.z));
    }
    g.beginPath(); g.arc(px(st.px), pz(st.pz), 6, 0, 7); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#20304a'; g.stroke();
    g.restore();
  }
}
