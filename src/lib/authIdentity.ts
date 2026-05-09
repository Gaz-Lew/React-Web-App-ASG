import type { User } from "firebase/auth";
import type { Rep } from "../types";

export type RepResolutionSource = "firebaseUid" | "savedRepId";

export interface RepResolution {
  rep: Rep | null;
  source: RepResolutionSource | null;
  shouldClearSavedRep: boolean;
}

export function getLinkableFirebaseUid(firebaseUser: User | null): string | null {
  if (!firebaseUser || firebaseUser.isAnonymous) {
    return null;
  }
  return firebaseUser.uid;
}

export function linkRepToFirebaseUser(rep: Rep, firebaseUser: User | null, linkedAt = Date.now()): Rep | null {
  const linkableUid = getLinkableFirebaseUid(firebaseUser);
  if (!linkableUid) {
    return rep;
  }

  if (rep.firebaseUid && rep.firebaseUid !== linkableUid) {
    return null;
  }

  if (rep.firebaseUid === linkableUid) {
    return rep;
  }

  return {
    ...rep,
    firebaseUid: linkableUid,
    firebaseLinkedAt: linkedAt,
    firebaseLinkedBy: firebaseUser?.email ?? firebaseUser?.displayName ?? linkableUid,
  };
}

function parseSavedRepId(savedRepId: string | null): number | null {
  if (!savedRepId) return null;
  const parsed = Number(savedRepId);
  return Number.isInteger(parsed) ? parsed : null;
}

function activeRep(rep: Rep): boolean {
  return rep.active !== false;
}

export function resolveRepForSession(
  reps: Rep[],
  firebaseUser: User | null,
  savedRepId: string | null,
): RepResolution {
  const linkableUid = getLinkableFirebaseUid(firebaseUser);

  if (linkableUid) {
    const linkedRep = reps.find((rep) => activeRep(rep) && rep.firebaseUid === linkableUid);
    if (linkedRep) {
      return { rep: linkedRep, source: "firebaseUid", shouldClearSavedRep: false };
    }
  }

  const parsedSavedRepId = parseSavedRepId(savedRepId);
  if (savedRepId && parsedSavedRepId === null) {
    return { rep: null, source: null, shouldClearSavedRep: true };
  }

  if (parsedSavedRepId === null) {
    return { rep: null, source: null, shouldClearSavedRep: false };
  }

  const savedRep = reps.find((rep) => activeRep(rep) && rep.id === parsedSavedRepId);
  if (!savedRep) {
    return { rep: null, source: null, shouldClearSavedRep: true };
  }

  if (linkableUid && savedRep.firebaseUid && savedRep.firebaseUid !== linkableUid) {
    return { rep: null, source: null, shouldClearSavedRep: true };
  }

  return { rep: savedRep, source: "savedRepId", shouldClearSavedRep: false };
}
