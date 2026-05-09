# Release Engineering Foundation

## Environment assumptions audited

- Firebase is currently production-first: `.firebaserc` points the default project at `amplify-leads-2026`, and `firebase.json` targets the production hosting site.
- Local `.env` values are production-shaped today. Staging is not yet split into its own Firebase project, auth domain, storage bucket, or hosting target.
- The local deploy script is the source of truth for release flow. `npm run deploy` remains hosting-only and should not be treated as the full governed deployment path.
- Realtime operational workflows remain client/Firebase-driven and were not moved or locked down in this phase.

## Staging prep

- `VITE_APP_ENV` now labels builds as `development`, `staging`, or `production`.
- Release metadata is generated into `src/generated/releaseMetadata.ts` before builds and can also be generated explicitly with `npm run release:metadata`.
- `deploy.ps1 -Environment staging -DryRun` can validate staging-labeled release metadata without publishing.
- Non-production deploys are blocked from publishing to the production Firebase project until a separate Firebase target is configured.

## Deployment governance

- Production deploys expect `.firebaserc` to point at `amplify-leads-2026`.
- Deploy logs now include environment, release version, commit, deploy timestamp, and Firebase project.
- Rollback tags continue to use `pre-deploy-YYYYMMDD-HHMMSS`; release version defaults to that tag during governed deploys.

## Remaining risks

- A true staging environment still needs separate Firebase project resources and environment files.
- The direct `npm run deploy` shortcut is still hosting-only; operators should prefer `deploy.ps1`.
- Generated release metadata is build-time metadata, not a server-trusted deployment attestation.
