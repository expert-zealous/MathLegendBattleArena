/* ============================================================
   MATH LEGENDS — smoke test DOM (jsdom)
   Jalankan:  npm i jsdom  (sekali)  lalu:  node test/dom-smoke.js
   Mensimulasikan pemain nyata: nama → home → setup → battle →
   jawab → damage → surrender → result → main lagi → semua menu.
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
vc.on('log', () => {});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://mathlegends.test/', virtualConsole: vc });
  const { window } = dom;
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => Array.from(window.document.querySelectorAll(s));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const active = () => $('.screen.active') ? $('.screen.active').id : '(none)';
  let step = '';
  const check = (cond, msg) => { if (!cond) throw new Error(`[${step}] ${msg}`); console.log('  ✓ ' + msg); };

  await sleep(150);
  step = 'boot';
  check(active() === 'screen-intro' || active() === 'screen-home' || $('#name-input'), 'game boot tanpa error');

  step = 'layar pembuka';
  if (active() === 'screen-intro') {
    check($$('#intro-heroes .ih').length === 5, '5 karakter tampil di intro');
    click($('[data-act="intro-start"]'));
    await sleep(80);
  }
  check(active() === 'screen-home' || $('#name-input'), 'intro -> beranda/modal nama');

  if ($('#name-input')) {
    step = 'modal nama';
    $('#name-input').value = 'ARENA';
    click($('[data-mact="ok"]'));
    await sleep(50);
  }
  step = 'home';
  check(active() === 'screen-home', 'berada di home');
  check($('#h-name').textContent === 'ARENA', 'nama tersimpan');
  check($('.hero-img') !== null, 'gambar karakter tampil di home');

  step = 'buka setup';
  click($('[data-nav="setup"]'));
  await sleep(50);
  check(active() === 'screen-setup', 'layar setup aktif');
  check($$('.hero-card').length === 5, '5 hero tersedia');
  check($$('.hero-card .hero-img').length === 5, 'semua kartu hero bergambar');

  step = 'pilih hero ninja';
  click($('.hero-card[data-id="kage"]'));
  await sleep(50);
  check($('#su-detail').textContent.includes('SHADOW STRIKE'), 'detail skill Ninja tampil');

  step = 'mulai battle';
  click($('#su-start'));
  await sleep(120);
  check(active() === 'screen-battle', 'layar battle aktif');
  check($('#q-text').textContent.length > 2, 'soal tampil: "' + $('#q-text').textContent + '"');
  check($('#b-hero-p').querySelector('img') !== null, 'karakter pemain muncul di arena');

  step = 'jawab benar';
  const ML = window.ML;
  const battle = ML.App.battle;
  const ai = battle.q.answerIndex;
  const hpBefore = battle.e.hp;
  click($(`#q-answers .ans[data-i="${ai}"]`));
  await sleep(200);
  check(battle.p.answered === true, 'jawaban tercatat');
  check(battle.e.hp < hpBefore, `damage masuk: ${hpBefore} -> ${battle.e.hp}`);
  check($('#b-p-energy').querySelectorAll('.on').length >= 1, 'energy terisi');

  step = 'skill siap saat energi cukup';
  battle.p.energy = 6;
  ML.UI._updSkillBtn();
  check($('#b-skill').disabled === false, 'tombol skill aktif');
  click($('#b-skill'));
  await sleep(60);
  check(battle.p.empowered === 'shadow', 'shadow strike terpasang');
  check($('#b-skill').classList.contains('armed'), 'tombol skill berstatus SIAP');

  step = 'surrender -> result';
  click($('#b-quit'));
  await sleep(60);
  click($('[data-mact="yes"]'));
  await sleep(1500);
  check(active() === 'screen-result', 'layar hasil tampil');
  check($('#res-rewards').textContent.includes('XP'), 'reward tampil');

  step = 'main lagi tanpa refresh';
  click($('[data-act="again"]'));
  await sleep(150);
  check(active() === 'screen-battle', 'battle baru dimulai');
  check(!!ML.App.battle && ML.App.battle.round >= 1, 'engine baru jalan');

  step = 'keluar & jelajahi menu';
  click($('#b-quit')); await sleep(60);
  click($('[data-mact="yes"]')); await sleep(1400);
  click($('#screen-result [data-nav="home"]')); await sleep(50);
  click($('[data-nav="missions"]'));
  check($$('.mission').length === 5, '5 misi harian');
  click($('[data-nav="achievements"]'));
  check($$('.ach').length === 10, '10 achievement');
  click($('[data-nav="leaderboard"]'));
  check($$('.board-row').length >= 5, 'leaderboard terisi');
  click($('[data-nav="learn"]'));
  check($$('.topic-card').length === 4, '4 topik latihan');
  click($('.topic-card'));
  await sleep(50);
  check(active() === 'screen-setup', 'klik topik -> setup latihan');
  click($('#su-start'));
  await sleep(120);
  check(ML.App.battle.cfg.practice === true, 'practice battle berjalan');

  step = 'bersih';
  const realErrors = errors.filter(e => !/Not implemented/.test(e));
  check(realErrors.length === 0, 'tidak ada error JS console' + (realErrors.length ? ' → ' + realErrors[0] : ''));

  console.log('\nDOM SMOKE TEST: SEMUA LOLOS ✅');
  window.close();
  process.exit(0);
})().catch(e => {
  console.error('\nDOM SMOKE GAGAL ❌\n' + (e.stack || e.message));
  console.error('Error console:', errors.slice(0, 5));
  process.exit(1);
});
