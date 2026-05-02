import { useState, useEffect } from "react";
import { getUserProfile } from "../services/userProfileService";
import type { UserProfile } from "../services/userProfileService";

/**
 * Loads the learning profile for the given userId once on mount (or userId change).
 * Returns null until the read resolves, or if the profile doesn't exist yet.
 * Never throws — errors are caught in getUserProfile.
 */
export function useUserProfile(userId: string | null): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    getUserProfile(userId).then(setProfile);
  }, [userId]);

  return profile;
}
