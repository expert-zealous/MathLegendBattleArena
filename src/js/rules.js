/* ============================================================
   MATH LEGENDS: BATTLE ARENA — rules.js
   Aturan numerik murni (bebas DOM): timer, grade, combo, damage,
   XP, level, rank, Elo Math Rating. Mudah diuji & dipindah ke server.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  ML.Rules = {
    /* ---------- Battle dasar ---------- */
    // Waktu berpikir per tingkat kesulitan (detik): mudah tetap 10s,
    // sedang & sulit makin lama agar ada waktu berpikir yang cukup.
    TIME_BY_DIFF: [0, 10, 14, 18, 23, 28],
    timeForDiff: function (d) {
      const i = U.clamp(Math.round(d) || 1, 1, 5);
      return this.TIME_BY_DIFF[i];
    },
    PERFECT_PCT: 0.3,  // benar ≤ 30% waktu = PERFECT (d1: 3.0s … d5: 8.4s)
    WEAK_PCT: 0.8,     // benar ≥ 80% waktu = WEAK HIT
    Q_TIME: 10,        // fallback (soal tanpa kesulitan)
    MAX_ROUNDS: 20,    // batas ronde; sisa HP menentukan pemenang
    MAX_ENERGY: 10,
    START_ENERGY: 2,
    LEVEL_HP_BONUS: 2, // +2 HP permanen setiap level akun,   // modal awal agar strategi skill terbuka lebih cepat

    DIFF_LABEL: ['', 'MUDAH', 'SEDANG', 'SULIT', 'MAHIR', 'LEGENDA'],
    DIFF_COLOR: ['', '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'],

    comboMult: function (c) { return [1, 1, 1.15, 1.25, 1.4, 1.6][Math.min(c, 5)]; },
    comboLabel: function (c) {
      if (c >= 5) return 'LEGENDARY ATTACK';
      if (c >= 4) return 'SUPER ATTACK';
      if (c >= 3) return 'COMBO x3';
      if (c >= 2) return 'COMBO x2';
      return '';
    },
    gradeOf: function (timeUsed, correct, limit) {
      if (!correct) return 'MISS';
      const L = limit || this.Q_TIME;
      if (timeUsed <= Math.round(L * this.PERFECT_PCT * 10) / 10) return 'PERFECT';
      if (timeUsed >= Math.round(L * this.WEAK_PCT * 10) / 10) return 'WEAK';
      return 'HIT';
    },
    gradeInfo: {
      PERFECT: { icon: '⚡', text: 'PERFECT', cls: 'perfect' },
      HIT:     { icon: '⚔️', text: 'HIT',     cls: 'hit' },
      WEAK:    { icon: '💤', text: 'WEAK HIT', cls: 'weak' },
      MISS:    { icon: '❌', text: 'MISS',    cls: 'miss' },
      TIME:    { icon: '⏰', text: "TIME'S UP", cls: 'miss' }
    },

    /* ---------- Level (perkembangan akun, dari XP kumulatif) ---------- */
    levelCost: function (l) { return 100 + (l - 1) * 40; },
    levelFromXP: function (xp) {
      let l = 1, rem = Math.max(0, xp | 0);
      while (rem >= this.levelCost(l) && l < 999) { rem -= this.levelCost(l); l++; }
      return { level: l, cur: rem, need: this.levelCost(l) };
    },

    /* ---------- Rank (kemampuan kompetitif, dari Rank Points) ---------- */
    rankFromRP: function (rp) {
      const D = ML.DATA.ranks;
      const per = ML.DATA.RP_PER_TIER || 100;
      const total = D.length * 5;
      const safe = U.clamp(Math.floor(Number(rp) || 0), 0, total * per - 1);
      const tier = Math.floor(safe / per);
      const index = Math.min(D.length - 1, Math.floor(tier / 5));
      const subIndex = tier % 5;
      const division = 5 - subIndex;
      const cur = safe % per;
      return { index: index, tier: tier, division: division, name: D[index].name + ' ' + division, majorName: D[index].name, icon: D[index].icon, color: D[index].color, cur: cur, need: per };
    },

    /* ---------- Math Rating (Elo) ---------- */
    elo: function (mr, oppRating, score, k) {
      if (k == null) k = 24;
      const e = 1 / (1 + Math.pow(10, (oppRating - mr) / 400));
      return Math.round(k * (score - e));
    },

    /* ---------- XP hasil match (transparan, dirinci) ---------- */
    xpForMatch: function (r) {
      const parts = [];
      const add = function (k, v) { parts.push({ k: k, v: v }); return v; };
      let xp = 0;
      xp += add(r.win ? 'Kemenangan 🏆' : 'Berpartisipasi', r.win ? 100 : 30);
      if (r.correct > 0) xp += add('Jawaban benar × ' + r.correct, r.correct * 6);
      if (r.perfect > 0) xp += add('PERFECT × ' + r.perfect, r.perfect * 5);
      if (r.hardCorrect > 0) xp += add('Soal sulit benar × ' + r.hardCorrect, r.hardCorrect * 10);
      if (r.maxCombo >= 5) xp += add('Combo x5+ 🔥', 30);
      else if (r.maxCombo >= 3) xp += add('Combo x3', 15);
      if (r.accuracy >= 0.9 && r.questions >= 10) xp += add('Akurasi tinggi', 25);
      if (r.practice) xp = Math.round(xp * 0.6); // mode latihan: 60%
      return { total: xp, parts: parts, scaled: !!r.practice };
    },

    /* ---------- Reward match (jelas & transparan, tanpa gambling) ---------- */
    rewardsForMatch: function (r) {
      // AI/latihan = XP + coin saja. Diamond dan RP hanya dari pertandingan Online.
      let coins = (r.win ? 35 : 15) + r.correct;
      let diamonds = 0;
      if (r.online && r.win) diamonds += 3;
      if (r.online && r.perfect >= 8) diamonds += 2;
      return { coins: coins, diamonds: diamonds };
    },

    /* ---------- Perubahan Rank Points: menang dihitung dari performa,
       bukan sekadar rajin bermain. Kalah tidak turun terlalu dalam. ---------- */
    rpDelta: function (r) {
      if (!r.online) return 0;
      const ai = ML.DATA.aiLevels[r.aiLevelIdx] || ML.DATA.aiLevels[1];
      if (r.win) {
        const f = 0.5 + r.accuracy * 0.5; // 0.5 .. 1.0
        return Math.max(1, Math.round(ai.rpWin * f));
      }
      if (r.draw) return 2;
      let d = ai.rpLose;
      if (r.accuracy >= 0.75) d += 2; // kalah tapi akurat: hukuman ringan
      return d;
    }
  };
})();
