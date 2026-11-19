// audio.js — one job: sound, all of it synthesized with WebAudio (no audio files exist).
// Engine hum and police siren follow the action, gunshots and the explosion boom are shaped
// noise, and three radio stations — Ola 98.1 synthwave, Radio Palma, Noche FM — run tiny step
// sequencers so a stolen car always has something playing.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

const STATIONS = [
  {
    name: 'OLA 98.1', track: 'Neon Reprise — Vela Roja', bpm: 102, wave: 'sawtooth',
    bass: [36, -1, 36, -1, 39, -1, 36, -1, 34, -1, 34, -1, 41, -1, 39, -1],
    lead: [60, -1, 63, -1, 65, -1, 63, -1, 58, -1, 60, -1, -1, -1, -1, -1],
  },
  {
    name: 'RADIO PALMA', track: 'Malecón — Los Faros', bpm: 116, wave: 'square',
    bass: [41, -1, -1, 41, -1, 41, -1, -1, 43, -1, -1, 43, -1, 43, -1, -1],
    lead: [65, -1, 69, -1, 72, -1, 69, 65, 67, -1, 71, -1, 74, -1, -1, -1],
  },
  {
    name: 'NOCHE FM', track: 'Bahía Lenta — Mar Serena', bpm: 74, wave: 'triangle',
    bass: [45, -1, -1, -1, -1, -1, -1, -1, 41, -1, -1, -1, -1, -1, -1, -1],
    lead: [69, -1, -1, 72, -1, -1, 76, -1, 74, -1, -1, 71, -1, -1, -1, -1],
  },
];

export function createAudio() {
  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let radioTimer = null, radioGain = null, radioStep = 0, nextNoteTime = 0;
  let stationIdx = 0, radioOn = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    radioGain = ctx.createGain();
    radioGain.gain.value = 0;
    radioGain.connect(master);
  }

  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burstNoise(dur, filterType, f0, f1, gainPeak, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, gainPeak, slideTo = null, dest = null) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(dest || master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // ---- continuous voices: engine + siren ----
  function setEngine(on, rpm = 0) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
    }
    if (engineOsc) {
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(52 + rpm * 120, t, 0.06);
      engineFilter.frequency.setTargetAtTime(280 + rpm * 700, t, 0.06);
      engineGain.gain.setTargetAtTime(on ? 0.05 + rpm * 0.05 : 0, t, 0.09);
    }
  }

  function setSiren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 950;
      sirenLfo = ctx.createOscillator();
      sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 330;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    if (sirenGain) sirenGain.gain.setTargetAtTime(on ? 0.028 : 0, ctx.currentTime, 0.2);
  }

  // ---- one-shots ----
  function shot(kind) {
    if (!ctx) return;
    if (kind === 'smg') burstNoise(0.09, 'bandpass', 1900, 500, 0.24);
    else burstNoise(0.16, 'bandpass', 1500, 300, 0.34);
  }
  function boom() {
    if (!ctx) return;
    burstNoise(1.1, 'lowpass', 420, 36, 0.95);
    tone(68, 0.8, 'sine', 0.7, 30);
  }
  function punch() { burstNoise(0.08, 'lowpass', 500, 120, 0.3); }
  function crash(intensity = 0.5) { burstNoise(0.28, 'lowpass', 900, 150, 0.25 + intensity * 0.4); }
  function coin() { tone(880, 0.09, 'square', 0.12); tone(1320, 0.14, 'square', 0.1); }
  function bustedJingle() { tone(392, 0.22, 'square', 0.16); setTimeout(() => tone(311, 0.3, 'square', 0.16), 160); setTimeout(() => tone(262, 0.44, 'square', 0.16), 340); }

  // ---- radio sequencer ----
  function scheduleStep(step, when) {
    const st = STATIONS[stationIdx];
    const bassNote = st.bass[step % 16];
    const leadNote = st.lead[step % 16];
    const spb = 60 / st.bpm / 2; // eighth notes
    const play = (note, wave, vol, dur, dest) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.value = midi(note);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(vol, when + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.connect(gain).connect(dest);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    };
    if (bassNote > 0) play(bassNote, 'triangle', 0.34, spb * 0.95, radioGain);
    if (leadNote > 0) play(leadNote, st.wave, 0.11, spb * 0.9, radioGain);
  }
  function radioTick() {
    if (!ctx || !radioOn) return;
    const st = STATIONS[stationIdx];
    const spb = 60 / st.bpm / 2;
    while (nextNoteTime < ctx.currentTime + 0.14) {
      scheduleStep(radioStep, nextNoteTime);
      nextNoteTime += spb;
      radioStep++;
    }
  }
  function setRadio(on, idx = null) {
    if (!ctx) return;
    if (idx !== null) stationIdx = ((idx % STATIONS.length) + STATIONS.length) % STATIONS.length;
    radioOn = on;
    radioGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.15);
    if (on && !radioTimer) {
      radioStep = 0;
      nextNoteTime = ctx.currentTime + 0.06;
      radioTimer = setInterval(radioTick, 90);
    } else if (!on && radioTimer) {
      clearInterval(radioTimer);
      radioTimer = null;
    }
  }

  return {
    init, setEngine, setSiren, shot, boom, punch, crash, coin, bustedJingle, setRadio,
    get station() { return STATIONS[stationIdx]; },
    get stationIdx() { return stationIdx; },
    STATIONS,
  };
}
