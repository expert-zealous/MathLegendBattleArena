/* ============================================================
   MATH LEGENDS: BATTLE ARENA — backend.js  (KERANGKA v0.5)
   Lapisan data jaringan, offline-first:
   - Tanpa konfigurasi -> mode LOCAL (localStorage, seperti sebelumnya).
   - Dengan window.ML_FIREBASE_CONFIG (lihat src/js/firebase-config.example.js)
     -> mode FIREBASE: Auth anonim + Firestore cloud save + leaderboard online.
     SDK dimuat dinamis dari CDN hanya saat diaktifkan, jadi build offline
     tetap kecil dan tidak butuh jaringan.
   Catatan arsitektur anti-cheat (versi online kompetitif nanti):
   simpan KEPUTUSAN (benar/salah, waktu) di server dan hitung damage di server.
   ============================================================ */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const ML = (G.ML = G.ML || {});
  const FB_VER = '10.12.2'; // versi Firebase SDK (modular, via CDN)

  const Backend = (ML.Backend = {
    mode: 'local',       // 'local' | 'firebase'
    online: false,
    user: null,          // { uid }
    _fb: null,           // { auth, db, fs }
    _saveTimer: null,
    _lastError: '',

    /* ---------- init: dipanggil sekali saat boot ---------- */
    init: async function () {
      const cfg = G.ML_FIREBASE_CONFIG;
      if (!cfg || !cfg.apiKey || !cfg.projectId) return this; // tetap mode local
      try {
        const appUrl = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app.js';
        const authUrl = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-auth.js';
        const fsUrl = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-firestore.js';
        const appMod = await import(appUrl);
        const authMod = await import(authUrl);
        const fsMod = await import(fsUrl);

        const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
        const auth = authMod.getAuth(app);
        const cred = await authMod.signInAnonymously(auth);
        const db = fsMod.getFirestore(app);

        this._fb = { auth: auth, db: db, fs: fsMod };
        this.user = { uid: cred.user.uid };
        this.mode = 'firebase';
        this.online = true;
      } catch (e) {
        // jaringan mati / config salah / Firestore belum aktif -> main offline
        this.mode = 'local';
        this.online = false;
        this._lastError = (e && e.message) || 'init gagal';
        if (G.console) console.warn('[ML] Firebase nonaktif, lanjut offline:', this._lastError);
      }
      return this;
    },

    /* ---------- cloud save (profil) ---------- */
    saveProfile: function (profile) {
      if (!this.online || !this.user) return false;
      const self = this;
      const fb = this._fb;
      try {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(async function () {
          try {
            await fb.fs.setDoc(fb.fs.doc(fb.db, 'players', self.user.uid), {
              data: JSON.stringify(profile),
              updatedAt: Date.now()
            });
          } catch (e) { self._lastError = (e && e.message) || ''; }
        }, 2500); // debounce: kumpulkan perubahan sebelum unggah
        return true;
      } catch (e) { return false; }
    },

    loadProfile: async function () {
      if (!this.online || !this.user) return null;
      try {
        const fb = this._fb;
        const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'players', this.user.uid));
        if (!snap.exists()) return null;
        const raw = snap.data().data;
        return JSON.parse(raw);
      } catch (e) { return null; }
    },

    /* ---------- leaderboard online ---------- */
    submitScore: async function (entry) { // { name, hero, mr, level, school? }
      if (!this.online || !this.user) return false;
      try {
        const fb = this._fb;
        await fb.fs.setDoc(
          fb.fs.doc(fb.db, 'leaderboard', this.user.uid),
          Object.assign({ updatedAt: Date.now() }, entry),
          { merge: true }
        );
        return true;
      } catch (e) { this._lastError = (e && e.message) || ''; return false; }
    },

    topScores: async function (limit) {
      if (!this.online) return null;
      try {
        const fb = this._fb;
        const q = fb.fs.query(
          fb.fs.collection(fb.db, 'leaderboard'),
          fb.fs.orderBy('mr', 'desc'),
          fb.fs.limit(limit || 50)
        );
        const snap = await fb.fs.getDocs(q);
        const out = [];
        snap.forEach(function (d) {
          const v = d.data();
          if (v && typeof v.mr === 'number') {
            out.push({
              name: String(v.name || 'TANPA NAMA').slice(0, 12),
              hero: v.hero || 'raka',
              mr: Math.max(0, Math.min(9999, Math.round(v.mr))),
              level: v.level || 1,
              school: !!v.school,
              me: d.id === Backend.user.uid
            });
          }
        });
        return out;
      } catch (e) { return null; }
    },

    /* dipanggil main.js setelah tiap match selesai */
    onMatchEnd: function (profile) {
      if (!this.online) return;
      const R = ML.Rules;
      this.saveProfile(profile);
      this.submitScore({
        name: profile.name || 'PEMAIN',
        hero: profile.hero,
        mr: profile.mr,
        level: R.levelFromXP(profile.xp).level
      });
    }
  });
})();
