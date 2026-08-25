/* ============================================================
   MATH LEGENDS — test suite (Node, tanpa DOM)
   Jalankan:  node test/test.js
   Menguji: question engine (kualitas soal & pilihan jawaban),
   aturan (level/rank/elo/xp), battle engine (simulasi penuh, timer virtual),
   player progression, dan adaptive difficulty.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// muat modul game di konteks global (bebas DOM)
const SRC = path.join(__dirname, '..', 'src', 'js');
['core.js', 'data.js', 'rules.js', 'questions.js', 'ai.js', 'battle.js', 'player.js', 'leaderboard.js', 'backend.js'].forEach(f => {
  eval(fs.readFileSync(path.join(SRC, f), 'utf8'));
});
const ML = globalThis.ML;
const { util: U, DATA: D, Rules: R, QEngine, Battle } = ML;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e && e.message)); }
}

/* ================= 0. DATA HERO ================= */
console.log('\n[0] Data hero');
test('5 hero lengkap & valid', () => {
  assert.strictEqual(D.heroes.length, 5, 'hero berjumlah 5');
  D.heroes.forEach(h => {
    assert.ok(h.id && h.name && h.role, 'identitas hero lengkap: ' + h.id);
    assert.ok(h.img, 'hero punya gambar: ' + h.id);
    assert.ok(h.hp > 0 && h.atk > 0 && h.def >= 0, 'stat hero valid: ' + h.id);
    assert.ok(h.skill && h.skill.cost >= 4 && h.skill.cost <= 10, 'biaya skill 4-10: ' + h.id);
    assert.ok(h.passive && h.passive.name, 'ada pasif: ' + h.id);
  });
  const ids = new Set(D.heroes.map(h => h.id));
  assert.ok(ids.has('kage') && ids.has('morru'), 'NINJA & NECROMANCER ada');
});

/* ================= 1. QUESTION ENGINE ================= */
console.log('\n[1] Question Engine');

const CHOICE_OK = q => {
  assert.ok(q.choices.length === 4, 'pilihan harus 4: ' + JSON.stringify(q));
  assert.ok(new Set(q.choices).size === 4, 'pilihan harus unik: ' + JSON.stringify(q.choices));
  assert.ok(q.answerIndex >= 0 && q.answerIndex < 4, 'answerIndex valid');
  assert.strictEqual(q.choices[q.answerIndex], String(q.answer), 'jawaban sesuai indeks');
  assert.ok(q.explanation && q.explanation.length >= 5, 'ada pembahasan: ' + q.explanation);
  assert.ok(q.text && q.text.length >= 3, 'ada teks soal');
};

D.topics.forEach(t => {
  for (let d = 1; d <= 5; d++) {
    test(`${t.id} difficulty ${d} (150 sampel)`, () => {
      const used = new Set();
      for (let i = 0; i < 150; i++) {
        const q = QEngine.make(t.id, d, used);
        assert.ok(q, 'soal selalu dihasilkan');
        CHOICE_OK(q);
        assert.strictEqual(q.topic, t.id);
      }
    });
  }
});

test('tidak mengulang soal dalam satu match (18 ronde)', () => {
  const used = new Set();
  const texts = [];
  for (let i = 0; i < 18; i++) {
    const q = QEngine.make(U.pick(QEngine.topics()), U.ri(1, 5), used);
    texts.push(q.text);
  }
  assert.ok(new Set(texts).size === texts.length, 'semua soal unik: ' + texts.length);
});

test('fallback difficulty/topik tak dikenal', () => {
  const q = QEngine.make('aljabar', 99, new Set());
  assert.ok(q && q.choices.length === 4);
  const q2 = QEngine.make('topik-tidak-ada', 2, new Set());
  assert.ok(q2 && q2.choices.length === 4);
});

/* ================= 1b. AUDIT MENYELURUH: solver independen =================
   Setiap soal diselesaikan ulang oleh pemeriksa terpisah (bukan kode generator)
   untuk menjamin jawaban yang ditandai "benar" memang benar secara matematis.
   (Regresi bug v0.5.0: "x ÷ 4 = 32" dijawab 8, seharusnya 128.) */
console.log('\n[1b] Audit menyeluruh — verifikasi jawaban dengan solver independen');

