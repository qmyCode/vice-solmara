// hud.js — one job: everything the player reads. Mission panel, cash and
// stars, the SMPD dispatch feed, vitals, speedo, weapon slots, radio card,
// dialogue boxes with painted portraits, toasts, chapter cards, the title
// poster treatment and the busted / wasted screens. Pure DOM + canvas.

import { respectRank } from './save.js';

const $ = (id) => document.getElementById(id);

export function drawPortrait(canvas, who) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const bg = g.createLinearGradient(0, 0, 0, H);
  if (who === 'marina') {
    bg.addColorStop(0, '#3a1c5e'); bg.addColorStop(1, '#7a2450');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8a4a2e'; g.fillRect(28, 8, 72, 66); // hair mass
    g.fillStyle = '#e8b08a'; g.beginPath(); g.ellipse(64, 52, 24, 28, 0, 0, 7); g.fill(); // face
    g.fillStyle = '#8a4a2e'; g.fillRect(40, 14, 48, 16); // fringe
    g.fillStyle = '#1c1428'; g.fillRect(52, 48, 6, 4); g.fillRect(71, 48, 6, 4); // eyes
    g.fillStyle = '#c2436e'; g.fillRect(57, 66, 14, 4); // lips
    g.fillStyle = '#123f36'; g.fillRect(34, 84, 60, 44); // jacket
    g.fillStyle = '#ffcf3f'; g.fillRect(60, 84, 8, 20); // gold chain
  } else if (who === 'rico') {
    bg.addColorStop(0, '#173a5e'); bg.addColorStop(1, '#7a3a1c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c98a5a'; g.beginPath(); g.ellipse(64, 54, 23, 27, 0, 0, 7); g.fill();
    g.fillStyle = '#14100c'; g.fillRect(41, 16, 46, 15);
    g.fillStyle = '#1c1428'; g.fillRect(52, 50, 6, 4); g.fillRect(71, 50, 6, 4);
    g.fillStyle = '#7a4a34'; g.fillRect(57, 68, 13, 4);
    g.fillStyle = '#e8542e'; g.fillRect(32, 86, 64, 42); // his shirt
  } else { // radio caller / generic
    bg.addColorStop(0, '#203040'); bg.addColorStop(1, '#402030');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9a878'; g.beginPath(); g.ellipse(64, 54, 23, 27, 0, 0, 7); g.fill();
    g.fillStyle = '#30303a'; g.fillRect(40, 15, 48, 14);
    g.fillStyle = '#1c1428'; g.fillRect(52, 50, 6, 4); g.fillRect(71, 50, 6, 4);
    g.fillStyle = '#5e3a2e'; g.fillRect(57, 68, 13, 4);
    g.fillStyle = '#3f6a8a'; g.fillRect(32, 86, 64, 42);
  }
}

