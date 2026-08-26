/* ============================================================
   E2E LENGKAP KODE RUANGAN: buat → gabung → BATTLE PENUH → hasil
   node test/firebase-room-battle-e2e.js   (npm i firebase)
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
  console.log('⏳ 2 klien masuk…');
  const A = await mk('hostc');
  const B = await mk('guestc');
  console.log('✅ siap');

  // 1) HOST membuat ruangan
  const KODE = ML.PVP.makeCode();
  let aInfo = null;
  ML.PVP.createRoom(A.fb, { name: 'HOSTKU', hero: 'raka', mr: 1100, gear: { hpMul: 0.06, atkMul: 0, critAdd: 0, defAdd: 0 } }, KODE, i => { aInfo = i; }, e => { console.log('create err', e); });
  console.log('🎮 KODE:', KODE);
  await sleep(2000);

  // 2) GUEST bergabung
  let bInfo = null;
  ML.PVP.joinRoom(B.fb, { name: 'GUESTKU', hero: 'kage', mr: 1050, gear: null }, KODE, i => { bInfo = i; }, e => console.log('join err', e));
  const t0 = Date.now();
  while ((!aInfo || !bInfo) && Date.now() - t0 < 30000) await sleep(300);
  assert.ok(aInfo && bInfo, 'kedua pihak terpasangkan (host=' + !!aInfo + ' guest=' + !!bInfo + ')');
  console.log(`✅ terpasangkan ${(Date.now() - t0) / 1000 | 0}s — HOSTKU(${aInfo.role}) vs GUESTKU(${bInfo.role})`);

  // 3) BATTLE PENUH lewat NetBattle sungguhan
  const hostNet = new ML.NetBattle({ fb: aInfo.role === 'host' ? A.fb : B.fb, role: aInfo.role, roomId: KODE, myHeroId: 'raka', myName: 'HOSTKU', myGear: { hpMul: 0.06, atkMul: 0, critAdd: 0, defAdd: 0 }, opp: aInfo.opp });
  const guestNet = new ML.NetBattle({ fb: bInfo.role === 'guest' ? B.fb : A.fb, role: bInfo.role, roomId: KODE, myHeroId: 'kage', myName: 'GUESTKU', myGear: null, opp: bInfo.opp });
  let hEnd = null, gEnd = null;
  hostNet.on('end', r => { hEnd = r; });
  guestNet.on('end', r => { gEnd = r; });
  hostNet.on('question', d => setTimeout(() => hostNet.playerAnswer(d.q.answerIndex), 250));
  guestNet.on('question', d => setTimeout(() => guestNet.playerAnswer(Math.random() < 0.8 ? d.q.answerIndex : (d.q.answerIndex + 1) % 4), 250));
  hostNet.start();
  guestNet.start();

  const t1 = Date.now();
  while ((!hEnd || !gEnd) && Date.now() - t1 < 240000) await sleep(500);
  assert.ok(hEnd && gEnd, 'kedua pihak menerima hasil (host=' + !!hEnd + ' guest=' + !!gEnd + ')');
  assert.strictEqual(hEnd.win, !gEnd.win, 'hasil bercermin');
  assert.ok(Math.abs(hEnd.questions - gEnd.questions) <= 1, 'ronde konsisten');
  console.log(`✅ BATTLE SELESAI ${hEnd.rounds} ronde — HOSTKU ${hEnd.win ? 'MENANG' : 'KALAH'} (acc ${Math.round(hEnd.accuracy * 100)}% vs ${Math.round(gEnd.accuracy * 100)}%)`);

  hostNet.destroy(); guestNet.destroy();
  await fsMod.deleteDoc(fsMod.doc(A.fb.db, 'rooms', KODE)).catch(() => {});
  console.log('\n🎉 KODE RUANGAN: BATTLE PENUH TERUJI END-TO-END');
  process.exit(0);
})().catch(e => {
  console.error('\n❌ GAGAL:', String(e && e.message).split('\n')[0]);
  process.exit(1);
});
