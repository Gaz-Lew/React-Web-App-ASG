/**
 * oaAutofill.ts — Auto-fill engine for the O&A document.
 *
 * Builds a pre-populated OADocumentData from client, deal, and user context.
 * Maps:
 *  - client (Lead) → buyer fields
 *  - deal → financial fields
 *  - user (Rep) → preparedBy fields
 *  - system → dates
 */

import type { OADocumentData, Lead, Rep } from "../../types";

// Minimal Deal interface — mirrors local type in DealDashboard/DealPipeline
interface OaDealContext {
  id: string;
  leadId?: string;
  clientName: string;
  dealValue: number;
}

export interface OaAutofillContext {
  client: Lead | null;
  deal: OaDealContext | null;
  user: Rep | null;
}

/**
 * Default empty document data.
 */
export function createEmptyOaData(): OADocumentData {
  return {
    buyerName: "",
    buyerAddress: "",
    buyerPhone: "",
    buyerEmail: "",
    propertyAddress: "",
    propertyStreet: "",
    propertySuburb: "",
    propertyPostcode: "",
    propertyTitleRef: "",
    purchasePrice: "",
    depositAmount: "",
    depositPaidDate: "",
    balanceAmount: "",
    financeClause: "14",
    settlementDays: "30",
    gstInclusive: false,
    complianceNotes: "",
    includedChattels: "",
    specialConditions: "",
    preparedByRep: "",
    preparedByRepId: 0,
    preparedDate: new Date().toISOString().split("T")[0],
  };
}

/**
 * Build a pre-filled OADocumentData from available context.
 *
 * Auto-fill sources:
 *  - Lead: name, phone, email, address, suburb, postcode
 *  - Deal: dealValue (purchase price)
 *  - Rep: name, ID
 *  - System: current date
 *
 * Existing values in initialData are preserved (never overwritten).
 */
export function buildInitialOADocument(
  context: OaAutofillContext,
  initialData?: Partial<OADocumentData>,
): OADocumentData {
  const defaults = createEmptyOaData();

  // Start with any existing data (preserves user edits)
  const base = initialData ? { ...defaults, ...initialData } : defaults;

  // ── Auto-fill from Lead (client) ──────────────────────────────────────
  const client = context.client;
  if (client) {
    // Only fill fields that are empty
    if (!base.buyerName) base.buyerName = client.name || "";
    if (!base.buyerPhone) base.buyerPhone = client.phone || "";
    if (!base.buyerEmail) base.buyerEmail = client.email || "";

    const streetParts = [client.houseNum, client.street].filter(Boolean).join(" ");
    if (!base.buyerAddress && streetParts) base.buyerAddress = streetParts;
    if (!base.propertyAddress) {
      const fullAddr = [streetParts, client.suburb].filter(Boolean).join(", ");
      if (fullAddr) base.propertyAddress = fullAddr;
    }
    if (!base.propertyStreet) base.propertyStreet = client.street || "";
    if (!base.propertySuburb) base.propertySuburb = client.suburb || "";
    if (!base.propertyPostcode) base.propertyPostcode = client.postcode || "";
  }

  // ── Auto-fill from Deal ───────────────────────────────────────────────
  const deal = context.deal;
  if (deal) {
    if (!base.buyerName && deal.clientName) base.buyerName = deal.clientName;
    if (!base.purchasePrice && deal.dealValue) {
      base.purchasePrice = String(deal.dealValue);
    }
  }

  // ── Auto-fill from User (Rep) ─────────────────────────────────────────
  const user = context.user;
  if (user) {
    if (!base.preparedByRep) base.preparedByRep = user.name;
    if (!base.preparedByRepId) base.preparedByRepId = user.id;
  }

  // ── System defaults ───────────────────────────────────────────────────
  if (!base.preparedDate) base.preparedDate = new Date().toISOString().split("T")[0];

  return base;
}

/**
 * Merge existing form data with fresh auto-fill values.
 * Used when context changes (e.g. user logs in, deal updates).
 *
 * Only fills empty fields — never overwrites user input.
 */
export function mergeAutofillIntoData(existing: OADocumentData, context: OaAutofillContext): OADocumentData {
  const fresh = buildInitialOADocument(context);
  const merged = { ...existing };

  // Only copy fields that are empty in existing
  for (const key of Object.keys(fresh) as (keyof OADocumentData)[]) {
    const existingVal = existing[key];
    const freshVal = fresh[key];

    // Skip if existing has a value
    if (existingVal != null && existingVal !== "" && existingVal !== 0) continue;

    // Copy fresh value with type-safe assignment
    (merged as Record<string, unknown>)[key] = freshVal;
  }

  return merged;
}

/**
 * Calculate derived financial fields.
 * Should be called whenever purchasePrice or depositAmount changes.
 */
export function calculateFinancials(data: OADocumentData): OADocumentData {
  const updated = { ...data };

  const price = Number(data.purchasePrice) || 0;
  const deposit = Number(data.depositAmount) || 0;
  const balance = price - deposit;

  // Only update balance if it hasn't been manually set to a different value
  if (balance !== Number(data.balanceAmount)) {
    updated.balanceAmount = balance > 0 ? String(balance) : "";
  }

  return updated;
}
