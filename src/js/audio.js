/* ============================================================
   MATH LEGENDS: BATTLE ARENA — audio.js
   Efek suara sintesis via WebAudio (tanpa file audio -> super ringan).
   Context dibuat saat interaksi pertama (kebijakan autoplay browser).
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});

  ML.Audio = {
    ctx: null,
    enabled: true,

    _ensure: function () {
      if (typeof window === 'undefined') return null;
      if (!this.ctx) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) {
        try { this.ctx.resume().catch(function () {}); } catch (e) {}
      }
      return this.ctx;
    },

    // satu nada: frekuensi, durasi, offset, tipe osilator, volume, frekuensi akhir (slide)
    tone: function (c, freq, dur, at, type, vol, slideTo) {
      const t0 = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },

    play: function (name) {
      if (!this.enabled) return;
      const c = this._ensure();
      if (!c) return;
      const T = this;
      switch (name) {
        case 'click':   T.tone(c, 660, 0.06, 0, 'square', 0.08); break;
        case 'correct': T.tone(c, 523, 0.09, 0, 'sine', 0.16); T.tone(c, 784, 0.14, 0.08, 'sine', 0.16); break;
        case 'perfect': T.tone(c, 659, 0.07, 0, 'triangle', 0.18); T.tone(c, 880, 0.08, 0.06, 'triangle', 0.18); T.tone(c, 1175, 0.16, 0.12, 'triangle', 0.18); break;
        case 'wrong':   T.tone(c, 220, 0.18, 0, 'sawtooth', 0.12, 150); T.tone(c, 160, 0.24, 0.12, 'sawtooth', 0.10, 110); break;
        case 'attack':  T.tone(c, 320, 0.1, 0, 'square', 0.12, 90); break;
        case 'crit':    T.tone(c, 520, 0.05, 0, 'square', 0.14); T.tone(c, 780, 0.05, 0.05, 'square', 0.14); T.tone(c, 1040, 0.2, 0.1, 'triangle', 0.16); break;
        case 'skill':   T.tone(c, 440, 0.08, 0, 'triangle', 0.15); T.tone(c, 660, 0.14, 0.07, 'triangle', 0.15); break;
        case 'tick':    T.tone(c, 880, 0.035, 0, 'square', 0.05); break;
        case 'victory': [523, 659, 784, 1047].forEach(function (f, i) { T.tone(c, f, i === 3 ? 0.34 : 0.12, i * 0.12, 'triangle', 0.16); }); break;
        case 'defeat':  [392, 330, 262].forEach(function (f, i) { T.tone(c, f, i === 2 ? 0.32 : 0.14, i * 0.14, 'sine', 0.14); }); break;
        case 'rankup':  [523, 523, 659, 784].forEach(function (f, i) { T.tone(c, f, i === 3 ? 0.3 : 0.1, i * 0.1, 'triangle', 0.17); }); break;
        case 'coin':    T.tone(c, 988, 0.07, 0, 'square', 0.1); T.tone(c, 1319, 0.12, 0.07, 'square', 0.1); break;
      }
    }
  };
})();
