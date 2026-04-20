/**
 * oaPdfGenerator.ts — Generates a filled Offer & Acceptance PDF using pdf-lib.
 *
 * Architecture:
 *  1. Load the base REIWA O&A PDF template from /public/templates/oa.pdf
 *  2. Validate template fields against schema
 *  3. Fill all fields safely (skip undefined, handle checkboxes)
 *  4. Flatten form fields (read-only output)
 *  5. Return Uint8Array for download or upload
 *
 * Safety guarantees:
 *  - Never crashes on missing/mismatched fields
 *  - Logs all mapping issues to console
 *  - Falls back to jsPDF-generated PDF if template fails
 */

import { PDFDocument, PDFForm, PDFFont, StandardFonts } from "pdf-lib";
import jsPDF from "jspdf";
import type { OADocumentData } from "../../types";
import { getOaPdfMappedFields, OA_SCHEMA } from "./oaFieldSchema";
import { validatePdfMapping, validatePdfTemplate, type PdfValidationResult } from "./oaValidation";

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = "[OAPdfGenerator]";

function logMappingIssue(field: string, issue: string) {
  console.warn(`${LOG_PREFIX} Field "${field}": ${issue}`);
}

function logFillResult(result: PdfFieldFillResult) {
  if (result.skippedFields.length > 0) {
    console.warn(`${LOG_PREFIX} Skipped ${result.skippedFields.length} fields:`, result.skippedFields);
  }
  if (result.filledFields > 0) {
    console.log(`${LOG_PREFIX} Filled ${result.filledFields} fields successfully`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PdfFieldFillResult {
  filledFields: number;
  skippedFields: string[];
  errorFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Template Validation (runs once per generation)
// ─────────────────────────────────────────────────────────────────────────────

let cachedValidation: PdfValidationResult | null = null;
let cachedValidationAt = 0;
const VALIDATION_CACHE_MS = 60_000; // Re-validate every 60 seconds

/**
 * Validates the PDF template against the schema.
 * Cached for 60 seconds to avoid repeated fetches.
 */
async function getTemplateValidation(): Promise<PdfValidationResult> {
  const now = Date.now();
  if (cachedValidation && now - cachedValidationAt < VALIDATION_CACHE_MS) {
    return cachedValidation;
  }

  const result = await validatePdfTemplate(OA_SCHEMA);
  cachedValidation = result;
  cachedValidationAt = now;

  if (result.missingFields.length > 0) {
    console.warn(
      `${LOG_PREFIX} PDF template missing ${result.missingFields.length} fields:`,
      result.missingFields.slice(0, 10),
    );
  }
  if (result.typeMismatches.length > 0) {
    console.warn(`${LOG_PREFIX} PDF template type mismatches:`, result.typeMismatches);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe PDF Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to load the base O&A PDF template, validate, fill form fields,
 * and return the resulting PDF as a Uint8Array.
 *
 * @param data Filled OADocumentData
 * @param templatePath Path to the PDF template (relative to /public)
 */
export async function generateOAPdfFromTemplate(
  data: OADocumentData,
  templatePath = "/templates/oa.pdf",
): Promise<Uint8Array> {
  // Fetch the base PDF
  const response = await fetch(templatePath);
  if (!response.ok) {
    throw new Error(`Failed to load PDF template: ${response.status} ${response.statusText}`);
  }

  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Run validation (cached)
  const validation = await getTemplateValidation();

  // Fill fields safely
  const fillResult = fillPdfFieldsSafely(form, font, data);
  logFillResult(fillResult);

  // Flatten fields so they become read-only in the output
  form.flatten();

  return pdfDoc.save();
}

/**
 * Safely fills PDF form fields with data from OADocumentData.
 *
 * Safety rules:
 *  - Skips undefined/null/empty values
 *  - Handles checkboxes correctly (check/uncheck)
 *  - Handles text fields with sanitised values
 *  - Never throws — logs issues and continues
 */
function fillPdfFieldsSafely(form: PDFForm, font: PDFFont, data: OADocumentData): PdfFieldFillResult {
  const result: PdfFieldFillResult = {
    filledFields: 0,
    skippedFields: [],
    errorFields: [],
  };

  for (const field of getOaPdfMappedFields()) {
    const pdfFieldNames = field.pdfFieldNames;
    if (!pdfFieldNames || pdfFieldNames.length === 0) continue;

    const dataKey = field.id as keyof OADocumentData;
    const value = data[dataKey];

    for (const pdfFieldName of pdfFieldNames) {
      try {
        if (typeof value === "boolean") {
          // Checkbox field
          const checkBox = form.getCheckBox(pdfFieldName);
          if (value) {
            checkBox.check();
          } else {
            checkBox.uncheck();
          }
          result.filledFields++;
        } else if (value != null && value !== "") {
          // Text field — sanitise and fill
          const textField = form.getTextField(pdfFieldName);
          const textValue = String(value);
          textField.setText(textValue);
          try {
            textField.updateAppearances(font);
          } catch {
            // Font update may fail for some field types — continue anyway
          }
          result.filledFields++;
        } else {
          // Empty or undefined value — skip
          result.skippedFields.push(pdfFieldName);
          logMappingIssue(pdfFieldName, `Skipped — empty value for field "${field.id}"`);
        }
      } catch (err) {
        // Field doesn't exist or wrong type — log and skip
        result.skippedFields.push(pdfFieldName);
        const isMissing = !(form as unknown as Record<string, unknown>)[pdfFieldName];
        if (isMissing) {
          logMappingIssue(pdfFieldName, `Not found in PDF template`);
        } else {
          logMappingIssue(pdfFieldName, `Error: ${(err as Error)?.message || "unknown"}`);
          result.errorFields.push(pdfFieldName);
        }
      }
    }
  }

  return result;
}

/**
 * Fallback: generate a clean text-based O&A PDF using jsPDF when the
 * template PDF is not available.
 *
 * This ensures the system never fails — the layout is functional but
 * not identical to the REIWA form.
 */
export function generateOAPdfFallback(data: OADocumentData): Uint8Array {
  const doc = new jsPDF();
  const font = "helvetica";
  const primaryColor = [26, 26, 29] as [number, number, number];
  const goldColor = [184, 147, 58] as [number, number, number];

  let y = 20;
  const leftMargin = 20;
  const contentWidth = 170;

  function addHeading(text: string) {
    doc.setFont(font, "bold");
    doc.setFontSize(14);
    doc.setTextColor(...goldColor);
    doc.text(text, leftMargin, y);
    y += 8;
    doc.setDrawColor(...goldColor);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, y, leftMargin + 60, y);
    y += 6;
  }

  function addField(label: string, value: string | boolean) {
    doc.setFont(font, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...primaryColor);
    doc.text(`${label}:`, leftMargin, y);
    doc.setFont(font, "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const displayValue = typeof value === "boolean" ? (value ? "Yes" : "No") : value || "—";
    doc.text(String(displayValue), leftMargin + 55, y);
    y += 6;
  }

  function addSection() {
    y += 4;
  }

  // Header
  doc.setFont(font, "bold");
  doc.setFontSize(18);
  doc.setTextColor(...primaryColor);
  doc.text("Offer & Acceptance", leftMargin, y);
  y += 6;
  doc.setFont(font, "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Prepared by: ${data.preparedByRep}  |  Date: ${data.preparedDate}`, leftMargin, y);
  y += 10;

  // Buyer Details
  addHeading("Buyer Details");
  addField("Buyer Name", data.buyerName);
  addField("Address", data.buyerAddress);
  addField("Phone", data.buyerPhone);
  addField("Email", data.buyerEmail);
  addSection();

  // Property Details
  addHeading("Property Details");
  addField("Property Address", data.propertyAddress);
  addField("Street", data.propertyStreet);
  addField("Suburb", data.propertySuburb);
  addField("Postcode", data.propertyPostcode);
  addField("Title Reference", data.propertyTitleRef);
  addSection();

  // Financials
  addHeading("Financials");
  addField("Purchase Price", `$${data.purchasePrice}`);
  addField("Deposit", `$${data.depositAmount}`);
  addField("Deposit Paid", data.depositPaidDate);
  addField("Balance", `$${data.balanceAmount}`);
  addField("Finance Clause", `${data.financeClause} days`);
  addField("Settlement", `${data.settlementDays} days`);
  addSection();

  // GST / Compliance
  addHeading("GST & Compliance");
  addField("GST Inclusive", data.gstInclusive);
  addField("Compliance Notes", data.complianceNotes);
  addSection();

  // Additional
  addHeading("Additional Terms");
  addField("Included Chattels", data.includedChattels);
  addField("Special Conditions", data.specialConditions);
  addSection();

  // Footer
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(leftMargin, y, leftMargin + contentWidth, y);
  y += 6;
  doc.setFont(font, "italic");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "This document is generated for illustrative purposes and should be reviewed by a qualified professional.",
    leftMargin,
    y,
  );

  const pdfBytes = doc.output("arraybuffer");
  return new Uint8Array(pdfBytes);
}

/**
 * Main entry point: try template-based fill, fall back to generated PDF.
 * Never throws.
 */
export async function generateOAPdf(data: OADocumentData): Promise<Uint8Array> {
  try {
    return await generateOAPdfFromTemplate(data);
  } catch (err) {
    console.warn(`${LOG_PREFIX} Template fill failed, using fallback:`, err);
    return generateOAPdfFallback(data);
  }
}

/**
 * Trigger browser download of a PDF Uint8Array.
 */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
