import { GENERATED_RELEASE_METADATA } from "../generated/releaseMetadata";

export type AppEnvironment = "development" | "staging" | "production" | "unknown";

export interface ReleaseMetadata {
  environment: AppEnvironment;
  version: string;
  commit: string;
  fullCommit: string;
  deployedAt: string;
  firebaseProjectId: string;
}

const PRODUCTION_FIREBASE_PROJECT_ID = "amplify-leads-2026";

function normalizeEnvironment(value: string | undefined): AppEnvironment {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "development" || normalized === "dev" || normalized === "local") {
    return "development";
  }
  if (normalized === "staging") {
    return "staging";
  }
  if (normalized === "production" || normalized === "prod") {
    return "production";
  }
  return "unknown";
}

function firstValue(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim().length > 0) ?? "unknown";
}

export function getReleaseMetadata(): ReleaseMetadata {
  return {
    environment: normalizeEnvironment(import.meta.env.VITE_APP_ENV ?? GENERATED_RELEASE_METADATA.environment),
    version: firstValue(import.meta.env.VITE_RELEASE_VERSION, GENERATED_RELEASE_METADATA.version),
    commit: firstValue(import.meta.env.VITE_RELEASE_COMMIT, GENERATED_RELEASE_METADATA.commit),
    fullCommit: firstValue(import.meta.env.VITE_RELEASE_COMMIT_FULL, GENERATED_RELEASE_METADATA.fullCommit),
    deployedAt: firstValue(import.meta.env.VITE_RELEASE_DEPLOYED_AT, GENERATED_RELEASE_METADATA.deployedAt),
    firebaseProjectId: firstValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, GENERATED_RELEASE_METADATA.firebaseProjectId),
  };
}

export function getEnvironmentLabel(environment: AppEnvironment): string {
  switch (environment) {
    case "development":
      return "Development";
    case "staging":
      return "Staging";
    case "production":
      return "Production";
    default:
      return "Unknown";
  }
}

export function isProductionEnvironment(metadata = getReleaseMetadata()): boolean {
  return metadata.environment === "production" || metadata.firebaseProjectId === PRODUCTION_FIREBASE_PROJECT_ID;
}

export function shouldShowEnvironmentBadge(metadata = getReleaseMetadata()): boolean {
  return !isProductionEnvironment(metadata);
}
