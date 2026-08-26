/* ============================================================
   MATH LEGENDS — UJI END-TO-END PVP ke Firebase sungguhan
   Jalankan:  npm i firebase  lalu:  node test/firebase-e2e.js
   Mensimulasikan 2 pemain (2 klien anonim): matchmaking atomik,
   battle penuh lewat dokumen `rooms`, hasil cermin host/guest.
   Dokumen uji dibersihkan setelah selesai.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

// muat modul game (bebas DOM)
const SRC = path.join(__dirname, '..', 'src', 'js');
['core.js', 'data.js', 'rules.js', 'questions.js', 'ai.js', 'battle.js', 'pvp.js'].forEach(f => {
  eval(fs.readFileSync(path.join(SRC, f), 'utf8'));
});
const ML = globalThis.ML;
const assert = require('assert');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CFG = {
  apiKey: 'AIzaSyBohE5mQDRjMb4DZu0-YNIVgcS0sTulUe8',
  authDomain: 'battle-arena-246ce.firebaseapp.com',
  projectId: 'battle-arena-246ce',
  storageBucket: 'battle-arena-246ce.firebasestorage.app',
  messagingSenderId: '605408613552',
  appId: '1:605408613552:web:44d712e06cd4facf991775'
};

(async () => {
  const fb9 = await import('firebase/app');
  const fsMod = await import('firebase/firestore');
  const authMod = await import('firebase/auth');

  const mkClient = async (tag) => {
    const app = fb9.initializeApp(CFG, tag + '-' + Date.now());
    const auth = authMod.getAuth(app);
    const cred = await authMod.signInAnonymously(auth);
    const db = fsMod.getFirestore(app);
    return { tag, app, uid: cred.user.uid, fb: { fs: fsMod, db, uid: cred.user.uid } };
  };

  console.log('⏳ klien HOST masuk…');
  const host = await mkClient('host');
  console.log('⏳ klien GUEST masuk…');
  const guest = await mkClient('guest');
  console.log('✅ 2 klien anonim terautentikasi:', host.uid.slice(0, 6), '/', guest.uid.slice(0, 6));

  /* --- 1. MATCHMAKING --- */
  // bersihkan lobby dari uji-uji sebelumnya
  try { await fsMod.deleteDoc(fsMod.doc(host.fb.db, 'rooms', 'lobby')); } catch (e) {}
  console.log('\n🔎 matchmaking…');
  const t0 = Date.now();
  const found = await new Promise((resolve, reject) => {
    let hInfo = null, gInfo = null;
    const to = setTimeout(() => reject(new Error('matchmaking timeout 40s')), 40000);
    ML.PVP.findMatch(host.fb, { name: 'HOST-UJI', hero: 'raka', mr: 1100 }, i => { hInfo = i; done(); }, e => { if (!hInfo && !gInfo) reject(new Error('host fail: ' + e)); });
    ML.PVP.findMatch(guest.fb, { name: 'GUEST-UJI', hero: 'kage', mr: 1050 }, i => { gInfo = i; done(); }, e => { if (!hInfo && !gInfo) reject(new Error('guest fail: ' + e)); });
    function done() {
      if (hInfo && gInfo) { clearTimeout(to); resolve({ hInfo, gInfo }); }
    }
  });
  const { hInfo, gInfo } = found;
  // peran ditentukan urutan commit lobby (bukan urutan panggilan) — keduanya sah
  assert.ok(hInfo.role !== gInfo.role, 'tepat satu host & satu guest');
  assert.strictEqual(hInfo.roomId, gInfo.roomId, 'kedua pihak satu ruangan');
  assert.strictEqual(hInfo.opp.name, 'GUEST-UJI', 'klien HOST-UJI melihat nama lawan');
  assert.strictEqual(gInfo.opp.name, 'HOST-UJI', 'klien GUEST-UJI melihat nama lawan');
  console.log(`✅ terpasangkan dalam ${Date.now() - t0}ms — room ${hInfo.roomId.slice(0, 6)}… (peran: HOST-UJI=${hInfo.role})`);

  /* --- 2. BATTLE PENUH lewat Firestore --- */
  console.log('\n⚔️ battle PvP dimulai (auto-answer kedua pihak)…');
  const netHost = new ML.NetBattle({ fb: host.fb, role: 'host', roomId: hInfo.roomId, myHeroId: 'raka', myName: 'HOST-UJI', opp: hInfo.opp });
  const netGuest = new ML.NetBattle({ fb: guest.fb, role: 'guest', roomId: gInfo.roomId, myHeroId: 'kage', myName: 'GUEST-UJI', opp: gInfo.opp });

  let hostRes = null, guestRes = null;
  netHost.on('end', r => { hostRes = r; });
  netGuest.on('end', r => { guestRes = r; });

  // auto-answer
  netHost.on('question', d => setTimeout(() => netHost.playerAnswer(d.q.answerIndex), 300));
  netGuest.on('question', d => setTimeout(() => netGuest.playerAnswer(Math.random() < 0.75 ? d.q.answerIndex : (d.q.answerIndex + 1) % 4), 250));

  netHost.start();
  netGuest.start();

  const t1 = Date.now();
  while ((!hostRes || !guestRes) && Date.now() - t1 < 300000) await sleep(400);
  assert.ok(hostRes && guestRes, 'kedua pihak menerima hasil (host=' + !!hostRes + ', guest=' + !!guestRes + ')');
  assert.strictEqual(hostRes.win, !guestRes.win, 'hasil saling bercermin');
  assert.strictEqual(hostRes.oppName, 'GUEST-UJI', 'host vs GUEST-UJI');
  assert.strictEqual(guestRes.oppName, 'HOST-UJI', 'guest vs HOST-UJI');
  assert.ok(hostRes.questions >= 1 && guestRes.questions >= 1, 'soal terjawab kedua sisi');
  assert.ok(Math.abs(hostRes.questions - guestRes.questions) <= 1, 'ronde kedua sisi sama (±1 utk KO)');
  console.log(`✅ battle selesai ${hostRes.rounds} ronde — HOST ${hostRes.win ? 'MENANG' : 'KALAH'} vs GUEST ${guestRes.win ? 'MENANG' : 'KALAH'}`);
  console.log('   host: acc ' + Math.round(hostRes.accuracy * 100) + '%, dmg ' + hostRes.dmgDealt + ' | guest: acc ' + Math.round(guestRes.accuracy * 100) + '%, dmg ' + guestRes.dmgDealt);

  netHost.destroy();
  netGuest.destroy();

  /* --- 3. BERSIHKAN --- */
  console.log('\n🧹 membersihkan dokumen uji…');
  const del = fsMod.deleteDoc(fsMod.doc(host.fb.db, 'rooms', hInfo.roomId)).catch(e => console.log('   room:', e.message));
  const delLobby = fsMod.deleteDoc(fsMod.doc(host.fb.db, 'rooms', 'lobby')).catch(() => {});
  await Promise.all([
    del,
    delLobby,
    fsMod.deleteDoc(fsMod.doc(host.fb.db, 'matchmaking', host.uid)).catch(() => {}),
    fsMod.deleteDoc(fsMod.doc(guest.fb.db, 'matchmaking', guest.uid)).catch(() => {})
  ]);
  console.log('✅ selesai — PVP ONLINE TERUJI END-TO-END! 🎉');
  process.exit(0);
})().catch(e => {
  const msg = String(e && e.message || e);
  console.error('\n❌ E2E GAGAL:', msg.split('\n')[0]);
  if (/permission|PERMISSION/.test(msg)) {
    console.error('\n👉 Firestore Rules kamu belum mengizinkan koleksi matchmaking/rooms.');
    console.error('   Salin Rules terbaru dari README-FIREBASE.md (bagian "Rules v0.6 — PvP"), lalu jalankan ulang.');
  }
  process.exit(1);
});
