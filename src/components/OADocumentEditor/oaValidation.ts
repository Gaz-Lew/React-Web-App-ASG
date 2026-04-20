/**
 * oaValidation.ts — Validation utilities for the O&A document system.
 *
 * Provides:
 *  - validatePdfMapping(pdfDoc, schema) — checks PDF template fields exist and are correct type
 *  - validateOADocument(data) — validates form data with conditional logic
 *  - Structured error objects with section, field, and message
 */

import { PDFDocument } from "pdf-lib";
import type { OADocumentData } from "../../types";
import type { OaSchema } from "./oaFieldSchema";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationError {
  section: string;
  field: string;
  fieldLabel: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface PdfValidationResult {
  valid: boolean;
  missingFields: string[];
  typeMismatches: { field: string; expected: string; actual: string }[];
  totalFields: number;
  matchedFields: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that all mapped PDF form fields exist in the template and are
 * the correct type (text field vs checkbox).
 *
 * Never throws — returns a structured result.
 */
export async function validatePdfMapping(pdfBytes: ArrayBuffer, schema: OaSchema): Promise<PdfValidationResult> {
  const result: PdfValidationResult = {
    valid: true,
    missingFields: [],
    typeMismatches: [],
    totalFields: 0,
    matchedFields: 0,
  };

  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (!field.pdfFieldNames || field.pdfFieldNames.length === 0) continue;

        for (const pdfFieldName of field.pdfFieldNames) {
          result.totalFields++;

          try {
            const pdfField = form.getField(pdfFieldName);
            if (!pdfField) {
              result.missingFields.push(pdfFieldName);
              result.valid = false;
              continue;
            }

            // Type check
            const fieldType = pdfField.constructor.name;
            if (field.type === "boolean" && fieldType !== "PDFCheckBox") {
              result.typeMismatches.push({
                field: pdfFieldName,
                expected: "checkbox",
                actual: fieldType.toLowerCase().replace("pdf", ""),
              });
              result.valid = false;
            } else if (field.type !== "boolean" && fieldType === "PDFCheckBox") {
              result.typeMismatches.push({
                field: pdfFieldName,
                expected: "text",
                actual: "checkbox",
              });
              result.valid = false;
            } else {
              result.matchedFields++;
            }
          } catch {
            result.missingFields.push(pdfFieldName);
            result.valid = false;
          }
        }
      }
    }
  } catch (err) {
    console.error("[PDF Validation] Failed to parse PDF:", err);
    result.valid = false;
  }

  return result;
}

/**
 * Fetches and validates the PDF template against the schema.
 * Returns the validation result without throwing.
 */
export async function validatePdfTemplate(
  schema: OaSchema,
  templatePath = "/templates/oa.pdf",
): Promise<PdfValidationResult> {
  const fallback: PdfValidationResult = {
    valid: false,
    missingFields: [],
    typeMismatches: [],
    totalFields: 0,
    matchedFields: 0,
  };

  try {
    const response = await fetch(templatePath);
    if (!response.ok) {
      console.warn(`[PDF Validation] Template not found: ${response.status}`);
      return fallback;
    }
    const pdfBytes = await response.arrayBuffer();
    return validatePdfMapping(pdfBytes, schema);
  } catch (err) {
    console.error("[PDF Validation] Fetch failed:", err);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Data Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates OADocumentData against required fields and conditional rules.
 *
 * Returns structured errors grouped by section and field.
 * Never throws.
 */
export function validateOADocument(data: OADocumentData, schema: OaSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (!field.required) continue;

      const value = data[field.id as keyof OADocumentData];

      // Evaluate condition
      if (field.condition && !evaluateCondition(field.condition, data)) {
        continue; // Field not required under current conditions
      }

      // Check required value
      if (isFieldEmpty(value, field.type)) {
        errors.push({
          section: section.name,
          field: field.id,
          fieldLabel: field.label,
          message: `${field.label} is required`,
          severity: "error",
        });
      } else if (!validateFieldType(value, field.type)) {
        errors.push({
          section: section.name,
          field: field.id,
          fieldLabel: field.label,
          message: `${field.label} has invalid format`,
          severity: "error",
        });
      }
    }

    // ── Conditional field validation ────────────────────────────────────

    // Finance clause: if financeRequired is true, financeClause must be set
    if ((data as unknown as Record<string, unknown>).financeRequired === true) {
      if (!data.financeClause || data.financeClause.trim() === "") {
        errors.push({
          section: section.name,
          field: "financeClause",
          fieldLabel: "Finance Approval Period",
          message: "Finance clause days must be specified when finance is required",
          severity: "error",
        });
      }
    }

    // Multi-buyer: check second buyer name for joint buyers
    if (
      (data as unknown as Record<string, unknown>).buyerName1 &&
      (data as unknown as Record<string, unknown>).buyerType === "Joint (Multiple)"
    ) {
      // buyerName2 is implicitly required for joint buyers
      if (!data.buyerName) {
        warnings.push({
          section: section.name,
          field: "buyerName",
          fieldLabel: "First Buyer Name",
          message: "Ensure all buyer names are filled for joint purchase",
          severity: "warning",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Evaluates a condition expression against the current data.
 * Supports simple expressions like:
 *  - "buyerType === 'Individual'"
 *  - "financeRequired === true"
 *  - "depositSplit === true"
 *  - "propertyTenure === 'Strata'"
 */
function evaluateCondition(condition: string, data: OADocumentData): boolean {
  try {
    // Build a safe evaluation context
    const dataRecord = data as unknown as Record<string, unknown>;

    // Simple equality checks — no eval() needed
    const match = condition.match(/^(\w+)\s*===\s*(.+)$/);
    if (match) {
      const [, key, rawValue] = match;
      const expectedValue = parseConditionValue(rawValue.trim());
      return dataRecord[key] === expectedValue;
    }

    return true; // If we can't parse, assume visible
  } catch {
    return true; // If parsing fails, show the field
  }
}

/** Parse a condition value like "'Individual'" or "true" or "14" */
function parseConditionValue(raw: string): unknown {
  // String literal
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Number
  if (!isNaN(Number(raw))) return Number(raw);
  return raw;
}

/** Check if a field value is empty */
function isFieldEmpty(value: unknown, type: string): boolean {
  if (type === "boolean") return false; // Booleans are never "empty"
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return false;
  return false;
}

/** Validate field value matches expected type format */
function validateFieldType(value: unknown, type: string): boolean {
  if (value == null) return true;

  switch (type) {
    case "number":
      return !isNaN(Number(value)) && Number(value) >= 0;
    case "date":
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const d = new Date(value + "T00:00:00");
        return !isNaN(d.getTime());
      }
      return true; // Allow non-ISO dates for flexibility
    case "text":
    case "textarea":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    default:
      return true;
  }
}

/**
 * Get errors grouped by section for UI display.
 */
export function groupErrorsBySection(errors: ValidationError[]): Record<string, ValidationError[]> {
  const grouped: Record<string, ValidationError[]> = {};
  for (const err of errors) {
    if (!grouped[err.section]) grouped[err.section] = [];
    grouped[err.section].push(err);
  }
  return grouped;
}

/**
 * Get a flat list of field IDs that have errors.
 */
export function getErrorFieldIds(errors: ValidationError[]): Set<string> {
  return new Set(errors.map((e) => e.field));
}
