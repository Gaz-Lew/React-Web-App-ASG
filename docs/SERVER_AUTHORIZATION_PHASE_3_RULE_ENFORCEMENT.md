# Server Authorization Phase 3: Rule Enforcement

## Fallback Audit

Safe to remove now:

- `settingsHistory` client writes from settings update and rollback fallback paths.
- `auditLogs` client writes from `settingsService.logAuditEvent`.
- Rollback direct client replacement of `appSettings/config`.

Needs staged rollout:

- Direct `auditLogs` side-effect writes in lead/client operational UI code. These are intentionally not migrated in this phase because they sit inside realtime operational workflows.
- `appSettings/config` direct client writes outside `settingsService`, including first-run seeding in `useAppSettings`. Reads remain open, and failed seeding is non-blocking.

Still requires compatibility:

- `appSettings` documents other than `config`.
- Realtime operational collections: leads, deals, appointments, chat, DRAPS, commissions, presence, and document instances.

## Enforcement Changes

- `src/lib/settingsService.ts` now requires callable success for settings update, rollback, and audit helper flows.
- `firestore.rules` denies direct client creates for `settingsHistory`, `auditLogs`, and legacy `audit`.
- `firestore.rules` denies direct client writes to `appSettings/config` while leaving other app settings documents compatible.
- `appendAuditEvent`, `updateAppSettingsCallable`, and `rollbackAppSettingsCallable` now emit lightweight structured logs with actor and source attribution.

## Callable-Authoritative Collections

- `settingsHistory`: server-created by settings admin callables.
- `auditLogs`: server-created by `appendAuditEvent` and settings admin callables.
- `audit`: legacy collection is read-only to elevated users.
- `appSettings/config`: server-written by settings admin callables.

## Remaining Risks

- Rep admin metadata remains client-authoritative under `reps/{repId}`.
- Document/template admin writes remain client-authoritative under `documentLibrary` and `formTemplates`.
- Training document/video/recording writes remain client-authoritative.
- Legacy direct audit side-writes in operational UI code may fail silently or log permission errors after rule deployment; primary operational writes are not dependent on those audit writes.
