/* ============================================================
   MATH LEGENDS: BATTLE ARENA — ui.js
   Semua render DOM & animasi ringan. Battle UI berlangganan event
   dari Battle Engine dan SELALU melepas langganan (bebas memory leak).
   Animasi hanya CSS ringan; node efek dibatasi & dihapus otomatis.
   ============================================================ */
(function () {
  'use strict';
  const ML = (window.ML = window.ML || {});
  const U = ML.util, D = ML.DATA, R = ML.Rules, P = ML.Player, AU = ML.Audio;

  const el = function (id) { return document.getElementById(id); };
  const esc = U.esc;
  function gearEffectText(it, lv) {
    if (it.stat === 'hp') return '+' + Math.round(it.per * lv * 100) + '% HP';
    if (it.stat === 'atk') return '+' + Math.round(it.per * lv * 100) + '% ATK';
    if (it.stat === 'crit') return '+' + Math.round(it.per * lv * 100) + '% CRIT';
    return '+' + Math.round(it.per * lv) + ' DEF';
  }

  // gambar tubuh utuh utk arena (imgF = siap, imgA = menyerang)
  // side 'p' (kiri) harus menghadap KANAN; side 'e' (kanan) harus menghadap KIRI.
  // Sebagian hero (LYRA) tergambar menghadap kiri -> dicerminkan lewat flip:true.
  function heroBody(h, side) {
    if (!h) return '';
    if (!h.imgF) return heroImg(h);
    let t = '';
    const facesLeft = !!h.flip;           // arah asli gambar
    const wantLeft = side === 'e';        // arah yang dibutuhkan di arena
    if (facesLeft !== wantLeft) t = ' style="--hero-flip:scaleX(-1)"';
    return '<img class="hero-img" src="' + h.imgF + '" data-atk="' + (h.imgA || h.imgF) + '" data-idle="' + h.imgF + '"' + t + ' draggable="false">';
  }

  // gambar hero (fallback ke emoji bila file tak tersedia)
  function heroImg(h, cls) {
    if (!h) return '';
    const c = cls ? ' ' + cls : '';
    return h.img
      ? '<img class="hero-img' + c + '" src="' + h.img + '" alt="' + esc(h.name) + '" draggable="false">'
      : h.emoji;
  }

  const UI = (ML.UI = {
    current: null,
    boardTab: 'global',
    wrongOpen: false,

    /* ---------- router ---------- */
    show: function (name) {
      const actives = U.$$('.screen.active');
      for (let i = 0; i < actives.length; i++) actives[i].classList.remove('active');
      const scr = el('screen-' + name);
      if (scr) { scr.classList.add('active'); scr.scrollTop = 0; }
      this.current = name;
      const render = {
        home: this.renderHome, setup: this.renderSetup, learn: this.renderLearn,
        missions: this.renderMissions, achievements: this.renderAchievements,
        leaderboard: this.renderBoard, profile: this.renderProfile,
        intro: this.renderIntro, shop: this.renderShop
      }[name];
      if (render) render.call(this);
    },

    /* ================= INTRO ================= */
    renderIntro: function () {
      const box = el('intro-heroes');
      if (!box) return;
      box.innerHTML = D.heroes.map(function (h, i) {
        return '<div class="ih" style="animation-delay:' + (0.3 + i * 0.12).toFixed(2) + 's">' +
          '<img src="' + h.img + '" alt="' + esc(h.name) + '"></div>';
      }).join('');
    },

    /* ---------- toast & modal ---------- */
    toast: function (msg, gold) {
      const root = el('toast-root');
      if (!root) return;
      while (root.children.length >= 3) root.removeChild(root.firstChild);
      const t = document.createElement('div');
      t.className = 'toast' + (gold ? ' gold' : '');
      t.innerHTML = msg;
      root.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2700);
    },

    modal: function (html) {
      const root = el('modal-root');
      root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + html + '</div></div>';
      return root.firstChild;
    },
    closeModal: function () { el('modal-root').innerHTML = ''; },

    confirmModal: function (title, msg, yesLabel, danger, onYes) {
      const self = this;
      const bd = this.modal(
        '<h3>' + esc(title) + '</h3><p>' + msg + '</p>' +
        '<div class="m-actions">' +
        '<button class="btn ghost" data-mact="no">BATAL</button>' +
        '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-mact="yes">' + esc(yesLabel) + '</button>' +
        '</div>'
      );
      bd.addEventListener('click', function (e) {
        const b = e.target.closest('[data-mact]');
        if (!b) return;
        AU.play('click');
        self.closeModal();
        if (b.getAttribute('data-mact') === 'yes') onYes();
      });
    },

    nameModal: function (cb) {
      const self = this;
      const bd = this.modal(
        '<h3>👋 Selamat datang!</h3>' +
        '<p>Siapa nama panggilanmu, calon Math Legend?</p>' +
        '<input id="name-input" maxlength="12" placeholder="Nama panggilan" autocomplete="off">' +
        '<div class="m-actions"><button class="btn primary" data-mact="ok" style="grid-column:1/-1">MULAI ⚔️</button></div>'
      );
      const input = bd.querySelector('#name-input');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      function submit() {
        const v = (input.value || '').trim() || 'PEMAIN';
        self.closeModal();
        AU.play('rankup');
        if (cb) cb(v.slice(0, 12).toUpperCase());
      }
      bd.addEventListener('click', function (e) {
        if (e.target.closest('[data-mact="ok"]')) submit();
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    },

    /* perbarui baris status pada modal yang terbuka */
    setModalStatus: function (text) {
      const st = U.$('.m-status');
      if (st) st.textContent = text;
    },

    /* modal input generik (kode ruangan / gabung / wasit) */
    inputModal: function (title, desc, placeholder, btnLabel, cb) {
      const self = this;
      const bd = this.modal(
        '<h3>' + title + '</h3><p>' + desc + '</p>' +
        '<input id="im-input" maxlength="40" placeholder="' + esc(placeholder) + '" autocomplete="off">' +
        '<div class="m-actions">' +
        '<button class="btn ghost" data-mact="no">BATAL</button>' +
        '<button class="btn primary" data-mact="go">' + esc(btnLabel) + '</button></div>'
      );
      const input = bd.querySelector('#im-input');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      function go() {
        const v = (input.value || '').trim();
        self.closeModal();
        if (v) cb(v);
      }
      bd.addEventListener('click', function (e) {
        const b = e.target.closest('[data-mact]');
        if (!b) return;
        const a = b.getAttribute('data-mact');
        self.closeModal();
        if (a === 'go') go();
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    },

    /* menunggu lawan di ruangan buatan (tampilkan kode besar) */
    roomModal: function (code, onCancel) {
      const self = this;
      const bd = this.modal(
        '<div style="text-align:center">' +
        '<div class="spinner"></div>' +
        '<h3 style="margin-top:12px">🎮 Ruangan dibuat!</h3>' +
        '<p>Berikan kode ini kepada lawan:<br>' +
        '<b class="room-code">' + esc(code) + '</b></p>' +
        '<div class="m-status">⏳ Menunggu lawan bergabung… (jangan tutup layar ini)</div>' +
        '<p class="page-desc small">Lawan: MAIN → 🌐 GABUNG KODE → masuk ' + esc(code) + '.<br>Wasit: 📺 Mode Wasit → kode yang sama.</p>' +
        '<div class="m-actions"><button class="btn ghost" data-mact="cancel">BATAL</button></div>' +
        '</div>'
      );
      bd.addEventListener('click', function (e) {
        if (e.target.closest('[data-mact="cancel"]')) {
          self.closeModal();
          if (onCancel) onCancel();
        }
      });
    },

    /* modal wasit: masukkan kode ruangan */
    watchModal: function (cb) {
      const self = this;
      const bd = this.modal(
        '<h3>📺 Mode Wasit</h3>' +
        '<p>Masukkan <b>kode ruangan</b> yang tampil di layar pemain (contoh: 4 karakter pertama ID ruangan). Layar ini cocok untuk proyektor/LCD turnamen.</p>' +
        '<input id="watch-input" maxlength="40" placeholder="Kode ruangan" autocomplete="off">' +
        '<div class="m-actions">' +
        '<button class="btn ghost" data-mact="no">BATAL</button>' +
        '<button class="btn primary" data-mact="go">TONTON 📺</button>' +
        '</div>'
      );
      const input = bd.querySelector('#watch-input');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      function go() {
        const v = (input.value || '').trim();
        self.closeModal();
        if (v) cb(v);
      }
      bd.addEventListener('click', function (e) {
        const b = e.target.closest('[data-mact]');
        if (!b) return;
        const a = b.getAttribute('data-mact');
        self.closeModal();
        if (a === 'go') go();
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    },

    /* modal mencari lawan PvP (dengan pembatalan) */
    searchingModal: function (onCancel) {
      const self = this;
      const bd = this.modal(
        '<div style="text-align:center">' +
        '<div class="spinner"></div>' +
        '<h3 style="margin-top:12px">🔎 Mencari lawan…</h3>' +
        '<div class="m-status">Menghubungi server…</div>' +
        '<p>Lawan sungguhan dicari lewat Firebase.<br>Biasanya sekejap bila ada pemain lain mencari.</p>' +
        '<div class="m-actions"><button class="btn ghost" data-mact="cancel">BATAL</button></div>' +
        '</div>'
      );
      bd.addEventListener('click', function (e) {
        if (e.target.closest('[data-mact="cancel"]')) {
          self.closeModal();
          if (onCancel) onCancel();
        }
      });
    },

    /* ================= HOME ================= */
    renderHome: function () {
      const pf = P.data;
      const lv = R.levelFromXP(pf.xp);
      const rk = R.rankFromRP(pf.rp);
      el('h-ava').innerHTML = heroImg(P.heroDef());
      el('h-name').textContent = pf.name || 'PEMAIN';
      el('h-level').textContent = 'Lv ' + lv.level;
      el('h-rank').textContent = rk.icon + ' ' + rk.name;
      el('h-xpfill').style.width = Math.round((lv.cur / lv.need) * 100) + '%';
      el('h-coins').textContent = '🪙 ' + pf.coins;
      el('h-diamonds').textContent = '💎 ' + pf.diamonds;
      el('h-mascot').innerHTML = heroBody(P.heroDef(), 'p');
      el('h-mr').textContent = pf.mr;
      const net = el('h-net');
      if (net) net.textContent = ML.Backend && ML.Backend.online ? 'v0.8.4 🟢 online' : 'v0.8.4 offline';
    },

    /* ================= SETUP ================= */
    renderSetup: function () {
      const st = ML.App.setup;
      const topic = D.topics.find(function (t) { return t.id === st.topic; });
      el('su-mode').textContent = st.mode === 'practice'
        ? '📚 ' + (topic ? topic.name.toUpperCase() : 'LATIHAN')
        : 'RANKED';

      const cards = D.heroes.map(function (h) {
        return '<button class="hero-card' + (h.id === st.heroId ? ' sel' : '') + '" data-act="pick-hero" data-id="' + h.id + '">' +
          '<div class="hc-ava">' + heroImg(h) + '</div>' +
          '<div class="hc-name">' + h.name + '</div>' +
          '<div class="hc-role" style="color:' + h.color + '">' + h.role + '</div>' +
          '</button>';
      }).join('');
      el('su-heroes').innerHTML = cards;

      const h = D.heroes.find(function (x) { return x.id === st.heroId; }) || D.heroes[0];
      el('su-detail').innerHTML =
        '<div class="hd-title">' + h.emoji + ' ' + h.name + ' — ' + h.title + '</div>' +
        '<div class="hd-stats">' +
        '<div class="hd-stat"><span>❤️ HP</span><b>' + h.hp + '</b></div>' +
        '<div class="hd-stat"><span>⚔️ ATK</span><b>' + h.atk + '</b></div>' +
        '<div class="hd-stat"><span>🛡️ DEF</span><b>' + h.def + '</b></div>' +
        '</div>' +
        '<div><b>🧬 Pasif — ' + h.passive.name + ':</b> ' + esc(h.passive.desc) + '</div>' +
        '<div class="hd-skill"><b>' + h.skill.emoji + ' Skill — ' + h.skill.name + ' (⚡' + h.skill.cost + '):</b> ' + esc(h.skill.desc) + '</div>';

      el('su-ai').innerHTML = D.aiLevels.map(function (a, i) {
        const stars = i === 0 ? '★' : i === 1 ? '★★' : i === 2 ? '★★★' : '★★★★';
        return '<button class="ai-chip' + (i === st.aiIdx ? ' sel' : '') + '" data-act="pick-ai" data-idx="' + i + '">' +
          '<b>' + a.name + '</b><span>' + stars + ' 🤖' + a.bot + '</span></button>';
      }).join('');

      const ai = D.aiLevels[st.aiIdx];
      el('su-start').innerHTML = '⚔️ MULAI <small style="font-weight:700">vs 🤖' + ai.bot + '</small>';

      const online = !!(ML.Backend && ML.Backend.online);
      el('su-online').style.display = online ? '' : 'none';
      const g = P.computeGear();
      const any = g.hpMul || g.atkMul || g.critAdd || g.defAdd;
      el('su-gear').innerHTML = any
        ? '🛍️ Atribut aktif: <b>+' + Math.round(g.hpMul * 100) + '% HP</b> • <b>+' + Math.round(g.atkMul * 100) + '% ATK</b> • <b>+' + Math.round(g.critAdd * 100) + '% CRIT</b> • <b>+' + Math.round(g.defAdd) + ' DEF</b> — <button class="link-btn" data-nav="shop">tingkatkan</button>'
        : '🛍️ Belum ada atribut — <button class="link-btn" data-nav="shop">buka TOKO</button> (beli pakai koin/diamond);';
    },

    /* ================= TOKO ATRIBUT ================= */
    renderShop: function () {
      const pf = P.data;
      el('shop-list').innerHTML =
        '<div class="panel gear-card" style="margin-bottom:10px">' +
        '<div class="g-icon">💰</div><div class="g-info"><div class="g-name">Koin: ' + pf.coins + ' 🪙 • Diamond: ' + pf.diamonds + ' 💎</div>' +
        '<div class="g-desc">Dapat dari pertandingan & misi — makin tinggi levelmu, makin besar bonus koin per match.</div></div></div>' +
        D.gear.map(function (it) {
          const lv = P.gearLevel(it.id);
          const cost = P.nextGearCost(it.id);
          const pips = Array.from({ length: it.max }, function (_, i) { return '<i class="' + (i < lv ? 'on' : '') + '"></i>'; }).join('');
          const btn = !cost
            ? '<button class="btn ghost" disabled>MAKS ✓</button>'
            : '<button class="btn ' + (cost.gem ? 'online' : 'primary') + '" data-act="buy-gear" data-id="' + it.id + '">' +
              (cost.coin ? '🪙 ' + cost.coin : '💎 ' + cost.gem) + '</button>';
          return '<div class="panel gear-card" style="margin-bottom:10px">' +
            '<div class="g-icon">' + it.emoji + '</div>' +
            '<div class="g-info"><div class="g-name">' + it.name + ' <span class="pips">' + pips + '</span></div>' +
            '<div class="g-desc">' + it.desc + ' • sekarang: Level ' + lv + '/' + it.max + '</div>' +
            '<div class="g-lv">' + (lv > 0 ? 'Bonus aktif: ' + gearEffectText(it, lv) : 'Belum dibeli') + '</div></div>' +
            '<div class="g-buy">' + btn + '</div></div>';
        }).join('');
    },

    /* ================= LEARN ================= */
    renderLearn: function () {
      el('learn-topics').innerHTML = D.topics.map(function (t) {
        const pt = P.data.perTopic[t.id];
        const mastery = pt && pt.t >= 3 ? Math.round((pt.c / pt.t) * 100) + '% dikuasai' : 'belum ada data';
        return '<button class="topic-card" data-act="practice-topic" data-topic="' + t.id + '">' +
          '<div class="tc-emoji">' + t.emoji + '</div>' +
          '<div class="tc-name" style="color:' + t.color + '">' + t.name + '</div>' +
          '<div class="tc-desc">' + t.desc + '</div>' +
          '<div class="tc-mastery">📊 ' + mastery + '</div>' +
          '</button>';
      }).join('');
    },

    /* ================= MISI ================= */
    renderMissions: function () {
      P.ensureMissions();
      const items = P.data.missions.items;
      el('missions-list').innerHTML = D.missions.map(function (mi) {
        const it = items[mi.id] || { p: 0, done: false };
        const pct = Math.min(100, Math.round((it.p / mi.goal) * 100));
        return '<div class="panel mission' + (it.done ? ' done' : '') + '">' +
          '<div class="m-head">' +
          '<div class="m-icon">' + mi.icon + '</div>' +
          '<div class="m-title"><b>' + esc(mi.name) + '</b><span>' + esc(mi.desc) + '</span></div>' +
          '<div class="m-rw">' + (it.done ? '<span class="m-done">✓ SELESAI</span><br>' : '') + '🎁 +' + mi.xp + ' XP, +' + mi.coin + ' 🪙</div>' +
          '</div>' +
          '<div class="m-bar-wrap"><div class="bar tiny" style="flex:1"><div class="barfill xp" style="width:' + pct + '%"></div></div>' +
          '<span class="m-count">' + Math.min(it.p, mi.goal) + '/' + mi.goal + '</span></div>' +
          '</div>';
      }).join('');
    },

    /* ================= ACHIEVEMENT ================= */
    renderAchievements: function () {
      const got = P.data.achievements;
      const total = D.achievements.length;
      const n = D.achievements.filter(function (a) { return got[a.id]; }).length;
      el('ach-list').innerHTML =
        '<div class="page-desc" style="grid-column:1/-1">' + n + ' dari ' + total + ' prestasi terbuka 🔓</div>' +
        D.achievements.map(function (a) {
          const ok = !!got[a.id];
          return '<div class="ach ' + (ok ? 'unlocked' : 'locked') + '">' +
            '<div class="a-icon">' + (ok ? a.icon : '🔒') + '</div>' +
            '<div class="a-name">' + esc(a.name) + '</div>' +
            '<div class="a-desc">' + esc(a.desc) + '</div></div>';
        }).join('');
    },

    /* ================= LEADERBOARD ================= */
    renderBoard: function () {
      const self = this;
      const tab = this.boardTab;
      U.$$('#board-tabs .tab').forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-tab') === tab);
      });

      const note = el('board-note');
      const isOnline = !!(ML.Backend && ML.Backend.online);
      if (note) note.textContent = isOnline
        ? '🟢 Data online (Firebase) — peringkat pemain sungguhan.'
        : 'Mode offline: peringkat dari data lokal. Isi firebase-config.js untuk mode online (lihat README-FIREBASE.md).';

      // tampilkan lokal dulu (instan)...
      this._boardRows(ML.Leaderboard.get(tab), false);

      // ...lalu lengkapi dengan data online bila tersedia
      if (isOnline && ML.Backend.topScores) {
        ML.Backend.topScores(50).then(function (list) {
          if (!list || self.current !== 'leaderboard' || self.boardTab !== tab) return;
          if (tab === 'friends') return; // tab teman tetap lokal pada fase ini
          let rows = list;
          if (tab === 'school') rows = list.filter(function (r) { return r.school; });
          if (!rows.some(function (r) { return r.me; })) rows = rows.concat(ML.Leaderboard.meEntry());
          rows.sort(function (a, b) { return b.mr - a.mr; });
          self._boardRows(rows.slice(0, 50), true);
        }).catch(function () {});
      }
    },

    _boardRows: function (rows, online) {
      el('board-list').innerHTML = rows.map(function (r, i) {
        const hero = D.heroes.find(function (h) { return h.id === r.hero; }) || D.heroes[0];
        return '<div class="board-row' + (r.me ? ' me' : '') + '">' +
          '<span class="b-rank">' + (i + 1) + '</span>' +
          '<span class="b-ava">' + heroImg(hero) + '</span>' +
          '<span class="b-name">' + (r.me ? '⭐ ' : '') + esc(r.name) + '<small>Lv ' + r.level + (online ? ' • online' : '') + '</small></span>' +
          '<span class="b-mr">' + r.mr + ' MR</span>' +
          '</div>';
      }).join('');
    },

    /* ================= PROFIL ================= */
    renderProfile: function () {
      const pf = P.data;
      const lv = R.levelFromXP(pf.xp);
      const rk = R.rankFromRP(pf.rp);
      const st = pf.stats;

      el('pf-ava').innerHTML = heroImg(P.heroDef());
      el('pf-name').innerHTML = esc(pf.name || 'PEMAIN') + ' <button class="mini-btn" data-act="edit-name">✏️</button>';
      el('pf-level').textContent = 'Level ' + lv.level;
      el('pf-xpfill').style.width = Math.round((lv.cur / lv.need) * 100) + '%';
      el('pf-xptext').textContent = 'XP ' + lv.cur + ' / ' + lv.need + ' (total ' + pf.xp + ')';
      el('pf-rank').innerHTML = '<span style="color:' + rk.color + '">' + rk.icon + ' ' + rk.name + '</span>';
      el('pf-rpfill').style.width = Math.round((rk.cur / rk.need) * 100) + '%';
      el('pf-rptext').textContent = 'RP ' + rk.cur + ' / ' + rk.need + ' • Math Rating ' + pf.mr;

      const winRate = st.matches ? Math.round((st.wins / st.matches) * 100) : 0;
      el('pf-stats').innerHTML = '<h3>📊 STATISTIK</h3>' +
        this.statGrid([
          [pf.mr, 'MATH RATING'], [st.matches, 'PERTANDINGAN'],
          [winRate + '%', 'WIN RATE'], [st.totalCorrect + '/' + st.totalQuestions, 'BENAR TOTAL'],
          [st.bestCombo + 'x', 'COMBO TERBAIK'], [st.hardCorrect, 'SOAL SULIT BENAR'],
          [st.totalPerfect, 'PERFECT'], [st.comebacks, 'COMEBACK']
        ]);

      el('pf-topics').innerHTML = '<h3>📈 PENGUASAAN MATERI</h3>' + this.topicBars(pf.perTopic, true);

      const B = ML.Backend;
      const linked = !!(B && B.isLinked && B.isLinked());
      const acct = el('pf-account');
      if (acct) {
        acct.innerHTML = linked
          ? '<div class="account-state ok">☁️ <b>AKUN DITAUTKAN</b><br><small>Progres tersimpan ke Cloud dan dapat dipulihkan di perangkat lain.</small></div><button class="btn primary wide" data-act="sync-cloud">☁️ SINKRONKAN SEKARANG</button>'
          : '<div class="account-state warn">🔒 <b>PROGRES BELUM DIAMANKAN</b><br><small>Tautkan akun untuk menyimpan Level, Hero, atribut, Coin, Diamond, EXP, dan Rank.</small></div><div class="account-actions"><button class="btn online wide" data-act="link-google">🔗 TAUTKAN AKUN & SIMPAN PROGRES</button><button class="btn primary wide" data-act="restore-google">☁️ MASUK & PULIHKAN PROGRES</button></div>';
      }

      el('pf-sound').innerHTML = AU.enabled ? '🔊 EFEK SUARA: ON' : '🔇 EFEK SUARA: OFF';
      const det = AU.filesDetected ? AU.filesDetected() : { ok: 0, total: 0 };
      el('pf-music').innerHTML = (AU.musicEnabled ? '🎵 MUSIK: ON' : '🎵 MUSIK: OFF') +
        (det.total ? ' <small>(file terdeteksi ' + det.ok + '/' + det.total + ')</small>' : '');
    },

    /* ---------- helper kecil ---------- */
    statGrid: function (cells) {
      return '<div class="stat-grid">' + cells.map(function (c) {
        return '<div class="stat-cell"><b>' + c[0] + '</b><span>' + c[1] + '</span></div>';
      }).join('') + '</div>';
    },

    topicBars: function (perTopic, lifetime) {
      const topicsWithData = D.topics.filter(function (t) { return perTopic[t.id] && perTopic[t.id].t > 0; });
      if (!topicsWithData.length) return '<p class="page-desc">Mainkan pertandingan untuk melihat data penguasaan materi 📊</p>';
      return topicsWithData.map(function (t) {
        const pt = perTopic[t.id];
        const acc = pt.t ? Math.round((pt.c / pt.t) * 100) : 0;
        const color = acc >= 80 ? '#10b981' : acc >= 50 ? '#f59e0b' : '#ef4444';
        return '<div class="topic-row">' +
          '<div class="t-head"><span>' + t.emoji + ' ' + esc(t.name) + (lifetime ? ' <small style="color:#94a3b8">(' + pt.c + '/' + pt.t + ' soal)</small>' : '') + '</span><b style="color:' + color + '">' + acc + '%</b></div>' +
          '<div class="tbar"><div class="tfill" style="width:' + acc + '%;background:' + color + '"></div></div>' +
          '</div>';
      }).join('');
    },

    /* ================= RESULT ================= */
    renderResult: function (sum, res) {
      this.wrongOpen = false;
      const banner = el('res-banner');
      banner.className = 'res-banner ' + (res.win ? 'win' : res.draw ? 'draw' : 'lose');
      banner.textContent = res.win ? '🏆 VICTORY' : res.draw ? '🤝 DRAW' : 'DEFEAT';
      // confetti ringan saat menang (elemen sedikit, dihapus otomatis)
      if (res.win) {
        const colors = ['#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899'];
        for (let i = 0; i < 14; i++) {
          const c = document.createElement('i');
          c.className = 'confetti';
          c.style.left = (4 + Math.random() * 92).toFixed(1) + '%';
          c.style.background = colors[i % colors.length];
          c.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
          banner.appendChild(c);
          setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 2700);
        }
      }
      el('res-sub').textContent = res.win
        ? 'Luar biasa! Matematikamu benar-benar menjadi senjata. 💪'
        : (res.draw ? 'Seri ketat! Sedikit lagi.' : 'Pertahankan latihan! Cek pembahasan di bawah — kamu pasti bisa. 💪');

      /* --- reward --- */
      let rows = '';
      rows += sum.xpParts.map(function (p) {
        return '<div class="rw-row"><span>' + esc(p.k) + '</span><b>+' + p.v + '</b></div>';
      }).join('');
      if (sum.xpScaled) rows += '<div class="rw-row"><span>Mode latihan (×0.6)</span><b>·</b></div>';
      rows += '<div class="rw-row total"><span>⭐ TOTAL XP</span><b>+' + sum.xpTotal + '</b></div>';
      rows += '<div class="rw-row"><span>\ud83e\ude99 Coin</span><b class="up">+' + sum.coins + '</b></div>';
      if (sum.levelBonus > 0) rows += '<div class="rw-row"><span>\ud83c\udfc5 Bonus Level (' + sum.level + ')</span><b class="up">+' + sum.levelBonus + '</b></div>';
      if (sum.diamonds > 0) rows += '<div class="rw-row"><span>💎 Diamond</span><b class="up">+' + sum.diamonds + '</b></div>';
      if (res.online) {
        rows += '<div class="rw-row"><span>' + sum.rankAfter.icon + ' ' + sum.rankAfter.name + '</span>' +
          '<b class="' + (sum.rpDelta >= 0 ? 'up' : 'down') + '">' + (sum.rpDelta >= 0 ? '+' : '') + sum.rpDelta + ' RP</b></div>';
        rows += '<div class="rw-row"><span>🧠 Math Rating</span><b class="' + (sum.mrDelta >= 0 ? 'up' : 'down') + '">' + (sum.mrDelta >= 0 ? '+' : '') + sum.mrDelta + '</b></div>';
        rows += '<div class="bar tiny" style="margin-top:6px"><div class="barfill rp" style="width:' + Math.round((sum.rankAfter.cur / sum.rankAfter.need) * 100) + '%"></div></div>';
      }
      if (sum.levelUp) rows += '<div class="rw-note">🎉 LEVEL UP! Lv ' + sum.level + ' → <b>Lv ' + sum.newLevel + '</b></div>';
      if (sum.rankUp) rows += '<div class="rw-note">🎊 RANK UP! Naik ke <b>' + sum.rankAfter.icon + ' ' + sum.rankAfter.name + '</b></div>';
      el('res-rewards').innerHTML = '<h3>🎁 REWARD</h3>' + rows;

      /* --- statistik --- */
      el('res-stats').innerHTML = '<h3>📊 STATISTIK MATCH</h3>' + this.statGrid([
        [Math.round(res.accuracy * 100) + '%', 'AKURASI'],
        [U.round1(res.avgTime) + 's', 'WAKTU RATA-RATA'],
        ['x' + res.maxCombo, 'COMBO TERINGGI'],
        [res.correct + '/' + res.questions, 'JAWABAN BENAR'],
        [res.perfect, 'PERFECT'],
        [res.hardCorrect + '/' + res.hardTotal, 'SOAL SULIT'],
        [res.dmgDealt, 'DAMAGE'],
        [res.rounds, 'RONDE']
      ]);

      /* --- penguasaan materi --- */
      el('res-topics').innerHTML = '<h3>📚 MATERI MATCH INI</h3>' + this.topicBars(res.perTopic, false);

      /* --- rekomendasi belajar --- */
      let reco = '<div class="reco-title">💡 REKOMENDASI</div>';
      const scored = D.topics.filter(function (t) { return res.perTopic[t.id] && res.perTopic[t.id].t >= 2; })
        .map(function (t) { const pt = res.perTopic[t.id]; return { t: t, acc: pt.c / pt.t }; });
      if (scored.length >= 2) {
        scored.sort(function (a, b) { return b.acc - a.acc; });
        const best = scored[0], worst = scored[scored.length - 1];
        reco += '<p>Performa kamu bagus pada <b style="color:' + best.t.color + '">' + best.t.emoji + ' ' + best.t.name + '</b> (' + Math.round(best.acc * 100) + '%).</p>';
        if (worst.acc < 0.8) {
          reco += '<p>Namun kamu masih perlu berlatih <b style="color:' + worst.t.color + '">' + worst.t.emoji + ' ' + worst.t.name + '</b> (' + Math.round(worst.acc * 100) + '%).</p>';
          reco += '<button class="btn primary" data-act="practice-weak" data-topic="' + worst.t.id + '">📚 LATIHAN ' + worst.t.name.toUpperCase() + '</button>';
        } else {
          reco += '<p>Semua materi sudah dikuasai di atas 80% — coba lawan AI yang lebih sulit! 🔥</p>';
        }
      } else {
        reco += '<p>Mainkan lebih banyak ronde agar sistem dapat merekomendasikan latihan yang tepat. 💪</p>';
      }
      el('res-reco').innerHTML = reco;

      /* --- misi & achievement terbuka --- */
      let unlocks = '';
      if (sum.missions.length) {
        unlocks += sum.missions.map(function (mi) {
          return '<div class="unlock-row"><span class="u-icon">' + mi.icon + '</span><span>Misi selesai: <b>' + esc(mi.name) + '</b></span><span class="u-rw">+' + mi.xp + ' XP, +' + mi.coin + ' 🪙</span></div>';
        }).join('');
      }
      if (sum.achievements.length) {
        unlocks += sum.achievements.map(function (a) {
          return '<div class="unlock-row"><span class="u-icon">' + a.icon + '</span><span>Prestasi baru: <b>' + esc(a.name) + '</b></span><span class="u-rw">🏆</span></div>';
        }).join('');
      }
      el('res-unlocks').innerHTML = unlocks ? '<h3>🎊 TERBUKA</h3>' + unlocks : '';
      el('res-unlocks').style.display = unlocks ? '' : 'none';

      /* --- pembahasan soal salah --- */
      const wl = res.wrongList || [];
      const wBox = el('res-wrong');
      if (!wl.length) {
        wBox.style.display = 'none';
      } else {
        wBox.style.display = '';
        wBox.innerHTML = '<h3>📖 PEMBAHASAN</h3>' +
          '<button class="wrong-toggle" data-act="toggle-wrong">Lihat ' + wl.length + ' soal yang salah ▾</button>' +
          '<div id="wrong-list" style="display:none">' + wl.map(function (w) {
            const t = D.topics.find(function (x) { return x.id === w.topic; });
            return '<div class="wrong-item">' +
              '<div class="w-q">' + (t ? t.emoji : '❓') + ' ' + esc(w.text) + '</div>' +
              '<div class="w-a">Jawaban: ' + esc(w.answer) + '</div>' +
              '<div class="w-e">' + esc(w.explanation) + '</div></div>';
          }).join('') + '</div>';
      }

      /* suara */
      AU.play(res.win ? 'victory' : 'defeat');
      if (sum.rankUp || sum.levelUp) setTimeout(function () { AU.play('rankup'); }, 700);
    },

    toggleWrong: function () {
      this.wrongOpen = !this.wrongOpen;
      const list = el('wrong-list');
      const btn = U.$('.wrong-toggle');
      if (list) list.style.display = this.wrongOpen ? '' : 'none';
      if (btn) btn.textContent = (this.wrongOpen ? 'Sembunyikan' : 'Lihat ' + (ML.App.lastResult ? ML.App.lastResult.wrongList.length : '')) + ' pembahasan ' + (this.wrongOpen ? '▴' : '▾');
    },

    /* ============================================================
       BATTLE UI ADAPTER
       ============================================================ */
    B: { engine: null, offs: [], refs: {}, lastPick: null, lastTickSec: 10 },

    attachBattle: function (engine) {
      const self = this;
      const B = this.B;
      this.detachBattle();
      B.engine = engine;
      B.lastPick = null;
      B.lastTickSec = 10;

      const p = engine.p, e = engine.e;
      const rp = el('b-p-ava'), re = el('b-e-ava');
      rp.innerHTML = heroImg(p.hero); re.innerHTML = heroImg(e.hero);
      rp.style.borderColor = p.hero.color2; re.style.borderColor = '#fda4af';
      el('b-p-name').textContent = (engine.cfg.playerName || 'KAMU');
      el('b-e-name').textContent = '🤖 ' + engine.ai.level.bot;
      el('b-hero-p').innerHTML = heroBody(p.hero, 'p');
      el('b-hero-e').innerHTML = heroBody(e.hero, 'e');
      const arena = el('b-arena');
      if (arena) {
        arena.querySelectorAll('.combo-float').forEach(function(n){ n.remove(); });
        ['p','e'].forEach(function(side){
          const n = document.createElement('div');
          n.className = 'combo-float ' + side;
          n.id = 'b-combo-float-' + side;
          n.setAttribute('aria-hidden','true');
          arena.appendChild(n);
        });
      }
      const code = el('b-code'), live = el('b-live');
      const pvp = engine.cfgPvp;
      if (code && live) {
        if (pvp && pvp.role !== 'watch') {
          code.style.display = '';
          const rid = String(pvp.roomId || '');
          code.textContent = 'KODE ' + (rid.length <= 6 ? rid.toUpperCase() : rid.slice(0, 6).toUpperCase());
        } else code.style.display = 'none';
        live.style.display = (pvp && pvp.role === 'watch') ? '' : 'none';
      }
      // Arena hero dibuat benar-benar tanpa bingkai; warna hero tetap dipakai oleh efek combo.
      el('b-hero-p').style.removeProperty('border-color');
      el('b-hero-e').style.removeProperty('border-color');

      // pip energy
      ['b-p-energy', 'b-e-energy'].forEach(function (id) {
        const box = el(id);
        box.innerHTML = '';
        for (let i = 0; i < R.MAX_ENERGY; i++) {
          const pip = document.createElement('span');
          pip.className = 'pip';
          box.appendChild(pip);
        }
      });
      el('b-fx').innerHTML = '';
      this._updHp(p.hp, p.maxHp, e.hp, e.maxHp);
      this._updEnergy(p.energy, e.energy);
      this._updCombo('p', 0); this._updCombo('e', 0);
      this._updShield(p.shield, e.shield);
      this._updSkillBtn();
      this._updDifficultySkills();

      const on = function (ev, fn) { B.offs.push(engine.on(ev, fn)); };

      on('question', function (d) { self._onQuestion(d); });
      on('timer', function (d) { self._onTimer(d); });
      on('answered', function (d) { self._onAnswered(d); });
      on('attack', function (d) { self._onAttack(d); });
      on('skill', function (d) { self._onSkill(d); });
      on('state', function (d) { self._onNetState(d); });
      on('difficulty', function (d) { self.showDifficultyChoice(d.difficulty); });
    },

    detachBattle: function () {
      const B = this.B;
      B.offs.forEach(function (off) { try { off(); } catch (e) {} });
      B.offs = [];
      B.engine = null;
      B.lastPick = null;
    },

    _onNetState: function (d) {
      const engine = this.B.engine;
      if (!engine || !d) return;
      if (Number.isFinite(Number(d.hpP)) && Number.isFinite(Number(d.hpE))) {
        this._updHp(Number(d.hpP), engine.p.maxHp, Number(d.hpE), engine.e.maxHp);
      }
      if (d.enP != null && d.enE != null) this._updEnergy(Number(d.enP), Number(d.enE));
      if (d.cbP != null) this._updCombo('p', Number(d.cbP));
      if (d.cbE != null) this._updCombo('e', Number(d.cbE));
      if (d.shP != null && d.shE != null) this._updShield(Number(d.shP), Number(d.shE));
      this._updSkillBtn();
    },

    _updHp: function (hpP, maxP, hpE, maxE) {
      el('b-p-hpfill').style.width = Math.max(0, (hpP / maxP) * 100) + '%';
      el('b-e-hpfill').style.width = Math.max(0, (hpE / maxE) * 100) + '%';
      el('b-p-hptext').textContent = Math.max(0, hpP) + '/' + maxP;
      el('b-e-hptext').textContent = Math.max(0, hpE) + '/' + maxE;
    },
    _updEnergy: function (pe, ee) {
      const P1 = el('b-p-energy').children, E1 = el('b-e-energy').children;
      for (let i = 0; i < P1.length; i++) P1[i].classList.toggle('on', i < pe);
      for (let i = 0; i < E1.length; i++) E1[i].classList.toggle('on', i < ee);
    },
    _updCombo: function (side, combo) {
      const badge = el(side === 'p' ? 'b-p-combo' : 'b-e-combo');
      const fig = el(side === 'p' ? 'b-hero-p' : 'b-hero-e');
      const float = el('b-combo-float-' + side);
      if (badge) { badge.classList.remove('on', 'pop'); badge.textContent = ''; }
      if (fig) fig.classList.remove('combo-active', 'combo-2', 'combo-3', 'combo-4', 'combo-5', 'combo-6', 'combo-burst');
      if (fig) { fig.removeAttribute('data-combo-label'); fig.removeAttribute('data-combo-level'); }
      if (float) { float.className = 'combo-float ' + side; float.textContent = ''; }
      if (combo >= 2 && fig && float) {
        const label = R.comboLabel(combo) || ('COMBO x' + combo);
        fig.classList.add('combo-active', 'combo-' + Math.min(6, combo));
        fig.setAttribute('data-combo-level', String(combo));
        float.textContent = '🔥 ' + label + ' 🔥';
        float.classList.add('on', 'combo-' + Math.min(6, combo));
        float.classList.remove('burst'); void float.offsetWidth; float.classList.add('burst');
        fig.classList.remove('combo-burst'); void fig.offsetWidth; fig.classList.add('combo-burst');
      }
    },
    _updShield: function (ps, es) {
      const a = el('b-p-shield'), b = el('b-e-shield');
      a.classList.toggle('on', ps > 0);
      b.classList.toggle('on', es > 0);
      a.textContent = '🛡️' + (ps > 0 ? ps : '');
      b.textContent = '🛡️' + (es > 0 ? es : '');
    },
    _updSkillBtn: function () {
      const engine = this.B.engine;
      const btn = el('b-skill');
      if (!engine) return;
      const f = engine.p, sk = f.hero.skill;
      btn.className = 'skill-btn';
      const isQueue = (sk.id === 'meteor' || sk.id === 'shadow' || sk.id === 'drain');
      if (isQueue && f.empowered) {
        btn.classList.add('armed');
        btn.innerHTML = sk.emoji + ' ' + sk.name + ' SIAP! Jawab benar 💥';
        btn.disabled = true;
        return;
      }
      btn.innerHTML = sk.emoji + ' ' + sk.name + ' <em>⚡' + sk.cost + '</em>';
      btn.disabled = f.energy < sk.cost || (sk.id === 'shield' && f.shield > 0);
    },

    showDifficultyChoice: function (d) {
      const buttons = U.$$('#b-difficulty-skills .diff-skill');
      buttons.forEach(function (b) { b.classList.toggle('selected', Number(b.getAttribute('data-diff')) === Number(d)); });
      const label = R.DIFF_LABEL[d] || 'SEDANG';
      const hint = el('skill-hint');
      if (hint) hint.textContent = 'Soal ' + label + ' siap • pilih bebas kapan saja';
    },

    _updDifficultySkills: function () {
      const engine = this.B.engine;
      const buttons = U.$$('#b-difficulty-skills .diff-skill');
      if (!buttons.length) return;
      const locked = !engine || engine.role === 'watch';
      buttons.forEach(function (b) { b.disabled = !!locked; });
    },

    _onQuestion: function (d) {
      const q = d.q;
      const t = D.topics.find(function (x) { return x.id === q.topic; }) || D.topics[0];
      const topicEl = el('q-topic');
      topicEl.textContent = t.emoji + ' ' + t.name.toUpperCase();
      topicEl.style.background = t.color;
      const diffEl = el('q-diff');
      diffEl.textContent = R.DIFF_LABEL[q.difficulty];
      diffEl.style.background = R.DIFF_COLOR[q.difficulty];
      diffEl.style.color = '#fff';

      el('q-text').textContent = q.text;
      const btns = U.$$('#q-answers .ans');
      btns.forEach(function (b, i) {
        b.querySelector('span').textContent = q.choices[i];
        b.disabled = false;
        b.classList.remove('correct', 'wrong', 'dim');
      });
      const fb = el('q-feedback');
      fb.textContent = '';
      fb.className = 'q-feedback';
      el('b-round').textContent = d.parallel ? ('SOAL #' + d.round) : (d.round + '/' + d.maxRounds);
      el('b-e-status').textContent = '🤔 AI berpikir…';
      const bar = el('q-timerbar');
      bar.style.width = '100%';
      bar.className = 'q-timerbar';
      this.B.lastPick = null;
      this.B.lastTickSec = Math.ceil(d.limit || ML.Rules.Q_TIME);
      el('q-time').textContent = Math.ceil(d.limit || ML.Rules.Q_TIME);
      this._updEnergy(d.pEnergy, d.eEnergy);
      this._updSkillBtn();
      this._updDifficultySkills();
      this._updShield(this.B.engine.p.shield, this.B.engine.e.shield);
    },

    _onTimer: function (d) {
      const pct = U.clamp((d.left / d.total) * 100, 0, 100);
      const bar = el('q-timerbar');
      bar.style.width = pct + '%';
      bar.className = 'q-timerbar' + (pct <= 25 ? ' danger' : pct <= 50 ? ' warn' : '');
      const sec = Math.max(0, Math.ceil(d.left));
      el('q-time').textContent = sec;
      const engine = this.B.engine;
      if (sec <= 3 && sec < this.B.lastTickSec && engine && !engine.p.answered) AU.play('tick');
      this.B.lastTickSec = sec;
    },

    _onAnswered: function (d) {
      const engine = this.B.engine;
      if (!engine) return;
      const gi = R.gradeInfo[d.grade] || R.gradeInfo.HIT;

      if (d.side === 'p') {
        const btns = U.$$('#q-answers .ans');
        const q = engine.q;
        btns.forEach(function (b, i) {
          b.disabled = true;
          if (i === q.answerIndex) b.classList.add('correct');
          else if (i !== UI.B.lastPick) b.classList.add('dim');
        });
        if (this.B.lastPick != null && this.B.lastPick !== q.answerIndex) {
          btns[this.B.lastPick].classList.add('wrong');
        }
        const fb = el('q-feedback');
        if (d.correct) {
          fb.className = 'q-feedback ' + gi.cls;
          fb.innerHTML = gi.icon + ' <b>' + gi.text + '</b> — ' + d.timeUsed + 's' +
            (d.combo >= 2 ? ' • ' + R.comboLabel(d.combo) : '');
          AU.play(d.grade === 'PERFECT' ? 'perfect' : 'correct');
        } else {
          fb.className = 'q-feedback miss';
          fb.innerHTML = '❌ <b>' + gi.text + '</b> — Jawaban: ' + esc(d.answer) +
            '<span class="expl">' + esc(d.explanation) + '</span>';
          AU.play('wrong');
        }
      } else {
        el('b-e-status').textContent = engine.cfgPvp
          ? (d.correct ? '⚔️ Lawan menyerang' : (d.grade === 'TIME' ? '⏰ Lawan kehabisan waktu' : '❌ Lawan salah'))
          : (d.correct ? '✔️ AI benar (' + d.timeUsed + 's)' : (d.grade === 'TIME' ? '⏰ AI kehabisan waktu' : '❌ AI salah'));
      }

      this._updEnergy(engine.p.energy, engine.e.energy);
      this._updCombo(d.side, d.combo);
      this._updSkillBtn();
    },

    _onAttack: function (d) {
      const engine = this.B.engine;
      if (!engine) return;
      this._updHp(d.hpP, engine.p.maxHp, d.hpE, engine.e.maxHp);
      this._updShield(engine.p.shield, engine.e.shield);

      // animasi hero
      const atkFig = el(d.from === 'p' ? 'b-hero-p' : 'b-hero-e');
      const defFig = el(d.to === 'p' ? 'b-hero-p' : 'b-hero-e');
      const cls = d.from === 'p' ? 'atk-p' : 'atk-e';
      atkFig.classList.remove(cls); void atkFig.offsetWidth; atkFig.classList.add(cls);
      defFig.classList.remove('hurt'); void defFig.offsetWidth; defFig.classList.add('hurt');
      if (d.crit || d.meteor) {
        const arena = el('b-arena');
        arena.classList.remove('shake'); void arena.offsetWidth; arena.classList.add('shake');
      }
      this._heroFx(d);
      // pose menyerang: gambar tubuh utuh berganti sesaat
      const figImg = atkFig.querySelector('img');
      if (figImg && figImg.dataset.atk) {
        figImg.src = figImg.dataset.atk;
        setTimeout(function () { figImg.src = figImg.dataset.idle; }, 650);
      }

      // angka damage (dibatasi jumlah node)
      const fx = el('b-fx');
      while (fx.children.length >= 6) fx.removeChild(fx.firstChild);
      const dmg = document.createElement('div');
      dmg.className = 'dmg ' + (d.crit ? 'crit' : d.grade === 'WEAK' ? 'weak' : '') + (d.to === 'p' ? ' at-p' : ' at-e');
      dmg.textContent = '−' + d.dmg;
      fx.appendChild(dmg);
      if (d.heal > 0) {
        const heal = document.createElement('div');
        heal.className = 'dmg heal' + (d.from === 'p' ? ' at-p' : ' at-e');
        heal.textContent = '+' + d.heal + ' HP';
        fx.appendChild(heal);
        setTimeout(function () { if (heal.parentNode) heal.parentNode.removeChild(heal); }, 900);
      }
      if (d.tags && d.tags.length) {
        const tag = document.createElement('div');
        tag.className = 'tag-line' + (d.to === 'p' ? ' at-p' : ' at-e');
        const pri = d.tags.filter(function (s) { return s.indexOf('PERFECT') < 0; }).slice(-2);
        tag.textContent = (pri.length ? pri.join(' • ') : d.tags[d.tags.length - 1]) || '';
        if (tag.textContent) fx.appendChild(tag);
      }
      setTimeout(function () {
        if (dmg.parentNode) dmg.parentNode.removeChild(dmg);
      }, 900);
      setTimeout(function () {
        const last = fx.querySelector('.tag-line');
        if (last && last.parentNode) last.parentNode.removeChild(last);
      }, 950);

      // efek suara khas hero penyerang (file milikmu bila ada, sintesis bila tidak)
      const atkHero = d.from === 'p' ? engine.p.hero.id : engine.e.hero.id;
      AU.heroAttack(atkHero, d.crit || d.meteor);
    },

    /* efek serangan khas tiap hero: proyektil / tebasan (elemen tunggal, dibersihkan otomatis) */
    _heroFx: function (d) {
      const engine = this.B.engine;
      const arena = el('b-arena'), fx = el('b-fx');
      if (!engine || !arena || !fx) return;
      const attacker = d.from === 'p' ? engine.p : engine.e;
      const id = attacker.hero.id;
      const dist = Math.max(90, Math.round(arena.clientWidth * 0.52));
      const remove = function (node) {
        setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 950);
      };
      if (fx.children.length >= 9) fx.removeChild(fx.firstChild);

      if (id === 'lyra' || id === 'sena' || id === 'morru') {
        // proyektil: bola api LYRA / panah SENA / bola jiwa MORRU
        const p = document.createElement('i');
        p.className = 'fx-proj ' + (id === 'lyra' ? 'fire' : id === 'sena' ? 'arrow' : 'orb') + (d.from === 'e' ? ' from-e' : '');
        if (d.from === 'p') p.style.setProperty('--dx', dist + 'px');
        else p.style.setProperty('--dxn', -dist + 'px');
        fx.appendChild(p);
        remove(p);
      } else {
        // tebasan pada pertahanan lawan: biru RAKA / bayangan ungu KAGE
        const s = document.createElement('i');
        s.className = 'fx-slash';
        s.style.left = (d.to === 'p' ? '22%' : '78%');
        if (id === 'kage') {
          s.style.setProperty('--slash-c', '#a78bfa');
          s.style.setProperty('--slash-g', 'rgba(167,139,250,.55)');
        }
        fx.appendChild(s);
        remove(s);
      }
    },

    _onSkill: function (d) {
      const engine = this.B.engine;
      if (!engine) return;
      this._updEnergy(engine.p.energy, engine.e.energy);
      this._updShield(engine.p.shield, engine.e.shield);
      this._updSkillBtn();
      AU.play('skill');
      if (d.id === 'meteor') this.toast(d.side === 'p' ? '☄️ METEOR siap — jawab benar!' : '🤖 AI menyiapkan METEOR…', d.side === 'p');
      if (d.id === 'shadow') this.toast(d.side === 'p' ? '🥷 SHADOW STRIKE siap — jawab benar!' : '🤖 AI menghilang ke bayangan…', d.side === 'p');
      if (d.id === 'drain') this.toast(d.side === 'p' ? '👻 SOUL DRAIN siap — hisap HP lawan!' : '🤖 AI mengumpulkan jiwa…', d.side === 'p');
      if (d.id === 'shield') this.toast(d.side === 'p' ? '🛡️ SHIELD WALL aktif!' : '🤖 AI memasang perisai', d.side === 'p');
    }
  });
})();