export class HUD {
  constructor() {
    this.toastT = 0;
    this.el = {
      hud: $('hud'), mission: $('mission-panel'), ch: $('mp-ch'), mname: $('mp-name'), dist: $('mp-dist'),
      obj: $('mp-obj'), sub: $('mp-sub'), bar: $('mp-bar'), clock: $('clock'), cash: $('cash'),
      stars: $('stars'), heat: $('heat-note'), dispatch: $('dispatch-panel'), dpCount: $('dp-count'), dpUnits: $('dp-units'),
      district: $('district-name'), health: $('health-fill'), respect: $('respect-fill'), rank: $('respect-rank'),
      radioFreq: $('radio-freq'), radioTrack: $('radio-track'), speedo: $('speedo'), speed: $('speed'),
      speedoCar: $('speedo-car'), speedoHp: $('speedo-hp'), dialogue: $('dialogue'), dlgName: $('dlg-name'),
      dlgText: $('dlg-text'), portrait: $('dlg-portrait'), toast: $('toast'), crosshair: $('crosshair'),
      interact: $('interact'), title: $('title-screen'), chapter: $('chapter-card'), ccCh: $('cc-ch'), ccName: $('cc-name'),
      end: $('end-screen'), endBig: $('end-big'), endSub: $('end-sub'), weapons: [...document.querySelectorAll('.wslot')],
    };
    this.chapterT = 0;
  }
  showGame() { this.el.hud.classList.remove('hidden'); this.el.title.classList.add('hidden'); }
  showTitle() { this.el.title.classList.remove('hidden'); }
  setMission(ch, name, obj, sub, distM, frac) {
    this.el.ch.textContent = 'CH ' + ch;
    this.el.mname.textContent = name;
    this.el.obj.textContent = obj;
    this.el.sub.textContent = sub || '';
    this.el.dist.textContent = distM != null ? Math.round(distM) + ' m' : '';
    this.el.bar.style.width = ((frac || 0) * 100).toFixed(0) + '%';
  }
  hideMission() { this.el.mission.style.visibility = 'hidden'; }
  showMission() { this.el.mission.style.visibility = 'visible'; }
  setCash(v) { this.el.cash.textContent = '$' + v.toLocaleString('en-US'); }
  setClock(day, minutes) {
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(minutes % 60)).padStart(2, '0');
    this.el.clock.textContent = 'DÍA ' + day + ' · ' + hh + ':' + mm;
  }
  setStars(n, seen) {
    let s = '';
    for (let i = 0; i < 5; i++) s += '<span class="' + (i < n ? 'on' : '') + '">★</span>';
    this.el.stars.innerHTML = s;
    this.el.heat.textContent = n === 0 ? '' : seen ? '● A LA VISTA' : '○ TE ESTÁN BUSCANDO';
    this.el.heat.style.color = seen ? '#ff5d5d' : '#ffd166';
  }
  setDispatch(rows) {
    if (!rows || rows.length === 0) { this.el.dispatch.classList.add('hidden'); return; }
    this.el.dispatch.classList.remove('hidden');
    this.el.dpCount.textContent = rows.length + (rows.length === 1 ? ' UNIDAD' : ' UNIDADES');
    this.el.dpUnits.innerHTML = rows.map(r =>
      '<div class="unit"><span class="cs">' + r.cs + '</span>' +
      '<span class="tac tac-' + (r.tactic === 'PURSUIT' ? 'pursuit' : r.tactic === 'ROADBLOCK' ? 'roadblock' : r.tactic === 'FIRING' ? 'firing' : 'spot') + '">' + r.tactic + '</span>' +
      '<span class="ud">' + r.dist + ' m</span><div class="line">' + r.line + '</div></div>').join('');
  }
  setDistrict(name) { this.el.district.textContent = name; }
  setVitals(health, respect) {
    this.el.health.style.width = Math.max(0, health) + '%';
    this.el.health.style.background = health < 30 ? '#e83a3a' : '#57d95e';
    this.el.respect.style.width = Math.min(100, respect) + '%';
    this.el.rank.textContent = respectRank(respect);
  }
  setSpeed(carName, kmh, hpFrac, visible) {
    this.el.speedo.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) return;
    this.el.speedoCar.textContent = carName.toUpperCase();
    this.el.speed.textContent = Math.round(kmh);
    this.el.speedoHp.style.width = Math.max(0, hpFrac * 100) + '%';
    this.el.speedoHp.style.background = hpFrac < 0.3 ? '#e83a3a' : '#57d95e';
  }
  setRadio(label, track) { this.el.radioFreq.textContent = label; this.el.radioTrack.textContent = track; }
  setWeapon(i) { this.el.weapons.forEach((w, j) => w.classList.toggle('sel', i === j)); }
  showDialogue(name, role, text, who) {
    this.el.dialogue.classList.remove('hidden');
    this.el.dlgName.innerHTML = name + ' <span class="role">' + role + '</span>';
    this.el.dlgText.textContent = text;
    drawPortrait(this.el.portrait, who);
  }
  hideDialogue() { this.el.dialogue.classList.add('hidden'); }
  toast(msg, seconds = 2.6) { this.el.toast.textContent = msg; this.toastT = seconds; }
  chapterCard(ch, name, seconds = 2.8) {
    this.el.ccCh.textContent = 'CAPÍTULO ' + ch;
    this.el.ccName.textContent = name;
    this.el.chapter.classList.remove('hidden');
    this.chapterT = seconds;
  }
  endScreen(kind, sub) {
    this.el.endBig.textContent = kind;
    this.el.endBig.style.color = kind === 'BUSTED' ? '#6ab8ff' : '#ff5d5d';
    this.el.endSub.textContent = sub;
    this.el.end.classList.remove('hidden');
  }
  hideEnd() { this.el.end.classList.add('hidden'); }
  setInteract(text) {
    if (!text) { this.el.interact.classList.add('hidden'); return; }
    this.el.interact.textContent = text;
    this.el.interact.classList.remove('hidden');
  }
  setCrosshair(on) { this.el.crosshair.classList.toggle('hidden', !on); }
  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.textContent = ''; }
    if (this.chapterT > 0) { this.chapterT -= dt; if (this.chapterT <= 0) this.el.chapter.classList.add('hidden'); }
  }
}
