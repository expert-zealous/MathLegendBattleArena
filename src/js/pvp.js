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
  // Backend menyimpan UID pada ML.Backend.user, bukan pada _fb.
  // Gunakan helper ini agar semua jalur PvP selalu mendapat UID yang valid.
  function getUid(fb) {
    return String((fb && fb.uid) || (ML.Backend && ML.Backend.user && ML.Backend.user.uid) || '').trim();
  }

  const HB_MS = 5000;      // interval heartbeat
  const HB_STALE = 20000;  // dianggap putus

  /* ---------- sanitasi payload utk Firestore ----------
     Firestore menolak nilai undefined/NaN (kode: invalid-argument).
     Semua tulisan PvP melewati _clean() agar aman dari profil lama/rusak. */
  function _clean(obj) {
    const out = {};
    Object.keys(obj || {}).forEach(function (k) {
      let v = obj[k];
      if (v === undefined || v === null) { out[k] = null; return; }
      const t = typeof v;
      if (t === 'number') { out[k] = isFinite(v) ? v : 0; return; }
      if (t === 'string') { out[k] = v.slice(0, 40); return; }
      if (t === 'boolean') { out[k] = v; return; }
      if (t === 'object' && !Array.isArray(v)) { out[k] = _clean(v); return; }
      out[k] = String(v).slice(0, 40);
    });
    return out;
  }

  /* ================= MATCHMAKING =================
     Lobby satu dokumen (rooms/lobby): antrean uid. Transaksi Firestore pada
     SATU dokumen terserialisasi penuh -> tak ada race dua-HOST.
     Profil tiap pemain di matchmaking/{uid}; guest "mengunci" dokumen host. */
  const PVP = (ML.PVP = {
    /* fb: {fs, db, uid}; me: {name, hero, mr, gear?}; onFound({role, roomId, opp}); onFail(err) */
    findMatch: function (fb, me, onFound, onFail) {
      const fs = fb.fs, db = fb.db, uid = getUid(fb);
      if (!fs || !db || !uid) { onFail && onFail('firebase-user-unavailable'); return { cancel: function () {} }; }
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
            if (i >= 0) { q.splice(i, 1); tx.set(lobbyRef, _clean({ queue: q, updatedAt: Date.now() })); }
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
          await fs.setDoc(myRef, _clean({
            uid: uid, name: (me.name || 'PEMAIN').slice(0, 12), hero: me.hero || 'raka',
            mr: isFinite(me.mr) ? me.mr : 1000, level: me.level || 1, gear: me.gear || null,
            matched: false, opponent: null, updatedAt: Date.now()
          }));
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
                if (myIdx < 0) { q.push(uid); tx.set(lobbyRef, _clean({ queue: q, updatedAt: Date.now() })); }
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
                tx.set(lobbyRef, _clean({ queue: q, updatedAt: Date.now() }));
                return { role: 'retry' };
              }
              tx.set(lobbyRef, _clean({ queue: q, updatedAt: Date.now() }));
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
              await fs.updateDoc(hostRef, _clean({
                matched: true, opponent: uid,
                oppName: (me.name || 'PEMAIN').slice(0, 12), oppHero: me.hero || 'raka',
                oppMr: isFinite(me.mr) ? me.mr : 1000, oppLevel: me.level || 1, oppGear: me.gear || null
              }));
            } catch (e) { await sleep(400); continue; }
            const hostSnap = await fs.getDoc(hostRef).catch(function () { return null; });
            const hd = hostSnap && hostSnap.exists() ? hostSnap.data() : null;
            const opp = { uid: res.hostUid, name: (hd && hd.name) || 'HOST', hero: (hd && hd.hero) || 'raka', mr: (hd && hd.mr) || 1000, level: (hd && hd.level) || 1, gear: (hd && hd.gear) || null };
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
              const opp = { uid: got.opponent, name: got.oppName || 'GUEST', hero: got.oppHero || 'raka', mr: got.oppMr || 1000, level: got.oppLevel || 1, gear: got.oppGear || null };
              const guestSnap = await fs.getDoc(fs.doc(db, 'matchmaking', opp.uid)).catch(function () { return null; });
              if (guestSnap && guestSnap.exists()) {
                const gd = guestSnap.data();
                opp.name = gd.name || opp.name; opp.hero = gd.hero || opp.hero; opp.mr = gd.mr || opp.mr; opp.gear = gd.gear || opp.gear;
              }
              try {
                await fs.setDoc(fs.doc(db, 'rooms', uid), _clean({
                  status: 'playing', host: uid, guest: opp.uid,
                  names: { host: me.name, guest: opp.name },
                  heroes: { host: me.hero, guest: opp.hero },
                  round: 0, q: null, ans: null, skillReq: false, surrender: false,
                  seq: 0, frame: null, winner: null, result: null,
                  hostAlive: Date.now(), guestAlive: Date.now(), updatedAt: Date.now()
                }));
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

  /* HOST/GUEST ROOM FLOW — v0.10
     Guest claims the room AND changes status to `playing` in one write.
     Host only observes. This removes the old host-side write/transaction race. */
  PVP.createRoom = function (fb, me, code, onFound, onFail, onState) {
    const fs = fb.fs, db = fb.db, uid = getUid(fb);
      if (!fs || !db || !uid) { onFail && onFail('firebase-user-unavailable'); return { cancel: function () {} }; }
    let unsubRoom = null, unsubMM = null, poll = null, timer = null, done = false;
    code = String(code || PVP.makeCode()).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const roomRef = fs.doc(db, 'rooms', code);
    const mmRef = fs.doc(db, 'matchmaking', uid);
    const stop = function () {
      if (unsubRoom) { try { unsubRoom(); } catch(e) {} unsubRoom = null; }
      if (unsubMM) { try { unsubMM(); } catch(e) {} unsubMM = null; }
      if (poll) { clearInterval(poll); poll = null; }
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const fail = function(e) {
      if (done) return;
      done = true; stop();
      const msg = String(e && (e.code || e.message) || e);
      if (G.console) console.error('[ML PVP HOST]', msg, e);
      onFail && onFail(msg);
    };
    const finish = function(v) {
      if (done) return;
      done = true; stop(); onFound && onFound(v);
    };

    const startBattleIfJoined = function(d) {
      if (done || !d) return false;
      const guestUid = d.guestUid || d.guest || null;
      if (!guestUid || guestUid === uid) return false;
      if (d.status !== 'playing') return false;
      const opp = {
        uid: guestUid,
        name: d.guestName || (d.names && d.names.guest) || 'GUEST',
        hero: d.guestHero || (d.heroes && d.heroes.guest) || 'raka',
        mr: d.guestMr || 1000,
        level: d.guestLevel || 1,
        gear: d.guestGear || null
      };
      if (G.console) console.log('[ML PVP HOST] GUEST CONFIRMED', code, opp.uid);
      if (onState) onState('starting');
      finish({ role:'host', roomId:code, opp:opp });
      return true;
    };

    const promoteFromMatchmaking = function(mm) {
      if (done || !mm || !mm.matched || !mm.opponent) return;
      const guestUid = mm.opponent;
      fs.getDoc(roomRef).then(function(snap) {
        if (done || !snap.exists()) return;
        const d = snap.data() || {};
        if ((d.guestUid || d.guest) && d.status === 'playing') {
          startBattleIfJoined(d); return;
        }
        // Host is authoritative: convert waiting -> playing and preserve guest data.
        return fs.setDoc(roomRef, _clean({
          status:'playing', host:uid, guest:guestUid, guestUid:guestUid,
          guestName:mm.oppName || d.guestName || 'GUEST',
          guestHero:mm.oppHero || d.guestHero || 'raka',
          guestMr:isFinite(mm.oppMr) ? mm.oppMr : (d.guestMr || 1000),
          guestGear:mm.oppGear || d.guestGear || null,
          names:{host:me.name || 'PEMAIN', guest:mm.oppName || d.guestName || 'GUEST'},
          heroes:{host:me.hero || 'raka', guest:mm.oppHero || d.guestHero || 'raka'},
          round:0, q:null, ans:null, skillReq:false, surrender:false,
          seq:0, frame:null, winner:null, result:null,
          hostAlive:Date.now(), guestAlive:Date.now(), updatedAt:Date.now()
        }), {merge:true}).then(function(){
          startBattleIfJoined({
            status:'playing', guest:guestUid, guestUid:guestUid,
            guestName:mm.oppName || d.guestName, guestHero:mm.oppHero || d.guestHero,
            guestMr:mm.oppMr || d.guestMr, guestLevel:mm.oppLevel || d.guestLevel || 1, guestGear:mm.oppGear || d.guestGear
          });
        });
      }).catch(function(e){
        if (G.console) console.warn('[ML PVP HOST MM]', e && (e.code || e.message) || e);
      });
    };

    fs.setDoc(mmRef, _clean({
      uid:uid, name:(me.name || 'PEMAIN').slice(0,12), hero:me.hero || 'raka',
      mr:isFinite(me.mr) ? me.mr : 1000, level:me.level || 1, gear:me.gear || null,
      matched:false, opponent:null, updatedAt:Date.now()
    }), {merge:true}).catch(function(){});

    fs.setDoc(roomRef, _clean({
      status:'waiting', host:uid,
      hostName:(me.name || 'PEMAIN').slice(0,12), hostHero:me.hero || 'raka',
      hostMr:isFinite(me.mr) ? me.mr : 1000, hostLevel:me.level || 1, hostGear:me.gear || null,
      guest:null, guestUid:null, guestName:null, guestHero:null, guestMr:null, guestLevel:null, guestGear:null,
      createdAt:Date.now(), updatedAt:Date.now()
    })).then(function(){
      if (onState) onState('waiting');
      // Primary channel: room document.
      unsubRoom = fs.onSnapshot(roomRef, function(snap){
        if (!snap.exists()) return;
        const d = snap.data() || {};
        if (G.console) console.log('[ML PVP HOST ROOM]', code, d.status, d.guestUid || d.guest || null);
        startBattleIfJoined(d);
      }, function(e){
        if (G.console) console.error('[ML PVP HOST ROOM LISTENER]', e && (e.code || e.message) || e);
      });
      // Secondary channel: matchmaking host document. This avoids a single room-listener failure blocking the handshake.
      unsubMM = fs.onSnapshot(mmRef, function(snap){
        if (snap.exists()) promoteFromMatchmaking(snap.data() || {});
      }, function(e){
        if (G.console) console.error('[ML PVP HOST MM LISTENER]', e && (e.code || e.message) || e);
      });
      poll = setInterval(function(){
        if (done) return;
        Promise.all([
          fs.getDoc(roomRef).then(function(s){ if (s.exists()) startBattleIfJoined(s.data() || {}); }).catch(function(e){ if(G.console) console.warn('[ML PVP HOST POLL ROOM]', e && (e.code || e.message) || e); }),
          fs.getDoc(mmRef).then(function(s){ if (s.exists()) promoteFromMatchmaking(s.data() || {}); }).catch(function(e){ if(G.console) console.warn('[ML PVP HOST POLL MM]', e && (e.code || e.message) || e); })
        ]);
      }, 1000);
      timer = setTimeout(function(){
        if (done) return;
        fs.getDoc(roomRef).then(function(snap){
          if (snap.exists() && startBattleIfJoined(snap.data() || {})) return;
          fs.deleteDoc(roomRef).catch(function(){});
          fail('timeout');
        }).catch(fail);
      }, 180000);
    }).catch(fail);

    return { code:code, cancel:function(){
      if (done) return;
      done = true; stop();
      fs.deleteDoc(roomRef).catch(function(){});
      fs.deleteDoc(mmRef).catch(function(){});
      onFail && onFail('cancel');
    }};
  };

  PVP.joinRoom = function (fb, me, code, onFound, onFail, onState) {
    const fs = fb.fs, db = fb.db, uid = getUid(fb);
      if (!fs || !db || !uid) { onFail && onFail('firebase-user-unavailable'); return { cancel: function () {} }; }
    const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (!cleanCode) { onFail && onFail('invalid-code'); return {cancel:function(){}}; }
    const roomRef = fs.doc(db, 'rooms', cleanCode);
    let unsub = null, poll = null, timer = null, done = false;
    let opp = null;
    const stop = function(){
      if (unsub) { try { unsub(); } catch(e) {} unsub = null; }
      if (poll) { clearInterval(poll); poll = null; }
      if (timer) { clearTimeout(timer); timer = null; }
    };
    const fail = function(e){
      if (done) return;
      done = true; stop();
      const msg = String(e && (e.code || e.message) || e);
      if (G.console) console.error('[ML PVP GUEST]', msg, e);
      onFail && onFail(msg);
    };
    const finish = function(v){ if (done) return; done=true; stop(); onFound && onFound(v); };
    const consume = function(snap){
      if (done || !snap || !snap.exists()) return;
      const d = snap.data() || {};
      if (d.status === 'playing' && (d.guestUid || d.guest) === uid) {
        if (onState) onState('starting');
        finish({role:'guest', roomId:cleanCode, opp:opp});
      }
    };

    fs.getDoc(roomRef).then(function(snap){
      if (!snap.exists()) throw new Error('NOT_FOUND');
      const d = snap.data() || {};
      if (d.status !== 'waiting') throw new Error('FULL');
      if (d.host === uid) throw new Error('SELF');
      if (d.guest || d.guestUid) throw new Error('FULL');
      opp = {uid:d.host, name:d.hostName || 'HOST', hero:d.hostHero || 'raka', mr:d.hostMr || 1000, level:d.hostLevel || 1, gear:d.hostGear || null};
      const guestData = _clean({
        guest:uid, guestUid:uid,
        guestName:(me.name || 'PEMAIN').slice(0,12), guestHero:me.hero || 'raka',
        guestMr:isFinite(me.mr) ? me.mr : 1000, guestLevel:me.level || 1, guestGear:me.gear || null,
        updatedAt:Date.now()
      });
      // Write guest presence to the room.
      return fs.setDoc(roomRef, guestData, {merge:true}).then(function(){
        // Independent acknowledgement channel owned by host.
        const hostMM = fs.doc(db, 'matchmaking', d.host);
        return fs.setDoc(hostMM, _clean({
          matched:true, opponent:uid,
          oppName:(me.name || 'PEMAIN').slice(0,12), oppHero:me.hero || 'raka',
          oppMr:isFinite(me.mr) ? me.mr : 1000, oppGear:me.gear || null,
          updatedAt:Date.now()
        }), {merge:true});
      });
    }).then(function(){
      if (done) return;
      if (onState) onState('claimed');
      unsub = fs.onSnapshot(roomRef, consume, function(e){
        if (G.console) console.error('[ML PVP GUEST LISTENER]', e && (e.code || e.message) || e);
      });
      poll = setInterval(function(){ fs.getDoc(roomRef).then(consume).catch(function(e){ if(G.console) console.warn('[ML PVP GUEST POLL]', e && (e.code || e.message) || e); }); }, 750);
      timer = setTimeout(function(){ if(!done){ stop(); onFail && onFail('timeout'); done=true; } }, 60000);
    }).catch(function(e){
      const m = String(e && (e.code || e.message) || e);
      if (/NOT_FOUND|not-found/i.test(m)) fail('notfound');
      else if (/FULL/i.test(m)) fail('full');
      else if (/SELF/i.test(m)) fail('self');
      else fail(m);
    });
    return {cancel:function(){ if(!done){done=true; stop(); onFail && onFail('cancel');}}};
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
      this._difficultyReqSent = false;
      this._mySide = cfg.role === 'host' ? 'p' : 'e'; // sisi engine (host selalu 'p')

      if (cfg.role === 'host') this._initHost();
      else if (cfg.role === 'watch') this._initWatch();
      else this._initGuest();
    }

    _heroDef(id) {
      return ML.DATA.heroes.find(function (h) { return h.id === id; }) || ML.DATA.heroes[0];
    }

    /* ---------- HOST: PvP bebas giliran (soal independen per pemain) ---------- */
    _initHost() {
      const cfg = this.cfgPvp;
      const battle = new ML.Battle({
        heroId: cfg.myHeroId, aiHeroId: cfg.opp.hero, aiLevelIdx: 2,
        netMode: true, practice: false,
        playerGear: cfg.myGear || null, enemyGear: cfg.opp.gear || null,
        playerLevel: cfg.myLevel || 1, enemyLevel: cfg.opp.level || 1,
        playerName: cfg.myName, oppName: cfg.opp.name, oppRating: cfg.opp.mr || 1000
      });
      this.battle = battle;
      this.p = battle.p; this.e = battle.e; this.cfg = battle.cfg;
      this.ai = { level: { bot: cfg.opp.name } };
      this.maxRounds = 999;
      this._usedQ = new Set();
      this._slots = { p: {1:[],2:[],3:[]}, e: {1:[],2:[],3:[]} };
      this._qSeq = {p:0,e:0};
      this._qState = {p:null,e:null};
      this._processedAns = {e:null};
      this._timerP = null; this._timerE = null;
      this._lastHostAction = 0;

      const self = this;
      // Pre-generate three independent question lanes for each player.
      [1,2,3].forEach(function(d){
        self._slots.p[d].push(self._makeNetQuestion(d));
        self._slots.e[d].push(self._makeNetQuestion(d));
      });

      // Teruskan SEMUA event engine host ke frame online. Tanpa ini Guest
      // tidak pernah menerima hasil jawaban/serangan walaupun Host berjalan normal.
      ['answered','attack','skill'].forEach(function(name){
        battle.on(name, function(data){
          const safe = JSON.parse(JSON.stringify(data || {}));

          // Host harus menerima event Battle secara lokal DAN state terbaru.
          // State dipancarkan terpisah agar HUD Host tidak hanya bergantung
          // pada frame Firebase yang memang ditujukan untuk perangkat lain.
          self.emit(name, safe);
          self.emit('state', {
            hpP: battle.p.hp, hpE: battle.e.hp,
            enP: battle.p.energy, enE: battle.e.energy,
            cbP: battle.p.combo, cbE: battle.e.combo,
            shP: battle.p.shield, shE: battle.e.shield
          });

          // Replay event sekali pada tick berikutnya. Ini memastikan UI yang
          // dipasang sesudah inisialisasi NetBattle tetap menerima event lokal.
          setTimeout(function () {
            if (!self.finished) self.emit(name, safe);
          }, 0);

          // Event yang sama tetap dikirim ke Firebase untuk Guest.
          self._pendingEvts.push({ n:name, d:safe });
          self._scheduleFlush();
        });
      });

      battle.on('end', function(res){
        self.finished = true;
        self._clearNetTimers();
        self.emit('end', res);
        self._flushNow();
        self._write({
          status:'done', winner: res.win ? 'host' : (res.draw ? null : 'guest'),
          result:{
            hostRes: JSON.parse(JSON.stringify(res)),
            guestRes: JSON.parse(JSON.stringify(battle.resultFor('e', res.win ? 'p' : (res.draw ? null : 'e'), res.reason)))
          }
        });
      });

      this._unsubRoom = this.fb.fs.onSnapshot(this.roomRef, function(snap){
        if (!snap.exists() || self.finished) return;
        const d=snap.data()||{};
        self._watchStale('guestAlive', d);
        if (d.surrender) { battle._finish('p','SURRENDER'); return; }

        // Guest answers its own independent question (side e on host engine).
        const ans=d.ansE;
        if (ans && ans.by==='guest' && ans.qid && ans.qid!==self._processedAns.e) {
          self._processedAns.e=ans.qid;
          self._answerSide('e', Number(ans.choice), Number(ans.timeUsed), ans.qid);
        }

        // Guest selects difficulty for its NEXT question. Host consumes a preloaded question.
        const req=d.questionReq;
        if (req && req.by==='guest' && req.qid && req.qid!==self._lastGuestReq) {
          self._lastGuestReq=req.qid;
          const diff=U.clamp(Number(req.difficulty)||2,1,3);
          self._issueQuestion('e', diff);
          self._write({questionReq:null});
        }

        // Hero skill remains separate from question skill.
        if (d.heroSkillReq && d.heroSkillReq.by==='guest' && d.heroSkillReq.id) {
          if (d.heroSkillReq.qid !== self._lastHeroSkillReq) {
            self._lastHeroSkillReq=d.heroSkillReq.qid;
            battle.useSkillSide('e', d.heroSkillReq.id);
            self._write({heroSkillReq:null});
          }
        }
      }, function(e){ if(G.console) console.error('[ML PVP HOST LISTENER]', e && (e.code||e.message)||e); });

      this._hb=setInterval(function(){ self._write({hostAlive:Date.now()}); },HB_MS);
    }

    _makeNetQuestion(diff){
      const topic=U.pick(ML.QEngine.topics());
      let q=null;
      try{ q=ML.QEngine.make(topic,diff,this._usedQ); }catch(e){ q=null; }
      if(!q){ try{ q=ML.QEngine.make('arit',diff,this._usedQ); }catch(e){} }
      return q;
    }
    _questionPayload(q, side, seq){
      return { qid:side+'-'+seq+'-'+Date.now(), round:seq, text:q.text, choices:q.choices,
        topic:q.topic, difficulty:q.difficulty, limit:ML.Rules.timeForDiff(q.difficulty), answerIndex:q.answerIndex };
    }
    _issueQuestion(side,diff){
      if(this.finished) return false;
      const slot=this._slots[side][diff];
      let q=slot && slot.shift();
      if(!q) q=this._makeNetQuestion(diff);
      if(!q) return false;
      // Refill immediately so each button always has a fresh, different question ready.
      this._slots[side][diff].push(this._makeNetQuestion(diff));
      const seq=++this._qSeq[side];
      const payload=this._questionPayload(q,side,seq);
      this._qState[side]={payload:payload, q:q, answered:false, startedAt:Date.now()};
      if(side==='p'){
        this.p.answered=false;
        this.q=q; this._answeredLocal=false; this._qRecvAt=Date.now(); this.qLimit=payload.limit;
        this.emit('question',{q:q,round:seq,maxRounds:999,limit:payload.limit,pEnergy:this.p.energy,eEnergy:this.e.energy,parallel:true,side:'p',qid:payload.qid});
        this._startLocalTimer('p',payload.limit);
        this._write({qP:payload, ansE:null});
      }else{
        this.e.answered=false;
        this._write({qE:payload});
        this._startRemoteTimer('e', payload.limit);
      }
      return true;
    }
    _startLocalTimer(side,total){
      const self=this;
      if(this._timerP){clearInterval(this._timerP);this._timerP=null;}
      if(side!=='p') return;
      this._timerP=setInterval(function(){
        if(self.finished||!self._qState.p||self._qState.p.answered){clearInterval(self._timerP);self._timerP=null;return;}
        const left=Math.max(0,total-(Date.now()-self._qState.p.startedAt)/1000);
        self.emit('timer',{left:left,total:total});
        if(left<=0){clearInterval(self._timerP);self._timerP=null;self._answerSide('p',-1,total,self._qState.p.payload.qid);}
      },100);
    }
    _startRemoteTimer(side,total){
      const self=this;
      if(this._timerE){clearTimeout(this._timerE);this._timerE=null;}
      if(side!=='e') return;
      const qid=this._qState.e && this._qState.e.payload.qid;
      this._timerE=setTimeout(function(){
        if(self.finished||!self._qState.e||self._qState.e.answered)return;
        self._answerSide('e',-1,total,qid);
      }, Math.max(100,total*1000+150));
    }
    _startGuestTimer(payload){
      const self=this;
      if(this._timerE){clearTimeout(this._timerE);clearInterval(this._timerE);this._timerE=null;}
      const started=Date.now();
      this._timerE=setInterval(function(){
        const st=self._qState.e;if(!st||st.answered){clearInterval(self._timerE);self._timerE=null;return;}
        const left=Math.max(0,payload.limit-(Date.now()-started)/1000);
        if(left<=0){clearInterval(self._timerE);self._timerE=null;self._answerSide('e',-1,payload.limit,payload.qid);}
      },100);
    }
    _clearNetTimers(){
      if(this._timerP){clearInterval(this._timerP);this._timerP=null;}
      if(this._timerE){clearTimeout(this._timerE);clearInterval(this._timerE);this._timerE=null;}
    }
    _answerSide(side,index,timeUsed,qid){
      const st=this._qState[side]; if(this.finished||!st||st.answered||st.payload.qid!==qid) return false;
      st.answered=true;
      if(side==='p' && this._timerP){clearInterval(this._timerP);this._timerP=null;}
      if(side==='e' && this._timerE){clearInterval(this._timerE);this._timerE=null;}
      const b=this.battle;
      b.q=st.q; b.qLimit=st.payload.limit; b.qStart=st.startedAt;
      b.netAnswer(side,index,Math.max(0,Math.min(Number(timeUsed)||st.payload.limit,st.payload.limit)));
      return true;
    }

    /* ---------- GUEST: soal independen milik guest, host tetap otoritatif ---------- */
    _initGuest() {
      const cfg=this.cfgPvp, myHero=this._heroDef(cfg.myHeroId), oppHero=this._heroDef(cfg.opp.hero);
      const mk=function(hero,isPlayer,g,level){
        const hp=Math.round(hero.hp*(1+(g.hpMul||0)))+Math.max(0,(level-1)*(ML.Rules.LEVEL_HP_BONUS||0));
        return {hero:hero,isPlayer:isPlayer,hp:hp,maxHp:hp,atk:Math.round(hero.atk*(1+(g.atkMul||0))),def:hero.def+(g.defAdd||0),
          energy:ML.Rules.START_ENERGY,combo:0,shield:0,empowered:null,comebackShield:false,comebackUsed:false,gearCrit:g.critAdd||0,
          answered:false,stats:{questions:0,correct:0,perfect:0,weak:0,wrong:0,maxCombo:0,hardCorrect:0,hardTotal:0,comeback:0,dmgDealt:0,dmgTaken:0,timeSum:0,perTopic:{}}};
      };
      this.p=mk(myHero,true,cfg.myGear||{},cfg.myLevel||1); // local guest
      this.e=mk(oppHero,false,cfg.opp.gear||{},cfg.opp.level||1); // host
      this.cfg={playerName:cfg.myName,oppName:cfg.opp.name,oppRating:cfg.opp.mr||1000};
      this.ai={level:{bot:cfg.opp.name}};
      this.q=null; this.maxRounds=999; this._lastQId=null; this._lastHostQId=null;
      this._qState={p:null,e:null}; this._answeredLocal=false; this._qRecvAt=0; this._timerIv=null; this._usedLocal=new Set();
      this._difficultyReqSent=false; this._lastFrameSeq=0;
      const self=this;
      this._unsubRoom=this.fb.fs.onSnapshot(this.roomRef,function(snap){
        if(!snap.exists()||self.finished)return;
        const d=snap.data()||{}; self._watchStale('hostAlive',d);
        if(d.qP && d.qP.qid && d.qP.qid!==self._lastHostQId){
          self._lastHostQId=d.qP.qid; self._applyOpponentQuestion(d.qP);
        }
        if(d.qE && d.qE.qid && d.qE.qid!==self._lastQId){
          self._lastQId=d.qE.qid;
          const q={text:d.qE.text,choices:d.qE.choices,answerIndex:d.qE.answerIndex,topic:d.qE.topic,difficulty:d.qE.difficulty,explanation:'',answer:String(d.qE.choices[d.qE.answerIndex])};
          self.q=q; self._qState.p={payload:d.qE,q:q,answered:false,startedAt:Date.now()}; self._answeredLocal=false; self._qRecvAt=Date.now();
          self.emit('question',{q:q,round:d.qE.round,maxRounds:999,limit:d.qE.limit||10,pEnergy:self.p.energy,eEnergy:self.e.energy,parallel:true,side:'p',qid:d.qE.qid});
          self._startGuestTimer(d.qE);
        }
        if(d.frame && d.frame.seq && d.frame.seq>self._lastFrameSeq){
          self._lastFrameSeq=d.frame.seq;
          self.e.hp=d.frame.hpP; self.e.energy=d.frame.enP; self.e.combo=d.frame.cbP; self.e.shield=d.frame.shP; self.e.empowered=d.frame.empP||null;
          self.p.hp=d.frame.hpE; self.p.energy=d.frame.enE; self.p.combo=d.frame.cbE; self.p.shield=d.frame.shE; self.p.empowered=d.frame.empE||null;
          (d.frame.evts||[]).forEach(function(ev){ self.emit(ev.n,remapSides(ev.d)); });
        }
        if(d.status==='done'&&d.result&&!self.finished){
          self.finished=true; if(self._timerIv){clearInterval(self._timerIv);self._timerIv=null;}
          self.emit('end',Object.assign({},d.result.guestRes,{oppRating:cfg.opp.mr||1000}));
        }else if(d.status==='aborted'&&!self.finished){self.finished=true;self.emit('aborted',{});}
      },function(e){if(G.console)console.error('[ML PVP GUEST LISTENER]',e&& (e.code||e.message)||e);});
      this._hb=setInterval(function(){self._write({guestAlive:Date.now()});},HB_MS);
    }
    _applyOpponentQuestion(payload){
      // Opponent question is shown only through status; it never blocks the local question.
      this._qState.e={payload:payload,answered:false,startedAt:Date.now()};
      this.e.answered=false;
    }
    _startRemoteTimer(side,total){
      const self=this;
      if(this._timerE){clearTimeout(this._timerE);this._timerE=null;}
      if(side!=='e') return;
      const qid=this._qState.e && this._qState.e.payload.qid;
      this._timerE=setTimeout(function(){
        if(self.finished||!self._qState.e||self._qState.e.answered)return;
        self._answerSide('e',-1,total,qid);
      }, Math.max(100,total*1000+150));
    }
    _startGuestTimer(payload){
      const self=this; if(this._timerIv){clearInterval(this._timerIv);this._timerIv=null;}
      const started=Date.now(); this._qRecvAt=started;
      this._timerIv=setInterval(function(){
        if(self.finished||!self._qState.p||self._qState.p.answered){clearInterval(self._timerIv);self._timerIv=null;return;}
        const left=Math.max(0,(payload.limit||10)-(Date.now()-started)/1000);
        self.emit('timer',{left:left,total:payload.limit||10});
        if(left<=0){clearInterval(self._timerIv);self._timerIv=null;self.playerAnswer(-1);}
      },100);
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

    /* ---------- API seperti Battle (PvP bebas giliran) ---------- */
    start(){
      this.emit('start',{p:this.p,e:this.e,cfg:this.cfg});
      if(this.role==='host'){
        // Kedua pemain mendapat soal awal secara independen. Skill 1/2/3 sudah punya antrean soal masing-masing.
        this._issueQuestion('p',2);
        this._issueQuestion('e',2);
      }
    }
    playerAnswer(i){
      if(this.role==='watch'||this.finished||this._answeredLocal||!this.q)return;
      this._answeredLocal=true;
      const st=this._qState.p;if(!st)return;
      if(this.role==='host'){
        this._answerSide('p',i,(Date.now()-st.startedAt)/1000,st.payload.qid);
        return;
      }
      const used=Math.max(0.1,Math.min((Date.now()-st.startedAt)/1000,st.payload.limit||10));
      const ok=i===st.payload.answerIndex;
      const grade=ML.Rules.gradeOf(used,ok,st.payload.limit||10);
      st.answered=true;
      if(this._timerIv){clearInterval(this._timerIv);this._timerIv=null;}
      this.emit('answered',{side:'p',correct:ok,grade:grade,timeUsed:Math.round(used*10)/10,answer:String(st.q.choices[st.q.answerIndex]),explanation:'',combo:this.p.combo,energy:this.p.energy,source:'NET',hpP:this.p.hp,hpE:this.e.hp});
      this._write({ansE:{by:'guest',qid:st.payload.qid,choice:i,timeUsed:Math.round(used*10)/10}}).catch((err)=>{
        // Jangan biarkan Guest macet jika Firestore menolak write.
        self._answeredLocal=false; st.answered=false;
        if(G.console) console.error('[ML PVP GUEST ANSWER WRITE]', err && (err.code||err.message)||err);
        self.emit('neterror',{stage:'answer',error:String(err && (err.code||err.message)||err)});
      });
    }
    chooseDifficulty(diff){
      if(this.role==='watch'||this.finished)return false;
      const d=U.clamp(Math.round(diff)||2,1,3);
      // Jangan membuat soal baru sebelum soal aktif selesai: ini mencegah pemain membatalkan soal berulang-ulang.
      if(this.q && this._qState.p && !this._qState.p.answered)return false;
      if(this.role==='host') return this._issueQuestion('p',d);
      if(this._difficultyReqSent)return false;
      this._difficultyReqSent=true;
      const qid='req-'+getUid(this.fb)+'-'+Date.now();
      this._write({questionReq:{by:'guest',difficulty:d,qid:qid}}).catch((err)=>{
        this._difficultyReqSent=false;
        if(G.console) console.error('[ML PVP GUEST SKILL WRITE]', err && (err.code||err.message)||err);
        this.emit('neterror',{stage:'skill',error:String(err && (err.code||err.message)||err)});
      });
      setTimeout(()=>{this._difficultyReqSent=false;},700);
      this.emit('difficulty',{difficulty:d,next:true,parallel:true});
      return true;
    }
    useSkill(id){
      if(this.role==='watch'||this.finished)return false;
      if(this.role==='host')return this.battle.useSkill(id);
      const qid='skill-'+getUid(this.fb)+'-'+Date.now();
      this._write({heroSkillReq:{by:'guest',id:id,qid:qid}}); return true;
    }
    surrender(){
      if(this.role==='watch'||this.finished)return;
      if(this.role==='host')this.battle.surrender();
      else{this._write({surrender:true});setTimeout(()=>this._abortLocal(),4000);}
    }
    _abortLocal(){if(this.finished)return;this.finished=true;this.emit('aborted',{});}
    destroy(){
      this.finished=true; this._offs.forEach(function(o){try{o();}catch(e){}}); this._offs=[];
      if(this._hb){clearInterval(this._hb);this._hb=null;} if(this._timerIv){clearInterval(this._timerIv);this._timerIv=null;}
      this._clearNetTimers&&this._clearNetTimers(); if(this._unsubRoom){try{this._unsubRoom();}catch(e){}} if(this.battle)this.battle.destroy(); this.kill();
    }

    /* ---------- util ---------- */
    _write(patch) {
      const fs = this.fb.fs;
      try {
        return fs.setDoc(this.roomRef, patch, { merge: true }).catch(function(err){
          if(G.console) console.error('[ML PVP WRITE]', patch, err && (err.code||err.message)||err);
          throw err;
        });
      } catch (e) {
        if(G.console) console.error('[ML PVP WRITE]', patch, e && (e.code||e.message)||e);
        return Promise.reject(e);
      }
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
