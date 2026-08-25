# 📋 CHANGELOG — MATH LEGENDS: BATTLE ARENA

Panduan update untuk pengguna: **cukup ganti file yang tercantum di versi baru**.
Cara paling simpel untuk GitHub Pages: ganti 1 file `index.html` (hasil build sudah mandiri).

---

## v0.6.0 — PVP ONLINE 1v1 (Firebase aktif: battle-arena-246ce)

**Fitur:**
- 🌐 **CARI LAWAN 1v1** — matchmaking atomik lewat Firestore (`matchmaking`), pembuat antrean otomatis jadi HOST, penggabung jadi GUEST
- Battle realtime lewat dokumen `rooms/{hostUid}`: host menjalankan engine & menyiarkan soal + frame peristiwa; guest menjawab dari HP-nya sendiri; UI battle persis seperti vs AI (skill, combo, efek per hero semua jalan)
- Hasil **cermin host/guest** (dicek otomatis), Math Rating Elo memakai **rating lawan sungguhan**
- Deteksi putus (heartbeat 5 detik; >20 detik diam = pertandingan dibatalam), tombol menyerah, tombol batal saat mencari lawan
- Config Firebase project kamu sudah terpasang (`src/js/firebase-config.js`) — cloud save + leaderboard online ikut aktif
- Uji end-to-end otomatis `test/firebase-e2e.js` (2 klien anonim sungguhan)

**⚠️ WAJIB sebelum PvP jalan:** perbarui Firestore Rules dengan blok **v0.6** di `README-FIREBASE.md` (menambah `matchmaking` & `rooms`). Uji cepat: `node test/firebase-e2e.js`.

**File berubah/baru:** `index.html` 🔁 · BARU: `src/js/pvp.js`, `src/js/firebase-config.js`, `test/firebase-e2e.js` · ganti: `src/js/battle.js` (netMode/netAnswer/useSkillSide/resultFor), `src/js/main.js`, `src/js/ui.js`, `src/js/player.js`, `src/js/data.js`, `src/index.html`, `src/css/style.css`, `README-FIREBASE.md`, `test/test.js` (50 test) · Hapus zip lama.

---

## v0.5.1 — PERBAIKAN SOAL (laporan pemain) + Audit Menyeluruh + Layar Pembuka & Animasi per Hero

**🐞 Perbaikan soal dari laporan playtest:**
- **FIX KRITIS**: soal `x ÷ b = c` (mis. `x ÷ 4 = 32`) dahulu menjawab **8** — padahal jawaban benar **x = 32 × 4 = 128**, dan 128 ikut muncul sebagai pilihan salah. Kini benar (+ test regresi khusus).
- FIX: `x − b = c` dan `ax − b = c` bisa menghasilkan ruas kanan negatif (mis. `2x − 7 = -1`) — kurang cocok level mudah/sedang; kini selalu positif.
- FIX: saat ruang soal satu topik habis, fallback kini tetap pada TOPIK SAMA (dulu melompat ke soal hitung di topik pecahan/persen).

**🔍 Audit menyeluruh (baru di test):** setiap soal kini diverifikasi **solver independen** (5.000 sampel: 250/tingkat × 4 topik × 5 tingkat) — memastikan jawaban bertanda "benar" memang benar secara matematis & tidak ada distraktor bernilai sama. Audit inilah yang menemukan 2 bug tambahan di atas.

**✨ Visual/UX:**
- **Layar pembuka**: logo + 5 karakter muncul berurutan + tombol MULAI (sekaligus membuka audio)
- **Animasi serangan khas hero**: 🔥 bola api LYRA • 🏹 panah SENA • 👻 bola jiwa MORRU • tebasan biru RAKA • tebasan bayangan ungu KAGE
- Hero di arena kini bergoyang idle; kemenangan diberi **confetti ringan**
- Semua animasi CSS transform (ringan untuk HP kelas menengah)

**File yang berubah / baru:**

| File | Status |
|---|---|
| `index.html` | 🔁 GANTI (build terbaru — sudah termasuk semua) |
| `src/js/questions.js` | 🔁 ganti (3 perbaikan soal) |
| `src/js/ui.js` | 🔁 ganti (intro, efek per hero, confetti, versi) |
| `src/js/main.js` | 🔁 ganti (alur layar pembuka) |
| `src/js/data.js` | 🔁 ganti (versi 0.5.1) |
| `src/index.html` | 🔁 ganti (section intro) |
| `src/css/style.css` | 🔁 ganti (intro, efek, confetti) |
| `test/test.js` | 🔁 ganti (audit solver 5.000 soal + regresi — total 49 test) |
| `test/dom-smoke.js`, `test/dom-victory.js` | 🔁 ganti (alur intro, lebih stabil) |
| `CHANGELOG.md`, `README.md` | 🔁 ganti |

> Hanya mau update cepat di GitHub Pages? **ganti `index.html` saja.**

---

## v0.5.0 — Waktu Soal per Kesulitan + Balancing + Kerangka Firebase

**Waktu soal kini berbeda per tingkat kesulitan (permintaan playtest):**

| Kesulitan | Batas waktu | PERFECT jika ≤ | WEAK jika ≥ |
|---|---|---|---|
| 1 MUDAH | 10s (tetap) | 3.0s | 8.0s |
| 2 SEDANG | **14s** | 4.2s | 11.2s |
| 3 SULIT | **18s** | 5.4s | 14.4s |
| 4 MAHIR | **23s** | 6.9s | 18.4s |
| 5 LEGENDA | **28s** | 8.4s | 22.4s |

