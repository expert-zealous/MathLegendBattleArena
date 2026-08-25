/* ============================================================
   MATH LEGENDS: BATTLE ARENA — core.js
   Utilitas dasar, storage aman (localStorage + fallback), event emitter.
   Tanpa dependensi DOM agar bisa diuji di Node.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = (ML.util = {});

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.ri = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.shuffled = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  U.gcd = function (a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  };
  U.frac = function (n, d) { // bentuk paling sederhana; integer -> "n"
    if (d < 0) { n = -n; d = -d; }
    const g = U.gcd(n, d);
    n = Math.round(n / g); d = Math.round(d / g);
    return d === 1 ? String(n) : n + '/' + d;
  };
  U.fmtIDR = function (n) { return 'Rp' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  U.round1 = function (n) { return Math.round(n * 10) / 10; };
  U.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  U.pct = function (a, b) { return b ? Math.round((a / b) * 100) : 0; };

  /* ---------- Storage: localStorage bila tersedia, jika tidak -> memori ----------
     (iframe sandbox / private mode bisa memblokir localStorage; jangan sampai crash) */
  const mem = {};
  let backend = undefined; // undefined = belum diprobe, null = fallback memori
  function be() {
    if (backend !== undefined) return backend;
    try {
      const k = '__ml_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      backend = localStorage;
    } catch (e) { backend = null; }
    return backend;
  }

  ML.Storage = {
    persistent: function () { return !!be(); },
    get: function (key, def) {
      try {
        const b = be();
        const raw = b ? b.getItem('ml_' + key) : mem[key];
        if (raw == null) return def;
        const v = JSON.parse(raw);
        return v === null || v === undefined ? def : v;
      } catch (e) { return def; }
    },
    set: function (key, val) {
      try {
        const raw = JSON.stringify(val);
        const b = be();
        if (b) b.setItem('ml_' + key, raw); else mem[key] = raw;
      } catch (e) { /* kuota penuh / diblokir: abaikan */ }
    },
    remove: function (key) {
      try {
        const b = be();
        if (b) b.removeItem('ml_' + key); else delete mem[key];
      } catch (e) {}
    },
    clearAll: function () {
      try {
        const b = be();
        if (b) {
          const kill = [];
          for (let i = 0; i < b.length; i++) { const k = b.key(i); if (k && k.indexOf('ml_') === 0) kill.push(k); }
          kill.forEach(function (k) { b.removeItem(k); });
        }
      } catch (e) {}
      Object.keys(mem).forEach(function (k) { delete mem[k]; });
    }
  };

  /* ---------- Event emitter kecil (dipakai Battle Engine; mudah dilepas = bebas memory leak) ---------- */
  ML.Emitter = class {
    constructor() { this._subs = {}; this._dead = false; }
    on(ev, fn) {
      if (this._dead) return function () {};
      (this._subs[ev] = this._subs[ev] || []).push(fn);
      const self = this;
      return function off() {
        const a = self._subs[ev];
        if (!a) return;
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      };
    }
    emit(ev, data) {
      if (this._dead) return;
      const a = this._subs[ev];
      if (!a) return;
      for (let i = 0; i < a.length; i++) {
        try { a[i](data); }
        catch (e) { if (G.console) console.error('[ML][' + ev + ']', e); }
      }
    }
    kill() { this._dead = true; this._subs = {}; }
  };
})();
