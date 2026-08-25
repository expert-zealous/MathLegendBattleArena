/* ============================================================
   MATH LEGENDS: BATTLE ARENA — questions.js
   Question Engine: generator soal per topik & tingkat kesulitan 1..5.
   Jaminan:
   - jawaban benar selalu tepat satu (dedup pilihan);
   - distraktor berasal dari kesalahan umum siswa, bukan angka acak;
   - tidak mengulang soal yang sama dalam satu match (pool "used");
   - setiap soal punya pembahasan singkat.
   Topik prototype: arit, aljabar, pecahan, persen.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  /* ---------- pembangun pilihan jawaban ---------- */
  // ubah satu angka pada teks (fallback bila kesalahan umum kurang)
  function jitterText(text) {
    const parts = String(text).split(/(-?\d+)/);
    const nIdx = [];
    parts.forEach(function (p, i) { if (/^-?\d+$/.test(p)) nIdx.push(i); });
    if (!nIdx.length) return null;
    const i = U.pick(nIdx);
    const n = Number(parts[i]);
    const deltas = [1, -1, 2, -2, 10, -10, Math.max(1, Math.round(Math.abs(n) / 5))];
    parts[i] = String(n + U.pick(deltas));
    return parts.join('');
  }

  function buildChoices(answerText, mistakes) {
    const seen = {};
    const out = [{ text: String(answerText), ok: true }];
    seen[String(answerText)] = true;
    const shuffledM = U.shuffled(mistakes || []);
    for (let i = 0; i < shuffledM.length && out.length < 4; i++) {
      const m = shuffledM[i];
      if (m === null || m === undefined) continue;
      if (typeof m === 'number' && (!isFinite(m) || !Number.isInteger(m))) continue; // hanya bilangan bulat wajar
      const t = String(m);
      if (!seen[t]) { seen[t] = true; out.push({ text: t, ok: false }); }
    }
    let guard = 0;
    while (out.length < 4 && guard++ < 60) {
      const t = jitterText(String(answerText));
      if (t && !seen[t]) { seen[t] = true; out.push({ text: t, ok: false }); }
    }
    return out;
  }

  function intOrNull(v) { return Number.isFinite(v) && Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : null; }

  /* ============================================================
     GENERATOR: { t: teks soal, a: jawaban benar (string), m: [kesalahan umum], e: pembahasan }
     ============================================================ */
  const GEN = {

    /* ================= ARITMETIKA / OPERASI BILANGAN ================= */
    arit: {
      1: function () {
        if (Math.random() < 0.55) {
          const a = U.ri(12, 58), b = U.ri(11, 79), c = a + b;
          return { t: a + ' + ' + b + ' = ?', a: String(c), m: [c + 1, c - 1, c + 10, c - 10], e: a + ' + ' + b + ' = ' + c + '.' };
        }
        const a = U.ri(40, 99), b = U.ri(11, a - 8), c = a - b;
        return { t: a + ' − ' + b + ' = ?', a: String(c), m: [c + 10, c - 10, a + b, c + 1], e: a + ' − ' + b + ' = ' + c + '.' };
      },
      2: function () {
        const roll = Math.random();
        if (roll < 0.4) {
          const a = U.ri(3, 9), b = U.ri(4, 12), c = a * b;
          return { t: a + ' × ' + b + ' = ?', a: String(c), m: [a * (b + 1), (a + 1) * b, c + 10, c - 10], e: a + ' × ' + b + ' = ' + c + '.' };
        }
        if (roll < 0.7) {
          const a = U.ri(3, 9), b = U.ri(4, 12), c = a * b;
          return { t: c + ' ÷ ' + b + ' = ?', a: String(a), m: [b, c - b, a - 1, intOrNull(c / (b + 1))], e: c + ' ÷ ' + b + ' = ' + a + ' karena ' + a + ' × ' + b + ' = ' + c + '.' };
        }
        const a = U.ri(120, 470), b = U.ri(130, 480), c = a + b;
        return { t: a + ' + ' + b + ' = ?', a: String(c), m: [c + 100, c - 100, c + 10, c - 10], e: a + ' + ' + b + ' = ' + c + '.' };
      },
      3: function () {
        if (Math.random() < 0.55) {
          // urutan operasi: kali dulu
          const a = U.ri(2, 12), b = U.ri(3, 9), c = U.ri(3, 9), ans = a + b * c;
          return {
            t: a + ' + ' + b + ' × ' + c + ' = ?', a: String(ans),
            m: [(a + b) * c, a + b * (c - 1), a * b + c, ans + 10],
            e: 'Kerjakan perkalian dulu: ' + b + ' × ' + c + ' = ' + (b * c) + '. Lalu ' + a + ' + ' + (b * c) + ' = ' + ans + '.'
          };
        }
        const a = U.ri(13, 19), b = U.ri(12, 18), c = a * b;
        return {
          t: a + ' × ' + b + ' = ?', a: String(c),
          m: [a * (b + 1), (a + 1) * b, c + a, c - b],
          e: a + ' × ' + b + ' = ' + c + ' (' + a + ' × ' + b + ' = ' + a + '×10 + ' + a + '×' + (b - 10) + ').'
        };
      },
      4: function () {
        if (Math.random() < 0.5) {
          const a = U.ri(6, 12), b = U.ri(6, 12), c = U.ri(5, Math.min(30, a * b - 5)), ans = a * b - c;
          return {
            t: a + ' × ' + b + ' − ' + c + ' = ?', a: String(ans),
            m: [a * b + c, (a - 1) * b - c, ans + 10, ans + a],
            e: a + ' × ' + b + ' = ' + (a * b) + '. Lalu ' + (a * b) + ' − ' + c + ' = ' + ans + '.'
          };
        }
        const a = U.ri(6, 15), ans = a * a;
        return {
          t: a + '² = ?', a: String(ans),
          m: [a * 2, (a + 1) * (a + 1), (a - 1) * (a - 1), ans + a],
          e: a + '² = ' + a + ' × ' + a + ' = ' + ans + '.'
        };
      },
      5: function () {
        const a = U.ri(3, 9), b = U.ri(4, 9), c = U.ri(2, 8), d = U.ri(3, 8), ans = a * b + c * d;
        return {
          t: a + ' × ' + b + ' + ' + c + ' × ' + d + ' = ?', a: String(ans),
          m: [a * b - c * d, ans + 10, ans - 10, (a + 1) * b + c * d],
          e: a + ' × ' + b + ' = ' + (a * b) + ' dan ' + c + ' × ' + d + ' = ' + (c * d) + '. Jumlahnya ' + ans + '.'
        };
      }
    },

    /* ================= ALJABAR (persamaan linear) ================= */
    aljabar: {
      1: function () {
        if (Math.random() < 0.55) {
          const x = U.ri(2, 20), b = U.ri(3, 30), c = x + b;
          return {
            t: 'x + ' + b + ' = ' + c, a: String(x),
            m: [c, b, x + 2 * b, x + 1],
            e: 'x = ' + c + ' − ' + b + ' = ' + x + '.'
          };
        }
        // x − b = c: jaga c tetap positif agar cocok level MUDAH (audit v0.5.1)
        const b = U.ri(2, 15), x = b + U.ri(2, 24), c = x - b;
        return {
          t: 'x − ' + b + ' = ' + c, a: String(x),
          m: [c, b, c - b, x + 1],
          e: 'x = ' + c + ' + ' + b + ' = ' + x + '.'
        };
      },
      2: function () {
        if (Math.random() < 0.6) {
          const a = U.ri(2, 9), x = U.ri(3, 12), c = a * x;
          return {
            t: a + 'x = ' + c, a: String(x),
            m: [c, a, c + a, c - a],
            e: 'x = ' + c + ' ÷ ' + a + ' = ' + x + '.'
          };
        }
        // x ÷ b = c  ->  x = c × b  (FIX v0.5.1: dulu hasilnya terbalik)
        const b = U.ri(2, 9), c = U.ri(3, 12), x = c * b;
        return {
          t: 'x ÷ ' + b + ' = ' + c, a: String(x),
          m: [c, b, intOrNull(c / b), c + b],
          e: 'x = ' + c + ' × ' + b + ' = ' + x + '.'
        };
      },
      3: function () {
        const a = U.ri(2, 8), x = U.ri(2, 9), b = U.ri(3, 18), c = a * x + b;
        return {
          t: a + 'x + ' + b + ' = ' + c, a: String(x),
          m: [intOrNull((c + b) / a), c - b, b, x + 2],
          e: a + 'x = ' + c + ' − ' + b + ' = ' + (c - b) + '. Maka x = ' + (c - b) + ' ÷ ' + a + ' = ' + x + '.'
        };
      },
      4: function () {
        if (Math.random() < 0.5) {
          const a = U.ri(2, 6), b = U.ri(2, 9), x = U.ri(2, 9), c = a * (x + b);
          return {
            t: a + '(x + ' + b + ') = ' + c, a: String(x),
            m: [c / a + b, c / a, b, x + b],
            e: 'x + ' + b + ' = ' + c + ' ÷ ' + a + ' = ' + (c / a) + '. Maka x = ' + (c / a) + ' − ' + b + ' = ' + x + '.'
          };
        }
        const a = U.ri(2, 8), x = U.ri(4, 9); // pastikan a×x cukup besar agar c positif
        const b = U.ri(3, Math.min(15, a * x - 5)), c = a * x - b;
        return {
          t: a + 'x − ' + b + ' = ' + c, a: String(x),
          m: [intOrNull((c - b) / a), c + b, c - b, b],
          e: a + 'x = ' + c + ' + ' + b + ' = ' + (c + b) + '. Maka x = ' + (c + b) + ' ÷ ' + a + ' = ' + x + '.'
        };
      },
      5: function () {
        const a = U.ri(4, 9), c = U.ri(2, a - 2), x = U.ri(2, 9), b = U.ri(2, 15), d = (a - c) * x + b;
        return {
          t: a + 'x + ' + b + ' = ' + c + 'x + ' + d, a: String(x),
          m: [intOrNull((d + b) / (a - c)), intOrNull((d - b) / (a + c)), x + 1, x - 1],
          e: a + 'x − ' + c + 'x = ' + d + ' − ' + b + ' → ' + (a - c) + 'x = ' + (d - b) + '. Maka x = ' + (d - b) + ' ÷ ' + (a - c) + ' = ' + x + '.'
        };
      }
    },

    /* ================= PECAHAN ================= */
    pecahan: {
      1: function () {
        const d = U.ri(3, 12), n1 = U.ri(1, d - 1), n2 = U.ri(1, d - 1);
        const ans = U.frac(n1 + n2, d);
        return {
          t: n1 + '/' + d + ' + ' + n2 + '/' + d + ' = ?', a: ans,
          m: [U.frac(n1 + n2, 2 * d), String(n1 + n2), U.frac(n1 + n2 + 1, d), U.frac(n1 * n2, d)],
          e: 'Penyebut sama, jumlahkan pembilang: ' + n1 + '+' + n2 + ' = ' + (n1 + n2) + '. Hasil ' + ans + '.'
        };
      },
      2: function () {
        const b = U.pick([2, 3, 4, 5, 6]), a = U.ri(1, b - 1), k = U.ri(2, 9), N = b * k, ans = a * k;
        return {
          t: a + '/' + b + ' dari ' + N + ' = ?', a: String(ans),
          m: [k, ans + b, ans - b, (a + 1) * k],
          e: a + '/' + b + ' × ' + N + ' = ' + N + ' ÷ ' + b + ' × ' + a + ' = ' + k + ' × ' + a + ' = ' + ans + '.'
        };
      },
      3: function () {
        const d = U.ri(3, 8), k = U.pick([2, 3, 4]), D = k * d, n1 = U.ri(1, d - 1), n2 = U.ri(1, D - 1);
        const num = n1 * k + n2, ans = U.frac(num, D);
        return {
          t: n1 + '/' + d + ' + ' + n2 + '/' + D + ' = ?', a: ans,
          m: [U.frac(n1 + n2, D), U.frac(n1 + n2, d + D), U.frac(num + 1, D), U.frac(n1 + n2, d)],
          e: 'Samakan penyebut: ' + n1 + '/' + d + ' = ' + (n1 * k) + '/' + D + '. Lalu ' + (n1 * k) + '+' + n2 + ' = ' + num + '. Hasil ' + ans + '.'
        };
      },
      4: function () {
        const b = U.ri(2, 9), a = U.ri(1, b - 1), d2 = U.ri(2, 9), c = U.ri(1, d2 - 1);
        const ans = U.frac(a * c, b * d2);
        return {
          t: a + '/' + b + ' × ' + c + '/' + d2 + ' = ?', a: ans,
          m: [U.frac(a + c, b + d2), U.frac(a * d2, b * c), U.frac(a * c + 1, b * d2), U.frac(a * c, b + d2)],
          e: 'Kalikan lurus: ' + a + '×' + c + ' = ' + (a * c) + ', ' + b + '×' + d2 + ' = ' + (b * d2) + '. Sederhanakan → ' + ans + '.'
        };
      },
      5: function () {
        const pair = U.pick([[3, 4], [2, 5], [3, 5], [4, 5], [2, 7], [3, 7]]);
        const d1 = pair[0], d2 = pair[1];
        let n1 = 0, n2 = 0, num = 0;
        for (let t = 0; t < 30; t++) {
          n1 = U.ri(1, d1 - 1); n2 = U.ri(1, d2 - 1);
          if (n1 * d2 - n2 * d1 > 0) { num = n1 * d2 - n2 * d1; break; }
        }
        if (num <= 0) { n1 = d1 - 1; n2 = 1; num = n1 * d2 - n2 * d1; }
        const D = d1 * d2, ans = U.frac(num, D);
        return {
          t: n1 + '/' + d1 + ' − ' + n2 + '/' + d2 + ' = ?', a: ans,
          m: [U.frac(Math.abs(n1 - n2) || 1, D), U.frac(n1 * d2 + n2 * d1, D), U.frac(num + 1, D), U.frac(Math.abs(n1 - n2) || 1, Math.abs(d1 - d2) || 1)],
          e: 'Samakan penyebut ' + D + ': ' + (n1 * d2) + '/' + D + ' − ' + (n2 * d1) + '/' + D + ' = ' + ans + '.'
        };
      }
    },

    /* ================= PERSEN ================= */
    persen: {
      1: function () {
        if (Math.random() < 0.5) {
          const N = U.ri(2, 80) * 10, ans = N / 2;
          return { t: '50% dari ' + N + ' = ?', a: String(ans), m: [N / 10, N / 4, N / 5, ans + 5], e: '50% = setengah. ' + N + ' ÷ 2 = ' + ans + '.' };
        }
        const N = U.ri(4, 160) * 10, ans = N / 10;
        return { t: '10% dari ' + N + ' = ?', a: String(ans), m: [N / 2, N / 5, N / 20, ans + 10], e: '10% = persepuluh. ' + N + ' ÷ 10 = ' + ans + '.' };
      },
      2: function () {
        if (Math.random() < 0.5) {
          const N = U.ri(2, 40) * 4, ans = N / 4;
          return { t: '25% dari ' + N + ' = ?', a: String(ans), m: [N / 2, N / 5, N / 10, ans + 2], e: '25% = seperempat. ' + N + ' ÷ 4 = ' + ans + '.' };
        }
        const N = U.ri(2, 50) * 5, ans = N / 5;
        return { t: '20% dari ' + N + ' = ?', a: String(ans), m: [N / 4, N / 2, N / 10, ans + 5], e: '20% = seperlima. ' + N + ' ÷ 5 = ' + ans + '.' };
      },
      3: function () {
        const p = U.pick([5, 15, 30, 40, 60, 75, 80, 90]), N = U.ri(4, 40) * 20, ans = p * N / 100;
        return {
          t: p + '% dari ' + N + ' = ?', a: String(ans),
          m: [ans + N / 20, ans - N / 20, N / 2, ans + 10],
          e: p + '% × ' + N + ' = ' + N + ' × ' + (p / 100) + ' = ' + ans + '.'
        };
      },
      4: function () {
        const price = U.ri(4, 20) * 10000, p = U.pick([10, 20, 25, 50]);
        const disc = price * p / 100, bayar = price - disc;
        const F = U.fmtIDR;
        return {
          t: 'Harga tas ' + F(price) + ' didiskon ' + p + '%. Berapa yang harus dibayar?',
          a: F(bayar),
          m: [F(disc), F(bayar + 5000), F(bayar - 5000), F(price - p * 1000)],
          e: 'Diskon = ' + p + '% × ' + F(price) + ' = ' + F(disc) + '. Bayar = ' + F(price) + ' − ' + F(disc) + ' = ' + F(bayar) + '.'
        };
      },
      5: function () {
        const naik = Math.random() < 0.4;
        const p = U.pick([20, 25]);
        const akhir = p === 20 ? U.ri(2, 6) * 24000 : U.ri(2, 6) * 25000;
        const awal = Math.round(akhir * 100 / (100 + (naik ? p : -p)));
        const F = U.fmtIDR;
        return {
          t: 'Setelah ' + (naik ? 'naik' : 'diskon') + ' ' + p + '%, harga sepatu menjadi ' + F(akhir) + '. Berapa harga awalnya?',
          a: F(awal),
          m: [F(Math.round(akhir * p / 100)), F(akhir + Math.round(akhir * p / 100)), F(Math.round(akhir * 100 / (100 + p))), F(Math.round(akhir * (100 - p) / 100))],
          e: 'Harga akhir = ' + (100 + (naik ? p : -p)) + '% × harga awal. Harga awal = ' + F(akhir) + ' ÷ ' + ((100 + (naik ? p : -p)) / 100) + ' = ' + F(awal) + '.'
        };
      }
    }
  };

  /* ---------- API ---------- */
  ML.QEngine = {
    topics: function () { return ML.DATA.topics.map(function (t) { return t.id; }); },

    // Ambil soal unik: topic string, difficulty 1..5, used = Set teks soal match ini
    make: function (topic, difficulty, used) {
      const diff = U.clamp(Math.round(difficulty) || 1, 1, 5);
      const table = GEN[topic] || GEN.arit;
      let g = null;
      for (let tries = 0; tries < 16; tries++) {
        let d = diff;
        let fn = null;
        while (d >= 1 && !fn) { fn = table[d]; if (!fn) d--; }
        if (!fn) fn = GEN.arit[1];
        try { g = fn(); } catch (e) { g = null; }
        if (!g || !g.t || g.a === undefined) { g = null; continue; }
        if (used && used.has(g.t)) { g = null; continue; }
        break;
      }
      // cadangan 1: soal TOPIK YANG SAMA, izinkan pengulangan (bukan lompat topik)
      if (!g) {
        let d = diff;
        let fn = null;
        while (d >= 1 && !fn) { fn = table[d]; if (!fn) d--; }
        if (fn) { try { g = fn(); } catch (e) { g = null; } }
      }
      // cadangan terakhir: aritmetika sederhana agar pertandingan tidak pernah macet
      if (!g) {
        try { g = GEN.arit[2](); } catch (e) { g = null; }
        if (!g) return null;
      }
      if (!g.t || g.a === undefined) return null;

      if (used) used.add(g.t);
      const choices = U.shuffled(buildChoices(g.a, g.m));
      const answerIndex = choices.findIndex(function (c) { return c.ok; });
      return {
        topic: (GEN[topic] ? topic : 'arit'),
        difficulty: diff,
        text: g.t,
        choices: choices.map(function (c) { return c.text; }),
        answerIndex: answerIndex,
        answer: String(g.a),
        explanation: g.e || ''
      };
    }
  };
})();
