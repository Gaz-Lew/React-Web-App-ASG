import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export type ServerRole = "rep" | "manager" | "admin" | "director";
export type ServerRegion = "brisbane" | "perth";

export interface ServerAuthContext {
  uid: string;
  signInProvider?: string;
  repId?: number;
  role?: ServerRole;
  region?: ServerRegion;
  allowedRegions: ServerRegion[];
  active?: boolean;
}

const ROLE_RANK: Record<ServerRole, number> = {
  rep: 1,
  manager: 2,
  admin: 3,
  director: 4,
};

function asRole(value: unknown): ServerRole | undefined {
  return value === "rep" || value === "manager" || value === "admin" || value === "director" ? value : undefined;
}

function asRegion(value: unknown): ServerRegion | undefined {
  return value === "brisbane" || value === "perth" ? value : undefined;
}

function asRegions(value: unknown): ServerRegion[] {
  return Array.isArray(value) ? value.filter((item): item is ServerRegion => asRegion(item) !== undefined) : [];
}

function asInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function requireAuth(request: CallableRequest): ServerAuthContext {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Firebase Auth is required.");
  }

  const token = request.auth.token;
  const firebase = token.firebase as { sign_in_provider?: string } | undefined;

  return {
    uid: request.auth.uid,
    signInProvider: firebase?.sign_in_provider,
    repId: asInteger(token.repId),
    role: token.director === true ? "director" : token.admin === true ? "admin" : asRole(token.role),
    region: asRegion(token.region),
    allowedRegions: asRegions(token.allowedRegions),
    active: typeof token.active === "boolean" ? token.active : undefined,
  };
}

export function hasMinimumRole(auth: ServerAuthContext, role: ServerRole): boolean {
  if (auth.active === false) return false;
  if (!auth.role) return false;
  return ROLE_RANK[auth.role] >= ROLE_RANK[role];
}

export function requireMinimumRole(auth: ServerAuthContext, role: ServerRole): void {
  if (!hasMinimumRole(auth, role)) {
    throw new HttpsError("permission-denied", `Requires ${role} role or higher.`);
  }
}

export function canAccessRegion(auth: ServerAuthContext, region: ServerRegion): boolean {
  if (auth.active === false) return false;
  if (auth.allowedRegions.length === 0) return true;
  return auth.allowedRegions.includes(region);
}
