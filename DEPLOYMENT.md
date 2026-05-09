# ASG Leads Web App Deployment

This project uses a local, operator-controlled deployment workflow. It is intentionally not CI/CD and does not add GitHub Actions, cloud runners, or automatic production deploys.

## One-click deployment

Double-click:

```text
deploy.bat
```

The batch file launches `deploy.ps1` with a PowerShell execution-policy bypass for this run only and keeps the window open so the operator can read the result.

## Safe validation without publishing

To validate the script, create the rollback tag, run TypeScript checks, and run the production build without publishing to Firebase:

```powershell
.\deploy.ps1 -DryRun
```

Dry run prints the Firebase deploy commands that would run, but does not execute them.
The same governed dry-run is available through npm:

```powershell
npm run release:dry-run
```

The deployment script defaults to production metadata. To validate future staging metadata without publishing, use:

```powershell
.\deploy.ps1 -DryRun -Environment staging
```

Non-production environments are blocked from publishing to the production Firebase project until a separate Firebase target is configured.

## Deployment flow

1. Validate the local environment:
   - `git`
   - `firebase`
   - `npm`
   - project root files
   - active Firebase login
   - Firebase default project and requested environment
2. Check git branch and working tree status.
3. If uncommitted changes exist, require the operator to type `DEPLOY`.
4. Create a lightweight rollback tag named `pre-deploy-YYYYMMDD-HHMMSS`.
5. Install root dependencies only when `node_modules` is missing.
6. Run TypeScript validation:

```powershell
npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false
```

7. Generate release metadata for the build:

```powershell
npm run release:metadata
```

The app exposes the environment, release version, commit hash, deploy timestamp, and Firebase project in the admin settings panel.

8. Run the production build:

```powershell
npm run build
```

9. Deploy Firebase targets explicitly, in this order:

```powershell
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only hosting
firebase deploy --only functions
```

Functions deploy is skipped only when the `functions` directory does not exist.

## Logs

Every run writes a timestamped log under:

```text
scripts/deploy-logs/
```

Each log records the timestamp, branch, commit hash, rollback tag, deploy result, failed step if any, and command output.
Release metadata is also logged for traceability: environment, release version, commit, deploy timestamp, and Firebase project.

## Rollback reference

The rollback tag points to the latest committed state before validation and deployment:

```powershell
git show pre-deploy-YYYYMMDD-HHMMSS
```

If the operator deploys with uncommitted changes present, the tag still points only to the latest commit. The script warns about this and requires confirmation before continuing.

## Optional EXE wrapper

If a `.exe` launcher is useful for non-technical operators, use PS2EXE to wrap `deploy.ps1`. Keep `deploy.ps1` as the source of truth.

Example:

```powershell
Install-Module ps2exe -Scope CurrentUser
Invoke-ps2exe .\deploy.ps1 .\ASG-Leads-Deploy.exe -noConsole:$false
```

Do not replace the PowerShell script with generated binary-only deployment logic.
