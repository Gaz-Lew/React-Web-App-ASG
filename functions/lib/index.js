"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPropertyInsights = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
exports.getPropertyInsights = functions.https.onCall(async (data) => {
    var _a, _b, _c, _d, _e, _f;
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
        const fetchedAt = (_b = (_a = property.fetchedAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (fetchedAt && Date.now() - fetchedAt.getTime() < 1000 * 60 * 60 * 24 * 30) {
            return Object.assign(Object.assign({}, property), { propertyId: doc.id, fetchedAt: fetchedAt.getTime() });
        }
    }
    // ── Suburb baseline (safe fallback) ─────────────
    const suburbDoc = await db.collection("suburbBaselines").doc(suburbKey).get();
    const medianValue = suburbDoc.exists ? (_d = (_c = suburbDoc.data()) === null || _c === void 0 ? void 0 : _c.medianValue) !== null && _d !== void 0 ? _d : null : null;
    const growthRate = suburbDoc.exists ? (_f = (_e = suburbDoc.data()) === null || _e === void 0 ? void 0 : _e.annualGrowthRate) !== null && _f !== void 0 ? _f : 0.05 : 0.05;
    // ── Placeholder: replaced by Domain API in Phase 2 ──
    const apiEstimatedValue = null;
    const lastSoldPrice = null;
    const lastSoldDate = null;
    // ── Years since last sale ──────────────────────
    let years = 0;
    if (lastSoldDate) {
        years =
            (Date.now() - new Date(lastSoldDate).getTime()) /
                (1000 * 60 * 60 * 24 * 365.25);
    }
    // ── Resolve value + data tier ──────────────────
    let dataTier = "minimal";
    let resolvedValue = null;
    let resolvedValueSource = null;
    if (apiEstimatedValue && lastSoldPrice && lastSoldDate) {
        dataTier = "full";
        resolvedValue = apiEstimatedValue;
        resolvedValueSource = "api";
    }
    else if (lastSoldPrice && lastSoldDate) {
        dataTier = "partial";
        resolvedValue = lastSoldPrice * Math.pow(1 + growthRate, years);
        resolvedValueSource = "appreciation_model";
    }
    else {
        resolvedValue = medianValue;
        resolvedValueSource = "baseline";
    }
    // ── Comparison metrics (suppressed when source is baseline) ──
    let valueRatio = null;
    let valueVsMedian = null;
    let valueVsMedianPct = null;
    if (resolvedValue && medianValue && resolvedValueSource !== "baseline") {
        valueVsMedian = resolvedValue - medianValue;
        valueRatio = resolvedValue / medianValue;
        valueVsMedianPct = (valueVsMedian / medianValue) * 100;
    }
    // ── Equity (amortisation model) ────────────────
    let estimatedEquity = null;
    let equityConfidence = null;
    let equityMethod = null;
    const assumedLVR = 0.80;
    const assumedRate = 0.06;
    const assumedTerm = 30;
    if (lastSoldPrice && resolvedValue) {
        const principal = lastSoldPrice * assumedLVR;
        const monthlyRate = assumedRate / 12;
        const totalMonths = assumedTerm * 12;
        const paidMonths = Math.min(years * 12, totalMonths);
        const monthlyPayment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));
        const remainingPrincipal = principal * Math.pow(1 + monthlyRate, paidMonths) -
            (monthlyPayment * (Math.pow(1 + monthlyRate, paidMonths) - 1)) / monthlyRate;
        estimatedEquity = resolvedValue - remainingPrincipal;
        equityConfidence = dataTier === "full" ? "high" : "medium";
        equityMethod = dataTier === "full" ? "full_model" : "appreciation_model";
    }
    else if (medianValue) {
        estimatedEquity = medianValue * 0.4;
        equityConfidence = "low";
        equityMethod = "baseline_proxy";
    }
    // ── Data mode ──────────────────────────────────
    const dataMode = dataTier === "full" ? "cached" : "estimated";
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
    return Object.assign(Object.assign({}, propertyDoc), { fetchedAt: now, propertyId: ref.id });
});
//# sourceMappingURL=index.js.map