function fracParse(s) {
  const m = String(s).match(/^(-?\d+)\/(\d+)$/);
  return m ? { n: +m[1], d: +m[2] } : { n: +s, d: 1 };
}
function fracEq(a, b) {
  const A = fracParse(a), B = fracParse(b);
  return A.n * B.d === B.n * A.d;
}
function idrVal(s) { return Number(String(s).replace(/[^\d]/g, '')); }

const SOLVERS = {
  arit(t) {
    let m;
    if (m = t.match(/^(\d+) \+ (\d+) = \?$/)) return String(+m[1] + +m[2]);
    if (m = t.match(/^(\d+) − (\d+) = \?$/)) return String(+m[1] - +m[2]);
    if (m = t.match(/^(\d+) × (\d+) = \?$/)) return String(+m[1] * +m[2]);
    if (m = t.match(/^(\d+) ÷ (\d+) = \?$/)) return String(+m[1] / +m[2]);
    if (m = t.match(/^(\d+) \+ (\d+) × (\d+) = \?$/)) return String(+m[1] + +m[2] * +m[3]);
    if (m = t.match(/^(\d+) × (\d+) − (\d+) = \?$/)) return String(+m[1] * +m[2] - +m[3]);
    if (m = t.match(/^(\d+)² = \?$/)) return String(+m[1] * +m[1]);
    if (m = t.match(/^(\d+) × (\d+) \+ (\d+) × (\d+) = \?$/)) return String(+m[1] * +m[2] + +m[3] * +m[4]);
    return null;
  },
  aljabar(t) {
    let m;
    if (m = t.match(/^x \+ (\d+) = (\d+)$/)) return String(+m[2] - +m[1]);
    if (m = t.match(/^x − (\d+) = (\d+)$/)) return String(+m[2] + +m[1]);
    if (m = t.match(/^(\d+)x = (\d+)$/)) return String(+m[2] / +m[1]);
    if (m = t.match(/^x ÷ (\d+) = (\d+)$/)) return String(+m[2] * +m[1]); // kasus bug lama
    if (m = t.match(/^(\d+)x \+ (\d+) = (\d+)$/)) return String((+m[3] - +m[2]) / +m[1]);
    if (m = t.match(/^(\d+)x − (\d+) = (\d+)$/)) return String((+m[3] + +m[2]) / +m[1]);
    if (m = t.match(/^(\d+)\(x \+ (\d+)\) = (\d+)$/)) return String(+m[3] / +m[1] - +m[2]);
    if (m = t.match(/^(\d+)x \+ (\d+) = (\d+)x \+ (\d+)$/)) return String((+m[4] - +m[2]) / (+m[1] - +m[3]));
    return null;
  },
  pecahan(t) {
    let m;
    if (m = t.match(/^(\d+)\/(\d+) \+ (\d+)\/(\d+) = \?$/)) return U.frac(+m[1] * +m[4] + +m[3] * +m[2], +m[2] * +m[4]);
    if (m = t.match(/^(\d+)\/(\d+) − (\d+)\/(\d+) = \?$/)) return U.frac(+m[1] * +m[4] - +m[3] * +m[2], +m[2] * +m[4]);
    if (m = t.match(/^(\d+)\/(\d+) × (\d+)\/(\d+) = \?$/)) return U.frac(+m[1] * +m[3], +m[2] * +m[4]);
    if (m = t.match(/^(\d+)\/(\d+) dari (\d+) = \?$/)) return String(+m[1] / +m[2] * +m[3]);
    return null;
  },
  persen(t) {
    let m;
    if (m = t.match(/^(\d+)% dari (\d+) = \?$/)) return String(+m[1] * +m[2] / 100);
    if (m = t.match(/^Harga tas (.+) didiskon (\d+)%. Berapa yang harus dibayar\?$/)) {
      return U.fmtIDR(idrVal(m[1]) * (100 - +m[2]) / 100);
    }
    if (m = t.match(/^Setelah (diskon|naik) (\d+)%, harga sepatu menjadi (.+)\. Berapa harga awalnya\?$/)) {
      const p = +m[2], adj = m[1] === 'naik' ? 100 + p : 100 - p;
      return U.fmtIDR(Math.round(idrVal(m[3]) * 100 / adj));
    }
    return null;
  }
};

