/* ============================================================
   MATH LEGENDS — UJI E2E KODE RUANGAN (createRoom/joinRoom)
   Jalankan:  npm i firebase  lalu:  node test/firebase-room-e2e.js
   Alur: A membuat ruangan (kode) → B bergabung dengan kode →
   keduanya menerima info pasangan yang saling bercermin.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
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
  const mk = async (tag) => {
    const app = fb9.initializeApp(CFG, tag + Date.now());
    const auth = authMod.getAuth(app);
    const cred = await authMod.signInAnonymously(auth);
    return { uid: cred.user.uid, fb: { fs: fsMod, db: fsMod.getFirestore(app), uid: cred.user.uid } };
  };
  console.log('⏳ dua klien masuk…');
  const A = await mk('host');
  const B = await mk('guest');
  console.log('✅ siap:', A.uid.slice(0, 6), '/', B.uid.slice(0, 6));

  console.log('\n🎮 A membuat ruangan…');
  let aInfo = null;
  const h = ML.PVP.createRoom(A.fb, { name: 'ALFA', hero: 'lyra', mr: 1150, gear: { hpMul: 0.12 } }, i => { aInfo = i; }, e => { if (!aInfo) throw new Error('create fail ' + e); });
  console.log('   KODE:', h.code);
  assert.ok(/^[A-Z2-9]{5}$/.test(h.code), 'kode 5 karakter tanpa huruf membingungkan');

  await sleep(1500); // beri waktu dokumen waiting tersimpan
  console.log('🔑 B bergabung dengan kode…');
  let bInfo = null, bErr = null;
  ML.PVP.joinRoom(B.fb, { name: 'BETA', hero: 'kage', mr: 1080, gear: null }, h.code, i => { bInfo = i; }, e => { bErr = e; });

  const t0 = Date.now();
  while ((!aInfo || !bInfo) && Date.now() - t0 < 30000) await sleep(300);

  assert.ok(aInfo, 'host menerima lawan');
  assert.ok(bInfo, 'guest masuk ruangan' + (bErr ? ' (err=' + bErr + ')' : ''));
  assert.strictEqual(aInfo.role, 'host');
  assert.strictEqual(bInfo.role, 'guest');
  assert.strictEqual(aInfo.roomId, h.code, 'satu kode ruangan');
  assert.strictEqual(bInfo.roomId, h.code);
  assert.strictEqual(aInfo.opp.name, 'BETA', 'host melihat BETA');
  assert.strictEqual(bInfo.opp.name, 'ALFA', 'guest melihat ALFA');
  assert.strictEqual(aInfo.opp.hero, 'kage');
  assert.strictEqual(bInfo.opp.hero, 'lyra');
  assert.strictEqual(bInfo.opp.gear && bInfo.opp.gear.hpMul, 0.12, 'gear host terkirim');
  console.log('✅ pasangan bercermin: ALFA(host) vs BETA(guest) — kode', h.code);

  // kode salah harus ditolak
  const bad = await new Promise(res => ML.PVP.joinRoom(B.fb, { name: 'X', hero: 'raka', mr: 1000 }, 'ZZZZZ', () => res('ok'), e => res(e)));
  assert.strictEqual(bad, 'notfound', 'kode salah -> notfound');

  console.log('\n🧹 bersihkan…');
  await fsMod.deleteDoc(fsMod.doc(A.fb.db, 'rooms', h.code)).catch(() => {});
  console.log('✅ KODE RUANGAN TERUJI END-TO-END! 🎉');
  process.exit(0);
})().catch(e => {
  console.error('\n❌ GAGAL:', String(e && e.message).split('\n')[0]);
  if (/permission|PERMISSION/.test(String(e))) console.error('👉 Cek Firestore Rules (README-FIREBASE.md).');
  process.exit(1);
});
