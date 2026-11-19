// hud.js — one job: everything drawn in DOM over the 3D world. The mission panel, clock, cash
// and wanted stars, the SMPD dispatch feed with callsigns/tactics/distances, health and respect
// bars, weapon slots, the in-car radio panel and speedometer, dialogue boxes with portraits,
// chapter cards, toasts, the bust meter — and the title screen whose poster lettering (sunset
// gradient, palm silhouettes inside the glyphs, neon 3D badge) is styled in index.html.

import { CHARACTERS, drawPortrait } from './missions.js';
import { WEAPONS } from './combat.js';

const $ = (id) => document.getElementById(id);
const RANKS = [
  [1300, 'CAPO'], [900, 'SHOT CALLER'], [600, 'RESPETADO'], [350, 'CONOCIDO'], [150, 'REPARTIDOR'], [0, 'DON NADIE'],
];
const CAR_NAMES = {
  sedan: 'SENDA 4P', taxi: 'TAXI SOL', hatch: 'PICO 3P', pickup: 'BURRO 4X4',
  van: 'FURGÓN MAREA', gt: 'ÁGUILA GT', interceptor: 'INTERCEPTOR SMPD',
};

export function createHud(G) {
  const portraits = {};
  for (const key of Object.keys(CHARACTERS)) portraits[key] = drawPortrait(key);

  const els = {
    hud: $('hud'), missionPanel: $('missionPanel'), mpChapter: $('mpChapter'), mpTitle: $('mpTitle'),
    mpLabel: $('mpLabel'), mpSub: $('mpSub'), mpPips: $('mpPips'), mpTimerWrap: $('mpTimerWrap'),
    mpTimerBar: $('mpTimerBar'), mpDist: $('mpDist'),
    clock: $('clock'), cash: $('cash'), stars: $('stars'), seenTag: $('seenTag'),
    dispatchPanel: $('dispatchPanel'), dpCount: $('dpCount'), dpRows: $('dpRows'),
    minimap: $('minimap'), districtName: $('districtName'), healthFill: $('healthFill'),
    respectFill: $('respectFill'), respectRank: $('respectRank'),
    radioPanel: $('radioPanel'), radioName: $('radioName'), radioTrack: $('radioTrack'),
    speedo: $('speedo'), speedoCar: $('speedoCar'), speedoNum: $('speedoNum'), speedoCond: $('speedoCond'),
    dialogue: $('dialogue'), dlgPortrait: $('dlgPortrait'), dlgName: $('dlgName'), dlgRole: $('dlgRole'), dlgText: $('dlgText'),
    chapterCard: $('chapterCard'), ccCh: $('ccCh'), ccTitle: $('ccTitle'),
    toasts: $('toasts'), dmgFlash: $('dmgFlash'), bustWrap: $('bustWrap'), bustFill: $('bustFill'),
    interactHint: $('interactHint'), titleScreen: $('titleScreen'), pauseScreen: $('pauseScreen'),
    bustedScreen: $('bustedScreen'), wastedScreen: $('wastedScreen'), mapOverlay: $('mapOverlay'),
    fullMap: $('fullMap'), saveNote: $('saveNote'),
  };

  let dlg = null; // {lines, i, onDone}
  let dispatchT = 0;
  let dmgA = 0;
  let lastDistrict = '';

  function showDialogue(lines, onDone) {
    dlg = { lines, i: 0, onDone };
    renderDialogue();
    els.dialogue.style.display = 'flex';
  }
  function renderDialogue() {
    if (!dlg) return;
    const line = dlg.lines[dlg.i];
    const ch = CHARACTERS[line.who];
    els.dlgPortrait.src = portraits[line.who];
    els.dlgName.textContent = ch.name;
    els.dlgRole.textContent = ch.role;
    els.dlgText.textContent = line.text;
  }
  function advanceDialogue() {
    if (!dlg) return false;
    dlg.i++;
    if (dlg.i >= dlg.lines.length) {
      const cb = dlg.onDone;
      dlg = null;
      els.dialogue.style.display = 'none';
      if (cb) cb();
    } else renderDialogue();
    return true;
  }

  function showChapter(ch, title) {
    els.ccCh.textContent = ch;
    els.ccTitle.textContent = title;
    els.chapterCard.classList.remove('show');
    void els.chapterCard.offsetWidth;
    els.chapterCard.classList.add('show');
  }

  function toast(text, ms = 2000) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    els.toasts.appendChild(div);
    requestAnimationFrame(() => div.classList.add('in'));
    setTimeout(() => { div.classList.remove('in'); setTimeout(() => div.remove(), 350); }, ms);
  }

  function damageFlash() { dmgA = 0.55; }

  /** The mission panel mirrors missions.objective(), or the idle marker, or free roam. */
  function refreshObjective() {
    const m = G.missions;
    if (!m) return;
    const o = m.objective();
    if (o) {
      els.mpChapter.textContent = o.title.split(' ')[0] + ' ' + (o.title.split(' ')[1] || '');
      els.mpTitle.textContent = o.title.replace(/^CH \d+ /, '').replace(/^EN /, '');
      els.mpLabel.textContent = o.label;
      els.mpSub.textContent = o.sub || '';
      els.mpPips.innerHTML = '';
      for (let i = 0; i < o.stageCount; i++) {
        const pip = document.createElement('span');
        pip.className = 'pip' + (i < o.stageI ? ' done' : i === o.stageI ? ' now' : '');
        els.mpPips.appendChild(pip);
      }
      els.mpTimerWrap.style.display = o.timer !== null && o.timer !== undefined ? 'block' : 'none';
      return;
    }
    const idle = m.idleMarker();
    if (idle) {
      els.mpChapter.textContent = 'VICIO';
      els.mpTitle.textContent = 'SIGUIENTE ENCARGO';
      els.mpLabel.textContent = `Ve a ${idle.label}`;
      els.mpSub.textContent = 'El marcador dorado te espera';
      els.mpPips.innerHTML = '';
      els.mpTimerWrap.style.display = 'none';
      return;
    }
    els.mpChapter.textContent = 'VICE';
    els.mpTitle.textContent = 'SOLMARA LIBRE';
    els.mpLabel.textContent = 'Rueda libre — la isla es tuya';
    els.mpSub.textContent = 'Robos, carreras y encargos cuando quieras';
    els.mpPips.innerHTML = '';
    els.mpTimerWrap.style.display = 'none';
  }

  function refreshWeapons() {
    document.querySelectorAll('.wslot').forEach((slot) => {
      const key = slot.getAttribute('data-w');
      slot.classList.toggle('active', G.player.state.weapon === key);
      slot.classList.toggle('locked', !G.player.state.weapons.includes(key));
      const nameEl = slot.querySelector('.wname');
      if (nameEl) nameEl.textContent = WEAPONS[key].name;
    });
  }

  function fmtClock() {
    const hour = 6 + G.phase * 24;
    const hh = Math.floor(hour) % 24;
    const mm = Math.floor((hour - Math.floor(hour)) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function update(dt) {
    const p = G.player.state;
    // clock + cash + stars
    els.clock.textContent = `DÍA 1 · ${fmtClock()}`;
    els.cash.textContent = `$${G.cash.toLocaleString('en-US')}`;
    const stars = G.police ? G.police.stars : 0;
    els.stars.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.className = i < stars ? 'on' : 'off';
      els.stars.appendChild(s);
    }
    // pursuit state tag
    if (!G.police || stars === 0) els.seenTag.style.display = 'none';
    else {
      els.seenTag.style.display = 'block';
      if (G.police.state.seen) { els.seenTag.textContent = '● A LA VISTA'; els.seenTag.className = 'seen-hot'; }
      else if (G.police.state.searchT < 5) { els.seenTag.textContent = '○ PERDIENDO EL RASTRO…'; els.seenTag.className = 'seen-warm'; }
      else { els.seenTag.textContent = '○ BUSCANDO…'; els.seenTag.className = 'seen-cold'; }
    }
    // dispatch feed, refreshed a few times a second
    dispatchT -= dt;
    if (G.police && dispatchT <= 0) {
      dispatchT = 0.25;
      const rows = G.police.dispatch();
      const units = G.police.state.cops.length + (G.police.state.heli && G.police.state.heli.active ? 1 : 0);
      els.dispatchPanel.style.display = stars > 0 ? 'block' : 'none';
      els.dpCount.textContent = `${units} UNIDAD${units === 1 ? '' : 'ES'}`;
      els.dpRows.innerHTML = rows.map((r) => `
        <div class="dprow">
          <div class="dpmain"><span class="dpcs">${r.callsign}</span> <span class="dpdist">${r.dist} m</span>
          <div class="dptext">${r.text}</div></div>
          <span class="dptac tac-${r.tactic}">${r.tactic}</span>
        </div>`).join('');
    }
    // minimap + district + vitals
    if (G.minimap) G.minimap.drawMini(els.minimap, G);
    const district = G.city.districtAt(p.x, p.z);
    if (district !== lastDistrict) { lastDistrict = district; els.districtName.textContent = district.toUpperCase(); }
    els.healthFill.style.width = `${Math.max(0, p.health)}%`;
    const rank = RANKS.find(([min]) => G.respect >= min);
    els.respectRank.textContent = rank[1];
    const next = RANKS[RANKS.indexOf(rank) - 1];
    const base = rank[0];
    const span = next ? next[0] - base : 1;
    els.respectFill.style.width = `${next ? Math.min(100, ((G.respect - base) / span) * 100) : 100}%`;
    // objective distance + timer bar
    if (G.objectivePos) {
      const d = Math.round(Math.hypot(p.x - G.objectivePos.x, p.z - G.objectivePos.z));
      els.mpDist.textContent = `${d} m`;
    } else els.mpDist.textContent = '';
    const o = G.missions ? G.missions.objective() : null;
    if (o && o.timer !== null && o.timer !== undefined) {
      const total = G.missions.S.stage ? G.missions.S.stage.timer : 1;
      els.mpTimerBar.style.width = `${Math.max(0, (o.timer / total) * 100)}%`;
    }
    // car block: radio + speedo, or the on-foot interact hint
    if (p.car) {
      els.speedo.style.display = 'block';
      els.radioPanel.style.display = 'block';
      els.speedoCar.textContent = CAR_NAMES[p.car.type] || 'COCHE';
      els.speedoNum.textContent = `${Math.round(Math.abs(p.car.speed) * 3.6)}`;
      els.speedoCond.style.width = `${Math.max(0, p.car.health)}%`;
      els.speedoCond.style.background = p.car.health > 45 ? '#57d977' : p.car.health > 22 ? '#ffb347' : '#ff5147';
      const st = G.audio.station;
      els.radioName.textContent = `♪ ${st.name}`;
      els.radioTrack.textContent = st.track;
      els.interactHint.style.display = 'none';
    } else {
      els.speedo.style.display = 'none';
      els.radioPanel.style.display = 'none';
      const near = G.player.nearestCar(3.4);
      els.interactHint.style.display = near ? 'block' : 'none';
      if (near) els.interactHint.textContent = 'E · Subir al coche';
    }
    // bust meter + damage vignette
    if (G.police && G.police.state.bustT > 0.04 && G.police.stars > 0) {
      els.bustWrap.style.display = 'block';
      els.bustFill.style.width = `${Math.min(100, (G.police.state.bustT / 1.7) * 100)}%`;
    } else els.bustWrap.style.display = 'none';
    if (dmgA > 0) {
      dmgA = Math.max(0, dmgA - dt * 1.4);
      els.dmgFlash.style.opacity = dmgA.toFixed(2);
    }
  }

  function showScreen(name) {
    els.titleScreen.style.display = name === 'title' ? 'flex' : 'none';
    els.pauseScreen.style.display = name === 'pause' ? 'flex' : 'none';
    els.bustedScreen.style.display = name === 'busted' ? 'flex' : 'none';
    els.wastedScreen.style.display = name === 'wasted' ? 'flex' : 'none';
    els.mapOverlay.style.display = name === 'map' ? 'block' : 'none';
    els.hud.style.display = (name === 'play' || name === 'map') ? 'block' : 'none';
    if (name === 'map' && G.minimap) G.minimap.drawFull(els.fullMap, G);
  }

  return {
    els, update, showDialogue, advanceDialogue, showChapter, toast, damageFlash,
    refreshObjective, refreshWeapons, showScreen,
    get dialogueOpen() { return dlg !== null; },
  };
}
