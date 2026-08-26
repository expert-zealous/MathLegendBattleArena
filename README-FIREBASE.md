# 🔥 PANDUAN FIREBASE — MATH LEGENDS: BATTLE ARENA

Game ini **offline-first**: tanpa setup apa pun ia berjalan penuh (localStorage + leaderboard lokal).
Mengisi konfigurasi Firebase mengaktifkan **akun anonim + cloud save + leaderboard online** secara otomatis — tanpa mengubah kode game.

## Langkah mengaktifkan (±10 menit, gratis)

1. **Buat project** di [console.firebase.google.com](https://console.firebase.google.com) (paket Spark/free cukup).
2. **Authentication** → Sign-in method → aktifkan **Anonymous**.
3. **Firestore Database** → Create database → *Production mode* → lokasi terdekat (mis. `asia-southeast2` / Jakarta).
4. **Project settings → Your apps → Web app (`</>`)** → salin objek `firebaseConfig`.
5. Salin `src/js/firebase-config.example.js` → **`src/js/firebase-config.js`**, tempel config-mu.
6. Buka `src/index.html`, sisipkan **sebelum** tag `backend.js`:
   ```html
   <script src="js/firebase-config.js"></script>
   ```
7. Jalankan `python3 build.py`, deploy `index.html` baru ke GitHub Pages.
8. Terapkan **Firestore Rules** di bawah (Console → Firestore → Rules).

Indikator: footer Home berubah dari `offline` menjadi `🟢 online`.

## Firestore Rules (WAJIB — agar data pemain aman)

> **v0.6 (PvP):** Rules harus menambah koleksi `matchmaking` dan `rooms`.
> Salin blok lengkap di bawah ke Console → Firestore → Rules → Publish.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // profil: hanya pemilik yang bisa baca/tulis
    match /players/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // leaderboard: semua bisa baca; menulis hanya milik sendiri + bentuk data wajar
    match /leaderboard/{uid} {
      allow read: if true;
      allow create, update: if request.auth != null
        && request.auth.uid == uid
        && request.resource.data.name is string
        && request.resource.data.name.size() <= 12
        && request.resource.data.mr is number
        && request.resource.data.mr >= 0 && request.resource.data.mr <= 9999
        && request.resource.data.level is number
        && request.resource.data.level >= 1 && request.resource.data.level <= 999;
    }

    // antrean PvP: pemilik membuat/menghapus; lawan hanya boleh "mengunci" (matched/opponent)
    match /matchmaking/{uid} {
      allow read: if request.auth != null;
      allow create, delete: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null
        && (
          request.auth.uid == uid
          || (request.resource.data.matched == true
              && request.resource.data.opponent == request.auth.uid
              && request.resource.data.oppName is string
              && request.resource.data.oppName.size() <= 12)
        );
    }

    // ruangan PvP (MVP): peserta bertukar soal/jawaban/frame di sini.
    // Otoritas penuh di server (Cloud Functions) = langkah penguatan berikutnya.
    match /rooms/{id} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null
        && request.resource.data.keys().size() <= 30;
      allow delete: if request.auth != null; // opsional: kebersihan ruangan lama
    }
  }
}
```

## Cara kerja di dalam game

| Fitur | Offline (default) | Online (config terisi) |
|---|---|---|
| Simpan progres | localStorage | localStorage **+** Firestore `players/{uid}` (debounce 2.5s) |
| Ganti perangkat | — | profil cloud diambil bila XP-nya lebih maju (anti mundur) |
| Leaderboard | bot lokal + kamu | pemain sungguhan (tab Global; tab Sekolah = pemain bertanda `school`) |
| Akun | — | **Anonymous Auth** (UID per perangkat; nanti bisa di-upgrade email/Google) |
| Gagal jaringan | — | otomatis fallback offline, game tetap jalan |

## Catatan penting

- **Anak di bawah 13/16**: Auth anonim tidak meminta data pribadi — aman untuk siswa. Untuk sekolah, disarankan nama panggilan saja (game sudah membatasi 12 karakter).
- **Kuota gratis** Spark: 50rb baca/20rb tulis Firestore per hari — cukup untuk satu kelas/sekolah kecil. Cloud save hanya mengirim profil saat selesai match.
- **Anti-cheat (versi kompetitif nanti)**: nilai client bisa dimanipulasi. Solusi: pindahkan `battle.js` ke Cloud Functions — kirim hanya *keputusan jawaban + waktu*, biarkan server menghitung damage/XP (arsitektur engine sudah bebas DOM, siap dipindah).
- **Menghapus data pemain**: Console → Firestore → hapus dokumen `players/{uid}` & `leaderboard/{uid}`.


## PENTING — UJI KODE ROOM v0.9
Versi ini memakai `getDoc + updateDoc` untuk klaim slot guest, bukan transaksi,
agar error akses Firestore dapat dibedakan dengan jelas. Jika tombol GABUNG
menampilkan `Firebase menolak akses ke room`, Rules Firestore Anda belum sesuai.
Gunakan `firestore.rules` yang disertakan dalam paket ini dan Publish di Firebase
Console > Firestore Database > Rules. Setelah itu reload kedua perangkat.
