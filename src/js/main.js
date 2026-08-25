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
      UI.show('home');
    });
    net.start();
    UI.show('battle');
    UI.toast('⚔️ Lawan: ' + U.esc(info.opp.name));
  }

  function endBattleSilently() {
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
          topicFocus: s.mode === 'practice' ? s.topic : null,
          practice: s.mode === 'practice',
          playerName: P.data.name
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
          { name: P.data.name || 'PEMAIN', hero: P.data.hero, mr: P.data.mr },
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
    App.setup.heroId = P.data.hero || 'raka';

    // buka AudioContext pada interaksi pertama (kebijakan autoplay)
    document.addEventListener('touchstart', function unlock() {
      AU._ensure();
      document.removeEventListener('touchstart', unlock);
    }, { once: true });

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
