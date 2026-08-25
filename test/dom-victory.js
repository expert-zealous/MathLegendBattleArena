/* ============================================================
   MATH LEGENDS — uji alur kemenangan penuh (jsdom)
   Jalankan:  npm i jsdom (sekali)  lalu:  node test/dom-victory.js
   Pemain "sempurna" vs AI EASY sampai VICTORY, lalu cek reward,
   rekomendasi belajar, penyimpanan, dan pergantian engine.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '..', 'node_modules', 'jsdom'));

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
vc.on('jsdomError', (e) => { if (!/Could not parse CSS/.test(String(e))) errors.push(String(e.message || e)); });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://t.test/', virtualConsole: vc });
  const { window } = dom;
  const $ = (s) => window.document.querySelector(s);
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const active = () => $('.screen.active') ? $('.screen.active').id : '(none)';
  const ML = window.ML;
  const check = (c, m) => { if (!c) throw new Error(m); console.log('  ✓ ' + m); };

  await sleep(120);
  if (active() === 'screen-intro') { click($('[data-act="intro-start"]')); await sleep(60); }
  if ($('#name-input')) { $('#name-input').value = 'CHAMP'; click($('[data-mact="ok"]')); await sleep(30); }

  click($('[data-nav="setup"]')); await sleep(30);
  // pilih necromancer agar pasif heal ikut teruji
  click($('.hero-card[data-id="morru"]')); await sleep(30);
  click($('#su-start')); await sleep(100);

  let endRes = null;
  const battle = ML.App.battle;
  battle.on('end', r => { endRes = r; });
  // percepat uji: buat AI menjawab sangat cepat (waktu soal kini lebih panjang per kesulitan)
  battle.ai.level = Object.assign({}, battle.ai.level, { tmin: 0.3, tmax: 0.8 });
  const iv = setInterval(() => {
    const b = ML.App.battle;
    if (b && !b.finished && !b.p.answered && b.q) {
      click($(`#q-answers .ans[data-i="${b.q.answerIndex}"]`));
    }
    if (endRes) clearInterval(iv);
  }, 120);

  const t0 = Date.now();
  while (!endRes && Date.now() - t0 < 120000) await sleep(200);
  clearInterval(iv);
  check(endRes, 'pertandingan selesai (win=' + (endRes && endRes.win) + ', ronde=' + (endRes && endRes.rounds) + ')');
  check(endRes.accuracy >= 0.6, 'akurasi: ' + Math.round(endRes.accuracy * 100) + '%');
  check(endRes.maxCombo >= 1 && endRes.maxCombo <= endRes.rounds, 'combo tercatat: x' + endRes.maxCombo + ' / ' + endRes.rounds + ' ronde');
  check(endRes.hpP > 0 && endRes.hpP <= battle.p.maxHp, 'HP necro terjaga (pasif heal): ' + endRes.hpP + '/' + battle.p.maxHp);

  await sleep(1300);
  check(active() === 'screen-result', 'layar hasil tampil');
  check($('#res-banner').textContent.includes('VICTORY'), 'banner VICTORY 🏆');
  check($('#res-rewards').textContent.indexOf('TOTAL XP') >= 0, 'rincian XP tampil');
  check($('#res-topics').textContent.indexOf('%') >= 0, 'penguasaan materi tampil');
  check($('#res-reco').textContent.indexOf('REKOMENDASI') >= 0, 'rekomendasi belajar tampil');

  const pf = JSON.parse(window.localStorage.getItem('ml_profile'));
  check(pf.stats.wins === 1, 'kemenangan tersimpan');
  check(pf.rp > 0, 'RP naik: ' + pf.rp);
  check(pf.achievements.first_win, 'achievement First Victory terbuka');

  click($('[data-act="again"]')); await sleep(120);
  check(ML.App.battle && ML.App.battle !== battle, 'engine baru dibuat, engine lama dibuang');

  const realErrors = errors.filter(e => !/Not implemented/.test(e));
  check(realErrors.length === 0, 'tanpa error console');
  console.log('\nVICTORY FLOW: SEMUA LOLOS ✅');
  window.close(); process.exit(0);
})().catch(e => { console.error('GAGAL ❌', e.stack || e); console.error(errors.slice(0, 5)); process.exit(1); });
