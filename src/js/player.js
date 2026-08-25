/* ============================================================
   MATH LEGENDS: BATTLE ARENA — player.js
   Profil pemain + persistence (localStorage, siap diganti Firebase
   karena semua akses lewat ML.Storage).
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  const DEFAULTS = function () {
    return {
      v: 1,
      name: '',
      hero: 'raka',
      xp: 0, coins: 0, diamonds: 0,
      rp: 0, mr: 1000,
      created: Date.now(),
      stats: {
        matches: 0, wins: 0, losses: 0, draws: 0,
        totalQuestions: 0, totalCorrect: 0, totalPerfect: 0,
        hardCorrect: 0, bestCombo: 0, comebacks: 0
      },
      perTopic: {},          // lifetime { topic: {c,t} }
      achievements: {},      // id -> {d:timestamp}
      missions: { date: '', items: {} },
      settings: { sound: true }
    };
  };

  function deepMerge(base, extra) {
    // nilai tersimpan menimpa default; objek digabung rekursif
    for (const k in extra) {
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        deepMerge(base[k], extra[k]);
      } else {
        base[k] = extra[k];
      }
    }
    return base;
  }

  ML.Player = {
    data: null,

    load: function () {
      const saved = ML.Storage.get('profile', {});
      this.data = deepMerge(DEFAULTS(), saved);
      this.ensureMissions();
    },
    // terima profil dari cloud (mis. login di perangkat lain) — ambil yang paling maju
    loadFrom: function (remote) {
      if (!remote || typeof remote !== 'object') return false;
      const merged = deepMerge(DEFAULTS(), remote);
      if ((merged.xp | 0) < (this.data.xp | 0)) return false; // lokal lebih maju -> abaikan
      this.data = merged;
      this.ensureMissions();
      this.save();
      return true;
    },
    save: function () { ML.Storage.set('profile', this.data); },

    today: function () {
      const d = new Date();
      return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
    },

    ensureMissions: function () {
      const m = this.data.missions, t = this.today();
      if (m.date !== t) { m.date = t; m.items = {}; }
      ML.DATA.missions.forEach(function (mi) {
        if (!m.items[mi.id]) m.items[mi.id] = { p: 0, done: false };
      });
    },

    heroDef: function () {
      const id = this.data.hero;
      return ML.DATA.heroes.find(function (h) { return h.id === id; }) || ML.DATA.heroes[0];
    },

    /* Terapkan hasil match: XP, reward, RP, Math Rating, statistik,
       progres misi harian, dan achievement. Mengembalikan ringkasan untuk UI. */
    applyMatchResult: function (res) {
      const pf = this.data;
      const R = ML.Rules, D = ML.DATA;
      this.ensureMissions();

      const before = { level: R.levelFromXP(pf.xp).level, rank: R.rankFromRP(pf.rp) };

      const xpCalc = R.xpForMatch(res);
      const rew = R.rewardsForMatch(res);
      const rpD = R.rpDelta(res);
      let mrD = 0;
      if (!res.practice) {
        // PvP: rating lawan sungguhan; vs AI: rating dari level AI
        const oppRating = res.oppRating != null ? res.oppRating : D.aiLevels[res.aiLevelIdx].rating;
        mrD = R.elo(pf.mr, oppRating, res.win ? 1 : (res.draw ? 0.5 : 0));
      }

      pf.xp += xpCalc.total;
      pf.coins += rew.coins;
      pf.diamonds += rew.diamonds;
      if (!res.practice) {
        pf.rp = U.clamp(pf.rp + rpD, 0, D.RP_MAX);
        pf.mr = Math.max(100, pf.mr + mrD);
      }

      const st = pf.stats;
      st.matches++;
      if (res.win) st.wins++; else if (res.draw) st.draws++; else st.losses++;
      st.totalQuestions += res.questions;
      st.totalCorrect += res.correct;
      st.totalPerfect += res.perfect;
      st.hardCorrect += res.hardCorrect;
      st.bestCombo = Math.max(st.bestCombo, res.maxCombo);
      st.comebacks += res.comeback;
      for (const t in res.perTopic) {
        const pt = pf.perTopic[t] || (pf.perTopic[t] = { c: 0, t: 0 });
        pt.c += res.perTopic[t].c;
        pt.t += res.perTopic[t].t;
      }

      /* --- misi harian --- */
      const doneMissions = [];
      D.missions.forEach(function (mi) {
        const it = pf.missions.items[mi.id];
        if (!it || it.done) return;
        let v = null;
        switch (mi.type) {
          case 'answers': v = res.questions; break;
          case 'wins': v = res.win ? 1 : 0; break;
          case 'topic': v = (res.perTopic[mi.topic] || { c: 0 }).c; break;
          case 'streak': v = res.maxCombo; break;
          case 'perfects': v = res.perfect; break;
        }
        if (v == null) return;
        if (mi.type === 'streak' || mi.type === 'perfects') it.p = Math.max(it.p, v);
        else it.p += v;
        if (it.p >= mi.goal) {
          it.p = mi.goal; it.done = true;
          pf.xp += mi.xp; pf.coins += mi.coin;
          doneMissions.push(mi);
        }
      });

      /* --- achievement --- */
      const newAch = [];
      D.achievements.forEach(function (a) {
        if (pf.achievements[a.id]) return;
        let ok = false;
        try { ok = !!a.test(pf, res); } catch (e) { ok = false; }
        if (ok) { pf.achievements[a.id] = { d: Date.now() }; newAch.push(a); }
      });

      const after = { level: R.levelFromXP(pf.xp).level, rank: R.rankFromRP(pf.rp) };
      this.save();

      return {
        xpParts: xpCalc.parts, xpTotal: xpCalc.total, xpScaled: xpCalc.scaled,
        coins: rew.coins, diamonds: rew.diamonds,
        rpDelta: res.practice ? 0 : rpD,
        mrDelta: mrD,
        levelUp: after.level > before.level,
        level: before.level, newLevel: after.level,
        rankUp: after.rank.index > before.rank.index,
        rankBefore: before.rank, rankAfter: after.rank,
        missions: doneMissions, achievements: newAch
      };
    },

    reset: function () {
      ML.Storage.clearAll();
      this.data = DEFAULTS();
      this.save();
    }
  };
})();
