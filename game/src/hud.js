// hud.js — one job: everything drawn over the 3D world. Cash, respect and the rank ladder,
// stars, health/armour with numbers, district standing, the crew panel (abilities, keybinds,
// live cooldowns), the radio ticker, the IN SIGHT spotlight tag, the mission panel with its
// segmented stage bar and NEXT line, the police response panel (up to five ground units with
// roles derived from the real pursuit geometry, plus the air unit and a "+N more" line), the
// vehicle card (name + condition from real vehicle health) beside the speedo, weapon slots
// including locked ones with unlock hints and live ammo, the deduplicated dispatch feed, the
// bust meter, dialogue with canvas portraits, chapter cards, banners, toasts, and the
// title/pause/end screens. Every number rendered here is read from live game state.
import { drawPortrait, CHARACTERS } from './missions.js';
import { rankFor } from './crew.js';
import { dist2d } from './rng.js';

const $ = (id) => document.getElementById(id);

const WEAPON_SLOTS = [
  ['fists', 'FISTS', '1', ''],
  ['pistol', 'PISTOL', '2', ''],
  ['smg', 'SMG', '3', 'MARINA · CH.3'],
  ['shotgun', 'BREAKER', '4', 'UNLOCK · CH.7'],
  ['rifle', 'KESTREL AR', '5', 'UNLOCK · CH.8'],
];
const VEHICLE_NAMES = {
  sports: 'ÁGUILA GT', sedan: 'REGENTE SEDAN', taxi: 'TAXI SOLMARA', hatch: 'PICO HATCH',
  pickup: 'BURRO PICKUP', van: 'FURGÓN CARGO', interceptor: 'INTERCEPTOR',
};
const CHIP_COLORS = ['#2ec4b6', '#ffb03a', '#c77dff'];

function conditionWord(h) {
  return h >= 90 ? 'SHOWROOM' : h >= 65 ? 'SOLID' : h >= 40 ? 'DENTED' : h >= 15 ? 'BATTERED' : 'WRECKED';
}

