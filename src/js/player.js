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
      rp: 0, mr: 1000, rankSchema: 2,
      created: Date.now(),
      stats: {
        matches: 0, wins: 0, losses: 0, draws: 0,
        totalQuestions: 0, totalCorrect: 0, totalPerfect: 0,
        hardCorrect: 0, bestCombo: 0, comebacks: 0
      },
      perTopic: {},          // lifetime { topic: {c,t} }
      gear: {},              // legacy; dipertahankan untuk migrasi
      gearByHero: {},       // atribut terpisah per hero: { heroId: { itemId: level } }
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
      // Migrasi rank lama (0..799) ke sistem 5 divisi per rank tanpa menghilangkan progres.
      if (this.data.rankSchema !== 2) {
        const oldRp = Math.max(0, Number(this.data.rp) || 0);
        this.data.rp = Math.min(ML.DATA.ranks.length * 5 * (ML.DATA.RP_PER_TIER || 100) - 1, oldRp * 5);
        this.data.rankSchema = 2;
      }
      // Migrasi atribut global lama -> hanya hero yang sedang dipakai, sehingga progres lama tidak hilang.
      if (!this.data.gearByHero || typeof this.data.gearByHero !== 'object') this.data.gearByHero = {};
      const legacy = this.data.gear && typeof this.data.gear === 'object' ? this.data.gear : {};
      const hid = this.data.hero || 'raka';
      if (Object.keys(legacy).length && !Object.keys(this.data.gearByHero).length) {
        this.data.gearByHero[hid] = deepMerge({}, legacy);
      }
      this.data.gear = {};
      this.ensureMissions();
      this.save();
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

    /* ---------- atribut toko ---------- */
    _gearMap: function (heroId) {
      const hid = heroId || this.data.hero || 'raka';
      if (!this.data.gearByHero || typeof this.data.gearByHero !== 'object') this.data.gearByHero = {};
      if (!this.data.gearByHero[hid] || typeof this.data.gearByHero[hid] !== 'object') this.data.gearByHero[hid] = {};
      return this.data.gearByHero[hid];
    },
    gearLevel: function (id, heroId) { return this._gearMap(heroId)[id] || 0; },
    computeGear: function (heroId) {
      const out = { hpMul: 0, atkMul: 0, critAdd: 0, defAdd: 0 };
      const map = this._gearMap(heroId);
      ML.DATA.gear.forEach(function (it) {
        const lv = map[it.id] || 0;
        if (lv <= 0) return;
        const total = it.per * lv;
        if (it.stat === 'hp') out.hpMul += total;
        else if (it.stat === 'atk') out.atkMul += total;
        else if (it.stat === 'crit') out.critAdd += total;
        else if (it.stat === 'def') out.defAdd += total;
      });
      return out;
    },
    nextGearCost: function (id, heroId) {
      const it = ML.DATA.gear.find(function (x) { return x.id === id; });
      const lv = this.gearLevel(id, heroId);
      if (!it || lv >= it.max) return null;
      return it.costs[lv];
    },
    buyGear: function (id, heroId) {
      const cost = this.nextGearCost(id, heroId);
      if (!cost) return { ok: false, msg: 'Sudah level maksimal' };
      if (cost.coin && this.data.coins < cost.coin) return { ok: false, msg: 'Koin belum cukup' };
      if (cost.gem && this.data.diamonds < cost.gem) return { ok: false, msg: 'Diamond belum cukup' };
      if (cost.coin) this.data.coins -= cost.coin;
      if (cost.gem) this.data.diamonds -= cost.gem;
      const map = this._gearMap(heroId);
      map[id] = this.gearLevel(id, heroId) + 1;
      this.save();
      return { ok: true, msg: 'Atribut ' + String(heroId || this.data.hero).toUpperCase() + ' naik level!' };
    },
    levelHpBonus: function (heroId) {
      const lv = ML.Rules.levelFromXP(this.data.xp).level;
      return Math.max(0, (lv - 1) * ML.Rules.LEVEL_HP_BONUS);
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
      if (res.online) {
        // Hanya PvP Online yang memengaruhi Rank/Math Rating
        const oppRating = res.oppRating != null ? res.oppRating : D.aiLevels[res.aiLevelIdx].rating;
        mrD = R.elo(pf.mr, oppRating, res.win ? 1 : (res.draw ? 0.5 : 0));
      }

      const lvBonus = (before.level - 1) * 2; // makin tinggi level, makin banyak koin
      rew.coins += lvBonus;
      pf.xp += xpCalc.total;
      pf.coins += rew.coins;
      pf.diamonds += rew.diamonds;
      if (res.online) {
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
        coins: rew.coins, diamonds: rew.diamonds, levelBonus: lvBonus,
        rpDelta: res.online ? rpD : 0,
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
