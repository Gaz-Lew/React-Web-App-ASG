import type { Region } from "../types";

export interface RegionIdentity {
  label: string;
  shortLabel: string;
  tone: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  textOnAccent: string;
}

export const REGION_IDENTITIES: Record<Region, RegionIdentity> = {
  brisbane: {
    label: "Brisbane",
    shortLabel: "BNE",
    tone: "warm coastal workspace",
    accent: "#c99b35",
    accentSoft: "rgba(201,155,53,0.16)",
    accentBorder: "rgba(201,155,53,0.42)",
    textOnAccent: "#101014",
  },
  perth: {
    label: "Perth",
    shortLabel: "PER",
    tone: "cool western workspace",
    accent: "#5f8fb8",
    accentSoft: "rgba(95,143,184,0.18)",
    accentBorder: "rgba(95,143,184,0.46)",
    textOnAccent: "#f8fbff",
  },
};

export function getRegionIdentity(region: Region): RegionIdentity {
  return REGION_IDENTITIES[region];
}