export function createHud(G) {
  const els = {
    hud: $('hud'), cash: $('cash'), respect: $('respect'), stars: $('stars'),
    health: $('health'), healthNum: $('health-num'), armour: $('armour'), armourNum: $('armour-num'),
    dName: $('d-name-line'), dStand: $('d-stand'), dFill: $('d-fill'),
    rankTitle: $('rank-title'), rankFill: $('rankfill'), rankNext: $('rank-next'),
    crewRows: $('crew-rows'), radio: $('radio'), insight: $('insight'),
    mission: $('mission'), mCh: $('m-ch'), mTitle: $('m-title'), mObj: $('m-obj'), mTimer: $('m-timer'),
    mStage: $('m-stage'), mNext: $('m-next'),
    dispatch: $('dispatch'), speedo: $('speedo'), speed: $('speed'), wslots: $('wslots'),
    vehName: $('veh-name'), vehCond: $('veh-cond'), vehFill: $('veh-fill'),
    bustwrap: $('bustwrap'), bustfill: $('bustfill'), dialogue: $('dialogue'), portrait: $('portrait'),
    response: $('response'), rrows: $('r-rows'),
    dlgName: $('d-name'), dlgText: $('d-text'), toast: $('toast'), chapter: $('chapter'),
    chNum: $('ch-num'), chTitle: $('ch-title'), banner: $('banner'), flashred: $('flashred'),
    title: $('title'), pause: $('pause'), endcard: $('endcard'), endstats: $('endstats'),
    cover: $('cover'), mapwrap: $('mapwrap'), crosshair: $('crosshair'),
  };
  els.wslots.innerHTML = WEAPON_SLOTS.map(([key, name, num, hint]) =>
    `<div class="wslot" data-w="${key}"><b>${name}</b><span class="ammo"></span>${hint ? `<span class="hint">${hint}</span>` : ''}<span>${num}</span></div>`).join('');
  const slotEls = [...els.wslots.children];
  els.crewRows.innerHTML = [0, 1, 2].map((i) =>
    `<div class="crow"><div class="cchip" style="background:${CHIP_COLORS[i]}"></div><div class="cinfo"><div class="cname"></div><div class="ccdbar"><i></i></div></div><span class="ckey"></span><span class="ccd"></span></div>`).join('');
  const crewRowEls = [...els.crewRows.children];
  let missionLabel = '', missionSetAt = -9, toastT = 0, flashT = 0, endT = 0;
  let stageOverride = null;
  const dispatchLines = [];

  function setMission(ch, title, label, stageInfo) {
    missionSetAt = performance.now() / 1000;
    missionLabel = label || '';
    els.mCh.textContent = ch ? 'CHAPTER ' + ch : '';
    els.mTitle.textContent = title || '';
    els.mObj.textContent = missionLabel;
    els.mission.style.display = title || label ? '' : 'none';
    if (stageInfo !== undefined) stageOverride = stageInfo;
  }
  function dispatch(text) {
    // the feed never repeats a line that is already on screen (the old cover showed
    // the same GAVIOTA-2 line twice) — a repeat refreshes nothing and adds nothing
    if (dispatchLines.some((l) => l.text === text)) return;
    const div = document.createElement('div');
    div.textContent = text;
    els.dispatch.appendChild(div);
    dispatchLines.push({ div, text, at: performance.now() / 1000 });
    while (els.dispatch.children.length > 4) { els.dispatch.removeChild(els.dispatch.firstChild); dispatchLines.shift(); }
  }
  function toast(text) {
    els.toast.textContent = text;
    els.toast.style.opacity = 1;
    toastT = 2.6;
  }
  function showDialogue(line) {
    const g = els.portrait.getContext('2d');
    g.clearRect(0, 0, 96, 96);
    drawPortrait(g, line.who);
    els.dlgName.textContent = CHARACTERS[line.who].name;
    els.dlgText.textContent = line.text;
    els.dialogue.classList.remove('hidden');
  }
  // A unit's role from the real pursuit geometry: roadblocks are staged across the road,
  // a unit closing fast from dead astern is ramming, one holding a rear quarter is
  // flanking, everything else is pursuit.
  function unitRole(c, pp) {
    if (c.role === 'roadblock') return 'ROADBLOCK';
    const dx = c.mesh.position.x - pp.x, dz = c.mesh.position.z - pp.z;
    const d = Math.hypot(dx, dz) || 1;
    const pa = G.playerAngle();
    const fx = Math.sin(pa), fz = Math.cos(pa);
    const fwd = (dx * fx + dz * fz) / d; // 1 = dead ahead, -1 = dead astern
    const side = Math.abs((dx * fz - dz * fx) / d);
    const closing = Math.abs(c.speed) - Math.abs(G.playerSpeed());
    if (d < 13 && fwd < -0.55 && closing > 2.5) return 'RAMMING';
    if (d < 22 && side > 0.55 && fwd < 0.35) return 'FLANKING';
    return 'PURSUIT';
  }
  function update(dt) {
    const now = performance.now() / 1000;
    const p = G.player;
    if (p) {
      els.cash.textContent = '$' + p.cash.toLocaleString('en-US');
      els.respect.textContent = 'RESPECT ' + p.respect;
      const rk = rankFor(p.respect);
      els.rankTitle.textContent = 'RANK ' + rk.index + ' · ' + rk.title;
      els.rankFill.style.width = Math.round(rk.frac * 100) + '%';
      els.rankNext.textContent = rk.next ? `${p.respect} / ${rk.next.at} RP → ${rk.next.title}` : 'TOP OF THE LADDER';
      els.health.style.width = Math.max(0, p.health) + '%';
      els.healthNum.textContent = Math.max(0, Math.round(p.health));
      els.armour.style.width = Math.max(0, p.armour) + '%';
      els.armourNum.textContent = Math.max(0, Math.round(p.armour));
    }
    // district standing — the district the player is standing in, from crew state
    if (G.crew) {
      const st = G.crew.currentStanding();
      if (st) {
        els.dName.textContent = st.district.name.toUpperCase();
        els.dStand.innerHTML = `STANDING · <b>${st.label}</b> · ${st.value}`;
        els.dFill.style.width = st.value + '%';
      }
    }
    // crew panel — portrait chips, names, roles, ability, keybind, live cooldown sweep
    if (G.crew) {
      G.crew.members.forEach((m, i) => {
        const row = crewRowEls[i];
        row.querySelector('.cchip').textContent = m.name[0];
        row.querySelector('.cname').innerHTML = `${m.ability} <span>${m.name} · ${m.role}</span>`;
        row.querySelector('.ckey').textContent = m.keyLabel;
        const cdEl = row.querySelector('.ccd');
        const bar = row.querySelector('.ccdbar i');
        if (m.cd > 0) {
          cdEl.textContent = Math.ceil(m.cd) + 's';
          cdEl.classList.remove('ready');
          bar.style.width = Math.round((1 - m.cd / m.cdMax) * 100) + '%';
        } else {
          cdEl.textContent = 'READY';
          cdEl.classList.add('ready');
          bar.style.width = '100%';
        }
      });
    }
    // radio ticker — the station the audio system is actually playing
    const st = G.audio ? G.audio.currentStation : null;
    if (st) {
      els.radio.textContent = '♪ ' + st.name + ' — ' + st.track;
      els.radio.classList.remove('hidden');
    } else els.radio.classList.add('hidden');
    const stars = G.police ? G.police.stars : 0;
    let starHtml = '';
    for (let i = 0; i < 5; i++) starHtml += `<span class="${i < stars ? 'on' : 'off'}">★</span>`;
    els.stars.innerHTML = starHtml;
    // IN SIGHT — the helicopter spotlight is locked on the player
    els.insight.classList.toggle('hidden', !(G.police && G.police.heliLocked));
    // Police response panel: air unit first, then the five nearest ground units with
    // derived roles and live distances, then a "+N more" line for the rest of the fleet.
    if (G.police && stars > 0 && G.player) {
      const pp = G.playerPos();
      const rows = [];
      if (G.police.heliActive) rows.push('<div>HALCÓN-9 · SPOTLIGHT · AIR UNIT</div>');
      const ground = G.police.state.cars.filter((c) => !c.exploded)
        .map((c) => ({ name: c.unit || 'UNIT', role: unitRole(c, pp), d: dist2d(pp.x, pp.z, c.mesh.position.x, c.mesh.position.z) }))
        .sort((a, b) => a.d - b.d);
      for (const u of ground.slice(0, 5)) rows.push(`<div>${u.name} · ${u.role} · ${Math.round(u.d)} m</div>`);
      const footN = G.police.state.foot ? G.police.state.foot.length : 0;
      const more = ground.length - Math.min(5, ground.length) + footN;
      if (more > 0) rows.push(`<div class="more">+${more} more unit${more > 1 ? 's' : ''} responding</div>`);
      els.rrows.innerHTML = rows.join('');
      els.response.style.display = rows.length ? '' : 'none';
    } else {
      els.response.style.display = 'none';
    }
    if (p) {
      for (const el of slotEls) {
        const key = el.dataset.w;
        const owned = p.weapons.includes(key);
        el.classList.toggle('sel', p.weapon === key);
        el.classList.toggle('locked', !owned);
        const ammoEl = el.querySelector('.ammo');
        const hintEl = el.querySelector('.hint');
        if (hintEl) hintEl.style.display = owned ? 'none' : '';
        if (!owned) ammoEl.textContent = 'LOCKED';
        else if (key === 'fists') ammoEl.textContent = '∞';
        else {
          const a = p.ammo[key];
          ammoEl.textContent = a ? a.mag + ' / ' + a.res : '';
        }
      }
      const driving = p.mode === 'car' && p.car;
      els.speedo.classList.toggle('hidden', !driving);
      if (driving) {
        els.speed.textContent = Math.round(Math.abs(p.car.speed) * 3.6);
        const cond = Math.max(0, Math.round(p.car.health));
        els.vehName.textContent = VEHICLE_NAMES[p.car.type] || 'VEHICLE';
        els.vehCond.innerHTML = `CONDITION <b>${cond}%</b> · ${conditionWord(cond)}`;
        els.vehFill.style.width = cond + '%';
      }
      els.crosshair.style.display = G.state === 'play' ? '' : 'none';
    }
    // mission stage bar + NEXT line — live mission state, or the staging override in shots
    const info = stageOverride || (G.missions && G.missions.stageInfo ? G.missions.stageInfo() : null);
    if (info) {
      let segHtml = '';
      for (let i = 1; i <= info.total; i++) segHtml += `<div class="seg ${i < info.stage ? 'done' : i === info.stage ? 'now' : ''}"></div>`;
      els.mStage.innerHTML = segHtml;
      els.mNext.innerHTML = `<b>STAGE ${info.stage}/${info.total}</b> · NEXT — ${info.next}`;
    } else {
      els.mStage.innerHTML = '';
      els.mNext.textContent = '';
    }
    // objective distance joins the label once the label stops changing every frame
    if (missionLabel && now - missionSetAt > 0.5 && G.missions) {
      const obj = G.missions.objective();
      if (obj) {
        const d = Math.round(dist2d(G.player.pos.x, G.player.pos.z, obj.x, obj.z));
        els.mObj.textContent = missionLabel + ' — ' + d + ' m';
      }
    }
    for (let i = dispatchLines.length - 1; i >= 0; i--) {
      if (now - dispatchLines[i].at > 8) { dispatchLines[i].div.remove(); dispatchLines.splice(i, 1); }
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) els.toast.style.opacity = 0; }
    if (flashT > 0) { flashT -= dt; els.flashred.style.opacity = Math.max(0, flashT * 1.6); }
    if (endT > 0) { endT -= dt; if (endT <= 0) els.endcard.classList.add('hidden'); }
  }
  return {
    update, dispatch, toast, setMission,
    showDialogue,
    hideDialogue() { els.dialogue.classList.add('hidden'); },
    showChapter(ch, title) {
      els.chNum.textContent = 'CHAPTER ' + ch;
      els.chTitle.textContent = title.toUpperCase();
      els.chapter.classList.remove('hidden');
    },
    hideChapter() { els.chapter.classList.add('hidden'); },
    setTimer(sec) {
      if (sec === null || sec === undefined) { els.mTimer.classList.add('hidden'); return; }
      els.mTimer.classList.remove('hidden');
      const s = Math.max(0, Math.ceil(sec));
      els.mTimer.textContent = '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      els.mTimer.classList.toggle('low', s < 30);
    },
    setBustMeter(f) {
      els.bustwrap.classList.toggle('hidden', !(f > 0.02));
      els.bustfill.style.width = Math.round(Math.min(1, f) * 100) + '%';
    },
    flashRed() { flashT = 0.55; els.flashred.style.opacity = 0.9; },
    showBanner(text, info = false) {
      els.banner.textContent = text;
      els.banner.classList.toggle('info', info);
      els.banner.classList.remove('hidden');
    },
    hideBanner() { els.banner.classList.add('hidden'); },
    showTitle() { els.title.classList.remove('hidden'); },
    hideTitle() { els.title.style.display = 'none'; },
    showPause(v) { els.pause.classList.toggle('hidden', !v); },
    showEnd() {
      els.endstats.textContent = `Final cash $${G.player.cash.toLocaleString('en-US')} · Respect ${G.player.respect} · All 8 jobs done`;
      els.endcard.classList.remove('hidden');
      endT = 10;
    },
    setCoverMode(on) {
      els.cover.classList.toggle('hidden', !on);
      els.hud.classList.toggle('hidden', on);
    },
    setMapOpen(open) { els.mapwrap.classList.toggle('hidden', !open); },
    showHud() { els.hud.classList.remove('hidden'); },
    els,
  };
}
