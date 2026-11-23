// hud.js — one job: everything drawn over the 3D world. Cash, respect, stars, health, weapon
// slots, speedo, the mission panel with objective distance and timer, the police dispatch
// feed, the police response panel (nearest units, roles, live distances, air unit), the bust
// meter, dialogue with canvas portraits, chapter cards, banners, toasts, the
// title/pause/end screens and the poster's cover treatment used by the cover screenshot.
import { drawPortrait, CHARACTERS } from './missions.js';
import { dist2d } from './rng.js';

const $ = (id) => document.getElementById(id);

export function createHud(G) {
  const els = {
    hud: $('hud'), cash: $('cash'), respect: $('respect'), stars: $('stars'), health: $('health'),
    mission: $('mission'), mCh: $('m-ch'), mTitle: $('m-title'), mObj: $('m-obj'), mTimer: $('m-timer'),
    dispatch: $('dispatch'), speedo: $('speedo'), speed: $('speed'), wslots: $('wslots'),
    bustwrap: $('bustwrap'), bustfill: $('bustfill'), dialogue: $('dialogue'), portrait: $('portrait'),
    response: $('response'), rrows: $('r-rows'),
    dName: $('d-name'), dText: $('d-text'), toast: $('toast'), chapter: $('chapter'),
    chNum: $('ch-num'), chTitle: $('ch-title'), banner: $('banner'), flashred: $('flashred'),
    title: $('title'), pause: $('pause'), endcard: $('endcard'), endstats: $('endstats'),
    cover: $('cover'), mapwrap: $('mapwrap'), crosshair: $('crosshair'),
  };
  const WEAPON_SLOTS = [['fists', 'FISTS', '1'], ['pistol', 'PISTOL', '2'], ['smg', 'SMG', '3']];
  els.wslots.innerHTML = WEAPON_SLOTS.map(([key, name, num]) => `<div class="wslot" data-w="${key}"><b>${name}</b>${num}</div>`).join('');
  const slotEls = [...els.wslots.children];
  let missionLabel = '', missionSetAt = -9, toastT = 0, flashT = 0, endT = 0;
  const dispatchLines = [];

  function setMission(ch, title, label) {
    missionSetAt = performance.now() / 1000;
    missionLabel = label || '';
    els.mCh.textContent = ch ? 'CHAPTER ' + ch : '';
    els.mTitle.textContent = title || '';
    els.mObj.textContent = missionLabel;
    els.mission.style.display = title || label ? '' : 'none';
  }
  function dispatch(text) {
    const div = document.createElement('div');
    div.textContent = text;
    els.dispatch.appendChild(div);
    dispatchLines.push({ div, at: performance.now() / 1000 });
    while (els.dispatch.children.length > 4) els.dispatch.removeChild(els.dispatch.firstChild);
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
    els.dName.textContent = CHARACTERS[line.who].name;
    els.dText.textContent = line.text;
    els.dialogue.classList.remove('hidden');
  }
  function update(dt) {
    const now = performance.now() / 1000;
    const p = G.player;
    if (p) {
      els.cash.textContent = '$' + p.cash.toLocaleString('en-US');
      els.respect.textContent = 'RESPECT ' + p.respect;
      els.health.style.width = Math.max(0, p.health) + '%';
    }
    const stars = G.police ? G.police.stars : 0;
    let starHtml = '';
    for (let i = 0; i < 5; i++) starHtml += `<span class="${i < stars ? 'on' : 'off'}">★</span>`;
    els.stars.innerHTML = starHtml;
    // Police response panel: the real pursuit state — nearest units by callsign and
    // role with live distances, plus the air unit while the helicopter is up.
    if (G.police && stars > 0 && G.player) {
      const pp = G.playerPos();
      const units = G.police.state.cars.filter((c) => !c.exploded)
        .map((c) => ({ name: c.unit || 'UNIT', role: c.role === 'roadblock' ? 'ROADBLOCK' : 'PURSUIT', d: dist2d(pp.x, pp.z, c.mesh.position.x, c.mesh.position.z) }))
        .sort((a, b) => a.d - b.d).slice(0, 5);
      if (G.police.heliActive) units.push({ name: 'HALCÓN-9', role: 'AIR UNIT DEPLOYED', d: null });
      els.rrows.innerHTML = units.map((u) => `<div>${u.name} · ${u.role}${u.d === null ? '' : ' · ' + Math.round(u.d) + ' m'}</div>`).join('');
      els.response.style.display = units.length ? '' : 'none';
    } else {
      els.response.style.display = 'none';
    }
    if (p) {
      for (const el of slotEls) {
        const key = el.dataset.w;
        el.classList.toggle('sel', p.weapon === key);
        el.classList.toggle('locked', !p.weapons.includes(key));
      }
      const driving = p.mode === 'car' && p.car;
      els.speedo.classList.toggle('hidden', !driving);
      if (driving) els.speed.textContent = Math.round(Math.abs(p.car.speed) * 3.6);
      els.crosshair.style.display = G.state === 'play' ? '' : 'none';
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
