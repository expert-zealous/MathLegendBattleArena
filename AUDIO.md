# 🎵 PANDUAN AUDIO — MATH LEGENDS: BATTLE ARENA

Game memakai **dua lapis audio**: (1) file milikmu bila tersedia, (2) fallback sintesis bawaan.
Jadi game **selalu bersuara**, dan kamu bisa meningkatkan kualitasnya kapan saja dengan menaruh file di `assets/audio/` — **tanpa mengubah kode**. Setelah menaruh file: cukup upload/deploy ulang (tidak perlu `build.py`, file tidak di-inline).

## Format umum

| Item | Nilai |
|---|---|
| Format | **MP3** (atau ganti ekstensi referensi di `src/js/audio.js` bila pakai .ogg/.wav) |
| Sample rate | 44.1 kHz, mono/stereo |
| Volume dinormalisasi | sekitar −3 dB puncak (game atur volume internal: musik 32%, SFX 50-55%) |
| Ukuran disarankan | musik ≤ 1 MB/track (loop 60-90 dtk), SFX ≤ 100 KB (≤ 2 dtk) |
| Lisensi | pastikan bebas royalti (Pixabay, OpenGameArt, JSFXR, dsb.) |

## File musik (loop otomatis)

| Nama file | Diputar saat | Karakter | Durasi ideal |
|---|---|---|---|
| `assets/audio/menu.mp3` | layar pembuka, beranda, pilih hero | ceria, optimis, petualangan, tempo sedang | 60–90 dtk, mulus di-loop |
| `assets/audio/battle.mp3` | pertandingan (AI/PvP/wasit) | menegangkan, berdebar, energik | 60–90 dtk, mulus di-loop |

## File SFX (sekali putar)

| Nama file | Momen | Karakter |
|---|---|---|
| `assets/audio/victory.mp3` | layar VICTORY | fanfare kemenangan 3–6 dtk |
| `assets/audio/defeat.mp3` | layar DEFEAT | melankolis ringan yang memotivasi 3–5 dtk |
| `assets/audio/atk-raka.mp3` | RAKA menyerang | benturan perisai/logam berat |
| `assets/audio/atk-lyra.mp3` | LYRA menyerang | lempar/ledakan bola api |
| `assets/audio/atk-sena.mp3` | SENA menyerang | dengung senar busur + desir panah |
| `assets/audio/atk-kage.mp3` | KAGE menyerang | sabetan katana tajam "shing" |
| `assets/audio/atk-morru.mp3` | MORRU menyerang | aura jiwa/whisper mistis |

> CRITICAL/METEOR memakai SFX hero + lapisan "crit" sintesis.
> SFX lain (klik, benar/salah, combo, koin, rank-up, tick timer) tetap sintesis ringan — bisa juga difile-kan dengan menambah entri di `SFX_FILES` (`src/js/audio.js`) bila ingin.

## Cara memasang (3 langkah)

1. Siapkan file dengan **nama persis** seperti tabel di atas → taruh di `assets/audio/`.
2. Upload folder `assets/audio/` bersama deploy (GitHub Pages).
3. Selesai — game otomatis mendeteksi file saat dimuat (`probeFiles`) dan memakainya; toggle **🎵 MUSIK** dan **🔊 EFEK SUARA** ada di layar PROFIL.

## Tips mencari/membuat

- **Musik loop mulus**: pilih track tanpa akhir menggantung; potong di titik beat; fade 20 ms di tepi.
- **Pembuat SFX gratis**: jsfxr (bl-typl.github.io? gunakan versi online "jsfxr") / sfxr — cocok untuk atk-* .
- Sumber bebas royalti: pixabay.com/music, opengameart.org, freepd.com, incompetech (atribusi).
- Nama file huruf kecil semua, tanpa spasi.
