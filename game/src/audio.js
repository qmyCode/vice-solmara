// audio.js — one job: every sound in Vice Solmara, synthesized with WebAudio.
// No audio files: engine hum, two-tone sirens, gunshots, crash thuds, the
// explosion boom and three procedural radio stations (OLA 98.1 synthwave,
// BRISA 91.3 balada, PULSO 104.7 club) that rotate fake track titles.

export const STATIONS = [
  { freq: 'OLA 98.1', mood: 'synth', tracks: [['Neon Reprise', 'Vela Roja'], ['Medianoche GT', 'Los Espejos'], ['Cristal y Sal', 'Ana Poniente']] },
  { freq: 'BRISA 91.3', mood: 'balada', tracks: [['Carta al Mar', 'Lucía Ferrer'], ['Dos Faroles', 'Trío Muelle'], ['Si Vuelves', 'Marco Alba']] },
  { freq: 'PULSO 104.7', mood: 'club', tracks: [['Bajo el Neón', 'DJ Calzada'], ['Ritmo Pirata', 'Kasa Blanca'], ['Seis Cilindros', 'Nico Volt']] },
];

class AudioEngine {
  constructor() {
    this.ctx = null; this.station = 0; this.trackI = 0; this.radioOn = true;
    this.noteTimer = 0; this.noteI = 0; this.engineOsc = null; this.sirenOsc = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: sawtooth through lowpass, frequency follows speed.
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 300;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      // Siren: square LFO between two tones, gain gated by police presence.
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo = setInterval(() => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.sirenOsc.frequency.setValueAtTime((Math.floor(t * 1.6) % 2) ? 940 : 680, t);
      }, 60);
    } catch { this.ctx = null; }
  }
  setEngine(speedRatio, inCar) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(inCar ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 130, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(240 + speedRatio * 700, t, 0.1);
  }
  setSiren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(Math.min(0.035, level), this.ctx.currentTime, 0.2);
  }
  blip(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
  noise(dur, vol, freq, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master); src.start(t);
  }
  shot(smg) { this.noise(smg ? 0.07 : 0.11, 0.20, smg ? 2100 : 1500, 0.7); this.blip(smg ? 190 : 150, 0.06, 'square', 0.06, -80); }
  crash(v) { this.noise(0.22, Math.min(0.3, v), 300, 0.5); }
  boom(power = 1) {
    this.noise(0.85, 0.5 * power, 110, 0.4);
    this.blip(64, 0.7, 'sine', 0.5 * power, -34);
    setTimeout(() => this.noise(0.4, 0.2, 500, 0.6), 70);
  }
  cash() { this.blip(1180, 0.09, 'square', 0.1); setTimeout(() => this.blip(1560, 0.14, 'square', 0.1), 80); }
  step() { this.noise(0.03, 0.03, 800, 1); }
  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.trackI = 0; this.noteI = 0;
    this.blip(300, 0.05, 'square', 0.05);
    return this.currentTrack();
  }
  currentTrack() {
    const st = STATIONS[this.station];
    const [title, artist] = st.tracks[this.trackI % st.tracks.length];
    return { freq: st.freq, label: '♪ ' + st.freq, title: title + ' — ' + artist };
  }
  // Procedural radio: a tiny step sequencer per mood.
  updateRadio(dt) {
    if (!this.ctx || !this.radioOn) return;
    this.noteTimer -= dt;
    if (this.noteTimer > 0) return;
    const st = STATIONS[this.station];
    const scales = { synth: [220, 261.6, 329.6, 392, 440, 523.3], balada: [196, 246.9, 293.7, 349.2, 392], club: [130.8, 130.8, 196, 146.8, 164.8, 196] };
    const scale = scales[st.mood];
    const tempo = { synth: 0.24, balada: 0.42, club: 0.19 }[st.mood];
    this.noteTimer = tempo;
    const i = this.noteI++;
    const note = scale[(i * 2 + ((i / 4) | 0)) % scale.length];
    const type = st.mood === 'balada' ? 'triangle' : 'sawtooth';
    this.blip(note, tempo * 1.7, type, st.mood === 'club' ? 0.045 : 0.035);
    if (i % 8 === 0) this.blip(scale[0] / 2, tempo * 3, 'sine', 0.06);
    if (i > 0 && i % 64 === 0) this.trackI++;
  }
}
export const audio = new AudioEngine();
