/* ============================================================
   MATH LEGENDS: BATTLE ARENA — data.js
   Data statis game: Hero, level AI, rank, topik, misi harian, achievement, bot leaderboard.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const U = ML.util;

  ML.DATA = {
    version: '0.9.0',

    /* ---------- HERO (5 hero, identitas original; gambar karakter di folder assets) ---------- */
    heroes: [
      {
        id: 'raka', name: 'RAKA', role: 'KNIGHT', title: 'Spesialis Pertahanan',
        emoji: '⚔️', img: 'assets/heroes/raka.png', imgF: 'assets/heroes/raka-f.png', imgA: 'assets/heroes/raka-a.png', color: '#2563eb', color2: '#60a5fa',
        hp: 190, atk: 15, def: 6,
        passive: { name: 'Benteng Baja', desc: 'Semua damage yang diterima berkurang 15%.' },
        skill: {
          id: 'shield', name: 'SHIELD WALL', emoji: '🛡️', cost: 5,
          desc: 'Dua serangan lawan berikutnya dikurangi 60%.'
        }
      },
      {
        id: 'lyra', name: 'LYRA', role: 'MAGE', title: 'Spesialis Serangan Besar',
        emoji: '🔥', flip: true, img: 'assets/heroes/lyra.png', imgF: 'assets/heroes/lyra-f.png', imgA: 'assets/heroes/lyra-a.png', color: '#ea580c', color2: '#fb923c',
        hp: 145, atk: 23, def: 2,
        passive: { name: 'Naluri Api', desc: 'Peluang CRITICAL +12%.' },
        skill: {
          id: 'meteor', name: 'METEOR', emoji: '☄️', cost: 8,
          desc: 'Jawaban benar berikutnya menjadi METEOR: damage ×2.4. Jika salah menjawab, Meteor hilang.'
        }
      },
      {
        id: 'sena', name: 'SENA', role: 'ARCHER', title: 'Spesialis Kecepatan',
        emoji: '🏹', img: 'assets/heroes/sena.png', imgF: 'assets/heroes/sena-f.png', imgA: 'assets/heroes/sena-a.png', color: '#059669', color2: '#34d399',
        hp: 165, atk: 19, def: 4,
        passive: { name: 'Refleks Kilat', desc: 'Jawaban PERFECT: +1 Energy tambahan & damage +10%.' },
        skill: {
          id: 'rain', name: 'HUJAN PANAH', emoji: '🎯', cost: 6,
          desc: 'Langsung menyerang lawan: damage = ATK ×1.3, menembus pertahanan.'
        }
      },
      {
        id: 'kage', name: 'KAGE', role: 'NINJA', title: 'Spesialis Critical Attack',
        emoji: '🥷', img: 'assets/heroes/ninja.png', imgF: 'assets/heroes/kage-f.png', imgA: 'assets/heroes/kage-a.png', color: '#7c3aed', color2: '#a78bfa',
        hp: 155, atk: 21, def: 3,
        passive: { name: 'Mata Bayangan', desc: 'Peluang CRITICAL +15%.' },
        skill: {
          id: 'shadow', name: 'SHADOW STRIKE', emoji: '🥷', cost: 6,
          desc: 'Jawaban benar berikutnya: DIJAMIN CRITICAL, damage ×1.2, dan menembus pertahanan lawan. Salah jawab = hilang.'
        }
      },
      {
        id: 'morru', name: 'MORRU', role: 'NECROMANCER', title: 'Spesialis Recovery & Soul',
        emoji: '💀', img: 'assets/heroes/necro.png', imgF: 'assets/heroes/morru-f.png', imgA: 'assets/heroes/morru-a.png', color: '#0d9488', color2: '#2dd4bf',
        hp: 175, atk: 17, def: 4,
        passive: { name: 'Soul Harvest', desc: 'Setiap jawaban benar menyembuhkan 2 HP.' },
        skill: {
          id: 'drain', name: 'SOUL DRAIN', emoji: '👻', cost: 6,
          desc: 'Jawaban benar berikutnya: damage ×1.25 dan 75%-nya menjadi HP-mu. Salah jawab = hilang.'
        }
      }
    ],

    /* ---------- TOKO ATRIBUT (dibeli koin/diamond; bonus menumpuk per level) ---------- */
    gear: [
      { id: 'heart', name: 'Jantung Titan', emoji: '❤️', stat: 'hp', per: 0.06, max: 5,
        desc: '+6% HP per level', costs: [{ coin: 40 }, { coin: 80 }, { coin: 160 }, { coin: 300 }, { coin: 500 }] },
      { id: 'blade', name: 'Mata Angka', emoji: '⚔️', stat: 'atk', per: 0.05, max: 5,
        desc: '+5% Attack per level', costs: [{ coin: 50 }, { coin: 100 }, { coin: 200 }, { coin: 350 }, { coin: 600 }] },
      { id: 'charm', name: 'Jimat Kritis', emoji: '💥', stat: 'crit', per: 0.02, max: 4,
        desc: '+2% peluang CRITICAL per level', costs: [{ coin: 60 }, { coin: 140 }, { coin: 320 }, { gem: 5 }] },
      { id: 'aegis', name: 'Perisai Cerdas', emoji: '🛡️', stat: 'def', per: 1, max: 3,
        desc: '+1 Defense per level', costs: [{ coin: 80 }, { coin: 180 }, { gem: 3 }] }
    ],

    /* ---------- LEVEL AI (akurasi & kecepatan bervariasi, bukan random murni) ---------- */
    aiLevels: [
      { id: 'easy',   name: 'EASY',   bot: 'BIT-1',    acc: 0.45, tmin: 3.0, tmax: 8.6, rating: 900,  skillP: 0.30, rpWin: 14, rpLose: -12 },
      { id: 'normal', name: 'NORMAL', bot: 'BYTE-2',   acc: 0.62, tmin: 2.2, tmax: 6.8, rating: 1100, skillP: 0.55, rpWin: 18, rpLose: -10 },
      { id: 'hard',   name: 'HARD',   bot: 'CORE-3',   acc: 0.78, tmin: 1.5, tmax: 4.8, rating: 1300, skillP: 0.80, rpWin: 22, rpLose: -7  },
      { id: 'legend', name: 'LEGEND', bot: 'OMEGA-4',  acc: 0.90, tmin: 1.1, tmax: 3.4, rating: 1500, skillP: 0.95, rpWin: 26, rpLose: -5  }
    ],

    /* ---------- RANK (RP: 100 per tier; naik berdasarkan performa + Math Rating) ---------- */
    ranks: [
      { name: 'BRONZE',       icon: '🥉', color: '#b45309', rp: 0 },
      { name: 'SILVER',       icon: '🥈', color: '#64748b', rp: 100 },
      { name: 'GOLD',         icon: '🥇', color: '#d97706', rp: 200 },
      { name: 'PLATINUM',     icon: '💠', color: '#0891b2', rp: 300 },
      { name: 'DIAMOND',      icon: '💎', color: '#2563eb', rp: 400 },
      { name: 'MASTER',       icon: '🏆', color: '#7c3aed', rp: 500 },
      { name: 'GRAND MASTER', icon: '👑', color: '#db2777', rp: 600 },
      { name: 'LEGEND',       icon: '🌟', color: '#f59e0b', rp: 700 }
    ],
    RP_PER_TIER: 100,
    RP_MAX: 3999, // 8 rank utama × 5 divisi × 100 RP - 1

    /* ---------- TOPIK MATEMATIKA (fase prototype) ---------- */
    topics: [
      { id: 'arit',    name: 'Operasi Bilangan', emoji: '➕', color: '#f59e0b', desc: 'Tambah, kurang, kali, bagi & urutan operasi' },
      { id: 'aljabar', name: 'Aljabar',          emoji: '⚖️', color: '#7c3aed', desc: 'Persamaan linear satu variabel' },
      { id: 'pecahan', name: 'Pecahan',          emoji: '🍕', color: '#ef4444', desc: 'Penjumlahan, pengurangan & perkalian pecahan' },
      { id: 'persen',  name: 'Persen',           emoji: '💯', color: '#10b981', desc: 'Persentase & diskon harga' }
    ],

    /* ---------- MISI HARIAN ----------
       type: 'answers' (akumulasi) | 'wins' (akumulasi) | 'topic' (benar topik tertentu)
             'streak' (combo terbaik satu match) | 'perfects' (PERFECT terbanyak satu match) */
    missions: [
      { id: 'm_ans20',   type: 'answers',  goal: 20, name: 'Pejuang Soal',  desc: 'Jawab 20 soal',                         xp: 30, coin: 20, icon: '✍️' },
      { id: 'm_streak8', type: 'streak',   goal: 8,  name: 'Combo Master',  desc: '8 jawaban benar berurutan dalam 1 match', xp: 40, coin: 25, icon: '🔥' },
      { id: 'm_win2',    type: 'wins',     goal: 2,  name: 'Menang 2x',     desc: 'Menangkan 2 pertandingan',              xp: 50, coin: 30, icon: '🏆' },
      { id: 'm_alj6',    type: 'topic',    topic: 'aljabar', goal: 6, name: 'Ahli Aljabar', desc: 'Jawab benar 6 soal aljabar',    xp: 35, coin: 25, icon: '🧮' },
      { id: 'm_perf5',   type: 'perfects', goal: 5,  name: 'Refleks Kilat', desc: 'Raih 5 jawaban PERFECT dalam 1 match',   xp: 40, coin: 30, icon: '⚡' }
    ],

    /* ---------- ACHIEVEMENT (test(profile, resultMatch) -> boolean) ---------- */
    achievements: [
      { id: 'first_win', icon: '🏆', name: 'Kemenangan Pertama', desc: 'Menang 1 pertandingan.',
        test: function (pf, r) { return !!r && !!r.win; } },
      { id: 'combo5', icon: '🔥', name: 'Serangan Legendaris', desc: 'Combo x5 dalam satu match.',
        test: function (pf, r) { return !!r && r.maxCombo >= 5; } },
      { id: 'streak10', icon: '⚡', name: 'Math Streak', desc: '10 jawaban benar berurutan dalam satu match.',
        test: function (pf, r) { return !!r && r.maxCombo >= 10; } },
      { id: 'genius', icon: '🧠', name: 'Genius', desc: 'Total 10 soal sulit (level 3+) dijawab benar.',
        test: function (pf) { return pf.stats.hardCorrect >= 10; } },
      { id: 'speed5', icon: '🚀', name: 'Speed Demon', desc: '5 jawaban PERFECT dalam satu match.',
        test: function (pf, r) { return !!r && r.perfect >= 5; } },
      { id: 'sharp', icon: '🎯', name: 'Teliti', desc: 'Akurasi 100% (minimal 8 soal) dalam satu match.',
        test: function (pf, r) { return !!r && r.questions >= 8 && r.accuracy >= 1; } },
      { id: 'comeback', icon: '🌅', name: 'Raja Comeback', desc: 'Menang setelah memicu COMEBACK.',
        test: function (pf, r) { return !!r && r.win && r.comeback > 0; } },
      { id: 'veteran', icon: '💪', name: 'Veteran', desc: 'Selesaikan 25 pertandingan.',
        test: function (pf) { return pf.stats.matches >= 25; } },
      { id: 'scholar', icon: '📚', name: 'Cendekia', desc: 'Total 100 jawaban benar.',
        test: function (pf) { return pf.stats.totalCorrect >= 100; } },
      { id: 'legend_rank', icon: '👑', name: 'Math Legend', desc: 'Capai rank LEGEND.',
        test: function (pf) { return ML.Rules.rankFromRP(pf.rp).index >= ML.DATA.ranks.length - 1; } }
    ],

    /* ---------- BOT LEADERBOARD (placeholder offline; siap diganti Firebase) ---------- */
    bots: [
      { name: 'Aksara',   hero: 'lyra', mr: 1652, level: 34, school: true,  friend: true },
      { name: 'Bintang',  hero: 'sena', mr: 1548, level: 29, school: true,  friend: false },
      { name: 'Cakra',    hero: 'raka', mr: 1471, level: 27, school: true,  friend: true },
      { name: 'Damar',    hero: 'lyra', mr: 1390, level: 24, school: false, friend: true },
      { name: 'Endah',    hero: 'sena', mr: 1316, level: 22, school: true,  friend: false },
      { name: 'Fajar',    hero: 'raka', mr: 1258, level: 20, school: false, friend: true },
      { name: 'Gilang',   hero: 'lyra', mr: 1204, level: 18, school: true,  friend: false },
      { name: 'Hanif',    hero: 'sena', mr: 1147, level: 16, school: false, friend: false },
      { name: 'Indira',   hero: 'raka', mr: 1096, level: 14, school: true,  friend: true },
      { name: 'Jayendra', hero: 'lyra', mr: 1042, level: 12, school: false, friend: false },
      { name: 'Kirana',   hero: 'sena', mr: 988,  level: 10, school: true,  friend: false },
      { name: 'Laksmana', hero: 'raka', mr: 934,  level: 8,  school: false, friend: false }
    ],
    schoolName: 'SMP Nusantara'
  };
})();
