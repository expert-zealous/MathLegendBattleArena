# ⚔️ MATH LEGENDS: BATTLE ARENA

Game edukasi matematika **kompetitif** untuk siswa SMP/SMA.
Matematika bukan soal latihan — matematika adalah **senjata utama** pemain.

> Pertanyaan → keputusan → jawaban menentukan serangan → HP/skill/combo → menang/kalah → XP & rank naik.

---

## 🎮 Cara Main (3 ketukan)

1. **MAIN SEKARANG** (home)
2. Pilih **Hero** + level **AI**
3. **MULAI BATTLE** — jawab soal secepat & sebenar mungkin untuk menyerang!

**Grade jawaban:** ⚡ PERFECT (≤30% batas waktu, damage +30%) · ⚔️ HIT · 💤 WEAK HIT (≥80% batas) · ❌ MISS (combo reset)
**Waktu berpikir per kesulitan:** MUDAH 10s · SEDANG 14s · SULIT 18s · MAHIR 23s · LEGENDA 28s — soal sulit memberi waktu berpikir lebih panjang
**Combo:** x2 (+15%) → x3 (+25%) → SUPER (+40%) → LEGENDARY (+60%)
**Skill:** dibayar dengan ⚡Energy (mulai 2⚡) yang HANYA didapat dari jawaban benar — matematika adalah senjata.

## 🦸 Hero (5, dengan gambar karakter original)

| Hero | Role | Pasif | Skill |
|---|---|---|---|
| ⚔️ RAKA | Knight | damage diterima −15% | 🛡️ Shield Wall — 2 serangan berikutnya −60% (⚡5) |
| 🔥 LYRA | Mage | peluang CRITICAL +12% | ☄️ Meteor — jawaban benar berikutnya damage ×2.4 (⚡8) |
| 🏹 SENA | Archer | PERFECT: +1⚡ & +10% damage | 🎯 Hujan Panah — serangan instan ATK×1.3 tembus pertahanan (⚡6) |
| 🥷 KAGE | Ninja | peluang CRITICAL +15% | 🥷 Shadow Strike — dijamin CRITICAL, ×1.2, tembus pertahanan (⚡6) |
| 💀 MORRU | Necromancer | tiap benar +2 HP | 👻 Soul Drain — damage ×1.25 & 75% jadi HP (⚡6) |

Gambar karakter ada di `assets/heroes/` — bisa diganti sesuai **CHARACTERS.md** (lembar desain + spesifikasi file), lalu rebuild.

## 📚 Fitur (v0.3)

- **Battle 1vsAI** (EASY/NORMAL/HARD/LEGEND) — AI punya akurasi & kecepatan berbeda, bukan random murni
- **Adaptive difficulty** — 2 benar-cepat ⇒ soal naik level; 2 salah ⇒ turun (level 1–5)
- **Question engine** — 4 topik (operasi bilangan, aljabar, pecahan, persen), distraktor dari **kesalahan umum siswa**, dijamin 1 jawaban benar & tidak berulang dalam satu match
- **Comeback system** — HP < 30% & soal sulit benar ⇒ bonus damage + perisai
- **XP, Level, Rank** (BRONZE→LEGEND) + **Math Rating** (Elo) — naik rank butuh performa, bukan sekadar rajin
- **Reward transparan** (XP/coin/diamond) — tanpa gambling/loot box/iklan
- **Misi harian, 10 achievement, leaderboard lokal** (global/sekolah/teman)
- **Mode LATIHAN** — practice battle fokus satu materi
- **Diagnostik & rekomendasi** — akurasi per materi, pembahasan soal yang salah, saran latihan
- **Audio sintesis** ringan (WebAudio, tanpa file), tombol 🔊 on/off
- Simpan otomatis di **localStorage**; main ulang tanpa refresh
- 🎵 Musik menu & battle + SFX per hero — file milikmu tinggal ditaruh di `assets/audio/` (lihat **AUDIO.md**)

