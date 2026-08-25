/* ============================================================
   MATH LEGENDS: BATTLE ARENA — ai.js
   Lawan AI: akurasi & kecepatan bergantung level, dipengaruhi kesulitan
   soal dan comeback. Memiliki sedikit variasi supaya tidak terasa curang.
   AI tidak "melihat" jawaban; ia hanya memenangkan probabilitas.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  ML.AI = class {
    constructor(heroDef, levelDef) {
      this.hero = heroDef;
      this.level = levelDef;
      this.comeback = false; // di-set battle engine saat HP AI rendah
    }

    // Rencana jawaban untuk satu soal: { correct, time (detik) }
    plan(q) {
      let acc = this.level.acc - 0.05 * (q.difficulty - 3); // soal sulit -> sedikit lebih sering salah
      acc = U.clamp(acc, 0.15, 0.95);
      if (this.comeback) acc = Math.min(0.95, acc + 0.08); // AI juga bisa bangkit
      const correct = Math.random() < acc;
      // Waktu berpikir ikut membesar pada soal sulit, tapi selalu di bawah batas soal
      const cap = Math.max(1.2, ML.Rules.timeForDiff(q.difficulty) - 1.5);
      let t = this.level.tmin + (this.level.tmax - this.level.tmin) * Math.pow(Math.random(), 1.25);
      t = t * (1 + 0.3 * (q.difficulty - 1)); // soal sulit: AI juga "berpikir" lebih lama
      t = Math.min(t, cap);
      return { correct: correct, time: Math.round(Math.max(0.8, t) * 10) / 10 };
    }
  };
})();
