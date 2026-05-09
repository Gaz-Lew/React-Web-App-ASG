# Auth Claims Foundation

## Purpose

Firebase Auth UID is the identity authority. Rep documents remain the operational profile. Custom claims are the future server-authoritative authorization metadata that Firestore rules and callable Functions can trust.

This phase does not require claims to exist. Missing claims must fall back to the linked rep profile so current PIN-based workflows keep working.

## Proposed Claims

Recommended custom claims:

- `repId`: numeric internal rep ID linked to the Firebase UID.
- `role`: `"rep"`, `"manager"`, `"admin"`, or `"director"`.
- `region`: primary region for default server-side filtering.
- `allowedRegions`: list of regions the user can access.
- `active`: whether the Firebase identity may access operational data.
- `admin`: convenience boolean for admin-only rules.
- `director`: convenience boolean for director-level rules.

## Stays In Rep Profile

Keep these as operational/profile fields:

- `name`
- `email`
- `phone`
- `photo`
- `pin`
- `backupPassword`
- calendar visibility and booking availability
- service-type access
- UI page permissions
- commission/banking profile fields
- onboarding status

## Server-Authoritative Later

The following should eventually be enforced by custom claims, callable Functions, or both:

- rep role changes
- Firebase UID to rep linking
- region assignment and allowed-region changes
- active/inactive account enforcement
- settings rollback and app settings writes
- rep creation/deactivation
- commission-sensitive writes
- audit/event creation
- document/template administration

## Current Fallback Strategy

Runtime helper order:

1. Read Firebase custom claims when a non-anonymous Firebase user exists.
2. Resolve effective role/region/active state from claims.
3. Fall back to the current linked `Rep` profile when claims are missing.
4. Treat frontend authorization as UX only until rules/functions enforce claims.

Anonymous Firebase users are not claim-linked and continue through the existing rep workflow.