## 🚀 Menjalankan

- **Langsung:** buka `index.html` (satu file mandiri, tanpa server/internet).
- **GitHub Pages:** upload seluruh folder ini ke repo → Settings → Pages → deploy dari branch. Selesai.
- **Android:** buka URL GitHub Pages di Chrome → "Add to Home screen".

## 🛠️ Struktur & Pengembangan

```
math-legends/
├── index.html          ← HASIL BUILD (satu file, untuk deploy/preview)
├── build.py            ← penyatu src → index.html  (python3 build.py)
├── src/
│   ├── index.html      ← kerangka UI (semua screen)
│   ├── css/style.css   ← tema cerah, responsif portrait+landscape
│   └── js/
│       ├── core.js         util, storage aman (fallback memori), event emitter
│       ├── data.js         hero, AI, rank, topik, misi, achievement, bot
│       ├── rules.js        aturan murni: timer, grade, combo, XP, level, rank, Elo
│       ├── questions.js    question engine + distraktor kesalahan umum
│       ├── audio.js        SFX sintesis WebAudio
│       ├── ai.js           lawan AI berprobabilitas
│       ├── battle.js       battle engine (BEBAS DOM, event-driven)
│       ├── player.js       profil, progresi, misi, achievement, persistence
│       ├── leaderboard.js  data leaderboard lokal
│       ├── ui.js           render layar + adapter battle (anti memory-leak)
│       └── main.js         boot, navigasi, 1 delegasi event global
└── test/
    ├── test.js            ← 38 test logika (node test/test.js)
    ├── dom-smoke.js       ← uji DOM jsdom (npm i jsdom; node test/dom-smoke.js)
    └── dom-victory.js     ← uji alur kemenangan penuh (jsdom)
```

**Performa:** tanpa framework/canvas/font eksternal; animasi CSS ringan; SATU interval per battle; semua timeout dibersihkan `destroy()`; listener memakai delegasi; localStorage dibungkus try/catch (aman di iframe/private mode).

**Mengubah soal/materi:** tambahkan generator di `src/js/questions.js` (format `{t, a, m[], e}`) dan topik di `src/js/data.js`, lalu `python3 build.py`.

## 🔮 Roadmap (sesuai spesifikasi)

- **v0.4** — Firebase Auth + Firestore, akun & cloud save, leaderboard online (ganti `ML.Storage`/`ML.Leaderboard` dengan adapter — UI tidak berubah)
- **v0.5** — PvP 1v1 online: `battle.js` sudah bebas DOM & event-driven, sehingga bisa dijalankan ulang di **server untuk validasi server-side** (jawaban/waktu/damage tidak diambil dari client — anti-cheat)
- Selanjutnya — hero baru (NINJA 🥷 critical, NECROMANCER 💀 recovery), materi SMA (trigonometri, logaritma, kalkulus, HOTS), tournament/class battle, PWA (manifest + service worker)

## ✅ Status Uji

- `node test/test.js` — **44/44 lulus** (waktu per kesulitan, grade proporsional, validasi 5 hero, kualitas 3000+ soal, rules, 80 simulasi battle, progresi, adaptive, skill, backend offline-first)
- `node test/dom-smoke.js` — alur lengkap pemain tanpa error console (butuh `npm i jsdom`)
- `node test/dom-victory.js` — alur kemenangan penuh dengan Necromancer

## ☁️ Mode Online (opsional)

Game berjalan **offline-first**. Untuk mengaktifkan akun + cloud save + leaderboard online
(Firebase Anonymous Auth + Firestore), ikuti **README-FIREBASE.md** (±10 menit, gratis).

## 📦 Update Versi

Lihat **CHANGELOG.md** — setiap versi mencantumkan file mana saja yang perlu diganti.
Cara tercepat update GitHub Pages: ganti satu file `index.html` saja.
