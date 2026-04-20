/**
 * useNotifications.ts — Firebase Cloud Messaging setup
 *
 * Requests notification permission from the browser,
 * retrieves the FCM token, and stores it in Firestore under `userDevices`.
 *
 * Usage: Call once at login (in App.tsx or on currentUser change).
 * The hook is idempotent — calling multiple times is safe.
 *
 * Requires: VITE_FIREBASE_VAPID_KEY environment variable
 * Requires: /public/firebase-messaging-sw.js service worker
 */

import { useState, useEffect, useRef } from "react";
import { getApp } from "firebase/app";
import { collection, addDoc, updateDoc, deleteDoc, where, getDocs, query, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseNotificationsResult {
  /** Current browser notification permission, or "unsupported" if the API is unavailable */
  permissionState: NotificationPermission | "unsupported";
  /** The FCM registration token for this browser, or null if not yet obtained */
  token: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useNotifications
 *
 * Sets up Firebase Cloud Messaging for the currently logged-in rep.
 * - Requests browser notification permission on first call
 * - Registers the FCM service worker
 * - Obtains and persists the FCM token to Firestore (idempotent)
 * - Attaches a foreground `onMessage` listener that shows an in-app toast
 *   (relies on a global toast mechanism if available, otherwise logs to console)
 *
 * All failures are caught and swallowed — push notifications are optional
 * and must never break the main application.
 */
export function useNotifications(): UseNotificationsResult {
  const currentUser = useAppStore((s) => s.currentUser);

  const [permissionState, setPermissionState] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  });

  const [token, setToken] = useState<string | null>(null);

  // Prevent double-initialisation within the same session
  const initialised = useRef(false);

  useEffect(() => {
    // Only run when a user is logged in
    if (!currentUser) return;
    // Idempotency guard — don't re-run if we've already set up for this mount
    if (initialised.current) return;

    // ── Unsupported environment check ──────────────────────────────────────
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermissionState("unsupported");
      return;
    }

    initialised.current = true;

    void (async () => {
      try {
        // ── 1. Request notification permission if not yet decided ──────────
        let permission = Notification.permission;

        if (permission === "default") {
          permission = await Notification.requestPermission();
        }

        setPermissionState(permission);

        if (permission !== "granted") {
          // User denied or dismissed — exit gracefully
          return;
        }

        // ── 2. Dynamically import firebase/messaging (avoids breaking non-Chrome) ──
        try {
          const { getMessaging, getToken, onMessage } = await import("firebase/messaging");

          // ── 3. Initialise messaging ──────────────────────────────────────
          const messaging = getMessaging(getApp());

          // ── 4. Register the service worker ──────────────────────────────
          const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

          // ── 4b. Send real Firebase config to service worker ─────────────
          // The SW runs in a separate scope and cannot access Vite env vars.
          // We postMessage the config so the SW can re-initialise with real creds.
          try {
            const readySw = await navigator.serviceWorker.ready;
            readySw.active?.postMessage({
              type: "FIREBASE_CONFIG",
              config: {
                apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
                authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
                projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
                storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                appId: import.meta.env.VITE_FIREBASE_APP_ID,
              },
            });
          } catch {
            // Non-fatal — SW may still work with placeholder values or cached config
          }

          // ── 5. Obtain FCM token ──────────────────────────────────────────
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

          if (!vapidKey) {
            console.warn("[useNotifications] VITE_FIREBASE_VAPID_KEY is not set. FCM token cannot be obtained.");
            return;
          }

          const fcmToken = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration,
          });

          if (!fcmToken) {
            console.warn("[useNotifications] getToken returned an empty token — check VAPID key and service worker.");
            return;
          }

          setToken(fcmToken);

          // ── 6. Persist / update token in Firestore ───────────────────────
          // Strategy:
          //  a) If this exact token already exists → no-op (idempotent)
          //  b) If a different token exists for this user+platform → update it
          //     (handles FCM token rotation)
          //  c) If no token exists at all → create new document
          const devicesRef = collection(db, "userDevices");

          const exactMatch = query(devicesRef, where("userId", "==", currentUser.id), where("token", "==", fcmToken));
          const exactSnap = await getDocs(exactMatch);

          if (exactSnap.empty) {
            // Check for a stale web token from this user that needs rotating
            const staleQuery = query(devicesRef, where("userId", "==", currentUser.id), where("platform", "==", "web"));
            const staleSnap = await getDocs(staleQuery);

            if (!staleSnap.empty) {
              // Update the first matching doc (there should only be one web token per user)
              const staleDoc = staleSnap.docs[0];
              await updateDoc(staleDoc.ref, {
                token: fcmToken,
                updatedAt: serverTimestamp(),
              });
              // Remove any additional stale web token docs (deduplication)
              const extras = staleSnap.docs.slice(1);
              for (const extra of extras) {
                await deleteDoc(extra.ref);
              }
            } else {
              // No existing web token — create fresh
              await addDoc(devicesRef, {
                userId: currentUser.id,
                token: fcmToken,
                platform: "web",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
          // else: exact token already registered — nothing to do

          // ── 7. Foreground message handler ────────────────────────────────
          onMessage(messaging, (payload) => {
            const title = payload.notification?.title ?? "ASG CRM Notification";
            const body = payload.notification?.body ?? "";

            // Attempt to surface via a global toast if the app exposes one,
            // otherwise fall back to a browser Notification (permission already granted).
            if (
              typeof window !== "undefined" &&
              typeof (window as unknown as Record<string, unknown>).__asgToast === "function"
            ) {
              // Custom in-app toast integration point:
              // window.__asgToast({ title, body, type: 'info' })
              (
                window as unknown as {
                  __asgToast: (opts: { title: string; body: string; type: string }) => void;
                }
              ).__asgToast({ title, body, type: "info" });
            } else {
              // Fallback: native Notification (tab must be focused for this path)
              try {
                new Notification(title, { body, icon: "/logo192.png" });
              } catch {
                // Notification constructor can throw in some contexts
                console.info("[useNotifications] FCM foreground:", title, body);
              }
            }
          });
        } catch {
          // firebase/messaging not supported (e.g. Firefox, Safari without push support)
          // Silently swallow — notifications are optional
        }
      } catch (err) {
        // Top-level catch — any unexpected error must not propagate to the app
        console.warn("[useNotifications] Setup failed (non-fatal):", err);
      }
    })();
  }, [currentUser]);

  return { permissionState, token };
}
