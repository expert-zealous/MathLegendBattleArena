/* ============================================================
   MATH LEGENDS: BATTLE ARENA — battle.js
   Battle Engine (turn simultan, event-driven, BEBAS DOM):
   - ronde berisi 1 soal untuk kedua pihak (adil);
   - pemain menjawab lewat playerAnswer(i); AI lewat jadwal waktu;
   - damage = fungsi(atk, kesulitan, grade kecepatan, combo, skill, crit);
   - adaptive difficulty naik/turun mengikuti performa;
   - comeback saat HP < 30% + soal sulit benar;
   - SATU interval timer per battle; destroy() membersihkan semuanya.
   Karena bebas DOM & deterministik terhadap jawaban, engine ini kelak
   bisa dijalankan di server untuk validasi anti-cheat / PvP online.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;
  const R = ML.Rules;

  ML.Battle = class extends ML.Emitter {
    /* cfg: { heroId, aiHeroId, aiLevelIdx, topicFocus|null, practice:boolean, playerName } */
    constructor(cfg) {
      super();
      this.cfg = cfg;
      const heroes = ML.DATA.heroes;
      const byId = {};
      heroes.forEach(function (h) { byId[h.id] = h; });
      this.p = this._fighter(byId[cfg.heroId] || heroes[0], true, cfg.playerGear);
      this.e = this._fighter(byId[cfg.aiHeroId] || heroes[U.ri(0, heroes.length - 1)], false, cfg.enemyGear);
      this.ai = new ML.AI(this.e.hero, ML.DATA.aiLevels[cfg.aiLevelIdx != null ? cfg.aiLevelIdx : 1]);
      this.round = 0;
      this.maxRounds = R.MAX_ROUNDS;
      this.finished = false;
      this.q = null;
      this.usedQ = new Set();
      this.mistakes = []; // soal yang dijawab salah pemain (untuk pembahasan)
      this.topicPool = cfg.topicFocus ? [cfg.topicFocus] : ML.QEngine.topics();
      this._interval = null;
      this._aiT = null;
      this._timers = [];
    }

    _fighter(hero, isPlayer, gear) {
      const g = gear || {};
      const hp = Math.round(hero.hp * (1 + (g.hpMul || 0)));
      return {
        hero: hero, isPlayer: isPlayer,
        gearCrit: g.critAdd || 0,
        hp: hp, maxHp: hp,
        atk: Math.round(hero.atk * (1 + (g.atkMul || 0))),
        def: hero.def + (g.defAdd || 0),
        energy: ML.Rules.START_ENERGY, combo: 0,
        shield: 0, comebackShield: false, comebackUsed: false,
        empowered: null, // skill "siap tempel": 'meteor' | 'shadow' | 'drain'
        diff: 2, fastRight: 0, missRow: 0,
        answered: false, answerTime: 0, plan: null,
        stats: {
          questions: 0, correct: 0, perfect: 0, weak: 0, wrong: 0,
          timeSum: 0, hardCorrect: 0, hardTotal: 0, maxCombo: 0, comeback: 0,
          dmgDealt: 0, dmgTaken: 0, perTopic: {}
        }
      };
    }

    /* ---------- siklus pertandingan ---------- */
    start() {
      this.emit('start', { p: this.p, e: this.e, cfg: this.cfg });
      this._next();
    }

    _next() {
      if (this.finished) return;
      this.round++;
      if (this.round > this.maxRounds) { this._finish(this._leader(), 'ROUNDS'); return; }

      const diff = U.clamp(this.p.diff, 1, 5);
      const topic = U.pick(this.topicPool);
      let q = null;
      try { q = ML.QEngine.make(topic, diff, this.usedQ); } catch (e) { q = null; }
      if (!q) { try { q = ML.QEngine.make('arit', 2, this.usedQ); } catch (e) { q = null; } }
      if (!q) { this._finish(this._leader(), 'ERROR'); return; }

      this.q = q;
      this.p.answered = false; this.e.answered = false;
      this.qStart = Date.now();
      this.qLimit = R.timeForDiff(q.difficulty); // waktu berpikir sesuai kesulitan
      // mode PvP: tanpa AI; beri waktu tenggang jaringan utk jawaban lawan
      const net = !!this.cfg.netMode;
      this.qEnd = this.qStart + (this.qLimit + (net ? 1.5 : 0)) * 1000;

      this.emit('question', {
        q: q, round: this.round, maxRounds: this.maxRounds,
        limit: this.qLimit,
        pEnergy: this.p.energy, eEnergy: this.e.energy
      });

      if (!net) {
        this.ai.comeback = this.e.hp / this.e.maxHp < 0.3;
        this.e.plan = this.ai.plan(q);
        this._aiMaybeSkill(); // AI memutuskan skill sebelum menjawab
        const self0 = this;
        this._aiT = setTimeout(function () { self0._resolveEnemy(false); }, this.e.plan.time * 1000);
        this._timers.push(this._aiT);
      }
      const self = this;
      this._interval = setInterval(function () { self._tick(); }, 100);
      this._tick();
    }

    /* ---------- PvP: jawaban dari jaringan (host yang menjalankan engine) ---------- */
    netAnswer(side, index, timeUsed) {
      if (this.finished || !this.q) return;
      const isP = side === 'p';
      const f = isP ? this.p : this.e;
      if (f.answered) return;
      f.answered = true;
      f.answerTime = U.clamp(timeUsed != null ? timeUsed : this.qLimit, 0, this.qLimit);
      const ok = index === this.q.answerIndex;
      this._applyResult(f, isP ? this.e : this.p, ok, f.answerTime, 'NET');
      if (this.p.answered && this.e.answered) this._endRound();
    }

    /* ---------- PvP: skill kedua sisi (dipanggil host) ---------- */
    useSkillSide(side, id) {
      if (this.finished) return false;
      if (side === 'p') return this.useSkill(id);
      const f = this.e, sk = f.hero.skill;
      if (id !== sk.id || f.energy < sk.cost) return false;
      if (sk.id === 'meteor' || sk.id === 'shadow' || sk.id === 'drain') {
        if (f.empowered) return false;
        f.empowered = sk.id; f.energy -= sk.cost;
        this.emit('skill', { side: 'e', id: sk.id, energy: f.energy });
        return true;
      }
      if (sk.id === 'shield') {
        if (f.shield > 0) return false;
        f.shield = 2; f.energy -= sk.cost;
        this.emit('skill', { side: 'e', id: 'shield', shield: 2, energy: f.energy });
        return true;
      }
      if (sk.id === 'rain') {
        f.energy -= sk.cost;
        this._skillAttack(f, this.p);
        this.emit('skill', { side: 'e', id: 'rain', energy: f.energy });
        if (this.p.hp <= 0) this._finish('e', 'KO');
        return true;
      }
      return false;
    }

    _tick() {
      if (this.finished) return;
      // otomatis jeda saat tab tersembunyi (fair untuk pemain)
      if (typeof document !== 'undefined' && document.hidden) { this.qEnd += 100; return; }
      const rem = (this.qEnd - Date.now()) / 1000;
      this.emit('timer', { left: Math.max(0, rem), total: this.qLimit });
      if (rem <= 0) this._timeout();
    }

    _timeout() {
      if (this.finished || !this.q) return;
      this._clearQ();
      if (!this.p.answered) {
        this.p.answered = true;
        this.p.answerTime = this.qLimit;
        this._applyResult(this.p, this.e, false, this.qLimit, 'TIME');
      }
      if (!this.e.answered) this._resolveEnemy(true);
      this._endRound();
    }

    _resolveEnemy(forceWrong) {
      if (this.finished || this.e.answered || !this.q) return;
      this.e.answered = true;
      const plan = this.e.plan || { correct: false, time: this.qLimit };
      const correct = !forceWrong && plan.correct;
      const t = correct ? Math.min(plan.time, this.qLimit - 0.1) : this.qLimit;
      this.e.answerTime = t;
      this._applyResult(this.e, this.p, correct, t, correct ? 'AI' : 'TIME');
      if (this.p.answered) this._endRound();
    }

    playerAnswer(i) {
      if (this.finished || this.p.answered || !this.q) return;
      this.p.answered = true;
      const used = Math.min((Date.now() - this.qStart) / 1000, this.qLimit);
      this.p.answerTime = used;
      const ok = i === this.q.answerIndex;
      this._applyResult(this.p, this.e, ok, used, ok ? 'P' : 'P');
      if (this.e.answered) this._endRound();
    }

    /* ---------- inti: hasil jawaban -> statistik + serangan ---------- */
    _applyResult(att, def, correct, timeUsed, source) {
      const q = this.q;
      const st = att.stats;
      st.questions++;
      const pt = st.perTopic[q.topic] || (st.perTopic[q.topic] = { c: 0, t: 0 });
      pt.t++;
      if (q.difficulty >= 3) st.hardTotal++;

      const grade = R.gradeOf(timeUsed, correct, this.qLimit);
      st.timeSum += Math.max(0, timeUsed);

      if (correct) {
        st.correct++; pt.c++;
        if (q.difficulty >= 3) st.hardCorrect++;
        if (grade === 'PERFECT') st.perfect++;
        if (grade === 'WEAK') st.weak++;
        att.combo++;
        st.maxCombo = Math.max(st.maxCombo, att.combo);
        let energyGain = 1 + (grade === 'PERFECT' ? 1 : 0);
        if (att.hero.id === 'sena' && grade === 'PERFECT') energyGain += 1; // pasif Archer
        if (att.hero.id === 'morru') att.hp = Math.min(att.maxHp, att.hp + 2); // pasif Necromancer
        att.energy = Math.min(R.MAX_ENERGY, att.energy + energyGain);
        this._attack(att, def, grade, q, source);
      } else {
        st.wrong++;
        att.combo = 0;
        if (att.empowered) att.empowered = null; // skill siap tempel hangus saat salah
        if (att.isPlayer) {
          this.mistakes.push({ text: q.text, answer: q.answer, explanation: q.explanation, topic: q.topic, difficulty: q.difficulty });
        }
      }

      this._adapt(att, grade);
      this.emit('answered', {
        side: att.isPlayer ? 'p' : 'e', correct: correct, grade: grade,
        timeUsed: Math.round(timeUsed * 10) / 10, answer: q.answer,
        explanation: q.explanation, combo: att.combo, energy: att.energy,
        hpP: this.p.hp, hpE: this.e.hp, source: source
      });

      if (def.hp <= 0) this._finish(att.isPlayer ? 'p' : 'e', 'KO');
    }

    _adapt(f, grade) {
      // 2 benar-cepat berturut -> naik; 2 salah berturut -> turun (tidak menghukum berlebihan)
      const fastT = (this.qLimit || 10) * 0.5;
      if (grade === 'PERFECT' || (grade === 'HIT' && f.answerTime <= fastT)) {
        f.fastRight++;
        if (f.fastRight >= 2) { f.diff = Math.min(5, f.diff + 1); f.fastRight = 0; }
      } else if (grade === 'MISS' || grade === 'WEAK') {
        f.fastRight = 0;
      }
      if (grade === 'MISS' || grade === 'TIME') {
        f.missRow++;
        if (f.missRow >= 2) { f.diff = Math.max(1, f.diff - 1); f.missRow = 0; }
      } else {
        f.missRow = 0;
      }
    }

    /* ---------- damage engine ---------- */
    _attack(att, def, grade, q, source) {
      const atkVal = att.atk != null ? att.atk : att.hero.atk;
      let dmg = atkVal * (1 + 0.12 * (q.difficulty - 1));
      const tags = [];
      if (grade === 'PERFECT') { dmg *= 1.3; tags.push('⚡ PERFECT'); }
      else if (grade === 'WEAK') { dmg *= 0.6; tags.push('💤 WEAK'); }

      const cm = R.comboMult(att.combo);
      if (cm > 1) { dmg *= cm; tags.push(R.comboLabel(att.combo)); }

      if (att.hero.id === 'sena' && grade === 'PERFECT') dmg *= 1.1; // pasif Archer

      // Comeback: HP < 30%, soal sulit, belum pernah dipakai
      let comeback = false;
      if (!att.comebackUsed && att.hp / att.maxHp < 0.3 && q.difficulty >= 3) {
        att.comebackUsed = true;
        att.comebackShield = true;
        comeback = true;
        att.stats.comeback++;
        dmg *= 1.25;
        tags.push('🔥 COMEBACK');
      }

      /* --- skill "siap tempel" (dikonsumsi saat jawaban benar) --- */
      let meteor = false, ignoreDef = false, drain = false;
      if (att.empowered === 'meteor') {           // LYRA
        meteor = true;
        dmg *= 2.4;
        tags.push('☄️ METEOR');
      } else if (att.empowered === 'shadow') {    // KAGE
        ignoreDef = true;
        dmg *= 1.2;
        tags.push('🥷 SHADOW STRIKE');
      } else if (att.empowered === 'drain') {     // MORRU
        drain = true;
        dmg *= 1.25;
        tags.push('👻 SOUL DRAIN');
      }
      att.empowered = null;

      // Critical: peluang terbatas, WEAK tidak bisa crit; SHADOW STRIKE dijamin crit
      let crit = false;
      let cc = 0.08;
      if (att.combo >= 5) cc += 0.10;
      if (q.difficulty >= 4 && grade === 'PERFECT') cc += 0.08;
      if (att.hero.id === 'lyra') cc += 0.12; // pasif Mage
      if (att.hero.id === 'kage') cc += 0.15; // pasif Ninja
      if (att.gearCrit) cc += att.gearCrit; // atribut toko
      if (ignoreDef) { crit = true; dmg *= 1.5; tags.push('💥 CRITICAL'); }
      else if (grade !== 'WEAK' && Math.random() < Math.min(cc, 0.55)) {
        crit = true;
        dmg *= 1.5;
        tags.push('💥 CRITICAL');
      }

      let final = Math.round(dmg);
      if (!ignoreDef) {
        const defVal = def.def != null ? def.def : def.hero.def;
        final -= defVal;
        if (def.hero.id === 'raka') final = Math.round(final * 0.85); // pasif Knight
        if (def.shield > 0) { final = Math.round(final * 0.4); def.shield--; }
        else if (def.comebackShield) { final = Math.round(final * 0.5); def.comebackShield = false; }
      }
      final = Math.max(1, final);

      def.hp = Math.max(0, def.hp - final);
      def.stats.dmgTaken += final;
      att.stats.dmgDealt += final;

      // SOUL DRAIN: 75% damage menjadi HP penyerang
      let heal = 0;
      if (drain && final > 0) {
        heal = Math.round(final * 0.75);
        const before = att.hp;
        att.hp = Math.min(att.maxHp, att.hp + heal);
        heal = att.hp - before;
      }

      this.emit('attack', {
        from: att.isPlayer ? 'p' : 'e', to: def.isPlayer ? 'p' : 'e',
        dmg: final, crit: crit, meteor: meteor, comeback: comeback,
        heal: heal, drain: drain,
        grade: grade, combo: att.combo, tags: tags,
        hpP: this.p.hp, hpE: this.e.hp, shield: def.shield
      });
    }

    /* ---------- skill ---------- */
    useSkill(id) {
      if (this.finished || !this.p) return false;
      const f = this.p, sk = f.hero.skill;
      if (id !== sk.id || f.energy < sk.cost) return false;
      if (sk.id === 'meteor' || sk.id === 'shadow' || sk.id === 'drain') {
        // skill "siap tempel": aktif pada jawaban benar berikutnya
        if (f.empowered) return false;
        f.empowered = sk.id; f.energy -= sk.cost;
        this.emit('skill', { side: 'p', id: sk.id, energy: f.energy });
        return true;
      }
      if (sk.id === 'shield') {
        if (f.shield > 0) return false;
        f.shield = 2; f.energy -= sk.cost;
        this.emit('skill', { side: 'p', id: 'shield', shield: 2, energy: f.energy });
        return true;
      }
      if (sk.id === 'rain') {
        f.energy -= sk.cost;
        this._skillAttack(f, this.e);
        this.emit('skill', { side: 'p', id: 'rain', energy: f.energy });
        if (this.e.hp <= 0) this._finish('p', 'KO');
        return true;
      }
      return false;
    }

    _skillAttack(att, def) { // Hujan Panah: menembus DEF
      let final = Math.max(1, Math.round((att.atk != null ? att.atk : att.hero.atk) * 1.3));
      if (def.shield > 0) { final = Math.round(final * 0.4); def.shield--; }
      else if (def.comebackShield) { final = Math.round(final * 0.5); def.comebackShield = false; }
      if (def.hero.id === 'raka') final = Math.round(final * 0.85);
      final = Math.max(1, final);
      def.hp = Math.max(0, def.hp - final);
      att.stats.dmgDealt += final; def.stats.dmgTaken += final;
      this.emit('attack', {
        from: att.isPlayer ? 'p' : 'e', to: def.isPlayer ? 'p' : 'e',
        dmg: final, crit: false, meteor: false, comeback: false,
        grade: 'SKILL', combo: att.combo, tags: ['🎯 HUJAN PANAH'],
        hpP: this.p.hp, hpE: this.e.hp, shield: def.shield
      });
    }

    _aiMaybeSkill() {
      const f = this.e, sk = f.hero.skill;
      const L = ML.DATA.aiLevels[this.cfg.aiLevelIdx != null ? this.cfg.aiLevelIdx : 1];
      if (f.energy < sk.cost) return;
      if (Math.random() > L.skillP) return;
      if (sk.id === 'shield') {
        if (f.shield <= 0) {
          f.shield = 2; f.energy -= sk.cost;
          this.emit('skill', { side: 'e', id: 'shield', shield: 2, energy: f.energy });
        }
      } else if (sk.id === 'meteor' || sk.id === 'shadow' || sk.id === 'drain') {
        const want = (sk.id === 'shadow' && f.combo >= 2) ||
                     (sk.id === 'drain' && f.hp / f.maxHp < 0.7) ||
                     (sk.id === 'meteor' && f.combo >= 3);
        if (!f.empowered && want) {
          f.empowered = sk.id; f.energy -= sk.cost;
          this.emit('skill', { side: 'e', id: sk.id, energy: f.energy });
        }
      } else if (sk.id === 'rain') {
        f.energy -= sk.cost;
        this._skillAttack(f, this.p);
        this.emit('skill', { side: 'e', id: 'rain', energy: f.energy });
        if (this.p.hp <= 0) this._finish('e', 'KO');
      }
    }

    /* ---------- akhir ronde / akhir match ---------- */
    _endRound() {
      if (this.finished) return;
      this._clearQ();
      const self = this;
      this._after(1300, function () { self._next(); });
    }

    _clearQ() {
      if (this._interval) { clearInterval(this._interval); this._interval = null; }
      if (this._aiT) { clearTimeout(this._aiT); this._aiT = null; }
    }

    _after(ms, fn) {
      const self = this;
      const id = setTimeout(function () {
        const i = self._timers.indexOf(id);
        if (i >= 0) self._timers.splice(i, 1);
        if (!self.finished) fn();
      }, ms);
      this._timers.push(id);
    }

    _leader() {
      const pp = this.p.hp / this.p.maxHp, ep = this.e.hp / this.e.maxHp;
      if (Math.abs(pp - ep) > 0.001) return pp > ep ? 'p' : 'e';
      const pa = this.p.stats.questions ? this.p.stats.correct / this.p.stats.questions : 0;
      const ea = this.e.stats.questions ? this.e.stats.correct / this.e.stats.questions : 0;
      if (Math.abs(pa - ea) > 0.001) return pa > ea ? 'p' : 'e';
      return null; // seri
    }

    _finish(winner, reason) {
      if (this.finished) return;
      this.finished = true;
      this._clearQ();
      this._timers.forEach(function (t) { clearTimeout(t); });
      this._timers = [];
      this.emit('end', this._result(winner, reason));
    }

    surrender() { if (!this.finished) this._finish('e', 'SURRENDER'); }

    // hasil dari sudut pandang sisi mana pun (dipakai PvP: host & guest)
    resultFor(side, winner, reason) {
      if (side !== 'e') return this._result(winner, reason);
      const w = winner === 'p' ? 'e' : winner === 'e' ? 'p' : null;
      const a = this.p, b = this.e;
      this.p = b; this.e = a; // tukar perspektif sesaat (sinkron, aman)
      let out = null;
      try { out = this._result(w, reason); } finally {
        const c = this.p; this.p = this.e; this.e = c;
      }
      out.playerName = this.cfg.oppName || '';
      out.oppName = this.cfg.playerName || '';
      out.hpP = this.p.hp; out.hpE = this.e.hp;
      return out;
    }

    // bebaskan semua sumber daya (dipanggil UI saat keluar battle)
    destroy() {
      this.finished = true;
      this._clearQ();
      this._timers.forEach(function (t) { clearTimeout(t); });
      this._timers = [];
      this.kill();
    }

    _result(winner, reason) {
      const st = this.p.stats;
      return {
        win: winner === 'p', draw: winner === null,
        reason: reason,
        ranked: !this.cfg.practice, practice: !!this.cfg.practice,
        aiLevelIdx: this.cfg.aiLevelIdx != null ? this.cfg.aiLevelIdx : 1,
        aiHero: this.e.hero.id, hero: this.p.hero.id,
        playerName: this.cfg.playerName || '',
        oppName: this.cfg.oppName || '',
        oppRating: this.cfg.oppRating != null ? this.cfg.oppRating : null,
        rounds: Math.min(this.round, this.maxRounds),
        questions: st.questions, correct: st.correct, perfect: st.perfect,
        weak: st.weak, wrong: st.wrong,
        accuracy: st.questions ? st.correct / st.questions : 0,
        avgTime: st.questions ? st.timeSum / st.questions : 0,
        maxCombo: st.maxCombo, hardCorrect: st.hardCorrect, hardTotal: st.hardTotal,
        comeback: st.comeback, dmgDealt: st.dmgDealt, dmgTaken: st.dmgTaken,
        perTopic: st.perTopic,
        hpP: this.p.hp, hpE: this.e.hp,
        finalDiff: this.p.diff,
        wrongList: this.mistakes.slice(0, 20)
      };
    }
  };
})();
