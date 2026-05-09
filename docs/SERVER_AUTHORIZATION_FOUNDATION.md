# Server Authorization Foundation

## Privileged Operation Audit

Security-sensitive operations that should move behind callable Functions:

- Rep role changes, activation/deactivation, and deletion.
- Firebase UID linkage assignment and unlinking.
- Region and allowed-region assignment.
- App settings updates, settings history creation, and rollback.
- Commission-sensitive writes and payout status changes.
- Training course/module administration.
- Document/template administration.

Operationally sensitive but not migrated in this phase:

- Leads, appointments, deals, chat, DRAPS, and realtime collaboration writes.
- These remain client-driven for now to avoid disrupting daily workflows.

Low-risk function candidate migrated first:

- Structured audit event creation through `appendAuditEvent`.
- Settings update and rollback authority through `updateAppSettingsCallable` and `rollbackAppSettingsCallable`.

## Function Groundwork

New callable helper foundations:

- `functions/src/auth.ts`: central Firebase callable auth parsing, role ranking, minimum-role checks, and region checks.
- `functions/src/audit.ts`: append-only audit event callable.
- `functions/src/settingsAdmin.ts`: admin-only settings update and rollback callables with server history and audit attribution.

The helpers are intentionally small. They establish the pattern for future privileged callables without forcing the current app into full RBAC.

## Migration Strategy

Client audit logging now tries the callable first, then falls back to the previous Firestore write. This keeps existing workflows safe while allowing deployments to roll forward in stages.

Future migrations should remove fallbacks only after the callable is deployed, monitored, and Firestore rules are tightened for the migrated collection.

See `docs/SERVER_AUTHORIZATION_PHASE_2_SETTINGS_ADMIN.md` for the settings/admin write audit and rule-tightening plan.
