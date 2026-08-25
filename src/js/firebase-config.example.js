/* ============================================================
   CONTOH KONFIGURASI FIREBASE — MATH LEGENDS
   ============================================================
   CARA MENGAKTIFKAN MODE ONLINE (akun + cloud save + leaderboard):

   1. Buat project gratis di https://console.firebase.google.com
   2. Aktifkan:
      - Build > Authentication > Sign-in method > ANONYMOUS
      - Build > Firestore Database > Create database (mode production)
   3. Project settings > Your apps > Web app > salilah objek firebaseConfig
   4. Salin file ini menjadi:  src/js/firebase-config.js
      lalu tempel config-mu di bawah (ganti contoh).
   5. Buka src/index.html, sisipkan baris ini SEBELUM tag backend.js:
        <script src="js/firebase-config.js"></script>
   6. Jalankan:  python3 build.py  -> deploy index.html baru.
   7. (Penting) Terapkan Firestore Rules dari README-FIREBASE.md.

   Tanpa langkah ini game tetap berjalan penuh dalam mode OFFLINE.
   ============================================================ */

window.ML_FIREBASE_CONFIG = {
  apiKey: 'CONTOH-AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  authDomain: 'math-legends.firebaseapp.com',
  projectId: 'math-legends',
  storageBucket: 'math-legends.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:xxxxxxxxxxxxxxxxxx'
};
