// =============================================================================
// firebase-messaging-sw.js  —  ASG CRM Firebase Cloud Messaging Service Worker
//
// IMPORTANT: The placeholder values below ("REPLACED_AT_BUILD") must be
// replaced with real Firebase project credentials before deploying to
// production. Inject them via your CI/CD pipeline or build script, e.g.:
//
//   sed -i "s/REPLACED_AT_BUILD_API_KEY/$VITE_FIREBASE_API_KEY/g" \
//       public/firebase-messaging-sw.js
//
// Alternatively, the running app sends the real config via postMessage once
// the service worker is registered (see the "message" event handler at the
// bottom of this file), so these hardcoded values serve only as a fallback
// for cases where the app has not yet communicated the config.
// =============================================================================

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// ---------------------------------------------------------------------------
// Firebase config
//
// self.__FIREBASE_CONFIG is set either:
//   (a) At runtime via a postMessage from useNotifications.ts, OR
//   (b) At build time by your deployment pipeline replacing the placeholders.
//
// Option (a) is the recommended path for Vite/CRA projects where env vars
// are only available in the app bundle, not in the service worker scope.
// ---------------------------------------------------------------------------
const firebaseConfig = self.__FIREBASE_CONFIG || {
  apiKey: "REPLACED_AT_BUILD",
  authDomain: "REPLACED_AT_BUILD",
  projectId: "REPLACED_AT_BUILD",
  storageBucket: "REPLACED_AT_BUILD",
  messagingSenderId: "REPLACED_AT_BUILD",
  appId: "REPLACED_AT_BUILD",
};

// ---------------------------------------------------------------------------
// Internal helpers — initialise Firebase and register the background handler
// ---------------------------------------------------------------------------

let messaging = null;

function registerBackgroundHandler() {
  if (!messaging) return;

  // Fires when a push message arrives and the app is in the background or
  // the tab is closed.  When the app is foregrounded, the onMessage() call
  // inside the React app takes precedence and this handler is NOT invoked.
  messaging.onBackgroundMessage((payload) => {
    console.log("[firebase-messaging-sw] Background message received:", payload);

    const { title, body } = payload.notification || {};
    const notifTitle = title || "ASG CRM";
    const notifOptions = {
      body: body || "",
      icon: "/asg-icon.png",
      badge: "/asg-icon.png",
      data: payload.data || {},
      requireInteraction: false,
    };

    self.registration.showNotification(notifTitle, notifOptions);
  });
}

function initFirebase(config) {
  try {
    // Reuse an existing default app if one is already initialised.
    firebase.app();
  } catch (_) {
    firebase.initializeApp(config);
  }
  messaging = firebase.messaging();
  registerBackgroundHandler();
}

// Kick off initialisation immediately.  If the config still contains
// placeholder values the background handler will be a no-op until the app
// re-initialises via postMessage (see the "message" listener below).
initFirebase(firebaseConfig);

// ---------------------------------------------------------------------------
// notificationclick — handle the user tapping a notification
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Prefer a deep-link from the notification data payload; fall back to root.
  const targetUrl =
    (event.notification.data && event.notification.data.link) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an already-open window pointing at the same URL.
        for (const client of clientList) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        // No matching window found — open a new tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ---------------------------------------------------------------------------
// message — allow the React app to supply the Firebase config at runtime.
//
// Call this from useNotifications.ts (or wherever you initialise FCM) after
// the service worker registration resolves:
//
//   const registration = await navigator.serviceWorker.ready;
//   registration.active?.postMessage({
//     type: "FIREBASE_CONFIG",
//     config: {
//       apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
//       authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
//       projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
//       storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
//       messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
//       appId: import.meta.env.VITE_FIREBASE_APP_ID,
//     },
//   });
//
// This is necessary because service workers run in a separate scope and
// cannot access Vite/CRA environment variables directly.
// ---------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "FIREBASE_CONFIG") return;

  const receivedConfig = event.data.config;

  // Persist the config on self so it survives SW restarts within the same
  // session (note: self properties are NOT persisted across SW terminations).
  self.__FIREBASE_CONFIG = receivedConfig;

  // Re-initialise with the real config by tearing down any existing app
  // that was started with placeholder values.
  const existingApps = firebase.apps;
  if (existingApps.length > 0) {
    existingApps[0]
      .delete()
      .then(() => {
        initFirebase(receivedConfig);
        console.log(
          "[firebase-messaging-sw] Re-initialised Firebase with app-supplied config."
        );
      })
      .catch((err) => {
        console.error("[firebase-messaging-sw] Error deleting old Firebase app:", err);
        // Attempt init anyway in case delete() partially succeeded.
        initFirebase(receivedConfig);
      });
  } else {
    initFirebase(receivedConfig);
    console.log(
      "[firebase-messaging-sw] Initialised Firebase with app-supplied config."
    );
  }
});
