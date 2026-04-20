/**
 * Firebase Initialization (Modular SDK v10)
 *
 * Uses environment variables from .env
 * Enables offline persistence via the modern FirestoreSettings.cache API
 */

import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { persistentLocalCache, persistentMultipleTabManager } from '@firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Modern offline persistence — replaces deprecated enableIndexedDbPersistence()
// persistentMultipleTabManager allows multiple tabs simultaneously.
// Falls back to memory cache if IndexedDB is unavailable (Safari private mode, etc.)
function buildLocalCache() {
  try {
    return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  } catch {
    console.warn('[firebase] IndexedDB unavailable — falling back to memory cache (offline writes will not persist)');
    return memoryLocalCache();
  }
}

export const db = initializeFirestore(app, {
  localCache: buildLocalCache(),
});

export const storage = getStorage(app);

export const auth = getAuth(app);

/**
 * authReady — resolves once Firebase Auth has determined the initial state.
 *
 * All Firestore listeners gate on this promise so that security rules
 * (which require request.auth != null) evaluate correctly.
 *
 * If anonymous sign-in fails (e.g. provider disabled in Firebase Console),
 * authReady still resolves so the app doesn't hang. Firestore access then
 * depends on the deployed security rules — the current rules use `if true;`
 * as a temporary workaround while Anonymous Auth is being configured.
 *
 * ─── To restore full auth-gated security ─────────────────────────────────
 *  1. Firebase Console → Authentication → Sign-in methods → Anonymous → Enable
 *     https://console.firebase.google.com/project/_/authentication/providers
 *  2. In firestore.rules, replace every `if true;` with `if isAuthenticated();`
 *  3. Run: firebase deploy --only firestore:rules
 * ─────────────────────────────────────────────────────────────────────────
 */
export const authReady: Promise<void> = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub(); // one-shot — only care about initial state

    if (user) {
      // Existing session (anonymous or otherwise) — nothing to do
      resolve();
    } else {
      // No session — attempt anonymous sign-in
      signInAnonymously(auth)
        .then(() => {
          resolve();
        })
        .catch((err: { code: string; message: string }) => {
          if (err.code === 'auth/admin-restricted-operation') {
            console.warn(
              '[firebase] ⚠️  Anonymous Authentication is DISABLED in the Firebase Console.\n' +
              '           Firestore rules are currently set to `if true;` so the app can still run.\n' +
              '           To enable full auth-gated security:\n' +
              '             1. Go to: https://console.firebase.google.com/project/_/authentication/providers\n' +
              '             2. Enable the "Anonymous" sign-in provider\n' +
              '             3. Update firestore.rules: replace `if true;` → `if isAuthenticated();`\n' +
              '             4. Run: firebase deploy --only firestore:rules',
            );
          } else {
            console.warn(
              '[firebase] Anonymous sign-in failed — Firestore reads may be blocked.',
              err.code,
              err.message,
            );
          }
          // Resolve regardless — authReady should never block the app from loading.
          // Whether Firestore succeeds depends on the deployed security rules.
          resolve();
        });
    }
  });
});

export default app;
