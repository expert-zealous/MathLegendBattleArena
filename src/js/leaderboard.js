/* ============================================================
   MATH LEGENDS: BATTLE ARENA — leaderboard.js
   Leaderboard offline dari data lokal (bot statis + pemain).
   Arsitektur: satu fungsi data -> mudah diganti Firebase nanti.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  ML.Leaderboard = {
    // entri pemain sendiri (dipakai leaderboard lokal & penggabungan data online)
    meEntry: function () {
      return {
        name: ML.Player.data.name || 'KAMU',
        hero: ML.Player.data.hero,
        mr: ML.Player.data.mr,
        level: ML.Rules.levelFromXP(ML.Player.data.xp).level,
        me: true
      };
    },

    /* tab: 'global' | 'school' | 'friends' -> array terurut Math Rating */
    get: function (tab) {
      const D = ML.DATA;
      const bots = D.bots.filter(function (b) {
        if (tab === 'school') return b.school;
        if (tab === 'friends') return b.friend;
        return true;
      }).map(function (b) {
        return { name: b.name, hero: b.hero, mr: b.mr, level: b.level, me: false };
      });

      bots.push(ML.Leaderboard.meEntry());

      bots.sort(function (a, b) { return b.mr - a.mr; });
      return bots;
    }
  };
})();
