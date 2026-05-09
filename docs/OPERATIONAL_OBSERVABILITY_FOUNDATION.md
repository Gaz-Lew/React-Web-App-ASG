# Operational Observability Foundation

## Blind Spots Identified

User-visible:

- Admin settings save failures surfaced as a generic save error.
- Settings rollback failures surfaced through the history panel.
- Settings history listener failures surfaced through the state wrapper.

Operator-visible:

- Callable-authoritative settings and audit flows logged to Cloud Functions with actor attribution.
- Frontend `handleError` and `logger.error` persist best-effort records to the `errors` collection.
- Many Firestore listeners log to console only.

Currently weak or invisible:

- Non-fatal `.catch(() => {})` paths in UI setup, geocoding, speech/audio cleanup, and storage cleanup.
- Legacy audit side-writes in lead/client workflows can fail after rule enforcement without operator-friendly grouping.
- Deployment/runtime diagnostics are mostly CLI output and docs, not surfaced in-app.
- Listener failures are inconsistent across hooks; some are user-visible, many are console-only.

## Helpers Added

- `src/lib/operationalDiagnostics.ts`
  - classifies auth denied, unauthenticated, validation, callable unavailable, network, listener, and unknown failures
  - provides user-safe actionable messages
  - provides lightweight callable, listener, auth-boundary, and degraded-behavior logging helpers

## User-Facing Improvements

- `SystemSettingsPanel` now shows actionable save errors for auth denied, expired session, validation failure, network failure, or callable unavailability.
- `SettingsHistoryPanel` now logs listener failures through the diagnostic helper and shows actionable rollback/listener messages.

## Attribution Consistency

Callable-authoritative writes continue to include:

- `authUid`
- `authRepId`
- `authRole`
- `authProvider`
- `source: "callable"`
- server timestamp

`appendAuditEvent` now builds audit records through a single `buildAuditEvent` helper so stored fields and runtime logs stay aligned.

## Remaining Gaps

- Broader listener standardization should happen incrementally in high-value hooks rather than as a sweeping rewrite.
- Operational workflows still contain non-fatal silent catches that should be reviewed case by case.
- There is no in-app operator diagnostics panel yet; this phase intentionally avoids dashboards.
- Runtime version visibility is still mostly deployment/CLI-based.
