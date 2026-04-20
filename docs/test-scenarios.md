# ASG CRM — Hardening Test Scenarios

This document covers manual and automated test scenarios to validate platform
stability, correctness, and resilience. Run these before any major release.

---

## 1. Offline Usage

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1.1 | Enqueue while offline | Go offline (DevTools → Network → Offline). Edit a lead (add a call log). | `ConnectionStatus` shows "Offline · 1 queued". Item persists in localStorage. |
| 1.2 | Duplicate suppression | While offline, edit the same lead twice. | Queue length stays at 1 (second edit merges into first). |
| 1.3 | Reconnect replay | Come back online after 1+ queued items. | Status briefly shows "Syncing 1…" then "Synced ✓". Firestore doc updated. |
| 1.4 | Reconnect backoff | Simulate a flaky connection (go offline/online rapidly 5× in 10 s). | No duplicate Firestore writes. Queue replays exactly once per item. |
| 1.5 | Permanent failure | Force a Firestore permission-denied error for a queued item (remove security rule temporarily). After 3 retries it should give up. | `failedItems` count increments in `ConnectionStatus`. Banner appears. |
| 1.6 | Clear failed queue | Click "Clear Failed" in the failed-writes notice (if surfaced). | Failed items removed from queue and localStorage. |

---

## 2. Slow / Degraded Network

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 2.1 | Slow 3G simulation | DevTools → Network → Slow 3G. Navigate to Leads page. | Skeleton loaders visible while Firestore hydrates. No blank screens. |
| 2.2 | Timeout on write | Simulate timeout on a write. | Error toast displayed. Item added to offline queue for retry. |
| 2.3 | Partial data load | Disconnect mid-load of leads. | `DataStateWrapper` shows error state with retry button. App does not crash. |

---

## 3. Failed Writes

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 3.1 | Invalid deal save | Attempt to save a deal without `clientName`. | Validation error shown inline. No Firestore write attempted. |
| 3.2 | Invalid DRAPS entry | Submit DRAPS with a negative value. | Validation rejects the write with a specific field error message. |
| 3.3 | Rep PIN validation | Set a PIN shorter than 4 digits. | Form blocks submission with "PIN must be 4–8 digits" message. |
| 3.4 | Commission without amount | Create commission allocation with no amount. | Validation error: "repAllocations[0].amount must be a non-negative number." |
| 3.5 | Settings write while readOnly | Enable `readOnlyMode` in System Settings. Try any write from a rep. | Write is blocked at application layer. Toast: "App is in read-only mode." |

---

## 4. Concurrent Edits

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 4.1 | Two reps update same lead | Open same lead in two browser tabs. Rep A adds a call. Rep B adds a note simultaneously. | Both updates persisted (Firestore merge). No data lost. |
| 4.2 | Settings concurrent update | Admin A updates `stuckDaysThreshold`. Admin B updates `weeklyTargetSessions` at the same time. | Both fields saved (Firestore `setDoc` with `merge: true`). Version history shows both changes. |
| 4.3 | FCM token rotation | Two browser sessions for the same user. Both obtain FCM tokens. | Only 1 `userDevices` document exists per platform per user (older token updated, not duplicated). |

---

## 5. Missing / Null Data

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 5.1 | Lead with no callHistory | View leads list — some leads imported without `callHistory`. | Leads render without crash. Call count shows 0. |
| 5.2 | Rep with no targets | Load RepDashboard for a rep with no `repTargets` entry in settings. | Target defaults used (weeklyDQ: 20, weeklyBookings: 5). No NaN in progress bars. |
| 5.3 | Missing drapsEntries | Load DRAPS page with no entries. | Empty state shown ("No DRAPS data yet"). Not a blank white screen. |
| 5.4 | DailyStats — no sessions | Load RepDashboard's Training section with 0 completed training sessions. | Skill bars show 0 / "No sessions yet" message. No division-by-zero. |
| 5.5 | Settings doc missing | Delete `appSettings/config` from Firestore. | `useAppSettings` falls back to `DEFAULT_APP_CONFIG`. App continues functioning. |
| 5.6 | Null currentUser | Clear localStorage `asg-crm:userId`. Reload. | Login screen shown. No runtime errors. |

---

