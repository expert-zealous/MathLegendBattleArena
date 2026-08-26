/* ============================================================
   MATH LEGENDS: BATTLE ARENA — main.js
   Boot, navigasi antar layar, siklus hidup pertandingan.
   Satu delegasi event global (bebas listener menumpuk).
   Alur cepat: HOME → MAIN → PILIH HERO → BATTLE (≤ 3 ketukan).
   ============================================================ */
(function () {
  'use strict';
  const ML = (window.ML = window.ML || {});
  const U = ML.util, D = ML.DATA, P = ML.Player, UI = ML.UI, AU = ML.Audio;

  const App = (ML.App = {
    setup: { mode: 'ranked', topic: null, heroId: 'raka', aiIdx: 1 },
    battle: null,
    lastCfg: null,
    lastResult: null
  });

  /* ---------- akhir pertandingan (dipakai AI & PvP) ---------- */
  function onEngineEnd(engine, res, keepCfg) {
    AU.musicStop();
    App.lastResult = res;
    if (keepCfg) App.lastCfg = keepCfg; else App.lastCfg = null;
    setTimeout(function () {
      const sum = P.applyMatchResult(res);
      if (ML.Backend && ML.Backend.online) ML.Backend.onMatchEnd(P.data); // cloud save + leaderboard
      if (App.battle === engine) {
        UI.detachBattle();
        engine.destroy();
        App.battle = null;
      }
      UI.renderResult(sum, res);
      UI.show('result');
    }, 1100);
  }

  /* ---------- mulai pertandingan vs AI ---------- */
  function startBattle(cfg) {
    endBattleSilently();
    const battle = new ML.Battle(cfg);
    App.battle = battle;
    UI.attachBattle(battle);
    battle.on('end', function (res) { onEngineEnd(battle, res, cfg); });
    battle.start();
    AU.music('battle');
    UI.show('battle');
  }

  /* ---------- mulai pertandingan PvP online ---------- */
  function startNetBattle(info) {
    endBattleSilently();
    const B = ML.Backend;
    const net = new ML.NetBattle({
      fb: B._fb,
      role: info.role,
      roomId: info.roomId,
      myHeroId: P.data.hero,
      myName: P.data.name || 'PEMAIN',
      myGear: P.computeGear(),
      opp: info.opp
    });
    App.battle = net;
    UI.attachBattle(net);
    net.on('end', function (res) { onEngineEnd(net, res, null); });
    net.on('aborted', function () {
      UI.detachBattle();
      net.destroy();
      if (App.battle === net) App.battle = null;
      UI.closeModal();
      UI.toast('⚠️ Lawan terputus — pertandingan dibatalkan');
      AU.music('menu');
      UI.show('home');
    });
    net.start();
    AU.music('battle');
    UI.show('battle');
    UI.toast('⚔️ Lawan: ' + U.esc(info.opp.name));
  }

  function startWatch(roomIdRaw) {
    endBattleSilently();
    const roomId = String(roomIdRaw || '').trim();
    if (!roomId) { UI.toast('Masukkan kode ruangan'); return; }
    const B = ML.Backend;
    const net = new ML.NetBattle({
      fb: B._fb, role: 'watch', roomId: roomId,
      myHeroId: P.data.hero, myName: 'WASIT',
      hostName: 'HOST', guestName: 'GUEST'
    });
    App.battle = net;
    UI.attachBattle(net);
    const root = document.getElementById('battle-root');
    if (root) root.classList.add('mode-watch');
    net.on('watchend', function (d) {
      UI.detachBattle(); net.destroy();
      if (App.battle === net) App.battle = null;
      if (root) root.classList.remove('mode-watch');
      const h = d.host || {}, g = d.guest || {};
      const nm = function (x) { return U.esc(x && (x.oppName || x.playerName) || ''); };
      AU.musicStop();
      UI.confirmModal('🏁 Pertandingan Selesai',
        (d.winner === 'host' ? '🏆 <b>' + nm(h) + '</b> (host) menang!' :
         d.winner === 'guest' ? '🏆 <b>' + (U.esc(g.playerName || 'GUEST')) + '</b> (guest) menang!' : 'Seri!') +
        '<br><small>' + (h.rounds || 0) + ' ronde • HOST ' + Math.round((h.accuracy || 0) * 100) + '% vs GUEST ' + Math.round((g.accuracy || 0) * 100) + '%</small>',
        'SELESAI', false, function () { UI.show('home'); });
    });
    net.on('aborted', function () {
      UI.detachBattle(); net.destroy();
      if (App.battle === net) App.battle = null;
      if (root) root.classList.remove('mode-watch');
      UI.toast('⚠️ Siaran berakhir (pemain terputus)');
      AU.music('menu');
      UI.show('home');
    });
    net.start();
    AU.music('battle');
    UI.show('battle');
    UI.toast('📺 Mode wasit aktif — ruangan ' + roomId.slice(0, 6).toUpperCase());
  }

  function endBattleSilently() {
    const root0 = document.getElementById('battle-root');
    if (root0) root0.classList.remove('mode-watch');
    if (App.battle) {
      UI.detachBattle();
      App.battle.destroy();
      App.battle = null;
    }
  }

  /* ---------- navigasi & aksi (satu delegasi global) ---------- */
  function onAction(act, t) {
    switch (act) {
      case 'intro-start': {
        AU._ensure(); // buka AudioContext pada interaksi pertama
        AU.play('rankup');
        AU.music('menu');
        if (!P.data.name) {
          UI.nameModal(function (name) {
            P.data.name = name;
            P.save();
            UI.show('home');
          });
        } else {
          UI.show('home');
        }
        break;
      }

      case 'pick-hero':
        App.setup.heroId = t.getAttribute('data-id');
        P.data.hero = App.setup.heroId; P.save();
        UI.renderSetup();
        break;

      case 'pick-ai':
        App.setup.aiIdx = parseInt(t.getAttribute('data-idx'), 10) || 0;
        UI.renderSetup();
        break;

      case 'start-battle': {
        const s = App.setup;
        startBattle({
          heroId: s.heroId,
          aiHeroId: D.heroes[U.ri(0, D.heroes.length - 1)].id,
          aiLevelIdx: s.aiIdx,
          playerGear: P.computeGear(),
          enemyGear: { hpMul: 0.03 * s.aiIdx, atkMul: 0.02 * s.aiIdx, critAdd: 0.01 * s.aiIdx, defAdd: s.aiIdx >= 2 ? 1 : 0 },
          topicFocus: s.mode === 'practice' ? s.topic : null,
          practice: s.mode === 'practice',
          playerName: P.data.name
        });
        break;
      }

      case 'pvp-create': {
        const Bc = ML.Backend;
        if (!Bc || !Bc.online || !Bc._fb || !Bc.user) { UI.toast('ℹ️ Mode online belum aktif'); break; }
        AU.play('skill');
        let handle = null;
        const me = { name: P.data.name || 'PEMAIN', hero: P.data.hero, mr: P.data.mr, gear: P.computeGear() };
        try {
          const code = ML.PVP.makeCode();      // kode dibuat SEBELUM modal -> selalu tampil
          UI.roomModal(code, function () { if (handle) handle.cancel(); });
          handle = ML.PVP.createRoom(Bc._fb, me, code,
            function (info) { UI.closeModal(); startNetBattle(info); },
            function (err) {
              UI.closeModal();
              UI.toast(err === 'timeout' ? '⌛ Tak ada lawan dalam 3 menit' :
                       err === 'cancel' ? 'ℹ️ Dibatalkan' : '⚠️ Buat ruangan: ' + String(err).slice(0, 90));
            });
        } catch (e) {
          UI.closeModal();
          UI.toast('⚠️ Gagal membuat ruangan: ' + String((e && (e.code || e.message)) || e).slice(0, 60));
        }
        break;
      }

      case 'pvp-join': {
        const Bj = ML.Backend;
        if (!Bj || !Bj.online || !Bj._fb || !Bj.user) { UI.toast('ℹ️ Mode online belum aktif'); break; }
        AU.play('click');
        UI.inputModal('🔑 Gabung Ruangan', 'Masukkan kode 5 karakter dari pembuat ruangan.', 'KODE', 'GABUNG ⚔️', function (code) {
          let handle = null;
          UI.searchingModal(function () { if (handle) handle.cancel(); });
          handle = ML.PVP.joinRoom(Bj._fb, { name: P.data.name || 'PEMAIN', hero: P.data.hero, mr: P.data.mr, gear: P.computeGear() }, code,
            function (info) { UI.closeModal(); startNetBattle(info); },
            function (err) {
              UI.closeModal();
              UI.toast(err === 'full' ? '⚠️ Ruangan sudah penuh' :
                       err === 'notfound' ? '⚠️ Kode tidak ditemukan' :
                       err === 'timeout' ? '⌛ Host tidak merespons' : 'ℹ️ Dibatalkan');
            });
        });
        break;
      }

      case 'pvp-search': {
        const B = ML.Backend;
        if (!B || !B.online || !B._fb || !B.user) {
          UI.toast('ℹ️ Mode online belum aktif — cek README-FIREBASE.md');
          break;
        }
        AU.play('skill');
        let handle = null;
        UI.searchingModal(function () { if (handle) handle.cancel(); });
        handle = ML.PVP.findMatch(
          B._fb,
          { name: P.data.name || 'PEMAIN', hero: P.data.hero, mr: P.data.mr, gear: P.computeGear() },
          function (info) { UI.closeModal(); startNetBattle(info); },
          function (err) {
            UI.closeModal();
            UI.toast(err === 'timeout' ? '⌛ Tidak ada lawan ditemukan, coba lagi' : 'ℹ️ Pencarian dibatalkan');
          }
        );
        break;
      }

      case 'answer': {
        const battle = App.battle;
        if (!battle || battle.finished || battle.p.answered || !battle.q) return;
        const i = parseInt(t.getAttribute('data-i'), 10);
        UI.B.lastPick = i;
        battle.playerAnswer(i);
        break;
      }

      case 'use-skill': {
        const battle = App.battle;
        if (!battle) return;
        battle.useSkill(battle.p.hero.skill.id);
        break;
      }

      case 'quit':
        if (!App.battle) return;
        UI.confirmModal('Menyerah?', 'Pertandingan akan dihitung sebagai <b>kekalahan</b>. Yakin?', 'MENYERAH', true, function () {
          if (App.battle) App.battle.surrender();
        });
        break;

      case 'again': {
        const cfg = App.lastCfg;
        if (!cfg) { UI.show('setup'); return; }
        startBattle(cfg);
        break;
      }

      case 'practice-weak':
        startBattle({
          heroId: P.data.hero,
          aiHeroId: D.heroes[U.ri(0, D.heroes.length - 1)].id,
          aiLevelIdx: 1,
          playerGear: P.computeGear(),
          enemyGear: null,
          topicFocus: t.getAttribute('data-topic'),
          practice: true,
          playerName: P.data.name
        });
        break;

      case 'practice-topic':
        App.setup.mode = 'practice';
        App.setup.topic = t.getAttribute('data-topic');
        App.setup.heroId = P.data.hero;
        App.setup.aiIdx = 1;
        UI.show('setup');
        break;

      case 'edit-name':
        UI.nameModal(function (name) {
          P.data.name = name; P.save();
          UI.toast('Nama diubah menjadi ' + U.esc(name));
          if (UI.current === 'profile') UI.renderProfile();
        });
        break;

      case 'toggle-music':
        AU.musicEnabled = !AU.musicEnabled;
        P.data.settings.music = AU.musicEnabled;
        P.save();
        if (!AU.musicEnabled) AU.musicStop();
        else AU.music(UI.current === 'battle' ? 'battle' : 'menu');
        UI.renderProfile();
        UI.toast(AU.musicEnabled ? '🎵 Musik aktif' : '🎵 Musik mati');
        break;

      case 'toggle-sound':
        AU.enabled = !AU.enabled;
        P.data.settings.sound = AU.enabled;
        P.save();
        UI.renderProfile();
        UI.toast(AU.enabled ? '🔊 Suara aktif' : '🔇 Suara mati');
        if (AU.enabled) AU.play('click');
        break;

      case 'reset-progress':
        UI.confirmModal('Reset progres?', 'Semua XP, rank, coin, dan prestasi akan <b>hilang permanen</b>.', 'RESET', true, function () {
          const sound = P.data.settings.sound;
          P.reset();
          P.data.settings.sound = sound; P.save();
          UI.toast('Progres direset');
          UI.nameModal(function (name) {
            P.data.name = name; P.save();
            UI.show('home');
          });
        });
        break;

      case 'buy-gear': {
        const id = t.getAttribute('data-id');
        const r = P.buyGear(id);
        AU.play(r.ok ? 'coin' : 'wrong');
        UI.toast(r.ok ? '🎉 ' + r.msg : '⚠️ ' + r.msg, r.ok);
        UI.renderShop();
        if (UI.current === 'setup') UI.renderSetup();
        break;
      }

      case 'watch': {
        const B2 = ML.Backend;
        if (!B2 || !B2.online || !B2._fb || !B2.user) { UI.toast('ℹ️ Mode wasit butuh mode online'); break; }
        AU.play('click');
        UI.watchModal(function (roomId) { startWatch(roomId); });
        break;
      }

      case 'board-tab':
        UI.boardTab = t.getAttribute('data-tab');
        UI.renderBoard();
        break;

      case 'toggle-wrong':
        UI.toggleWrong();
        break;
    }
  }

  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-nav],[data-act]');
    if (!t) return;
    const nav = t.getAttribute('data-nav');
    if (nav) {
      AU.play('click');
      if (nav === 'home') AU.music('menu');
      // keluar dari battle tanpa menyerah = pertandingan dibatalkan
      if (App.battle && nav !== 'battle') endBattleSilently();
      if (nav === 'setup') {
        App.setup.mode = 'ranked';
        App.setup.topic = null;
        App.setup.heroId = P.data.hero;
      }
      UI.show(nav);
      return;
    }
    const act = t.getAttribute('data-act');
    if (act === 'answer' || act === 'use-skill') {
      onAction(act, t); // tanpa bunyi klik (ada bunyi sendiri)
      return;
    }
    AU.play('click');
    onAction(act, t);
  });

  // dukungan keyboard (nilai tambah di desktop): 1-4 / A-D menjawab
  document.addEventListener('keydown', function (e) {
    if (UI.current !== 'battle' || !App.battle) return;
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
    const i = map[e.key.toLowerCase()];
    if (i === undefined) return;
    const battle = App.battle;
    if (battle.finished || battle.p.answered) return;
    const btn = U.$('#q-answers .ans[data-i="' + i + '"]');
    if (btn && !btn.disabled) {
      UI.B.lastPick = i;
      battle.playerAnswer(i);
    }
  });

  /* ---------- boot ---------- */
  function boot() {
    P.load();
    AU.enabled = P.data.settings.sound !== false;
    AU.musicEnabled = P.data.settings.music !== false;
    AU.probeFiles(); // deteksi file musik/SFX milikmu di assets/audio/
    App.setup.heroId = P.data.hero || 'raka';

    // buka AudioContext pada interaksi pertama (kebijakan autoplay)
    document.addEventListener('touchstart', function unlock() {
      AU._ensure();
      document.removeEventListener('touchstart', unlock);
    }, { once: true });

    // PWA: daftar service worker bila dijalankan dari server web
    try {
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    } catch (e) {}

    // tampilkan layar pembuka; tombol MULAI membuka audio + beranda/nama
    UI.show('intro');

    if (!ML.Storage.persistent()) {
      setTimeout(function () { UI.toast('ℹ️ Mode preview: progres tidak tersimpan permanen'); }, 1200);
    }

    // Kerangka online (Firebase): aktif hanya bila firebase-config.js terisi.
    // Cloud save: ambil profil cloud bila lebih maju dari lokal.
    if (ML.Backend && ML.Backend.init) {
      ML.Backend.init().then(function () {
        if (!ML.Backend.online) return;
        return ML.Backend.loadProfile().then(function (remote) {
          const adopted = remote ? P.loadFrom(remote) : false;
          if (UI.current === 'home') UI.renderHome();
          if (adopted) UI.toast('☁️ Profil dimuat dari cloud');
        });
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