Ambang PERFECT/WEAK proporsional (30%/80% batas) — cepat tetap dihargai, tapi berpikir teliti tidak dihukum.

**Balancing lain:**
- ⚡ **Energy awal 2** untuk kedua pihak — strategi skill terbuka lebih cepat
- AI "berpikir" lebih lama pada soal sulit (waktunya ikut kesulitan, selalu di bawah batas soal)
- Batas naik/turun kesulitan adaptif kini proporsional terhadap batas waktu

**Kerangka Firebase (offline-first):**
- Modul `backend.js` baru: tanpa config → offline penuh seperti biasa; dengan `firebase-config.js` → **akun anonim + cloud save (Firestore) + leaderboard online** otomatis
- SDK dimuat dinamis hanya saat diaktifkan — build offline tetap ringan
- Cloud save: profil diunggah setelah match (debounce), diambil bila lebih maju dari lokal (anti-mundur)
- Panduan lengkap + Firestore Rules: **README-FIREBASE.md**

**File yang berubah / baru:**

| File | Status |
|---|---|
| `index.html` | 🔁 GANTI (build terbaru — sudah termasuk semua) |
| `src/js/rules.js` | 🔁 ganti (waktu per kesulitan, grade proporsional, energi awal) |
| `src/js/battle.js` | 🔁 ganti (batas waktu per soal, adaptif, emit limit) |
| `src/js/ai.js` | 🔁 ganti (waktu berpikir ikut kesulitan) |
| `src/js/ui.js` | 🔁 ganti (timer sesuai batas, status online, leaderboard online) |
| `src/js/main.js` | 🔁 ganti (init backend, sinkron cloud setelah match) |
| `src/js/player.js` | 🔁 ganti (loadFrom: terima profil cloud yang lebih maju) |
| `src/js/leaderboard.js` | 🔁 ganti (meEntry untuk merge data online) |
| `src/js/data.js` | 🔁 ganti (versi 0.5.0) |
| `src/index.html` | 🔁 ganti (tag backend.js, footer status online) |
| `src/js/backend.js` | ✨ BARU (adapter Firebase/offline) |
| `src/js/firebase-config.example.js` | ✨ BARU (contoh config) |
| `README-FIREBASE.md` | ✨ BARU (panduan setup + rules keamanan) |
| `test/test.js`, `test/dom-victory.js` | 🔁 ganti (44 test + percepatan uji; termasuk regresi bug penyimpanan profil) |
| `README.md`, `CHANGELOG.md` | 🔁 ganti |

> Hanya mau update cepat di GitHub Pages? **ganti `index.html` saja.**

---

## v0.4.0 — Visual Karakter + 2 Hero Baru (NINJA & NECROMANCER)

**Fitur baru**
- 🎨 Gambar karakter original untuk 5 hero (chibi, ter-embed di `index.html` sebagai data URI) — tampil di home, pilih hero, arena battle, profil, leaderboard
- 🥷 **KAGE (NINJA)** — HP 112 / ATK 21 / DEF 3. Pasif *Mata Bayangan*: CRITICAL +15%. Skill **SHADOW STRIKE** (⚡6): jawaban benar berikutnya dijamin CRITICAL ×1.5, damage ×1.2, menembus pertahanan
- 💀 **MORRU (NECROMANCER)** — HP 128 / ATK 17 / DEF 4. Pasif *Soul Harvest*: tiap jawaban benar +2 HP. Skill **SOUL DRAIN** (⚡6): jawaban benar berikutnya damage ×1.25 dan 75%-nya jadi HP
- AI kini juga memakai skill hero baru (ninja saat combo ≥2, necro saat HP < 70%)
- Skill "siap-tempel" (Meteor/Shadow/Drain) kini **hilang jika jawaban salah** (risiko-strategi)
- Efek visual heal hijau `+N HP` di arena untuk Soul Drain

**File yang berubah / baru (ganti semuanya):**

| File | Status |
|---|---|
| `index.html` | 🔁 GANTI (build terbaru — sudah termasuk semua) |
| `src/js/data.js` | 🔁 ganti (5 hero + properti `img`) |
| `src/js/battle.js` | 🔁 ganti (skill siap-tempel, pasif baru, heal) |
| `src/js/ui.js` | 🔁 ganti (gambar karakter, status skill, efek heal) |
| `src/css/style.css` | 🔁 ganti (gaya gambar hero) |
| `src/index.html` | 🔁 ganti (label versi) |
| `build.py` | 🔁 ganti (inline gambar → data URI) |
| `test/test.js` | 🔁 ganti (38 test) |
| `test/dom-smoke.js`, `test/dom-victory.js` | ✨ BARU (uji DOM jsdom) |
| `assets/heroes/*.png` (5 file) | ✨ BARU (gambar karakter) |
| `CHARACTERS.md`, `CHANGELOG.md`, `README.md` | ✨ BARU / diperbarui |

> Hanya mau update cepat di GitHub Pages? **ganti `index.html` saja.**

---

## v0.3.0 — Rilis awal

3 hero (RAKA/LYRA/SENA), battle vs AI 4 level, question engine adaptif 4 topik (operasi bilangan, aljabar, pecahan, persen), combo, critical, comeback, timer, XP/level/rank BRONZE→LEGEND + Math Rating (Elo), misi harian, 10 achievement, leaderboard lokal, mode latihan per materi, statistik diagnostik + rekomendasi belajar, audio sintesis, simpan otomatis localStorage, responsif portrait/landscape.
