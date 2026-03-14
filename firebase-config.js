/**
 * Firebase (Firestore) config for shared poll data.
 * If this is not configured, the app uses localStorage (per-device only).
 *
 * Setup:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a project (or use existing)
 * 3. Add a web app, copy the config object
 * 4. Enable Firestore: Build → Firestore Database → Create database (start in test mode for quick start)
 * 5. Paste your config below and set USE_FIREBASE = true
 * 6. Deploy Firestore security rules (see FIREBASE_SETUP.md)
 */
(function () {
  const USE_FIREBASE = true;

  const firebaseConfig = {
    apiKey: 'AIzaSyBgYSwWSGdYdYOCE-u3XCO2dFvRA67q2Xs',
    authDomain: 'grepke-baseball-league.firebaseapp.com',
    projectId: 'grepke-baseball-league',
    storageBucket: 'grepke-baseball-league.firebasestorage.app',
    messagingSenderId: '895819255494',
    appId: '1:895819255494:web:1a1552ec1e288c959f11c7'
  };

  if (USE_FIREBASE && firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
      firebase.initializeApp(firebaseConfig);
      window.GBL_FIREBASE_DB = firebase.firestore();
    } catch (e) {
      console.warn('Firebase init failed:', e);
      window.GBL_FIREBASE_DB = null;
    }
  } else {
    window.GBL_FIREBASE_DB = null;
  }
})();
