// All sound is synthesised with WebAudio. No samples were harmed.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.hold = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: two oscillators through a lowpass with a put-put tremolo
    this.eng = { o1: ctx.createOscillator(), o2: ctx.createOscillator(), lfo: ctx.createOscillator(), lp: ctx.createBiquadFilter(), g: ctx.createGain(), lg: ctx.createGain() };
    const e = this.eng;
    e.o1.type = 'sawtooth';
    e.o2.type = 'square';
    e.lp.type = 'lowpass';
    e.lp.frequency.value = 500;
    e.g.gain.value = 0;
    e.lg.gain.value = 0;
    e.o1.connect(e.lp);
    e.o2.connect(e.lp);
    e.lp.connect(e.g).connect(this.master);
    e.lfo.connect(e.lg).connect(e.g.gain);
    e.o1.start();
    e.o2.start();
    e.lfo.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }
  suspend(s) {
    if (!this.ctx) return;
    if (s) this.ctx.suspend();
    else this.ctx.resume();
  }

  engine(speed, on) {
    if (!this.ctx) return;
    const e = this.eng, t = this.ctx.currentTime;
    const f = 34 + speed * 2.5;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.05);
    e.lfo.frequency.setTargetAtTime(7 + speed * 0.5, t, 0.05);
    e.lp.frequency.setTargetAtTime(320 + speed * 22, t, 0.05);
    e.g.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.08);
    e.lg.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.08);
  }

  // --- primitives ---------------------------------------------------------
  tone({ type = 'sine', f = 440, f2, dur = 0.2, vol = 0.2, at = 0, attack = 0.01, dest, vib, vibDepth = 0, curve }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (curve) for (const [dt, fv] of curve) o.frequency.linearRampToValueAtTime(fv, t + dt);
    else if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    if (vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = vib;
      lg.gain.value = vibDepth;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f = 1000, f2, q = 1, at = 0, attack = 0.005, dest }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true;
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest || this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  formant(freq, q = 2) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(this.master);
    return f;
  }

  // --- creatures ----------------------------------------------------------
  baa({ pitch = 1, dur = 0.7, vol = 0.22, at = 0, fall = 0.85 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const f0 = 400 * pitch * (0.92 + Math.random() * 0.16);
    const o = ctx.createOscillator(), g = ctx.createGain(), trem = ctx.createOscillator(), tg = ctx.createGain(), vg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.06, t);
    o.frequency.exponentialRampToValueAtTime(f0 * fall, t + dur);
    trem.frequency.value = 9 + Math.random() * 3; // the bleat wobble
    tg.gain.value = vol * 0.55;
    vg.gain.value = f0 * 0.05;
    trem.connect(tg).connect(g.gain);
    trem.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f1 = this.formant(1100, 1.6), f2 = this.formant(2500, 2.5);
    o.connect(g);
    g.connect(f1);
    g.connect(f2);
    o.start(t);
    trem.start(t);
    o.stop(t + dur + 0.05);
    trem.stop(t + dur + 0.05);
  }
  baaFlying() {
    this.baa({ dur: 1.5, vol: 0.3, fall: 0.5, pitch: 1.25 });
  }
  moo(vol = 0.3) {
    if (!this.ctx) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const t = this.ctx.currentTime;
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(700, t + 0.5);
    lp.frequency.linearRampToValueAtTime(300, t + 1.3);
    lp.connect(this.master);
    this.tone({ type: 'sawtooth', f: 120, curve: [[0.35, 150], [1.3, 105]], dur: 1.35, vol, attack: 0.12, dest: lp, vib: 5, vibDepth: 3 });
  }
  bark(n = 2) {
    for (let i = 0; i < n; i++) {
      this.tone({ type: 'sawtooth', f: 520, f2: 190, dur: 0.11, vol: 0.2, at: i * 0.2 });
      this.noise({ dur: 0.09, vol: 0.15, type: 'bandpass', f: 1200, q: 1, at: i * 0.2 });
    }
  }
  cry(n = 2, vol = 0.2) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) {
      const at = i * 0.62, base = 430 + Math.random() * 50;
      const f = this.formant(1300, 1.2);
      this.tone({ type: 'sawtooth', f: base, curve: [[0.12, base * 1.35], [0.5, base * 1.05]], dur: 0.54, vol, at, attack: 0.05, dest: f, vib: 13, vibDepth: 14 });
      this.tone({ type: 'triangle', f: base, curve: [[0.12, base * 1.35], [0.5, base * 1.05]], dur: 0.54, vol: vol * 0.5, at, attack: 0.05 });
    }
  }
  voice(who, chars = 20) {
    if (!this.ctx) return;
    if (who === 'dog') return this.bark(2);
    if (who === 'baby') return;
    const n = Math.min(12, Math.max(3, Math.round(chars / 5)));
    for (let i = 0; i < n; i++) {
      const at = i * 0.085;
      if (who === 'nana') {
        const f = 330 + Math.random() * 190;
        this.tone({ type: 'triangle', f, f2: f * (0.85 + Math.random() * 0.3), dur: 0.075, vol: 0.13, at, vib: 30, vibDepth: 18 });
      } else if (who === 'teen') {
        const f = 105 + Math.random() * 35;
        this.tone({ type: 'square', f, f2: f * 0.95, dur: 0.07, vol: 0.05, at });
      } else {
        const f = 150 + Math.random() * 60;
        this.tone({ type: 'sawtooth', f, f2: f * 0.9, dur: 0.07, vol: 0.06, at });
      }
    }
  }

  // --- car ----------------------------------------------------------------
  horn() {
    // a-OOO-gah
    if (!this.ctx) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(this.master);
    this.tone({ type: 'sawtooth', f: 210, curve: [[0.16, 430], [0.42, 430], [0.5, 300], [0.85, 290]], dur: 0.9, vol: 0.2, attack: 0.03, dest: lp, vib: 38, vibDepth: 16 });
  }
  tractorHorn() {
    this.tone({ type: 'square', f: 150, dur: 0.5, vol: 0.1 });
    this.tone({ type: 'square', f: 189, dur: 0.5, vol: 0.1 });
  }
  crash(i = 1) {
    this.noise({ dur: 0.35 * i + 0.1, vol: 0.5 * i, f: 1400, f2: 120 });
    this.tone({ f: 140, f2: 38, dur: 0.3, vol: 0.5 * i });
    this.tone({ type: 'square', f: 900, f2: 200, dur: 0.07, vol: 0.12 * i });
  }
  clang() {
    for (const f of [523, 811, 1289, 1760]) this.tone({ type: 'square', f, dur: 0.5, vol: 0.06 });
    this.crash(0.8);
  }
  thunk() {
    this.tone({ f: 110, f2: 45, dur: 0.18, vol: 0.5 });
    this.noise({ dur: 0.1, vol: 0.25, f: 500 });
  }
  scrape() {
    this.noise({ dur: 0.4, vol: 0.3, type: 'bandpass', f: 2600, f2: 900, q: 3 });
    this.crash(0.5);
  }
  squelch() {
    this.noise({ dur: 0.35, vol: 0.4, f: 900, f2: 150, q: 6 });
    this.tone({ f: 300, f2: 70, dur: 0.25, vol: 0.2 });
  }
  poof() {
    this.noise({ dur: 0.4, vol: 0.35, type: 'bandpass', f: 700, f2: 250, q: 0.6 });
  }
  ding(n = 1) {
    for (let i = 0; i < n; i++) {
      this.tone({ f: 1320 * (1 + i * 0.25), dur: 0.35, vol: 0.12, at: i * 0.09 });
      this.tone({ f: 2640 * (1 + i * 0.25), dur: 0.2, vol: 0.05, at: i * 0.09 });
    }
  }
  sputter() {
    for (let i = 0; i < 9; i++) {
      const at = i * i * 0.022 + i * 0.09;
      this.noise({ dur: 0.07, vol: 0.4, f: 500, at });
      this.tone({ type: 'square', f: 90 - i * 5, dur: 0.07, vol: 0.14, at });
    }
    this.noise({ dur: 2.6, vol: 0.14, type: 'highpass', f: 3500, at: 1.1, attack: 0.3 });
    this.tone({ f: 500, f2: 60, dur: 1.3, vol: 0.1, at: 0.9, type: 'triangle' });
  }
  ratchet(at = 0) {
    for (let i = 0; i < 7; i++) this.noise({ dur: 0.025, vol: 0.3, type: 'highpass', f: 3000, at: at + i * 0.055 });
  }
  hammer(at = 0) {
    this.tone({ type: 'square', f: 1250, dur: 0.12, vol: 0.09, at });
    this.tone({ type: 'square', f: 1873, dur: 0.1, vol: 0.06, at });
    this.noise({ dur: 0.05, vol: 0.3, f: 2500, at });
  }
  beep(n = 2) {
    for (let i = 0; i < n; i++) this.tone({ type: 'square', f: 620, dur: 0.14, vol: 0.09, at: i * 0.22 });
  }
  jingle() {
    [60, 64, 67, 72, 76].forEach((n, i) => this.tone({ type: 'triangle', f: midi(n), dur: 0.3, vol: 0.16, at: i * 0.09 }));
  }
  sad() {
    [58, 57, 56, 55].forEach((n, i) => this.tone({ type: 'sawtooth', f: midi(n), dur: i === 3 ? 1.1 : 0.42, vol: 0.09, at: i * 0.45, vib: i === 3 ? 6 : 0, vibDepth: 8 }));
  }
  rattle() {
    for (let i = 0; i < 8; i++) this.noise({ dur: 0.04, vol: 0.22, type: 'bandpass', f: 5200, q: 4, at: i * 0.07 + Math.random() * 0.02 });
  }

  // --- telephone ----------------------------------------------------------
  dial() {
    const rows = [697, 770, 852, 941], cols = [1209, 1336, 1477];
    for (let i = 0; i < 7; i++) {
      const at = i * 0.13;
      this.tone({ f: rows[(Math.random() * 4) | 0], dur: 0.09, vol: 0.07, at });
      this.tone({ f: cols[(Math.random() * 3) | 0], dur: 0.09, vol: 0.07, at });
    }
  }
  ring(at = 0) {
    for (const o of [0, 0.6]) {
      this.tone({ f: 400, dur: 0.4, vol: 0.08, at: at + o, attack: 0.02 });
      this.tone({ f: 450, dur: 0.4, vol: 0.08, at: at + o, attack: 0.02 });
    }
  }
  startHold() {
    if (!this.ctx || this.hold) return;
    const ctx = this.ctx;
    const g = ctx.createGain(), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.9;
    g.gain.value = 1;
    bp.connect(g).connect(this.master);
    // Baa Baa Black Sheep, pan-pipe edition
    const tune = [[60, 1], [60, 1], [67, 1], [67, 1], [69, 0.5], [71, 0.5], [72, 0.5], [69, 0.5], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2]];
    const beat = 0.34;
    const play = () => {
      let at = 0.05;
      for (const [n, b] of tune) {
        const f = midi(n + 12);
        this.tone({ f, dur: b * beat * 0.95, vol: 0.2, at, attack: 0.03, dest: bp, vib: 5.5, vibDepth: 5 });
        this.tone({ type: 'triangle', f: f / 2, dur: b * beat * 0.9, vol: 0.09, at, dest: bp });
        this.noise({ dur: 0.06, vol: 0.05, type: 'highpass', f: 2500, at, dest: bp });
        at += b * beat;
      }
    };
    play();
    this.hold = { g, timer: setInterval(play, 16 * beat * 1000 + 250) };
  }
  stopHold() {
    if (!this.hold) return;
    clearInterval(this.hold.timer);
    this.hold.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    const g = this.hold.g;
    setTimeout(() => g.disconnect(), 2500);
    this.hold = null;
  }
}