## 6. Notification Failures

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 6.1 | Notification denied | Browser blocks notification permission. | `useNotifications` sets `permissionState = "denied"`. No crash. No FCM token stored. |
| 6.2 | VAPID key missing | Remove `VITE_FIREBASE_VAPID_KEY` from `.env`. | Console warning logged. No error thrown. FCM token not registered. |
| 6.3 | Service worker absent | Delete `/public/firebase-messaging-sw.js`. | Console warning logged. No crash. |
| 6.4 | Invalid FCM token | Firestore contains a stale/invalid FCM token. Cloud Function sends notification. | `pruneInvalidTokens` removes the stale doc. Function still returns `sent: 0`. |
| 6.5 | Duplicate alert prevention | `onDailyStatsWritten` fires twice for the same rep/date/alertType. | `sentAlerts` check prevents the second notification from being sent. |
| 6.6 | Firefox / Safari (no FCM) | Open app in Firefox or Safari. | `firebase/messaging` import swallowed silently. No error surfaces to the user. |

---

## 7. Authentication / Access Control

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 7.1 | Rep accessing Admin page | Log in as a rep. Try to navigate to `/admin`. | Admin tab not shown in sidebar. Direct navigation blocked by `canSee()` check. |
| 7.2 | Rep editing system settings | Attempt to call `updateAppSettings()` as a rep (via console). | Firestore rule `isAdmin()` rejects the write. Console error logged. |
| 7.3 | Rep reading other rep's devices | Query `userDevices` for another userId via console. | Firestore rule denies: `resource.data.userId == userId()` fails. |
| 7.4 | Manager rollback | Log in as a manager. Attempt `rollbackSettings()`. | `can("rollback_settings")` returns false. Button not rendered. |
| 7.5 | Unauthenticated read | Clear auth token. Try to read `leads` via Firestore REST API. | `isAuthenticated()` rule rejects. 403 returned. |

---

## 8. Performance

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 8.1 | Large leads dataset | Load 1,000+ leads. | Virtualized list renders without lag. No full re-render on each keypress in search. |
| 8.2 | RepDashboard re-render | Open RepDashboard. Trigger 5 unrelated Zustand state updates. | `useMemo` prevents recalculation of KPIs. React DevTools shows no unnecessary renders. |
| 8.3 | Duplicate onSnapshot listeners | Navigate Leads → Admin → Leads → Admin rapidly 10×. | No accumulating Firestore listeners. Each page cleanup unsubscribes on unmount. |
| 8.4 | Lazy load pages | Initial bundle size. | All pages except Leads are code-split. Network tab shows separate chunks loading on navigation. |
| 8.5 | useDailyStats with 365 days | Query useDailyStats for a full year of data. | Query is scoped to `repId + dateFrom/dateTo`. No full collection scan. |

---

## 9. Error Logging

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 9.1 | Runtime crash in child component | Throw an error inside `RepDashboard` | `ErrorBoundary` catches it. Error logged to Firestore `errors` collection. User sees "Something went wrong" screen. |
| 9.2 | handleError utility | Call `handleError(new Error("test"), "TestContext")` in console. | Firestore `errors` document created with `context: "TestContext"`. |
| 9.3 | Firestore permission error | Trigger a permission-denied error. | User sees "You don't have permission to perform this action." (not raw Firebase error). |
| 9.4 | Error during offline queue replay | Force a failed replay attempt. | Error logged via `handleError`. Item attempt count increments. No crash. |

---

## 10. System Health Panel

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 10.1 | Offline detection | Disconnect network. Open Admin → System Health. | Network card shows "Offline". Offline Queue card shows queued count. |
| 10.2 | Notifications denied | Deny notification permission. Open System Health. | Push Notifications card shows "warn" status with "Notifications blocked" message. |
| 10.3 | Failsafe flags | Enable `disableTraining` in System Settings. Open System Health. | AI Training card shows "disabled". Feature Flags grid shows Training Disabled = ⚠ Enabled. |
| 10.4 | Read-only mode banner | Enable `readOnlyMode`. Open System Health. | Full-width amber warning banner at top: "READ-ONLY MODE ACTIVE". |

---

## Running Tests

### Manual
Follow each scenario above in Chrome (primary), then Firefox, then Safari (iOS).

### Automated (future)
- Unit tests for all validators in `src/lib/validators.ts` — test each error case
- Unit tests for `getErrorMessage()` in `src/lib/errorHandler.ts` — test each error code
- Integration test for `useOfflineQueue` — mock `navigator.onLine`, test enqueue/replay/dedup
- Cypress E2E — login flow, lead creation, DRAPS submission, offline scenario

---

*Last updated: 2026-04-09*
