// audio.js — one job: sound, all synthesized with WebAudio (no audio files exist). Engine and
// siren follow the action, shots/explosions/crashes are shaped noise, and three radio stations
// run as little step-sequencer loops with their own bass lines, arpeggios and tempos.
import { clamp, dist2d } from './rng.js';

const STATIONS = [
  { name: 'ONDA FARO 98.1', bpm: 102, bass: [45, 0, 45, 0, 41, 0, 41, 0, 43, 0, 43, 0, 38, 0, 40, 0], arp: [69, 72, 76, 72, 65, 69, 72, 69, 67, 71, 74, 71, 62, 65, 69, 65], wave: 'sawtooth' },
  { name: 'RADIO BRISA 103.7', bpm: 116, bass: [41, 41, 0, 41, 0, 41, 48, 0, 43, 43, 0, 43, 0, 46, 45, 0], arp: [65, 0, 69, 0, 72, 0, 69, 0, 67, 0, 71, 0, 74, 0, 71, 0], wave: 'triangle' },
  { name: 'NEÓN FM 88.9', bpm: 88, bass: [38, 0, 0, 38, 0, 38, 0, 0, 41, 0, 0, 41, 0, 0, 36, 0], arp: [62, 0, 0, 65, 0, 0, 69, 0, 65, 0, 0, 62, 0, 0, 58, 0], wave: 'square' },
];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio(G) {
  let ctx = null, master = null, noiseBuf = null;
  let engine = null, siren = null, radioGain = null;
  let station = 0, radioStep = 0, radioNext = 0;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    radioGain = ctx.createGain();
    radioGain.gain.value = 0;
    radioGain.connect(master);
  }
  function noise(dur, { type = 'lowpass', from = 1200, to = null, gain = 0.4, when = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    if (to !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(gain, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(gn); gn.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, { type = 'sine', gain = 0.2, slide = null, dest = null, when = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(24, slide), t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(gain, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gn); gn.connect(dest || master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function startEngine() {
    if (!ctx || engine) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 28;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    const gn = ctx.createGain();
    gn.gain.value = 0.0;
    osc.connect(filter); osc2.connect(filter); filter.connect(gn); gn.connect(master);
    osc.start(); osc2.start();
    engine = { osc, osc2, gn, filter };
  }
  function stopEngine() {
    if (!engine) return;
    const e = engine;
    engine = null;
    e.gn.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    setTimeout(() => { try { e.osc.stop(); e.osc2.stop(); } catch { /* already stopped */ } }, 350);
  }
  function engineUpdate(ratio, throttleOn) {
    if (!engine || !ctx) return;
    const f = 52 + ratio * 175 + (throttleOn ? 14 : 0);
    engine.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
    engine.osc2.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.05);
    engine.filter.frequency.setTargetAtTime(320 + ratio * 700, ctx.currentTime, 0.08);
    engine.gn.gain.setTargetAtTime(0.045 + ratio * 0.05, ctx.currentTime, 0.09);
  }
  function ensureSiren() {
    if (!ctx || siren) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 800;
    const gn = ctx.createGain();
    gn.gain.value = 0;
    osc.connect(gn); gn.connect(master);
    osc.start();
    siren = { osc, gn };
  }
  function playRadioStep(st, step) {
    const bassNote = st.bass[step % 16];
    if (bassNote) tone(midi(bassNote), 0.16, { type: 'triangle', gain: 0.16, dest: radioGain });
    const arpNote = st.arp[step % 16];
    if (arpNote) tone(midi(arpNote), 0.11, { type: st.wave, gain: 0.045, dest: radioGain });
    if (step % 2 === 0) { // hat tick
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.03, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f); f.connect(gn); gn.connect(radioGain);
      src.start(t); src.stop(t + 0.06);
    }
  }
  function cycleStation() {
    station = (station + 1) % 4; // 0 = off, 1..3 = stations
    if (G.hud) G.hud.toast(station === 0 ? 'Radio off' : '♪ ' + STATIONS[station - 1].name);
    radioStep = 0;
    radioNext = 0;
  }
  function update(dt) {
    if (!ctx) return;
    // siren follows the nearest police unit
    ensureSiren();
    if (siren && G.police) {
      let nearest = 1e9;
      const pp = G.playerPos();
      for (const c of G.police.state.cars) if (!c.exploded) nearest = Math.min(nearest, dist2d(pp.x, pp.z, c.mesh.position.x, c.mesh.position.z));
      const target = G.police.stars > 0 && nearest < 130 ? clamp(0.05 * (1 - nearest / 150), 0, 0.045) : 0;
      siren.gn.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
      if (target > 0) siren.osc.frequency.setValueAtTime(760 + Math.sin(ctx.currentTime * 5.2) * 190, ctx.currentTime);
    }
    // radio only from a car seat
    const inCar = G.player && G.player.mode === 'car';
    const wantRadio = station > 0 && inCar;
    radioGain.gain.setTargetAtTime(wantRadio ? 0.5 : 0, ctx.currentTime, 0.3);
    if (wantRadio) {
      radioNext -= dt;
      if (radioNext <= 0) {
        const st = STATIONS[station - 1];
        playRadioStep(st, radioStep++);
        radioNext = 30 / st.bpm;
      }
    }
  }
  return {
    unlock, update, cycleStation, startEngine, stopEngine, engineUpdate,
    get stationName() { return station === 0 ? null : STATIONS[station - 1].name; },
    shot(kind) {
      if (!ctx) return;
      if (kind === 'smg') { noise(0.07, { type: 'highpass', from: 900, gain: 0.22 }); tone(210, 0.06, { type: 'triangle', gain: 0.16, slide: 60 }); }
      else { noise(0.13, { type: 'lowpass', from: 2600, to: 300, gain: 0.34 }); tone(160, 0.1, { type: 'triangle', gain: 0.22, slide: 45 }); }
    },
    punch() { noise(0.06, { type: 'lowpass', from: 500, gain: 0.2 }); },
    crash(i) { noise(0.16 + i * 0.12, { type: 'bandpass', from: 500 + i * 300, gain: 0.14 + i * 0.3 }); },
    boom() {
      if (!ctx) return;
      noise(0.85, { type: 'lowpass', from: 520, to: 42, gain: 0.85 });
      tone(120, 0.7, { type: 'sine', gain: 0.6, slide: 30 });
    },
    splash() { noise(0.28, { type: 'lowpass', from: 750, gain: 0.12 }); },
    doorSlam() { tone(85, 0.08, { type: 'square', gain: 0.12 }); noise(0.05, { type: 'bandpass', from: 900, gain: 0.1 }); },
    sting(ok) {
      if (!ctx) return;
      if (ok) { tone(659, 0.16, { type: 'sine', gain: 0.16 }); tone(880, 0.3, { type: 'sine', gain: 0.16, when: 0.13 }); }
      else { tone(220, 0.22, { type: 'sine', gain: 0.15 }); tone(165, 0.34, { type: 'sine', gain: 0.15, when: 0.16 }); }
    },
  };
}
