import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

type Input = {
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
};

export const getPropertyInsights = functions.https.onCall(async (data: Input) => {
  const { address, suburb, state, postcode, lat, lng } = data;

  const suburbKey = `${state}_${postcode}_${suburb}`;

  // ── Check existing (30-day TTL) ────────────────
  const existingSnap = await db
    .collection("properties")
    .where("address", "==", address)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0];
    const property = doc.data();
    const fetchedAt = property.fetchedAt?.toDate?.();

    if (fetchedAt && Date.now() - fetchedAt.getTime() < 1000 * 60 * 60 * 24 * 30) {
      return { ...property, propertyId: doc.id, fetchedAt: fetchedAt.getTime() };
    }
  }

  // ── Suburb baseline (safe fallback) ─────────────
  const suburbDoc = await db.collection("suburbBaselines").doc(suburbKey).get();

  const medianValue = suburbDoc.exists ? suburbDoc.data()?.medianValue ?? null : null;
  const growthRate  = suburbDoc.exists ? suburbDoc.data()?.annualGrowthRate ?? 0.05 : 0.05;

  // ── Placeholder: replaced by Domain API in Phase 2 ──
  const apiEstimatedValue: number | null = null;
  const lastSoldPrice: number | null     = null;
  const lastSoldDate: string | null      = null;

  // ── Years since last sale ──────────────────────
  let years = 0;
  if (lastSoldDate) {
    years =
      (Date.now() - new Date(lastSoldDate).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
  }

  // ── Resolve value + data tier ──────────────────
  let dataTier: "full" | "partial" | "minimal"                             = "minimal";
  let resolvedValue: number | null                                          = null;
  let resolvedValueSource: "api" | "appreciation_model" | "baseline" | null = null;

  if (apiEstimatedValue && lastSoldPrice && lastSoldDate) {
    dataTier            = "full";
    resolvedValue       = apiEstimatedValue;
    resolvedValueSource = "api";
  } else if (lastSoldPrice && lastSoldDate) {
    dataTier            = "partial";
    resolvedValue       = lastSoldPrice * Math.pow(1 + growthRate, years);
    resolvedValueSource = "appreciation_model";
  } else {
    resolvedValue       = medianValue;
    resolvedValueSource = "baseline";
  }

  // ── Comparison metrics (suppressed when source is baseline) ──
  let valueRatio: number | null      = null;
  let valueVsMedian: number | null   = null;
  let valueVsMedianPct: number | null = null;

  if (resolvedValue && medianValue && resolvedValueSource !== "baseline") {
    valueVsMedian    = resolvedValue - medianValue;
    valueRatio       = resolvedValue / medianValue;
    valueVsMedianPct = (valueVsMedian / medianValue) * 100;
  }

  // ── Equity (amortisation model) ────────────────
  let estimatedEquity: number | null                                        = null;
  let equityConfidence: "high" | "medium" | "low" | null                   = null;
  let equityMethod: "full_model" | "appreciation_model" | "baseline_proxy" | null = null;

  const assumedLVR  = 0.80;
  const assumedRate = 0.06;
  const assumedTerm = 30;

  if (lastSoldPrice && resolvedValue) {
    const principal    = lastSoldPrice * assumedLVR;
    const monthlyRate  = assumedRate / 12;
    const totalMonths  = assumedTerm * 12;
    const paidMonths   = Math.min(years * 12, totalMonths);

    const monthlyPayment =
      (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));

    const remainingPrincipal =
      principal * Math.pow(1 + monthlyRate, paidMonths) -
      (monthlyPayment * (Math.pow(1 + monthlyRate, paidMonths) - 1)) / monthlyRate;

    estimatedEquity  = resolvedValue - remainingPrincipal;
    equityConfidence = dataTier === "full" ? "high" : "medium";
    equityMethod     = dataTier === "full" ? "full_model" : "appreciation_model";
  } else if (medianValue) {
    estimatedEquity  = medianValue * 0.4;
    equityConfidence = "low";
    equityMethod     = "baseline_proxy";
  }

  // ── Data mode ──────────────────────────────────
  const dataMode: "live" | "cached" | "estimated" =
    dataTier === "full" ? "cached" : "estimated";

  // ── Build document ─────────────────────────────
  const now = Date.now();

  const propertyDoc = {
    address,
    lat,
    lng,
    suburb,
    state,
    postcode,
    suburbKey,

    // Stored now; populated by Domain API in Phase 2
    lastSoldPrice,
    lastSoldDate,

    resolvedValue,
    resolvedValueSource,

    valueRatio,
    valueVsMedian,
    valueVsMedianPct,

    estimatedEquity,
    equityConfidence,
    equityMethod,

    assumedLVR,
    assumedRate,
    assumedTerm,

    dataTier,
    dataMode,

    fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // ── Persist ────────────────────────────────────
  const ref = await db.collection("properties").add(propertyDoc);

  return {
    ...propertyDoc,
    fetchedAt: now,
    propertyId: ref.id,
  };
});
