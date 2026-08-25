/* ============================================================
   MATH LEGENDS: BATTLE ARENA — pvp.js  (v0.6: ONLINE 1v1)
   Arsitektur "host otomatis" di atas Firestore:
   - MATCHMAKING: koleksi `matchmaking` (1 dok/pemain). Transaksi
     atomik memasangkan pemain; pencipta antrean = HOST, penggabung = GUEST.
   - HOST menjalankan Battle engine (netMode) dan menyiarkan
     soal + frame peristiwa (serangan/skill/HP) ke dokumen `rooms/{hostUid}`.
   - GUEST tipis: menerima soal, mengirim pilihan jawaban + waktu,
     dan memutar ulang frame sehingga UI battle sama persis dipakai
     (NetBattle meng-emit event yang sama seperti ML.Battle).
   - Deteksi putus: detak (heartbeat) tiap 5 detik; >20 detik diam = batal.
   Catatan anti-cheat: MVP ini memercayai host & laporan waktu client
   (validasi penuh memerlukan Cloud Functions — lihat README-FIREBASE.md).
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  const HB_MS = 5000;      // interval heartbeat
  const HB_STALE = 20000;  // dianggap putus

  /* ================= MATCHMAKING ================= */
  const PVP = (ML.PVP = {
    /* fb: {fs, db, uid}; me: {name, hero, mr}; onFound({role, roomId, opp}); onFail(err) */
    findMatch: function (fb, me, onFound, onFail) {
      const fs = fb.fs, db = fb.db, uid = fb.uid;
      let done = false, unsubDoc = null, timer = null;
      const finish = function (v) {
        if (done) return; done = true;
        if (timer) clearTimeout(timer);
        if (unsubDoc) { try { unsubDoc(); } catch (e) {} }
        if (v) onFound(v); else onFail && onFail('cancel');
      };
      function cleanupMyDoc() {
        try {
          fs.deleteDoc(fs.doc(db, 'matchmaking', uid)).catch(function () {});
        } catch (e) {}
      }

      // batalkan otomatis bila 90 detik tak terpasangkan
      timer = setTimeout(function () { if (!done) { cleanupMyDoc(); finish(null); onFail && onFail('timeout'); } }, 90000);

      const join = async function () {
        for (let attempt = 0; attempt < 8; attempt++) {
          try {
            const res = await fs.runTransaction(db, async function (tx) {
              const q = fs.query(
                fs.collection(db, 'matchmaking'),
                fs.where('matched', '==', false),
                fs.orderBy('createdAt', 'asc'),
                fs.limit(6)
              );
              const snap = await fs.getDocs(q);
              let cand = null;
              snap.forEach(function (d) {
                if (!cand && d.id !== uid && !d.data().matched) cand = { id: d.id, ref: d.ref, data: d.data() };
              });
              if (cand) {
                // aku GUEST: kunci dokumen host agar tak diperebutkan
                tx.update(cand.ref, {
                  matched: true, opponent: uid,
                  oppName: me.name, oppHero: me.hero, oppMr: me.mr || 1000
                });
                return { role: 'guest', hostUid: cand.id, host: cand.data };
              }
              // tak ada lawan: aku HOST, masuk antrean
              tx.set(fs.doc(db, 'matchmaking', uid), {
                uid: uid, name: me.name, hero: me.hero, mr: me.mr || 1000,
                matched: false, opponent: null,
                createdAt: fs.serverTimestamp()
              });
              return { role: 'host' };
            });
            return res;
          } catch (e) {
            if (attempt === 7) throw e;
            await new Promise(function (r) { setTimeout(r, 250 + Math.random() * 350); });
          }
        }
        throw new Error('matchmaking retry habis');
      };

      join().then(function (r) {
        if (done) { cleanupMyDoc(); return; }
        if (r.role === 'guest') {
          // tunggu host membuat ruangan (id ruangan = uid host)
          const roomId = r.hostUid;
          const wait = setInterval(function () {
            if (done) { clearInterval(wait); return; }
            fs.getDoc(fs.doc(db, 'rooms', roomId)).then(function (snap) {
              const d = snap.exists() ? snap.data() : null;
              if (d && d.status === 'playing' && d.guest === uid) {
                clearInterval(wait);
                fs.deleteDoc(fs.doc(db, 'matchmaking', uid)).catch(function () {});
                finish({
                  role: 'guest', roomId: roomId,
                  opp: { uid: r.hostUid, name: r.host.name, hero: r.host.hero, mr: r.host.mr || 1000 }
                });
              }
            }).catch(function () {});
          }, 700);
          // ikat pembersihan
          const oldFinish = finish;
          // (unsub via done-flag pada interval)
        } else {
          // HOST: pantau dokumen antreanku sampai ada yang mengunci
          unsubDoc = fs.onSnapshot(fs.doc(db, 'matchmaking', uid), function (snap) {
            const d = snap.exists() ? snap.data() : null;
            if (done || !d || !d.matched) return;
            const roomId = uid;
            fs.setDoc(fs.doc(db, 'rooms', roomId), {
              status: 'playing', host: uid, guest: d.opponent,
              names: { host: me.name, guest: d.oppName },
              heroes: { host: me.hero, guest: d.oppHero },
              round: 0, q: null, ans: null, skillReq: false, surrender: false,
              seq: 0, frame: null, winner: null, result: null,
              hostAlive: Date.now(), guestAlive: Date.now(),
              updatedAt: fs.serverTimestamp()
            }).then(function () {
              fs.deleteDoc(fs.doc(db, 'matchmaking', uid)).catch(function () {});
              finish({
                role: 'host', roomId: roomId,
                opp: { uid: d.opponent, name: d.oppName, hero: d.oppHero, mr: d.oppMr || 1000 }
              });
            }).catch(function (e) { if (!done) { cleanupMyDoc(); finish(null); onFail && onFail(String(e && e.message)); } });
          }, function () {});
        }
      }).catch(function (e) {
        if (!done) {
          if (timer) clearTimeout(timer);
          if (unsubDoc) { try { unsubDoc(); } catch (ex) {} }
          done = true;
          cleanupMyDoc();
          onFail && onFail(String((e && e.code) || (e && e.message) || e));
        }
      });

      return { cancel: function () { cleanupMyDoc(); finish(null); } };
    }
  });

  /* ================= NET BATTLE ================= */
  const NetBattle = (ML.NetBattle = class extends ML.Emitter {
    /* cfg: { fb, role:'host'|'guest', roomId, myHeroId, myName, opp:{uid,name,hero,mr} } */
    constructor(cfg) {
      super();
      this.cfgPvp = cfg;
      this.fb = cfg.fb;
      this.role = cfg.role;
      this.roomRef = cfg.fb.fs.doc(cfg.fb.db, 'rooms', cfg.roomId);
      this.finished = false;
      this._offs = [];
      this._hb = null;
      this._unsubRoom = null;
      this._lastQRound = 0;
      this._lastSeq = 0;
      this._answeredLocal = false;
      this._qRecvAt = 0;
      this._timerIv = null;
      this._pendingEvts = [];
      this._flushT = null;
      this._processedAnsRound = -1;
      this._skillReqSent = false;
      this._mySide = cfg.role === 'host' ? 'p' : 'e'; // sisi engine (host selalu 'p')

      if (cfg.role === 'host') this._initHost();
      else this._initGuest();
    }

    _heroDef(id) {
      return ML.DATA.heroes.find(function (h) { return h.id === id; }) || ML.DATA.heroes[0];
    }

    /* ---------- HOST: engine sungguhan + siaran ---------- */
    _initHost() {
      const cfg = this.cfgPvp;
      const battle = new ML.Battle({
        heroId: cfg.myHeroId,
        aiHeroId: cfg.opp.hero,
        aiLevelIdx: 2, // padanan RP utk PvP
        netMode: true, practice: false,
        playerName: cfg.myName, oppName: cfg.opp.name,
        oppRating: cfg.opp.mr || 1000
      });
      this.battle = battle;
      this.p = battle.p; this.e = battle.e;
      this.cfg = battle.cfg;
      this.q = null;
      // UI membaca nama lawan dari sini
      this.ai = { level: { bot: cfg.opp.name } };

      const self = this;
      const fwd = ['start', 'question', 'timer', 'answered', 'attack', 'skill'];
      fwd.forEach(function (name) {
        self._offs.push(battle.on(name, function (d) { self.emit(name, d); }));
      });

      // siarkan soal
      self._offs.push(battle.on('question', function (d) {
        self.q = d.q;
        const q = d.q;
        self._write({ round: d.round, q: {
          round: d.round, text: q.text, choices: q.choices,
          topic: q.topic, difficulty: q.difficulty, limit: d.limit, answerIndex: q.answerIndex
        }, ans: null, skillReq: false });
      }));
      // siarkan peristiwa sebagai frame
      ['answered', 'attack', 'skill'].forEach(function (name) {
        self._offs.push(battle.on(name, function (d) {
          self._pendingEvts.push({ n: name, d: JSON.parse(JSON.stringify(d)) });
          self._scheduleFlush();
        }));
      });
      // akhir pertandingan
      self._offs.push(battle.on('end', function (res) {
        self.finished = true;
        self._flushNow();
        self._write({
          status: 'done', winner: res.win ? 'host' : (res.draw ? null : 'guest'),
          result: {
            hostRes: JSON.parse(JSON.stringify(res)),
            guestRes: JSON.parse(JSON.stringify(battle.resultFor('e', res.win ? 'p' : (res.draw ? null : 'e'), res.reason)))
          }
        });
      }));

      // terima: jawaban guest, permintaan skill, menyerah, detak
      this._unsubRoom = this.fb.fs.onSnapshot(this.roomRef, function (snap) {
        if (!snap.exists()) return;
        const d = snap.data();
        self._watchStale('guestAlive', d);
        if (d.surrender && !battle.finished) battle._finish('p', 'SURRENDER');
        if (d.ans && d.ans.by === 'guest' && d.ans.round !== self._processedAnsRound) {
          self._processedAnsRound = d.ans.round;
          battle.netAnswer('e', d.ans.choice, d.ans.timeUsed);
        }
        if (d.skillReq && !self._skillHandled) {
          self._skillHandled = true;
          battle.useSkillSide('e', battle.e.hero.skill.id);
          self._write({ skillReq: false });
        }
        if (d.skillReq === false) self._skillHandled = false;
      });

      this._hb = setInterval(function () {
        self._write({ hostAlive: Date.now() });
      }, HB_MS);
    }

    /* ---------- GUEST: cermin dari frame host ---------- */
    _initGuest() {
      const cfg = this.cfgPvp;
      const myHero = this._heroDef(cfg.myHeroId);
      const oppHero = this._heroDef(cfg.opp.hero);
      const mk = function (hero, isPlayer) {
        return {
          hero: hero, isPlayer: isPlayer,
          hp: hero.hp, maxHp: hero.hp, energy: ML.Rules.START_ENERGY, combo: 0,
          shield: 0, empowered: null, comebackShield: false, answered: false,
          stats: { questions: 0, correct: 0, maxCombo: 0, perTopic: {} }
        };
      };
      this.p = mk(myHero, true);   // aku
      this.e = mk(oppHero, false); // lawan (host)
      this.cfg = { playerName: cfg.myName };
      this.ai = { level: { bot: cfg.opp.name } };
      this.q = null;
      this.maxRounds = ML.Rules.MAX_ROUNDS;

      const self = this;
      this._unsubRoom = this.fb.fs.onSnapshot(this.roomRef, function (snap) {
        if (!snap.exists()) return;
        const d = snap.data();
        self._watchStale('hostAlive', d);

        if (d.surrender && !self.finished) {
          // host menyerah: hasil akan datang via result
        }
        if (d.q && d.q.round > self._lastQRound) {
          self._lastQRound = d.q.round;
          self.q = {
            text: d.q.text, choices: d.q.choices, answerIndex: d.q.answerIndex,
            topic: d.q.topic, difficulty: d.q.difficulty, explanation: '', answer: String(d.q.choices[d.q.answerIndex])
          };
          self._answeredLocal = false;
          self._skillReqSent = false;
          self._qRecvAt = Date.now();
          if (self._timerIv) clearInterval(self._timerIv);
          const total = d.q.limit || 10;
          self._timerIv = setInterval(function () {
            const left = Math.max(0, total - (Date.now() - self._qRecvAt) / 1000);
            self.emit('timer', { left: left, total: total });
            if (left <= 0 && self._timerIv) { clearInterval(self._timerIv); self._timerIv = null; }
          }, 100);
          self.emit('question', {
            q: self.q, round: d.q.round, maxRounds: self.maxRounds, limit: total,
            pEnergy: self.p.energy, eEnergy: self.e.energy
          });
        }

        if (d.frame && d.frame.seq > self._lastSeq) {
          self._lastSeq = d.frame.seq;
          // perbarui cermin (frame host: p=host, e=guest)
          self.e.hp = d.frame.hpP; self.e.energy = d.frame.enP; self.e.combo = d.frame.cbP; self.e.shield = d.frame.shP;
          self.p.hp = d.frame.hpE; self.p.energy = d.frame.enE; self.p.combo = d.frame.cbE; self.p.shield = d.frame.shE;
          self.p.empowered = d.frame.empE || null;
          // putar ulang peristiwa dengan sisi DIBALIK (host->e, guest->p)
          (d.frame.evts || []).forEach(function (ev) {
            const dd = remapSides(ev.d);
            if (ev.n === 'answered' && dd.side === 'p' && self._answeredLocal) return; // lokal sudah tampil
            self.emit(ev.n, dd);
          });
        }

        if (d.status === 'done' && d.result && !self.finished) {
          self.finished = true;
          if (self._timerIv) { clearInterval(self._timerIv); self._timerIv = null; }
          const res = d.result.guestRes;
          self.emit('end', Object.assign({}, res, { oppRating: (cfg.opp.mr || 1000) }));
        } else if (d.status === 'aborted' && !self.finished) {
          self.finished = true;
          self.emit('aborted', {});
        }
      });

      this._hb = setInterval(function () {
        self._write({ guestAlive: Date.now() });
      }, HB_MS);
    }

    /* ---------- API seperti Battle (dipakai UI/main) ---------- */
    start() {
      if (this.role === 'host') {
        this.emit('start', { p: this.p, e: this.e, cfg: this.cfg });
        this.battle.start();
      } else {
        this.emit('start', { p: this.p, e: this.e, cfg: this.cfg });
      }
    }
    playerAnswer(i) {
      if (this.finished || this._answeredLocal || !this.q) return;
      if (this.role === 'host') {
        this._answeredLocal = true;
        this.battle.playerAnswer(i);
        return;
      }
      // guest: catat waktu lokal, kirim
      this._answeredLocal = true;
      const timeUsed = Math.max(0.1, (Date.now() - this._qRecvAt) / 1000);
      const ok = i === this.q.answerIndex;
      const grade = ML.Rules.gradeOf(timeUsed, ok, this.q.limit || 10);
      // umpan balik lokal cepat utk sisi sendiri
      this.emit('answered', {
        side: 'p', correct: ok, grade: grade,
        timeUsed: Math.round(timeUsed * 10) / 10,
        answer: String(this.q.choices[this.q.answerIndex]), explanation: '',
        combo: 0, energy: this.p.energy, source: 'NET',
        hpP: this.p.hp, hpE: this.e.hp
      });
      if (this._timerIv) { clearInterval(this._timerIv); this._timerIv = null; }
      this._write({ ans: { by: 'guest', round: this._lastQRound, choice: i, timeUsed: Math.round(timeUsed * 10) / 10 } });
    }
    useSkill(id) {
      if (this.finished) return false;
      if (this.role === 'host') return this.battle.useSkill(id);
      if (this._skillReqSent) return false;
      this._skillReqSent = true;
      this._write({ skillReq: true });
      return true;
    }
    surrender() {
      if (this.finished) return;
      if (this.role === 'host') { this.battle.surrender(); }
      else { this._write({ surrender: true }); setTimeout(() => this._abortLocal(), 4000); }
    }
    _abortLocal() {
      if (this.finished) return;
      this.finished = true;
      this.emit('aborted', {});
    }
    destroy() {
      this.finished = true;
      this._offs.forEach(function (o) { try { o(); } catch (e) {} });
      this._offs = [];
      if (this._hb) { clearInterval(this._hb); this._hb = null; }
      if (this._timerIv) { clearInterval(this._timerIv); this._timerIv = null; }
      if (this._flushT) { clearTimeout(this._flushT); this._flushT = null; }
      if (this._unsubRoom) { try { this._unsubRoom(); } catch (e) {} }
      if (this.battle) this.battle.destroy();
      this.kill();
    }

    /* ---------- util ---------- */
    _write(patch) {
      const fs = this.fb.fs;
      try { fs.setDoc(this.roomRef, patch, { merge: true }).catch(function () {}); } catch (e) {}
    }
    _scheduleFlush() {
      const self = this;
      if (self._flushT) return;
      self._flushT = setTimeout(function () { self._flushT = null; self._flushNow(); }, 220);
    }
    _flushNow() {
      if (!this._pendingEvts.length) return;
      const evts = this._pendingEvts;
      this._pendingEvts = [];
      const b = this.battle;
      this._write({
        seq: Date.now(),
        frame: {
          seq: Date.now(),
          evts: evts,
          hpP: b.p.hp, hpE: b.e.hp,
          enP: b.p.energy, enE: b.e.energy,
          cbP: b.p.combo, cbE: b.e.combo,
          shP: b.p.shield, shE: b.e.shield,
          empE: b.e.empowered || null
        }
      });
    }
    _watchStale(field, d) {
      const t = d[field] || 0;
      if (t && Date.now() - t > HB_STALE && !this.finished) {
        // lawan menghilang: akhiri dengan sopan
        this.finished = true;
        if (this.role === 'host') {
          this._write({ status: 'aborted' });
        }
        this.emit('aborted', {});
        this.destroy();
      }
    }
  });

  // balik sisi 'p'<->'e' pada payload event (host->guest perspective)
  function remapSides(d) {
    const out = Object.assign({}, d);
    ['side', 'from', 'to'].forEach(function (k) {
      if (out[k] === 'p') out[k] = 'e';
      else if (out[k] === 'e') out[k] = 'p';
    });
    const hpP = out.hpP; out.hpP = out.hpE; out.hpE = hpP;
    return out;
  }
})();