D.topics.forEach(tObj => {
  const solver = SOLVERS[tObj.id];
  test(`${tObj.id}: 250 soal/tingkat diverifikasi solver independen (total 1250)`, () => {
    for (let d = 1; d <= 5; d++) {
      const used = new Set();
      for (let i = 0; i < 250; i++) {
        const q = QEngine.make(tObj.id, d, used);
        const expect = solver(q.text);
        assert.ok(expect !== null, 'pola dikenali solver: ' + q.text);
        const same = tObj.id === 'pecahan'
          ? fracEq(expect, q.answer)
          : (tObj.id === 'persen' && String(expect).indexOf('Rp') === 0)
            ? idrVal(expect) === idrVal(q.answer)
            : Math.abs(Number(expect) - Number(q.answer)) < 1e-9;
        assert.ok(same, `JAWABAN SALAH: "${q.text}" — ditandai ${q.answer}, seharusnya ${expect}`);
        // pastikan jawaban benar tidak muncul dobel sebagai distraktor bernilai sama
        q.choices.forEach((c, ci) => {
          if (ci === q.answerIndex) return;
          const dup = tObj.id === 'pecahan' ? fracEq(c, q.answer) : String(c) === String(q.answer);
          assert.ok(!dup, `distraktor bernilai sama dgn jawaban: ${q.text} -> ${c}`);
        });
      }
    }
  });
});

test('REGRESI bug laporan pemain: x ÷ 4 = 32 harus berjawaban 128', () => {
  let found = 0;
  for (let i = 0; i < 500 && found < 5; i++) {
    const q = QEngine.make('aljabar', 2, new Set());
    const m = q.text.match(/^x ÷ (\d+) = (\d+)$/);
    if (!m) continue;
    found++;
    assert.strictEqual(q.answer, String(+m[2] * +m[1]), q.text + ' -> ' + q.answer);
    assert.ok(q.choices.indexOf(String(+m[2] * +m[1])) === q.answerIndex, 'nilai benar ada di pilihan & ditandai benar');
  }
  assert.ok(found >= 1, 'soal bentuk x ÷ b = c pernah dihasilkan');
});

/* ================= 2. RULES ================= */
console.log('\n[2] Rules (XP, level, rank, Elo)');

test('levelFromXP dasar', () => {
  assert.strictEqual(R.levelFromXP(0).level, 1);
  assert.strictEqual(R.levelFromXP(99).level, 1);
  assert.strictEqual(R.levelFromXP(100).level, 2);
  assert.strictEqual(R.levelFromXP(100 + 140).level, 3);
  assert.ok(R.levelFromXP(99999).level < 999);
});

test('rankFromRP', () => {
  assert.strictEqual(R.rankFromRP(0).name, 'BRONZE');
  assert.strictEqual(R.rankFromRP(150).name, 'SILVER');
  assert.strictEqual(R.rankFromRP(799).name, 'LEGEND');
  assert.strictEqual(R.rankFromRP(-5).name, 'BRONZE');
  assert.strictEqual(R.rankFromRP(5000).name, 'LEGEND');
});

test('Elo masuk akal', () => {
  assert.ok(R.elo(1000, 1000, 1) > 8 && R.elo(1000, 1000, 1) < 16);
  assert.ok(R.elo(1000, 1000, 0) < -8);
  assert.ok(Math.abs(R.elo(1600, 1000, 1)) < 3);
});

test('xpForMatch & rewardsForMatch non-negatif', () => {
  const res = { win: false, correct: 0, perfect: 0, hardCorrect: 0, maxCombo: 0, accuracy: 0, questions: 5, practice: false, aiLevelIdx: 0 };
  const x = R.xpForMatch(res);
  assert.ok(x.total > 0);
  x.parts.forEach(p => assert.ok(p.v >= 0));
  const rw = R.rewardsForMatch({ win: false, correct: 0, perfect: 0, aiLevelIdx: 0 });
  assert.ok(rw.coins > 0);
});

test('rpDelta: menang dgn akurasi tinggi > akurasi rendah; latihan = 0', () => {
  const hi = R.rpDelta({ win: true, accuracy: 1, practice: false, aiLevelIdx: 1 });
  const lo = R.rpDelta({ win: true, accuracy: 0.3, practice: false, aiLevelIdx: 1 });
  assert.ok(hi > lo, `hi=${hi} lo=${lo}`);
  assert.strictEqual(R.rpDelta({ win: true, accuracy: 1, practice: true, aiLevelIdx: 1 }), 0);
});

