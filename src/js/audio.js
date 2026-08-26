/* ============================================================
   MATH LEGENDS: BATTLE ARENA — audio.js (v0.8)
   Dua lapis:
   1) FILE (opsional, milikmu): taruh di assets/audio/ sesuai
      AUDIO.md — musik menu/battle, victory/defeat, serangan per
      hero. Bila file tidak ada, otomatis pakai lapisan sintesis.
   2) SINTESIS WebAudio: SFX ringan tanpa file (fallback penuh),
      kini BERBEDA untuk tiap hero.
   Semua akses dibungkus try/catch agar aman di jsdom/file://.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});

  const MUSIC_FILES = {
    menu: 'assets/audio/menu.mp3',
    battle: 'assets/audio/battle.mp3'
  };
  const SFX_FILES = {
    victory: 'assets/audio/victory.mp3',
    defeat: 'assets/audio/defeat.mp3',
    'atk-raka': 'assets/audio/atk-raka.mp3',
    'atk-lyra': 'assets/audio/atk-lyra.mp3',
    'atk-sena': 'assets/audio/atk-sena.mp3',
    'atk-kage': 'assets/audio/atk-kage.mp3',
    'atk-morru': 'assets/audio/atk-morru.mp3'
  };

  const AudioSystem = (ML.Audio = {
    ctx: null,
    enabled: true,        // SFX
    musicEnabled: true,   // musik latar
    _files: {},           // nama -> true (tersedia) / false
    _musicEl: null,
    _currentTrack: null,

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

    /* ---------- probe ketersediaan file ---------- */
    probeFiles: function () {
      const self = this;
      const all = Object.assign({}, MUSIC_FILES, SFX_FILES);
      Object.keys(all).forEach(function (name) {
        try {
          const a = new window.Audio();
          a.preload = 'metadata';
          a.addEventListener('loadedmetadata', function () { self._files[name] = true; });
          a.addEventListener('canplaythrough', function () { self._files[name] = true; });
          a.addEventListener('error', function () { self._files[name] = false; });
          self._files[name] = null;
          a.src = all[name];
          try { a.load(); } catch (e) {}
        } catch (e) { self._files[name] = false; }
      });
    },
    fileReady: function (name) { return this._files[name] === true; },
    filesDetected: function () {
      const names = Object.keys(this._files);
      return { ok: names.filter(n => this._files[n] === true).length, total: names.length, names: names.filter(n => this._files[n] === true) };
    },

    _playFile: function (name, vol, loop) {
      const url = (MUSIC_FILES[name] || SFX_FILES[name]);
      if (!url || typeof window === 'undefined') return false;
      try {
        // Jangan menunggu probeFiles(). Audio harus langsung dicoba saat
        // dipanggil dari klik/tap user; probe sebelumnya bersifat asynchronous.
        const el = new window.Audio();
        el.preload = 'auto';
        el.src = url;
        el.loop = !!loop;
        el.volume = vol != null ? vol : 0.5;
        el.addEventListener('canplaythrough', function () {
          this._files[name] = true;
        }.bind(this), { once: true });
        el.addEventListener('error', function () {
          this._files[name] = false;
        }.bind(this), { once: true });
        const p = el.play();
        if (p && p.catch) {
          p.catch(function () {
            // Autoplay policy dapat menolak play(); jangan buang element.
            // Panggilan berikutnya dari gesture user akan mencoba lagi.
          });
        }
        return el;
      } catch (e) {
        return null;
      }
    },

    /* ---------- musik latar ---------- */
    music: function (track) {
      if (!this.musicEnabled || typeof window === 'undefined') { this.musicStop(); return; }
      if (this._currentTrack === track && this._musicEl) return;
      this.musicStop();
      this._currentTrack = track;
      // Coba file secara langsung; jangan menunggu probe asynchronous.
      const el = this._playFile(track, 0.32, true);
      this._musicEl = el || { pause: function () {} }; // stub agar aman bila Audio tak tersedia
      if (!el) this._currentTrack = null;
    },
    musicStop: function () {
      if (this._musicEl) { try { this._musicEl.pause(); } catch (e) {} }
      this._musicEl = null;
      this._currentTrack = null;
    },

    /* ---------- satu nada sintesis ---------- */
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

    /* ---------- serangan khas tiap hero (sintesis) ---------- */
    _synthHeroAttack: function (heroId) {
      const c = this._ensure();
      if (!c) return;
      const T = this;
      switch (heroId) {
        case 'raka': // benturan perisai logam: dengung rendah + ping tinggi
          T.tone(c, 150, 0.14, 0, 'square', 0.16, 55);
          T.tone(c, 1150, 0.1, 0.02, 'triangle', 0.1, 900);
          break;
        case 'lyra': // bola api: siulan turun + ledakan sub-bass
          T.tone(c, 640, 0.22, 0, 'sawtooth', 0.13, 85);
          T.tone(c, 72, 0.26, 0.1, 'sine', 0.2, 48);
          break;
        case 'sena': // busur: dengung senar cepat + desir panah
          T.tone(c, 950, 0.05, 0, 'triangle', 0.13, 1500);
          T.tone(c, 2400, 0.09, 0.04, 'square', 0.05, 1200);
          break;
        case 'kage': // katana: dentingan tajam ganda
          T.tone(c, 1700, 0.05, 0, 'square', 0.1, 2300);
          T.tone(c, 2600, 0.16, 0.05, 'triangle', 0.12, 1900);
          break;
        case 'morru': // jiwa: dengung melayang dua-nada
          T.tone(c, 480, 0.3, 0, 'sine', 0.11, 320);
          T.tone(c, 466, 0.3, 0, 'sine', 0.1, 310);
          T.tone(c, 240, 0.34, 0.08, 'sine', 0.08, 160);
          break;
        default:
          T.tone(c, 320, 0.1, 0, 'square', 0.12, 90);
      }
    },
    heroAttack: function (heroId, crit) {
      if (!this.enabled) return;
      if (this.fileReady('atk-' + heroId)) {
        this._playFile('atk-' + heroId, 0.5, false);
      } else {
        this._synthHeroAttack(heroId);
      }
      if (crit) this.play('crit');
    },

    /* ---------- SFX umum: file bila ada, sintesis bila tidak ---------- */
    play: function (name) {
      if (!this.enabled) return;
      if ((name === 'victory' || name === 'defeat') && this.fileReady(name)) {
        this._playFile(name, 0.55, false);
        return;
      }
      const c = this._ensure();
      if (!c) return;
      const T = this;
      switch (name) {
        case 'click':   T.tone(c, 660, 0.06, 0, 'square', 0.08); break;
        case 'correct': T.tone(c, 523, 0.09, 0, 'sine', 0.16); T.tone(c, 784, 0.14, 0.08, 'sine', 0.16); break;
        case 'perfect': T.tone(c, 659, 0.07, 0, 'triangle', 0.18); T.tone(c, 880, 0.08, 0.06, 'triangle', 0.18); T.tone(c, 1175, 0.16, 0.12, 'triangle', 0.18); break;
        case 'wrong':   T.tone(c, 220, 0.18, 0, 'sawtooth', 0.12, 150); T.tone(c, 160, 0.24, 0.12, 'sawtooth', 0.1, 110); break;
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
  });
})();
