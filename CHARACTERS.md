# 🎨 LEMBAR DESAIN KARAKTER — MATH LEGENDS: BATTLE ARENA

Panduan visual resmi 5 hero. Gunakan lembar ini jika ingin **mencari / mengganti / membuat ulang** gambar karakter — cukup timpa file PNG di `assets/heroes/` dengan desain baru yang sesuai spesifikasi di bawah, lalu jalankan `python3 build.py`.

## Spesifikasi teknis file gambar

| Item | Nilai |
|---|---|
| Format | PNG, **persegi (1:1)**, tanpa teks/watermark |
| Resolusi sumber | 512×512 atau 1024×10224 (akan dikecilkan otomatis ke 320×320) |
| Resolusi siap pakai | 320×320 px, ≤ 60 KB (hemat kuota siswa) |
| Kompresi | PNG terkuantisasi (192 warna) — skrip: `python3 -c "from PIL import Image; ..."` (lihat README) |
| Tampilan di game | dipotong lingkaran (border-radius 50%) → **objek utama harus di tengah frame** |
| Latar | **flat satu warna pastel** sesuai warna hero (tanpa gradasi rumit) — berfungsi sebagai badge warna |
| Gaya | chibi/cartoon mobile-game, kepala-dan-bahu, mata besar, cerah, ramah untuk SMP/SMA |

## ⚔️ RAKA — KNIGHT (`assets/heroes/raka.png`)

- **Persona**: ksatria muda yang tenang dan protektif; "tembok" tim.
- **Warna**: biru (#2563eb) · latar pastel **#bfdbfe**
- **Elemen desain**: armor perak-biru bulat, jambul helm biru, perisai kecil bulat di dekat dada, senyum percaya diri.
- **Kata kunci pencarian**: `chibi knight blue armor shield cartoon avatar`.

## 🔥 LYRA — MAGE (`assets/heroes/lyra.png`)

- **Persona**: penyihir cewek ceria dan agresif; pengguna api; tipe "damage besar".
- **Warna**: oranye-merah (#ea580c) · latar pastel **#fed7aa**
- **Elemen desain**: rambut oranye api menypijal, jubah merah-oranye bertrim emas, bola api kecil melayang di tangan, senyum lebar.
- **Kata kunci pencarian**: `chibi fire mage girl orange hair flame cartoon avatar`.

## 🏹 SENA — ARCHER (`assets/heroes/sena.png`)

- **Persona**: pemanah lincah, jenaka, refleks kilat.
- **Warna**: hijau (#059669) · latar pastel **#bbf7d0**
- **Elemen desain**: hood hijau, busur kayu di pundak, lencana daun di dada.
- **Kata kunci pencarian**: `chibi archer green hood bow cartoon avatar`.

## 🥷 KAGE — NINJA (`assets/heroes/ninja.png`)

- **Persona**: ninja misterius tapi ramah; spesialis serangan kritis; bergerak lewat bayangan.
- **Warna**: ungu-indigo (#7c3aed) · latar pastel **#ddd6fe**
- **Elemen desain**: hood + masker ninja indigo (hanya mata ungu menyala yang terlihat), syal ungu berkibar, gagang katana di pundak.
- **Kata kunci pencarian**: `chibi ninja purple mask glowing eyes katana cartoon avatar`.

## 💀 MORRU — NECROMANCER (`assets/heroes/necro.png`)

- **Persona**: penjaga jiwa yang lembut (imut, bukan menyeramkan); spesialis pemulihan.
- **Warna**: teal gelap (#0d9488) · latar pastel **#99f6e4**
- **Elemen desain**: jubah teal bertudung, wisp jiwa hijau melayang, lambang tengkorak kecil di tudung, mata teal tenang.
- **Kata kunci pencarian**: `cute chibi necromancer teal hood soul wisps cartoon avatar`.

## Mengganti gambar (3 langkah)

1. Siapkan PNG persegi baru → simpan timpa `assets/heroes/<nama>.png` (nama file sama).
2. (Opsional, jika file > 100 KB) kecilkan: `python3 tools/resize.py` atau alat apa pun ke 320×320.
3. Jalankan `python3 build.py` → `index.html` baru sudah memuat gambar baru (ter-otomatis jadi data URI).

> Nama file dipetakan di `src/js/data.js` pada properti `img` tiap hero — bisa juga menambah hero baru dengan file baru.
