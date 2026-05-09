import type { IdTokenResult } from "firebase/auth";
import type { Region, Rep } from "../types";
import type { UserRole } from "../hooks/useUserRole";

const ROLES = ["rep", "manager", "admin", "director"] as const;
export type AuthClaimRole = (typeof ROLES)[number];

export interface AuthClaims {
  repId?: number;
  role?: AuthClaimRole;
  region?: Region;
  allowedRegions?: Region[];
  active?: boolean;
  admin?: boolean;
  director?: boolean;
}

export interface EffectiveAuthContext {
  repId: number | null;
  role: AuthClaimRole;
  region: Region | null;
  allowedRegions: Region[];
  active: boolean;
  claimsPresent: boolean;
}

function isRegion(value: unknown): value is Region {
  return value === "brisbane" || value === "perth";
}

function isRole(value: unknown): value is AuthClaimRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function numberClaim(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function booleanClaim(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function regionsClaim(value: unknown): Region[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const regions = value.filter(isRegion);
  return regions.length > 0 ? regions : undefined;
}

export function readAuthClaims(tokenResult: IdTokenResult | null | undefined): AuthClaims {
  const raw = tokenResult?.claims;
  if (!raw) return {};

  return {
    repId: numberClaim(raw.repId),
    role: isRole(raw.role) ? raw.role : undefined,
    region: isRegion(raw.region) ? raw.region : undefined,
    allowedRegions: regionsClaim(raw.allowedRegions),
    active: booleanClaim(raw.active),
    admin: booleanClaim(raw.admin),
    director: booleanClaim(raw.director),
  };
}

export function roleFromClaims(claims: AuthClaims): AuthClaimRole | undefined {
  if (claims.director) return "director";
  if (claims.admin) return "admin";
  return claims.role;
}

export function roleForUi(role: AuthClaimRole): UserRole {
  return role === "director" ? "admin" : role;
}

export function getEffectiveAuthContext(rep: Rep | null, claims: AuthClaims): EffectiveAuthContext {
  const claimRole = roleFromClaims(claims);
  const repRole = rep?.role === "admin" || rep?.role === "manager" || rep?.role === "rep" ? rep.role : undefined;
  const allowedRegions = claims.allowedRegions ?? rep?.allowedRegions ?? (rep?.primaryRegion ? [rep.primaryRegion] : []);

  return {
    repId: claims.repId ?? rep?.id ?? null,
    role: claimRole ?? repRole ?? "rep",
    region: claims.region ?? rep?.primaryRegion ?? null,
    allowedRegions,
    active: claims.active ?? rep?.active ?? false,
    claimsPresent: Object.keys(claims).length > 0,
  };
}

export function hasRoleAccess(context: EffectiveAuthContext, minimumRole: AuthClaimRole): boolean {
  const rank: Record<AuthClaimRole, number> = {
    rep: 1,
    manager: 2,
    admin: 3,
    director: 4,
  };
  return context.active && rank[context.role] >= rank[minimumRole];
}

export function canAccessRegion(context: EffectiveAuthContext, region: Region): boolean {
  if (!context.active) return false;
  if (context.allowedRegions.length === 0) return true;
  return context.allowedRegions.includes(region);
}