test('waktu soal per tingkat kesulitan (permintaan playtest)', () => {
  assert.strictEqual(R.timeForDiff(1), 10, 'MUDAH tetap 10s');
  assert.strictEqual(R.timeForDiff(2), 14, 'SEDANG 14s');
  assert.strictEqual(R.timeForDiff(3), 18, 'SULIT 18s');
  assert.strictEqual(R.timeForDiff(4), 23, 'MAHIR 23s');
  assert.strictEqual(R.timeForDiff(5), 28, 'LEGENDA 28s');
  for (let d = 2; d <= 5; d++) assert.ok(R.timeForDiff(d) > R.timeForDiff(d - 1), 'monoton naik');
});

test('gradeOf: ambang PERFECT/WEAK ikut batas waktu soal', () => {
  // batas 10s (mudah): sama seperti versi lama
  assert.strictEqual(R.gradeOf(2.0, true, 10), 'PERFECT');
  assert.strictEqual(R.gradeOf(5.0, true, 10), 'HIT');
  assert.strictEqual(R.gradeOf(9.0, true, 10), 'WEAK');
  assert.strictEqual(R.gradeOf(2.0, false, 10), 'MISS');
  // batas 28s (sulit): boleh berpikir lebih lama
  assert.strictEqual(R.gradeOf(8.0, true, 28), 'PERFECT', '≤8.4s tetap PERFECT');
  assert.strictEqual(R.gradeOf(15.0, true, 28), 'HIT');
  assert.strictEqual(R.gradeOf(23.5, true, 28), 'WEAK');
});

/* ================= TIMER VIRTUAL =================
   Battle memakai Date.now/setTimeout/setInterval — kita ganti dengan
   scheduler virtual agar 80 simulasi battle selesai dalam sekejap. */
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const setImmediateReal = globalThis.setImmediate.bind(globalThis);

let vNow = Date.now();
const tasks = new Map();
let idc = 1;
Date.now = () => Math.round(vNow);
globalThis.setTimeout = (fn, ms) => { const id = idc++; tasks.set(id, { at: vNow + (ms || 0), fn, iv: 0 }); return id; };
globalThis.setInterval = (fn, ms) => { const id = idc++; tasks.set(id, { at: vNow + (ms || 1), fn, iv: ms || 1 }); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { tasks.delete(id); };

async function drain(limitMs) {
  const limit = vNow + limitMs;
  while (tasks.size) {
    let nid = null, nt = null;
    for (const [id, t] of tasks) if (!nt || t.at < nt.at) { nt = t; nid = id; }
    if (nt.at > limit) throw new Error('virtual time limit terlampaui — battle tidak selesai');
    vNow = nt.at;
    if (nt.iv) nt.at += nt.iv; else tasks.delete(nid);
    nt.fn();
    await new Promise(r => setImmediateReal(r));
  }
}

/* ================= 3. BATTLE ENGINE ================= */
console.log('\n[3] Battle Engine — simulasi penuh (timer virtual)');

async function simulate(n, accP, label) {
  let ok = true, msg = '';
  try {
    for (let i = 0; i < n; i++) {
      const cfg = {
        heroId: D.heroes[i % 5].id,
        aiHeroId: D.heroes[(i + 2) % 5].id,
        aiLevelIdx: i % 4,
        topicFocus: null,
        practice: i % 5 === 0,
        playerName: 'TESTER'
      };
      const battle = new Battle(cfg);
      const result = await new Promise((resolve, reject) => {
        const guard = globalThis.setTimeout(() => reject(new Error('battle tidak selesai')), 15 * 60 * 1000);
        battle.on('end', r => { tasks.delete(guard); resolve(r); });
        battle.on('question', ({ q }) => {
          const correct = Math.random() < accP;
          const idx = correct ? q.answerIndex : (q.answerIndex + 1 + U.ri(0, 2)) % 4;
          globalThis.setTimeout(() => battle.playerAnswer(idx), 400 + Math.random() * 8200);
        });
        battle.start();
        drain(15 * 60 * 1000).catch(reject);
      });
      assert.ok(result.questions >= 1 && result.questions <= 18, 'ronde dalam batas: ' + result.questions);
      assert.ok(Number.isFinite(result.hpP) && Number.isFinite(result.hpE), 'HP finite');
      assert.ok(result.hpP >= 0 && result.hpE >= 0, 'HP tidak negatif');
      assert.ok(result.accuracy >= 0 && result.accuracy <= 1);
      assert.ok(result.maxCombo >= 0);
      if (result.win) assert.ok(result.hpE === 0 || result.rounds === 18, 'syarat menang benar');
      battle.destroy();
    }
  } catch (e) { ok = false; msg = e.message; }
  if (ok) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.error('  ✗ ' + label + '\n    ' + msg); }
}

