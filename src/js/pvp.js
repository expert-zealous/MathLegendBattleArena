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

  /* ================= MATCHMAKING =================
     Lobby satu dokumen (rooms/lobby): antrean uid. Transaksi Firestore pada
     SATU dokumen terserialisasi penuh -> tak ada race dua-HOST.
     Profil tiap pemain di matchmaking/{uid}; guest "mengunci" dokumen host. */
  const PVP = (ML.PVP = {
    /* fb: {fs, db, uid}; me: {name, hero, mr, gear?}; onFound({role, roomId, opp}); onFail(err) */
    findMatch: function (fb, me, onFound, onFail) {
      const fs = fb.fs, db = fb.db, uid = fb.uid;
      const lobbyRef = fs.doc(db, 'rooms', 'lobby');
      const myRef = fs.doc(db, 'matchmaking', uid);
      let cancelled = false, done = false, pollers = [];

      const stopPollers = () => pollers.forEach(c => { try { c(); } catch (e) {} });
      const finish = (v) => {
        if (done) return; done = true;
        stopPollers();
        if (v) onFound(v); else onFail && onFail('cancel');
      };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const leaveQueue = () => {
        try {
          fs.runTransaction(db, async function (tx) {
            const snap = await tx.get(lobbyRef);
            const q = (snap.exists() && snap.data().queue) ? snap.data().queue.slice() : [];
            const i = q.indexOf(uid);
            if (i >= 0) { q.splice(i, 1); tx.set(lobbyRef, { queue: q, updatedAt: Date.now() }); }
          }).catch(function () {});
        } catch (e) {}
      };
      // batas waktu keseluruhan
      const timer = setTimeout(function () {
        if (!done) { leaveQueue(); done = true; stopPollers(); onFail && onFail('timeout'); }
      }, 90000);

      const run = async function () {
        // profil saya utk dibaca lawan
        try {
          await fs.setDoc(myRef, {
            uid: uid, name: me.name, hero: me.hero, mr: me.mr || 1000,
            gear: me.gear || null, matched: false, opponent: null, updatedAt: Date.now()
          });
        } catch (e) { /* abaikan: dok lama tak masalah */ }

        for (let attempt = 0; attempt < 14 && !done && !cancelled; attempt++) {
          let res = null;
          try {
            res = await fs.runTransaction(db, async function (tx) {
              const snap = await tx.get(lobbyRef);
              const q = (snap.exists() && snap.data().queue) ? snap.data().queue.slice() : [];
              const myIdx = q.indexOf(uid);
              if (myIdx === 0 || (myIdx < 0 && q.length === 0) || (myIdx < 0 && q[0] === uid)) {
                // hanyaorang pertama boleh mengantre sbg HOST kandidat
                if (myIdx < 0) { q.push(uid); tx.set(lobbyRef, { queue: q, updatedAt: Date.now() }); }
                return { role: 'host-wait' };
              }
              if (myIdx > 0) {
                // ada orang di depan: aku menunggu giliran (coba lagi nanti)
                return { role: 'retry' };
              }
              // myIdx < 0 dan ada orang lain di depan -> GUEST: ambil orang pertama
              const hostUid = q.shift();
              // buang entri basi (pemain menghilang >2 menit) agar antrean menyembuhkan diri
              const candSnap = await tx.get(fs.doc(db, 'matchmaking', hostUid));
              const fresh = candSnap.exists() && (Date.now() - (candSnap.data().updatedAt || 0) < 120000);
              if (!fresh) {
                tx.set(lobbyRef, { queue: q, updatedAt: Date.now() });
                return { role: 'retry' };
              }
              tx.set(lobbyRef, { queue: q, updatedAt: Date.now() });
              return { role: 'guest', hostUid: hostUid };
            });
          } catch (e) {
            await sleep(300 + Math.random() * 400);
            continue;
          }

          if (done || cancelled) return;

          if (res.role === 'guest') {
            // kunci dokumen host dengan identitasku
            const hostRef = fs.doc(db, 'matchmaking', res.hostUid);
            try {
              await fs.updateDoc(hostRef, {
                matched: true, opponent: uid,
                oppName: me.name, oppHero: me.hero, oppMr: me.mr || 1000, oppGear: me.gear || null
              });
            } catch (e) { await sleep(400); continue; }
            const hostSnap = await fs.getDoc(hostRef).catch(function () { return null; });
            const hd = hostSnap && hostSnap.exists() ? hostSnap.data() : null;
            const opp = { uid: res.hostUid, name: (hd && hd.name) || 'HOST', hero: (hd && hd.hero) || 'raka', mr: (hd && hd.mr) || 1000, gear: (hd && hd.gear) || null };
            // tunggu host membuat ruangan
            const ok = await new Promise(function (resolve) {
              let tries = 0;
              const iv = setInterval(function () {
                if (done || cancelled) { clearInterval(iv); resolve(null); return; }
                tries++;
                fs.getDoc(fs.doc(db, 'rooms', res.hostUid)).then(function (snap) {
                  const d = snap.exists() ? snap.data() : null;
                  if (d && d.status === 'playing' && d.guest === uid) { clearInterval(iv); resolve(true); }
                  else if (tries > 36) { clearInterval(iv); resolve(false); }
                }).catch(function () { if (tries > 36) { clearInterval(iv); resolve(false); } });
              }, 700);
              pollers.push(function () { clearInterval(iv); });
            });
            if (done || cancelled) return;
            if (ok) { clearTimeout(timer); finish({ role: 'guest', roomId: res.hostUid, opp: opp }); return; }
            await sleep(300); continue; // host hilang -> coba lagi
          }

          if (res.role === 'host-wait') {
            // tunggu maks 6 detik sampai dokumenku dikunci guest
            const got = await new Promise(function (resolve) {
              let tries = 0;
              const iv = setInterval(function () {
                if (done || cancelled) { clearInterval(iv); resolve(null); return; }
                tries++;
                fs.getDoc(myRef).then(function (snap) {
                  const d = snap.exists() ? snap.data() : null;
                  if (d && d.matched && d.opponent) { clearInterval(iv); resolve(d); }
                  else if (tries > 8) { clearInterval(iv); resolve(false); }
                }).catch(function () { if (tries > 8) { clearInterval(iv); resolve(false); } });
              }, 750);
              pollers.push(function () { clearInterval(iv); });
            });
            if (done || cancelled) return;
            if (got) {
              const opp = { uid: got.opponent, name: got.oppName || 'GUEST', hero: got.oppHero || 'raka', mr: got.oppMr || 1000, gear: got.oppGear || null };
              const guestSnap = await fs.getDoc(fs.doc(db, 'matchmaking', opp.uid)).catch(function () { return null; });
              if (guestSnap && guestSnap.exists()) {
                const gd = guestSnap.data();
                opp.name = gd.name || opp.name; opp.hero = gd.hero || opp.hero; opp.mr = gd.mr || opp.mr; opp.gear = gd.gear || opp.gear;
              }
              try {
                await fs.setDoc(fs.doc(db, 'rooms', uid), {
                  status: 'playing', host: uid, guest: opp.uid,
                  names: { host: me.name, guest: opp.name },
                  heroes: { host: me.hero, guest: opp.hero },
                  round: 0, q: null, ans: null, skillReq: false, surrender: false,
                  seq: 0, frame: null, winner: null, result: null,
                  hostAlive: Date.now(), guestAlive: Date.now(), updatedAt: Date.now()
                });
              } catch (e) { await sleep(400); continue; }
              leaveQueue();
              clearTimeout(timer);
              finish({ role: 'host', roomId: uid, opp: opp });
              return;
            }
            // belum dikunci dalam 6 dtk -> keluar antrean & coba jadi guest utk host lain
            leaveQueue();
            await sleep(150 + Math.random() * 450);
          } else {
            await sleep(700 + Math.random() * 500); // retry: masih ada antrean
          }
        }
        if (!done && !cancelled) { leaveQueue(); done = true; onFail && onFail('timeout'); }
      };

      run().catch(function (e) {
        if (!done) { leaveQueue(); done = true; onFail && onFail(String((e && e.code) || (e && e.message) || e)); }
      });

      return {
        cancel: function () {
          cancelled = true;
          leaveQueue();
          finish(null);
        }
      };
    }
  });

  /* ================= RUANGAN BERKODE (buat/gabung manual) =================
     Cocok untuk uji 2 perangkat & turnamen: kode 5 karakter, deterministik. */
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa huruf mirip (I,O,0,1)

  PVP.makeCode = function () {
    let c = '';
    for (let i = 0; i < 5; i++) c += ABC[Math.floor(Math.random() * ABC.length)];
    return c;
  };

  /* HOST: buat ruangan -> cb({role:'host', roomId, opp}) saat lawan bergabung */
  PVP.createRoom = function (fb, me, onFound, onFail) {
    const fs = fb.fs, db = fb.db, uid = fb.uid;
    let unsub = null, done = false;
    const code = PVP.makeCode();
    const roomRef = fs.doc(db, 'rooms', code);

    const stop = function () { if (unsub) { try { unsub(); } catch (e) {} } };
    const finish = function (v) { if (done) return; done = true; stop(); if (v) onFound(v); else onFail && onFail('cancel'); };

    fs.setDoc(roomRef, {
      status: 'waiting', host: uid, hostName: me.name, hostHero: me.hero,
      hostMr: me.mr || 1000, hostGear: me.gear || null,
      guest: null, guestName: null, guestHero: null, guestMr: null, guestGear: null,
      createdAt: Date.now(), updatedAt: Date.now()
    }).then(function () {
      unsub = fs.onSnapshot(roomRef, function (snap) {
        if (done || !snap.exists()) return;
        const d = snap.data();
        if (d.guest && d.guestUid) {
          const opp = { uid: d.guestUid, name: d.guestName || 'GUEST', hero: d.guestHero || 'raka', mr: d.guestMr || 1000, gear: d.guestGear || null };
          // ubah ke ruangan pertandingan aktif (format NetBattle)
          fs.setDoc(roomRef, {
            status: 'playing', host: uid, guest: opp.uid,
            names: { host: me.name, guest: opp.name },
            heroes: { host: me.hero, guest: opp.hero },
            round: 0, q: null, ans: null, skillReq: false, surrender: false,
            seq: 0, frame: null, winner: null, result: null,
            hostAlive: Date.now(), guestAlive: Date.now(), updatedAt: Date.now()
          }).then(function () {
            finish({ role: 'host', roomId: code, opp: opp });
          }).catch(function (e) { if (!done) { done = true; stop(); onFail && onFail(String(e && e.code || e)); } });
        }
      }, function (e) { if (!done) { done = true; onFail && onFail(String(e && e.code || e)); } });
      // kedaluwarsa otomatis bila tak ada lawan dalam 3 menit
      setTimeout(function () {
        if (done) return;
        fs.getDoc(roomRef).then(function (snap) {
          if (!done && snap.exists() && snap.data().status === 'waiting') {
            fs.deleteDoc(roomRef).catch(function () {});
            done = true; stop(); onFail && onFail('timeout');
          }
        }).catch(function () {});
      }, 180000);
    }).catch(function (e) { if (!done) { done = true; onFail && onFail(String(e && e.code || e)); } });

    return {
      code: code,
      cancel: function () {
        finish(null);
        try { fs.deleteDoc(roomRef).catch(function () {}); } catch (e) {}
      }
    };
  };

  /* GUEST: gabung dengan kode -> cb({role:'guest', roomId, opp}) saat host memulai */
  PVP.joinRoom = function (fb, me, code, onFound, onFail) {
    const fs = fb.fs, db = fb.db, uid = fb.uid;
    const roomRef = fs.doc(db, 'rooms', String(code || '').trim().toUpperCase());
    let unsub = null, done = false;
    const stop = function () { if (unsub) { try { unsub(); } catch (e) {} } };

    fs.runTransaction(db, async function (tx) {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('NOT_FOUND');
      const d = snap.data();
      if (d.status !== 'waiting' || d.guest) throw new Error('FULL');
      tx.update(roomRef, {
        guest: uid, guestUid: uid, guestName: me.name, guestHero: me.hero,
        guestMr: me.mr || 1000, guestGear: me.gear || null, updatedAt: Date.now()
      });
      return { hostName: d.hostName, hostHero: d.hostHero, hostMr: d.hostMr, hostGear: d.hostGear, hostUid: d.host };
    }).then(function (info) {
      const opp = { uid: info.hostUid, name: info.hostName || 'HOST', hero: info.hostHero || 'raka', mr: info.hostMr || 1000, gear: info.hostGear || null };
      unsub = fs.onSnapshot(roomRef, function (snap) {
        if (done || !snap.exists()) return;
        const d = snap.data();
        if (d.status === 'playing' && d.guest === uid) {
          done = true; stop();
          onFound({ role: 'guest', roomId: roomRef.id, opp: opp });
        }
      }, function (e) { if (!done) { done = true; stop(); onFail && onFail(String(e && e.code || e)); } });
      // batas tunggu 60 dtk utk host memulai
      setTimeout(function () {
        if (!done) { done = true; stop(); onFail && onFail('timeout'); }
      }, 60000);
    }).catch(function (e) {
      const m = String(e && e.message || e);
      if (done) return; done = true;
      onFail && onFail(m.indexOf('FULL') >= 0 ? 'full' : m.indexOf('NOT_FOUND') >= 0 ? 'notfound' : m);
    });

    return { cancel: function () { if (!done) { done = true; stop(); onFail && onFail('cancel'); } } };
  };

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
      else if (cfg.role === 'watch') this._initWatch();
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
        playerGear: cfg.myGear || null, enemyGear: cfg.opp.gear || null,
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
        self._answeredLocal = false; // reset giliran jawab host tiap ronde
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
        self.emit('end', res); // teruskan ke UI/main (host juga butuh layar hasil)
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
      const myGear = cfg.myGear || {};
      const oppGear = cfg.opp.gear || {};
      const mk = function (hero, isPlayer, g) {
        const hp = Math.round(hero.hp * (1 + (g.hpMul || 0)));
        return {
          hero: hero, isPlayer: isPlayer,
          hp: hp, maxHp: hp, energy: ML.Rules.START_ENERGY, combo: 0,
          shield: 0, empowered: null, comebackShield: false, answered: false,
          gearCrit: g.critAdd || 0,
          stats: { questions: 0, correct: 0, maxCombo: 0, perTopic: {} }
        };
      };
      this.p = mk(myHero, true, myGear);   // aku
      this.e = mk(oppHero, false, oppGear); // lawan (host)
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

    /* ---------- WASIT: tonton ruangan (layar besar/turnamen) ---------- */
    _initWatch() {
      const cfg = this.cfgPvp;
      const hostHero = this._heroDef(cfg.hostHero || 'raka');
      const guestHero = this._heroDef(cfg.guestHero || 'raka');
      const mk = function (hero, isPlayer) {
        return {
          hero: hero, isPlayer: isPlayer,
          hp: hero.hp, maxHp: hero.hp, energy: ML.Rules.START_ENERGY, combo: 0,
          shield: 0, empowered: null, answered: true,
          stats: { questions: 0, correct: 0, maxCombo: 0, perTopic: {} }
        };
      };
      this.p = mk(hostHero, true);   // host di kiri
      this.e = mk(guestHero, false); // guest di kanan
      this.cfg = { playerName: cfg.hostName || 'HOST' };
      this.ai = { level: { bot: cfg.guestName || 'GUEST' } };
      this.q = null;
      this.maxRounds = ML.Rules.MAX_ROUNDS;

      const self = this;
      this._unsubRoom = this.fb.fs.onSnapshot(this.roomRef, function (snap) {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.q && d.q.round > self._lastQRound) {
          self._lastQRound = d.q.round;
          self.q = {
            text: d.q.text, choices: d.q.choices, answerIndex: d.q.answerIndex,
            topic: d.q.topic, difficulty: d.q.difficulty, explanation: '', answer: String(d.q.choices[d.q.answerIndex])
          };
          if (self._timerIv) clearInterval(self._timerIv);
          const started = Date.now() - 700; // perkiraan (latensi listener)
          const total = d.q.limit || 10;
          self._timerIv = setInterval(function () {
            const left = Math.max(0, total - (Date.now() - started) / 1000);
            self.emit('timer', { left: left, total: total });
          }, 200);
          self.emit('question', {
            q: self.q, round: d.q.round, maxRounds: self.maxRounds, limit: total,
            pEnergy: self.p.energy, eEnergy: self.e.energy
          });
        }
        if (d.frame && d.frame.seq > self._lastSeq) {
          self._lastSeq = d.frame.seq;
          self.e.hp = d.frame.hpP; self.e.energy = d.frame.enP; self.e.combo = d.frame.cbP; self.e.shield = d.frame.shP;
          self.p.hp = d.frame.hpE; self.p.energy = d.frame.enE; self.p.combo = d.frame.cbE; self.p.shield = d.frame.shE;
          (d.frame.evts || []).forEach(function (ev) { self.emit(ev.n, ev.d); }); // tanpa pembalikan: p=host
        }
        if (d.status === 'done' && d.result && !self.finished) {
          self.finished = true;
          if (self._timerIv) { clearInterval(self._timerIv); self._timerIv = null; }
          self.emit('watchend', { winner: d.winner, host: d.result.hostRes, guest: d.result.guestRes });
        } else if (d.status === 'aborted' && !self.finished) {
          self.finished = true;
          self.emit('aborted', {});
        }
      });
    }

    /* ---------- API seperti Battle (dipakai UI/main) ---------- */
    start() {
      this.emit('start', { p: this.p, e: this.e, cfg: this.cfg });
      if (this.role === 'host') this.battle.start();
    }
    playerAnswer(i) {
      if (this.role === 'watch' || this.finished || this._answeredLocal || !this.q) return;
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
      if (this.role === 'watch' || this.finished) return false;
      if (this.role === 'host') return this.battle.useSkill(id);
      if (this._skillReqSent) return false;
      this._skillReqSent = true;
      this._write({ skillReq: true });
      return true;
    }
    surrender() {
      if (this.role === 'watch' || this.finished) return;
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
