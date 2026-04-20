/**
 * oaFieldSchema.ts — Complete field schema for the REIWA Offer & Acceptance PDF.
 *
 * Covers every field in the standard REIWA Contract for Sale of Strata Lot /
 * General Property Offer & Acceptance form. Drives the dynamic form UI in
 * OADocumentEditor and maps directly to PDF form field names.
 *
 * Architecture:
 *  - Each field has: id, label, type, required, condition, defaultSource
 *  - Fields are grouped into logical sections
 *  - Conditions control field visibility (e.g. multiple buyers, finance clause)
 *  - defaultSource auto-fills from client, deal, or system data
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType = "text" | "number" | "date" | "boolean" | "select" | "textarea" | "signature";
export type ConditionExpr = string | null;
export type DefaultSource = "client" | "deal" | "system" | null;

export interface OaField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  condition?: ConditionExpr; // Expression to control visibility (e.g. "buyerType === 'multiple'")
  defaultSource?: DefaultSource;
  placeholder?: string;
  helpText?: string;
  options?: string[]; // For select type
  pdfFieldNames?: string[]; // Actual PDF form field names (may be multiple for grouped fields)
}

export interface OaSection {
  name: string;
  description?: string;
  fields: OaField[];
}

export interface OaSchema {
  version: string;
  formName: string;
  sections: OaSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

export const OA_SCHEMA: OaSchema = {
  version: "1.0.0",
  formName: "REIWA Offer & Acceptance — Contract for Sale",
  sections: [
    // ═══════════════════════════════════════════════════════════════════════
    // 1. PARTIES — Buyer Details
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Buyer Details",
      description: "Full legal name(s) and contact information of the purchaser(s)",
      fields: [
        {
          id: "buyerType",
          label: "Buyer Type",
          type: "select",
          required: true,
          options: ["Individual", "Joint (Multiple)", "Company", "Trust"],
          defaultSource: null,
        },
        {
          id: "buyerName",
          label: "Buyer Full Name",
          type: "text",
          required: true,
          condition: "buyerType === 'Individual'",
          defaultSource: "client",
          pdfFieldNames: ["BuyerName"],
        },
        {
          id: "buyerName1",
          label: "First Buyer Name",
          type: "text",
          required: true,
          condition: "buyerType === 'Joint (Multiple)'",
          defaultSource: "client",
        },
        {
          id: "buyerName2",
          label: "Second Buyer Name",
          type: "text",
          required: true,
          condition: "buyerType === 'Joint (Multiple)'",
          defaultSource: null,
        },
        {
          id: "buyerName3",
          label: "Third Buyer Name (if applicable)",
          type: "text",
          required: false,
          condition: "buyerType === 'Joint (Multiple)'",
          defaultSource: null,
        },
        {
          id: "buyerCompany",
          label: "Company Name (ACN/ABN)",
          type: "text",
          required: true,
          condition: "buyerType === 'Company'",
          defaultSource: null,
        },
        {
          id: "buyerTrust",
          label: "Trust Name (Trustee for)",
          type: "text",
          required: true,
          condition: "buyerType === 'Trust'",
          defaultSource: null,
        },
        {
          id: "buyerAddress",
          label: "Buyer Postal Address",
          type: "text",
          required: true,
          defaultSource: "client",
          pdfFieldNames: ["BuyerAddress"],
        },
        {
          id: "buyerSuburb",
          label: "Suburb",
          type: "text",
          required: true,
          defaultSource: "client",
        },
        {
          id: "buyerState",
          label: "State",
          type: "select",
          required: true,
          options: ["WA", "NSW", "VIC", "QLD", "SA", "TAS", "ACT", "NT"],
          defaultSource: "client",
        },
        {
          id: "buyerPostcode",
          label: "Postcode",
          type: "text",
          required: true,
          defaultSource: "client",
        },
        {
          id: "buyerPhone",
          label: "Phone",
          type: "text",
          required: false,
          defaultSource: "client",
          pdfFieldNames: ["BuyerPhone"],
        },
        {
          id: "buyerEmail",
          label: "Email",
          type: "text",
          required: false,
          defaultSource: "client",
          pdfFieldNames: ["BuyerEmail"],
        },
        {
          id: "buyerAgent",
          label: "Buyer's Agent / Solicitor",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "buyerAgentPhone",
          label: "Agent Phone",
          type: "text",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 2. PARTIES — Seller Details
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Seller Details",
      description: "Full legal name(s) of the vendor(s)",
      fields: [
        {
          id: "sellerName",
          label: "Seller Full Name",
          type: "text",
          required: true,
          defaultSource: null,
          pdfFieldNames: ["SellerName"],
        },
        {
          id: "sellerName2",
          label: "Second Seller Name (if joint)",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "sellerAddress",
          label: "Seller Postal Address",
          type: "text",
          required: true,
          defaultSource: null,
        },
        {
          id: "sellerSuburb",
          label: "Suburb",
          type: "text",
          required: true,
          defaultSource: null,
        },
        {
          id: "sellerState",
          label: "State",
          type: "select",
          required: true,
          options: ["WA", "NSW", "VIC", "QLD", "SA", "TAS", "ACT", "NT"],
          defaultSource: null,
        },
        {
          id: "sellerPostcode",
          label: "Postcode",
          type: "text",
          required: true,
          defaultSource: null,
        },
        {
          id: "sellerAgent",
          label: "Seller's Agent / Solicitor",
          type: "text",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 3. PROPERTY DETAILS
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Property Details",
      description: "Legal description and address of the property being sold",
      fields: [
        {
          id: "propertyStreetAddress",
          label: "Street Address",
          type: "text",
          required: true,
          defaultSource: "client",
          pdfFieldNames: ["PropertyAddress"],
        },
        {
          id: "propertySuburb",
          label: "Suburb / Locality",
          type: "text",
          required: true,
          defaultSource: "client",
          pdfFieldNames: ["PropertySuburb"],
        },
        {
          id: "propertyPostcode",
          label: "Postcode",
          type: "text",
          required: true,
          defaultSource: "client",
          pdfFieldNames: ["PropertyPostcode"],
        },
        {
          id: "propertyTitleRef",
          label: "Certificate of Title / Volume & Folio",
          type: "text",
          required: false,
          defaultSource: null,
          pdfFieldNames: ["PropertyTitleRef"],
        },
        {
          id: "propertyLot",
          label: "Lot Number",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "propertyPlan",
          label: "Plan / Diagram Number",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "propertyTenure",
          label: "Tenure Type",
          type: "select",
          required: true,
          options: ["Freehold", "Strata", "Leasehold", "Crown Lease"],
          defaultSource: null,
        },
        {
          id: "propertyStrataLot",
          label: "Strata Lot Number",
          type: "text",
          required: false,
          condition: "propertyTenure === 'Strata'",
          defaultSource: null,
        },
        {
          id: "propertyStrataPlan",
          label: "Strata Plan Number",
          type: "text",
          required: false,
          condition: "propertyTenure === 'Strata'",
          defaultSource: null,
        },
        {
          id: "propertyDescription",
          label: "Full Property Description",
          type: "textarea",
          required: false,
          defaultSource: null,
          helpText: "Complete legal description as shown on title",
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 4. FINANCIALS — Price & Deposit
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Financials",
      description: "Purchase price, deposit amount, and payment details",
      fields: [
        {
          id: "purchasePrice",
          label: "Purchase Price ($)",
          type: "number",
          required: true,
          defaultSource: "deal",
          pdfFieldNames: ["PurchasePrice"],
        },
        {
          id: "depositTotal",
          label: "Total Deposit ($)",
          type: "number",
          required: true,
          defaultSource: "deal",
          pdfFieldNames: ["DepositAmount"],
        },
        {
          id: "depositHeldBy",
          label: "Deposit Held By",
          type: "select",
          required: true,
          options: ["Real Estate Agent (Stakeholder)", "Settlement Agent", "Seller's Solicitor", "Other"],
          defaultSource: null,
        },
        {
          id: "depositHeldByName",
          label: "Name of Holder",
          type: "text",
          required: true,
          defaultSource: null,
        },
        {
          id: "depositPaidDate",
          label: "Deposit Paid Date",
          type: "date",
          required: false,
          defaultSource: "system",
          pdfFieldNames: ["DepositPaidDate"],
        },
        {
          id: "depositSplit",
          label: "Deposit Split Required",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "depositPart1",
          label: "Deposit Part 1 — On Signing ($)",
          type: "number",
          required: false,
          condition: "depositSplit === true",
          defaultSource: null,
        },
        {
          id: "depositPart1Due",
          label: "Part 1 Due Date",
          type: "date",
          required: false,
          condition: "depositSplit === true",
          defaultSource: "system",
        },
        {
          id: "depositPart2",
          label: "Deposit Part 2 — By Date ($)",
          type: "number",
          required: false,
          condition: "depositSplit === true",
          defaultSource: null,
        },
        {
          id: "depositPart2Due",
          label: "Part 2 Due Date",
          type: "date",
          required: false,
          condition: "depositSplit === true",
          defaultSource: null,
        },
        {
          id: "balanceAmount",
          label: "Balance of Purchase Price ($)",
          type: "number",
          required: true,
          defaultSource: null,
          pdfFieldNames: ["BalanceAmount"],
          helpText: "Purchase Price minus Total Deposit",
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 5. FINANCE CLAUSE
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Finance Clause",
      description: "Loan approval conditions and finance contingency details",
      fields: [
        {
          id: "financeRequired",
          label: "Subject to Finance",
          type: "boolean",
          required: true,
          defaultSource: null,
        },
        {
          id: "financeClause",
          label: "Finance Approval Period (days)",
          type: "number",
          required: false,
          condition: "financeRequired === true",
          defaultSource: null,
          pdfFieldNames: ["FinanceDays"],
          placeholder: "14",
        },
        {
          id: "financeLender",
          label: "Preferred Lender / Bank",
          type: "text",
          required: false,
          condition: "financeRequired === true",
          defaultSource: null,
        },
        {
          id: "financeAmount",
          label: "Loan Amount ($)",
          type: "number",
          required: false,
          condition: "financeRequired === true",
          defaultSource: null,
        },
        {
          id: "financePercentage",
          label: "Loan to Value (%)",
          type: "text",
          required: false,
          condition: "financeRequired === true",
          defaultSource: null,
          placeholder: "e.g. 80%",
        },
        {
          id: "financeExpiryDate",
          label: "Finance Expiry Date",
          type: "date",
          required: false,
          condition: "financeRequired === true",
          defaultSource: null,
        },
        {
          id: "financeApprovalNotice",
          label: "Buyer must notify Seller of approval",
          type: "boolean",
          required: true,
          condition: "financeRequired === true",
          defaultSource: null,
        },
        {
          id: "financeWaiveClause",
          label: "Buyer may waive finance condition in writing",
          type: "boolean",
          required: true,
          condition: "financeRequired === true",
          defaultSource: null,
        },
        {
          id: "financeDeclineRights",
          label: "Contract void if finance not obtained",
          type: "boolean",
          required: true,
          condition: "financeRequired === true",
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 6. SETTLEMENT
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Settlement Details",
      description: "Settlement date, period, and related terms",
      fields: [
        {
          id: "settlementDays",
          label: "Settlement Period (days)",
          type: "number",
          required: true,
          defaultSource: null,
          placeholder: "30",
          pdfFieldNames: ["SettlementDays"],
        },
        {
          id: "settlementDate",
          label: "Settlement Date",
          type: "date",
          required: false,
          defaultSource: null,
          helpText: "Calculated from acceptance date + settlement period",
        },
        {
          id: "settlementTime",
          label: "Settlement Time",
          type: "text",
          required: false,
          defaultSource: null,
          placeholder: "2:00 PM",
        },
        {
          id: "settlementLocation",
          label: "Settlement Location",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "settlementAgent",
          label: "Settlement Agent / Conveyancer",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "settlementAgentPhone",
          label: "Agent Phone",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "settlementAgentEmail",
          label: "Agent Email",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "settlementInPossession",
          label: "Buyer to take possession on settlement",
          type: "boolean",
          required: true,
          defaultSource: null,
        },
        {
          id: "settlementExtension",
          label: "Extension permitted by mutual agreement",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 7. GST
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "GST",
      description: "Goods & Services Tax treatment for the transaction",
      fields: [
        {
          id: "gstInclusive",
          label: "Price is GST Inclusive",
          type: "boolean",
          required: true,
          defaultSource: null,
          pdfFieldNames: ["GST_Inclusive"],
        },
        {
          id: "gstExclusive",
          label: "Price is GST Exclusive (GST added)",
          type: "boolean",
          required: true,
          defaultSource: null,
        },
        {
          id: "gstNotApplicable",
          label: "GST Does Not Apply (e.g. Residential Premises)",
          type: "boolean",
          required: true,
          defaultSource: null,
        },
        {
          id: "gstMargin",
          label: "Margin Scheme Applies",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "gstAbn",
          label: "Buyer ABN (if commercial)",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "gstNotes",
          label: "GST Notes / Additional Terms",
          type: "textarea",
          required: false,
          defaultSource: null,
          pdfFieldNames: ["ComplianceNotes"],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 8. CONVEYANCER / SETTLEMENT AGENT
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Conveyancer",
      description: "Buyer's settlement agent or conveyancer details",
      fields: [
        {
          id: "conveyancerName",
          label: "Conveyancer / Settlement Agent Name",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "conveyancerCompany",
          label: "Company / Firm",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "conveyancerPhone",
          label: "Phone",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "conveyancerEmail",
          label: "Email",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "conveyancerRef",
          label: "Reference / Matter Number",
          type: "text",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 9. CHATTELS & INCLUSIONS
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Included Chattels",
      description: "Fixtures, fittings, and items included in the sale",
      fields: [
        {
          id: "includedChattels",
          label: "Included Chattels / Fixtures",
          type: "textarea",
          required: false,
          defaultSource: null,
          pdfFieldNames: ["IncludedChattels"],
          placeholder: "Dishwasher, blinds, curtains, light fittings, floor coverings...",
        },
        {
          id: "excludedChattels",
          label: "Excluded Items",
          type: "textarea",
          required: false,
          defaultSource: null,
          placeholder: "Certain fixtures excluded from sale...",
        },
        {
          id: "chattelsAirConditioning",
          label: "Air Conditioning",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "chattelsDishwasher",
          label: "Dishwasher",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "chattelsBlinds",
          label: "Blinds / Curtains",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "chattelsFloorCoverings",
          label: "Floor Coverings",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "chattelsLightFittings",
          label: "Light Fittings",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "chattelsHotWater",
          label: "Hot Water System",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "chattelsPoolEquipment",
          label: "Pool Equipment",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 10. SPECIAL CONDITIONS
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Special Conditions",
      description: "Any additional terms, clauses, or conditions of sale",
      fields: [
        {
          id: "specialConditions",
          label: "Special Conditions",
          type: "textarea",
          required: false,
          defaultSource: null,
          pdfFieldNames: ["SpecialConditions"],
          placeholder: "List all special conditions, numbered sequentially...",
        },
        {
          id: "specialConditionBuildingInspection",
          label: "Subject to Building Inspection",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "specialConditionPestInspection",
          label: "Subject to Pest Inspection",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "specialConditionRentalIncome",
          label: "Subject to Rental Income Verification",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "specialConditionStrataReport",
          label: "Subject to Strata Report",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "specialConditionDueDiligence",
          label: "Subject to Buyer Due Diligence",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "specialConditionVacantPossession",
          label: "Vacant Possession Required",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
        {
          id: "specialConditionSaleWithTenant",
          label: "Sold with Tenancy In Place",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 11. OFFER VALIDITY
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Offer Validity",
      description: "How long this offer remains open for acceptance",
      fields: [
        {
          id: "offerExpiryDate",
          label: "Offer Expiry Date",
          type: "date",
          required: false,
          defaultSource: null,
          helpText: "If accepted by this date, this offer becomes a binding contract",
        },
        {
          id: "offerExpiryTime",
          label: "Expiry Time",
          type: "text",
          required: false,
          defaultSource: null,
          placeholder: "5:00 PM",
        },
        {
          id: "offerNoExpiry",
          label: "No Expiry — Open Until Withdrawn",
          type: "boolean",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 12. SIGNATURES
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Signatures",
      description: "Execution by buyer(s) and acceptance by seller(s)",
      fields: [
        {
          id: "buyerSignature",
          label: "Buyer Signature",
          type: "signature",
          required: true,
          defaultSource: null,
        },
        {
          id: "buyerSignatureDate",
          label: "Date Signed",
          type: "date",
          required: true,
          defaultSource: "system",
          pdfFieldNames: ["PreparedDate"],
        },
        {
          id: "buyerSignature2",
          label: "Second Buyer Signature",
          type: "signature",
          required: false,
          condition: "buyerType === 'Joint (Multiple)'",
          defaultSource: null,
        },
        {
          id: "sellerSignature",
          label: "Seller Signature (Acceptance)",
          type: "signature",
          required: true,
          defaultSource: null,
        },
        {
          id: "sellerSignatureDate",
          label: "Date Accepted",
          type: "date",
          required: true,
          defaultSource: "system",
        },
        {
          id: "witnessName",
          label: "Witness Name",
          type: "text",
          required: false,
          defaultSource: null,
        },
        {
          id: "witnessSignature",
          label: "Witness Signature",
          type: "signature",
          required: false,
          defaultSource: null,
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 13. PREPARED BY (System)
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: "Document Preparation",
      description: "Automatically populated — who prepared this document",
      fields: [
        {
          id: "preparedByRep",
          label: "Prepared By",
          type: "text",
          required: true,
          defaultSource: "system",
          pdfFieldNames: ["PreparedByRep"],
        },
        {
          id: "preparedByRepId",
          label: "Rep ID",
          type: "number",
          required: true,
          defaultSource: "system",
        },
        {
          id: "preparedDate",
          label: "Date Prepared",
          type: "date",
          required: true,
          defaultSource: "system",
          pdfFieldNames: ["PreparedDate"],
        },
        {
          id: "preparedCompany",
          label: "Company / Agency",
          type: "text",
          required: false,
          defaultSource: "system",
          helpText: "e.g. Amplify Solutions Group",
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Get all fields across all sections as a flat array */
export function getAllOaFields(): OaField[] {
  return OA_SCHEMA.sections.flatMap((s) => s.fields);
}

/** Get fields for a specific section by name */
export function getOaSectionFields(sectionName: string): OaField[] {
  return OA_SCHEMA.sections.find((s) => s.name === sectionName)?.fields ?? [];
}

/** Get all required fields */
export function getRequiredOaFields(): OaField[] {
  return getAllOaFields().filter((f) => f.required);
}

/** Get fields that auto-fill from a given source */
export function getOaFieldsBySource(source: DefaultSource): OaField[] {
  return getAllOaFields().filter((f) => f.defaultSource === source);
}

/** Get all PDF-mapped fields (fields that have corresponding form fields in the template) */
export function getOaPdfMappedFields(): OaField[] {
  return getAllOaFields().filter((f) => f.pdfFieldNames && f.pdfFieldNames.length > 0);
}

/** Build a map of field ID → PDF field name(s) for pdf-lib */
export function buildPdfFieldMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of getAllOaFields()) {
    if (field.pdfFieldNames) {
      for (const pdfName of field.pdfFieldNames) {
        map[pdfName] = field.id;
      }
    }
  }
  return map;
}

export default OA_SCHEMA;