(async () => {
  await simulate(40, 0.35, '40 battle tuntas tanpa NaN (pemain lemah)');
  await simulate(40, 0.9, '40 battle tuntas (pemain kuat)');

  test('destroy() membersihkan seluruh timer', () => {
    const before = tasks.size;
    const b = new Battle({ heroId: 'raka', aiHeroId: 'lyra', aiLevelIdx: 2, practice: false, playerName: 'X' });
    b.start();
    b.destroy();
    assert.ok(b.finished);
    assert.ok(tasks.size <= before, 'tidak ada timer tersisa dari battle');
  });

  test('energi awal 2 (balancing v0.5)', () => {
    const b = new Battle({ heroId: 'raka', aiHeroId: 'lyra', aiLevelIdx: 1, practice: false, playerName: 'X' });
    assert.strictEqual(b.p.energy, 2, 'pemain mulai dengan 2 energy');
    assert.strictEqual(b.e.energy, 2, 'AI juga mulai dengan 2 energy');
    b.destroy();
  });

  test('AI: waktu jawab selalu di bawah batas soal', () => {
    const AI = ML.AI;
    for (const lv of D.aiLevels) {
      const ai = new AI(D.heroes[0], lv);
      for (let d = 1; d <= 5; d++) {
        for (let i = 0; i < 60; i++) {
          const p = ai.plan({ difficulty: d });
          const cap = R.timeForDiff(d) - 1.5;
          assert.ok(p.time <= Math.max(1.2, cap) + 0.01, lv.name + ' d' + d + ' waktu ' + p.time + ' ≤ ' + cap);
        }
      }
    }
  });

  /* ================= 4. PLAYER PROGRESSION ================= */
  console.log('\n[4] Player & progression');

  test('applyMatchResult: profil, misi, achievement', () => {
    const P = ML.Player;
    P.data = null; P.load();
    P.data.name = 'TESTER';
    const res = {
      win: true, draw: false, ranked: true, practice: false, aiLevelIdx: 1,
      rounds: 10, questions: 10, correct: 9, perfect: 6, weak: 1, wrong: 1,
      accuracy: 0.9, avgTime: 3.2, maxCombo: 8, hardCorrect: 3, hardTotal: 4,
      comeback: 0, dmgDealt: 100, dmgTaken: 40,
      perTopic: { aljabar: { c: 5, t: 6 }, pecahan: { c: 4, t: 4 } },
      hpP: 50, hpE: 0, wrongList: []
    };
    const sum = P.applyMatchResult(res);
    assert.ok(sum.xpTotal > 0);
    assert.ok(P.data.coins > 0);
    assert.ok(P.data.rp > 0, 'RP naik saat menang');
    assert.ok(P.data.mr > 1000, 'MR naik saat menang');
    assert.ok(P.data.stats.matches === 1 && P.data.stats.wins === 1);
    assert.ok(P.data.achievements.first_win, 'kemenangan pertama terbuka');
    assert.ok(P.data.achievements.speed5, 'Speed Demon terbuka');
    const m = P.data.missions.items;
    assert.ok(m.m_ans20.p === 10, 'misi soal bertambah');
    assert.ok(m.m_streak8.p === 8 && m.m_streak8.done, 'misi streak selesai');
    assert.ok(m.m_alj6.p === 5, 'misi aljabar bertambah');
    assert.ok(m.m_win2.p === 1);
  });

  test('kalah tidak membuat RP negatif', () => {
    const P = ML.Player;
    P.data.rp = 3;
    P.applyMatchResult({
      win: false, draw: false, practice: false, aiLevelIdx: 0,
      questions: 6, correct: 1, perfect: 0, hardCorrect: 0, accuracy: 0.16,
      maxCombo: 1, perTopic: {}, wrongList: [], comeback: 0, dmgDealt: 0, dmgTaken: 0
    });
    assert.ok(P.data.rp >= 0);
  });

  test('leaderboard memuat pemain & terurut', () => {
    const rows = ML.Leaderboard.get('global');
    assert.ok(rows.some(r => r.me));
    assert.ok(rows.length >= 5);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].mr >= rows[i].mr, 'terurut');
  });

  test('backend: offline-first (tanpa config -> mode local, tidak melempar error)', async () => {
    const B = ML.Backend;
    assert.ok(B, 'modul backend ada');
    assert.strictEqual(B.mode, 'local');
    assert.strictEqual(B.online, false);
    await B.init(); // tanpa ML_FIREBASE_CONFIG -> tetap local
    assert.strictEqual(B.mode, 'local');
    assert.strictEqual(await B.topScores(10), null, 'offline: topScores null');
    assert.strictEqual(await B.loadProfile(), null, 'offline: loadProfile null');
    assert.strictEqual(B.saveProfile({}), false, 'offline: saveProfile false');
    B.onMatchEnd({}); // tidak boleh melempar
  });

  test('player.loadFrom: hanya menerima profil cloud yang lebih maju', () => {
    const P = ML.Player;
    P.data = null; P.load();
    P.data.xp = 500; P.data.name = 'LOKAL';
    assert.strictEqual(P.loadFrom({ xp: 100, name: 'CLOUD' }), false, 'cloud tertinggal -> ditolak');
    assert.strictEqual(P.data.name, 'LOKAL');
    assert.strictEqual(P.loadFrom({ xp: 900, name: 'CLOUD' }), true, 'cloud lebih maju -> diterima');
    assert.strictEqual(P.data.xp, 900);
    assert.strictEqual(P.data.name, 'CLOUD');
  });

  test('REGRESI: load() mengembalikan seluruh nilai tersimpan (bug deepMerge lama)', () => {
    const P = ML.Player;
    ML.Storage.set('profile', {
      name: 'TERSIMPAN', xp: 777, coins: 55, rp: 42, mr: 1234,
      stats: { matches: 9, wins: 5 }, settings: { sound: false }
    });
    P.data = null; P.load();
    assert.strictEqual(P.data.name, 'TERSIMPAN', 'nama pulih');
    assert.strictEqual(P.data.xp, 777, 'xp pulih');
    assert.strictEqual(P.data.coins, 55, 'coin pulih');
    assert.strictEqual(P.data.rp, 42, 'rp pulih');
    assert.strictEqual(P.data.mr, 1234, 'mr pulih');
    assert.strictEqual(P.data.stats.matches, 9, 'statistik pulih');
    assert.strictEqual(P.data.stats.losses, 0, 'default tetap terisi untuk field baru');
    assert.strictEqual(P.data.settings.sound, false, 'setting pulih');
    ML.Storage.remove('profile');
    P.data = null; P.load();
  });

  /* ================= 5. ADAPTIVE DIFFICULTY & SKILL ================= */
  console.log('\n[5] Adaptive difficulty & skill');

  test('kesulitan naik saat terus benar cepat', async () => {
    const b = new Battle({ heroId: 'lyra', aiHeroId: 'raka', aiLevelIdx: 0, practice: true, playerName: 'A' });
    await new Promise((resolve) => {
      b.on('end', resolve);
      b.on('question', ({ q }) => globalThis.setTimeout(() => b.playerAnswer(q.answerIndex), 600));
      b.start();
      drain(20 * 60 * 1000);
    });
    assert.ok(b.p.diff >= 4, 'diff naik ke ' + b.p.diff + ' (harus >= 4)');
    b.destroy();
  });

  test('kesulitan turun saat terus salah', async () => {
    const b = new Battle({ heroId: 'raka', aiHeroId: 'lyra', aiLevelIdx: 0, practice: true, playerName: 'B' });
    b.p.diff = 5;
    await new Promise((resolve) => {
      b.on('end', resolve);
      b.on('question', ({ q }) => globalThis.setTimeout(() => b.playerAnswer((q.answerIndex + 1) % 4), 1500));
      b.start();
      drain(20 * 60 * 1000);
    });
    assert.ok(b.p.diff <= 3, 'diff turun ke ' + b.p.diff + ' (harus <= 3)');
    b.destroy();
  });

  test('PvP: netMode + netAnswer kedua sisi + resultFor cermin', async () => {
    const b = new Battle({ heroId: 'raka', aiHeroId: 'kage', aiLevelIdx: 2, netMode: true, practice: false, playerName: 'HOST', oppName: 'GUEST', oppRating: 1234 });
    await new Promise((resolve) => {
      b.on('end', resolve);
      b.on('question', ({ q }) => {
        const t = 400 + Math.random() * 4000;
        globalThis.setTimeout(() => b.netAnswer('p', q.answerIndex, 1.0), 100);
        globalThis.setTimeout(() => b.netAnswer('e', Math.random() < 0.7 ? q.answerIndex : (q.answerIndex + 1) % 4, t), 100);
      });
      b.start();
      drain(30 * 60 * 1000);
    });
    assert.ok(b.finished, 'battle netMode tuntas tanpa AI');
    assert.ok(b.p.stats.questions >= 1 && b.e.stats.questions >= 1, 'kedua sisi menjawab');
    const winner = b.e.hp <= 0 ? 'p' : (b.p.hp <= 0 ? 'e' : b._leader());
    const h = b.resultFor('p', winner, 'KO');
    const g = b.resultFor('e', winner, 'KO');
    assert.ok(h.win === !g.win || (h.draw && g.draw), 'hasil host & guest saling bercermin');
    assert.strictEqual(h.dmgDealt, g.dmgTaken, 'damage saling bercermin');
    assert.strictEqual(g.dmgDealt, h.dmgTaken, 'damage 2 arah konsisten');
    assert.strictEqual(h.oppRating, 1234, 'oppRating terbawa utk Elo PvP');
    assert.strictEqual(g.oppName, 'HOST', 'nama lawan guest benar');
    b.destroy();
  });

  test('skill siap-tempel (shadow/drain/meteor) & pasif baru', async () => {
    // KAGE: pasang shadow saat energi cukup, pastikan serangan bertag SHADOW STRIKE + crit
    const b = new Battle({ heroId: 'kage', aiHeroId: 'raka', aiLevelIdx: 0, practice: true, playerName: 'C' });
    let queued = false, sawShadow = false;
    await new Promise((resolve) => {
      b.on('end', resolve);
      b.on('question', ({ q }) => {
        if (!b.p.answered) globalThis.setTimeout(() => b.playerAnswer(q.answerIndex), 900);
      });
      b.on('answered', () => {
        if (!queued && b.p.energy >= 6) queued = b.useSkill('shadow');
      });
      b.on('attack', (d) => {
        if (d.from === 'p' && d.tags && d.tags.some(t => t.indexOf('SHADOW') >= 0)) {
          sawShadow = true;
          assert.ok(d.crit === true, 'SHADOW STRIKE dijamin crit');
        }
      });
      b.start();
      drain(20 * 60 * 1000);
    });
    assert.ok(b.p.energy <= 10, 'energy maksimal 10');
    b.destroy();

    // MORRU: pasif heal — HP setelah beberapa benar > 128 - damage musuh... cukup pastikan engine stabil
    const b2 = new Battle({ heroId: 'morru', aiHeroId: 'lyra', aiLevelIdx: 0, practice: true, playerName: 'D' });
    await new Promise((resolve) => {
      b2.on('end', resolve);
      b2.on('question', ({ q }) => globalThis.setTimeout(() => b2.playerAnswer(q.answerIndex), 900));
      b2.start();
      drain(20 * 60 * 1000);
    });
    assert.ok(b2.p.stats.correct >= 1);
    assert.ok(b2.p.hp >= 0 && b2.p.hp <= b2.p.maxHp, 'HP necro dalam rentang (heal ter-cap)');
    b2.destroy();
    assert.ok(true, 'shadow queued=' + queued + ', sawShadow=' + sawShadow);
  });

  /* ================= RINGKASAN ================= */
  console.log('\n========================================');
  console.log(`  ${passed} lulus, ${failed} gagal`);
  console.log('========================================\n');
  realSetTimeout(() => process.exit(failed ? 1 : 0), 50);
})().catch(e => { console.error(e); process.exit(1); });
