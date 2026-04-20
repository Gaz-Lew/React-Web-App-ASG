/**
 * OADocumentEditor.tsx — Offer & Acceptance document editor.
 *
 * PDF-backed architecture:
 *  1. User fills in a React form (pre-filled from client + deal data)
 *  2. Form auto-saves to Firestore as a DocumentInstance
 *  3. "Generate PDF" fills the REIWA O&A PDF template via pdf-lib
 *  4. "Upload to Deal" uploads the generated PDF to Firebase Storage
 *     and registers it as a dealDocument
 *
 * Does NOT recreate PDF layout in React — maintains exact PDF formatting.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  X,
  Save,
  Download,
  Upload,
  FileText,
  Loader,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Send,
  XCircle,
  ExternalLink,
} from "lucide-react";
import type { OADocumentData, Lead, Rep } from "../../types";

// Minimal Deal interface — the full type is defined locally in DealDashboard/DealPipeline
interface OADeal {
  id: string;
  leadId?: string;
  clientName: string;
  dealValue: number;
}
import { generateOAPdf, downloadPdf } from "./oaPdfGenerator";
import { useSaveDocumentInstance, useUploadInstancePdf, useDeleteDocumentInstance } from "./useDocumentInstances";
import { useDealDocuments } from "../../hooks/useFirebase";
import { useDocuSign } from "../../hooks/useDocuSign";
import { DealTimeline } from "../DealTimeline";
import { uploadFile } from "../../lib/storage";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useToast } from "../../context/ToastContext";
import { validateOADocument, groupErrorsBySection, getErrorFieldIds, type ValidationError } from "./oaValidation";
import { OA_SCHEMA } from "./oaFieldSchema";
import { buildInitialOADocument, calculateFinancials, type OaAutofillContext } from "./oaAutofill";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OADocumentEditorProps {
  deal: OADeal;
  lead: Lead | null;
  reps: Rep[];
  currentUser: Rep | null;
  onClose: () => void;
  existingInstanceId?: string;
  initialData?: Partial<OADocumentData>;
}

type SectionKey = "buyer" | "property" | "financials" | "gst" | "additional";

interface SectionState {
  buyer: boolean;
  property: boolean;
  financials: boolean;
  gst: boolean;
  additional: boolean;
}

const SECTION_ORDER: SectionKey[] = ["buyer", "property", "financials", "gst", "additional"];
const SECTION_MAP: Record<SectionKey, string> = {
  buyer: "Buyer Details",
  property: "Property Details",
  financials: "Financials",
  gst: "GST & Compliance",
  additional: "Additional Terms",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function autoFillContext(currentUser: Rep | null, lead: Lead | null, deal: OADeal): OaAutofillContext {
  return {
    client: lead,
    deal,
    user: currentUser,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Input Component
// ─────────────────────────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40 min-h-[40px]";
const LABEL_CLS = "block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1";
const SECTION_BTN_CLS =
  "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function OADocumentEditor({
  deal,
  lead,
  reps,
  currentUser,
  onClose,
  existingInstanceId,
  initialData,
}: OADocumentEditorProps) {
  const { showToast } = useToast();
  const { sendForSigning, resendEnvelope, voidEnvelope, sending: docusignSending } = useDocuSign();
  const [docusignStatus, setDocusignStatus] = useState<"idle" | "sent" | "completed" | "declined" | "voided">("idle");
  const [docusignEnvelopeId, setDocusignEnvelopeId] = useState<string | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showSignedPreview, setShowSignedPreview] = useState(false);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  const [showAlreadySentModal, setShowAlreadySentModal] = useState(false);
  const [envelopeViewUrl, setEnvelopeViewUrl] = useState<string | null>(null);
  const [showSignedBanner, setShowSignedBanner] = useState(false);
  const { save, saving } = useSaveDocumentInstance();
  const { upload, uploading } = useUploadInstancePdf();
  const { remove, deleting } = useDeleteDocumentInstance();
  const { uploadDocument: uploadToDeal } = useDealDocuments(deal.id);

  // Form state — auto-filled from context
  const [formData, setFormData] = useState<OADocumentData>(() => {
    const ctx = autoFillContext(currentUser, lead, deal);
    return buildInitialOADocument(ctx, initialData);
  });

  // UI state
  const [sections, setSections] = useState<SectionState>({
    buyer: true,
    property: true,
    financials: true,
    gst: false,
    additional: false,
  });
  const [savingId, setSavingId] = useState<string | null>(existingInstanceId || null);
  const [status, setStatus] = useState<"draft" | "completed">("draft");
  const [generating, setGenerating] = useState(false);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, ValidationError[]>>({});
  const [validationTriggered, setValidationTriggered] = useState(false);

  // Auto-save debounced
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const id = await save(
          deal.id,
          lead?.id ? String(lead.id) : "",
          lead?.name || deal.clientName,
          formDataRef.current,
          savingId || undefined,
        );
        if (!savingId) setSavingId(id);
      } catch {
        // Silent — auto-save is best-effort
      }
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [formData, deal.id, lead, savingId, save]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof OADocumentData>(key: K, value: OADocumentData[K]) => {
    setFormData((prev: OADocumentData) => ({ ...prev, [key]: value }));
  }, []);

  const toggleSection = useCallback((key: SectionKey) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const runValidation = useCallback((): boolean => {
    const result = validateOADocument(formData, OA_SCHEMA);
    setValidationErrors(groupErrorsBySection(result.errors));
    setValidationTriggered(true);
    if (!result.valid) {
      showToast(`❌ ${result.errors.length} required field(s) missing`, "error");
      const firstErrorSection = result.errors[0]?.section;
      if (firstErrorSection) {
        const sectionKey = Object.entries(SECTION_MAP).find(([, label]) => label === firstErrorSection)?.[0] as
          | SectionKey
          | undefined;
        if (sectionKey) setSections((prev) => ({ ...prev, [sectionKey]: true }));
      }
    }
    return result.valid;
  }, [formData, showToast]);

  const handleSave = useCallback(async () => {
    try {
      const id = await save(
        deal.id,
        lead?.id ? String(lead.id) : "",
        lead?.name || deal.clientName,
        formData,
        savingId || undefined,
      );
      if (!savingId) setSavingId(id);
      showToast("✅ Document saved", "success");
    } catch {
      showToast("❌ Failed to save document", "error");
    }
  }, [save, deal.id, lead, formData, savingId, showToast]);

  const handleGeneratePdf = useCallback(async () => {
    if (!runValidation()) return;

    setGenerating(true);
    try {
      const pdfBytes = await generateOAPdf(formData);
      const filename = `OA_${formData.buyerName.replace(/\s+/g, "_") || "document"}_${new Date().toISOString().split("T")[0]}.pdf`;
      downloadPdf(pdfBytes, filename);
      showToast("✅ PDF generated and downloaded", "success");
    } catch {
      showToast("❌ Failed to generate PDF", "error");
    } finally {
      setGenerating(false);
    }
  }, [formData, showToast]);

  const handleUploadToDeal = useCallback(async () => {
    setGenerating(true);
    try {
      // Generate PDF
      const pdfBytes = await generateOAPdf(formData);

      // Upload to document instance
      let pdfUrl = "";
      let pdfStoragePath = "";
      if (savingId) {
        const result = await upload(savingId, deal.id, pdfBytes, "oa.pdf");
        pdfUrl = result.pdfUrl;
        pdfStoragePath = result.pdfStoragePath;
      }

      // Upload to deal documents
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const sanitised = `OA_${formData.buyerName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document"}.pdf`;
      const storagePath = `deals/${deal.id}/${Date.now()}_${sanitised}`;
      const downloadUrl = await uploadFile(storagePath, pdfBlob);

      // Register as a dealDocument
      await addDoc(collection(db, "dealDocuments"), {
        dealId: deal.id,
        clientId: lead?.id ? String(lead.id) : "",
        name: `O&A - ${formData.buyerName || deal.clientName}`,
        type: "oa" as const,
        fileUrl: downloadUrl,
        storagePath,
        fileType: "application/pdf",
        fileSize: pdfBytes.byteLength,
        uploadedBy: currentUser?.name || "Unknown",
        createdAt: Date.now(),
      });

      // Mark instance as completed
      if (savingId) {
        await upload(savingId, deal.id, pdfBytes, "oa.pdf");
        setStatus("completed");
      }

      showToast("✅ PDF uploaded to deal", "success");
    } catch (err) {
      console.error("[OADocumentEditor] Upload to deal failed:", err);
      showToast("❌ Failed to upload to deal", "error");
    } finally {
      setGenerating(false);
    }
  }, [formData, deal, lead, currentUser, savingId, upload, showToast]);

  const handleSendForSigning = useCallback(async () => {
    if (!runValidation()) return;

    setGenerating(true);
    try {
      const pdfBytes = await generateOAPdf(formData);
      const sanitised = `OA_${formData.buyerName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document"}.pdf`;
      const storagePath = `deals/${deal.id}/${Date.now()}_${sanitised}`;
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadUrl = await uploadFile(storagePath, pdfBlob);

      const result = await sendForSigning({
        documentUrl: downloadUrl,
        clientName: formData.buyerName || deal.clientName,
        clientEmail: formData.buyerEmail || "",
        dealId: deal.id,
        clientId: lead?.id ? String(lead.id) : "",
        documentName: `O&A - ${formData.buyerName || deal.clientName}`,
        oaDocumentInstanceId: savingId || undefined,
      });

      if (result.success) {
        setDocusignStatus("sent");
        setDocusignEnvelopeId(result.envelopeId);
        showToast("✅ Document sent for signing via DocuSign", "success");
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message || "";
      // Backend returned "already-exists" — document was already sent
      if (msg.includes("already been sent") || (err as { code?: string })?.code === "already-exists") {
        setShowAlreadySentModal(true);
      } else {
        console.error("[OADocumentEditor] Send for signing failed:", err);
        showToast("❌ Failed to send document for signing", "error");
      }
    } finally {
      setGenerating(false);
    }
  }, [formData, deal, lead, savingId, sendForSigning, showToast, runValidation]);

  const handleResend = useCallback(async () => {
    if (!docusignEnvelopeId) return;
    try {
      const result = await resendEnvelope(docusignEnvelopeId);
      if (result.success) {
        setDocusignStatus("sent");
        showToast("✅ Document resent successfully", "success");
      }
    } catch {
      showToast("❌ Failed to resend", "error");
    }
  }, [docusignEnvelopeId, resendEnvelope, showToast]);

  const handleViewInDocuSign = useCallback(() => {
    if (envelopeViewUrl) {
      window.open(envelopeViewUrl, "_blank", "noopener,noreferrer");
    }
  }, [envelopeViewUrl]);

  const handleVoid = useCallback(async () => {
    if (!docusignEnvelopeId) return;
    try {
      const result = await voidEnvelope(docusignEnvelopeId, voidReason || "Voided by sender");
      if (result.success) {
        setDocusignStatus("voided");
        setShowVoidModal(false);
        setVoidReason("");
        showToast("🗑️ Envelope voided", "success");
      }
    } catch {
      showToast("❌ Failed to void envelope", "error");
    }
  }, [docusignEnvelopeId, voidReason, voidEnvelope, showToast]);

  const handleDelete = useCallback(async () => {
    if (!savingId) {
      onClose();
      return;
    }
    if (!confirm("Delete this document instance?")) return;
    try {
      // We can't call remove here because it's typed for DocumentInstance
      // Just close — the instance will remain as draft
      showToast("🗑️ Editor closed", "success");
      onClose();
    } catch {
      showToast("❌ Failed to delete", "error");
    }
  }, [savingId, onClose, showToast]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9100] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-0 z-[9101] flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[#b8933a]" />
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Offer & Acceptance</h2>
                <p className="text-[10px] text-gray-400">
                  {deal.clientName} · {status === "draft" ? "Draft" : "Completed"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#b8933a] text-white hover:bg-[#d4aa55] disabled:opacity-50 transition min-h-[36px]"
              >
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {/* Buyer Details */}
            <CollapsibleSection
              title="Buyer Details"
              open={sections.buyer}
              onToggle={() => toggleSection("buyer")}
              errors={validationTriggered ? validationErrors["Buyer Details"] : undefined}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Buyer Name</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.buyerName}
                    onChange={(e) => updateField("buyerName", e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Phone</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.buyerPhone}
                    onChange={(e) => updateField("buyerPhone", e.target.value)}
                    placeholder="04XX XXX XXX"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Address</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.buyerAddress}
                    onChange={(e) => updateField("buyerAddress", e.target.value)}
                    placeholder="Street address"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Email</label>
                  <input
                    className={INPUT_CLS}
                    type="email"
                    value={formData.buyerEmail}
                    onChange={(e) => updateField("buyerEmail", e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Property Details */}
            <CollapsibleSection
              title="Property Details"
              open={sections.property}
              onToggle={() => toggleSection("property")}
              errors={validationTriggered ? validationErrors["Property Details"] : undefined}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Property Address</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.propertyAddress}
                    onChange={(e) => updateField("propertyAddress", e.target.value)}
                    placeholder="Full address"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Street</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.propertyStreet}
                    onChange={(e) => updateField("propertyStreet", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Suburb</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.propertySuburb}
                    onChange={(e) => updateField("propertySuburb", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Postcode</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.propertyPostcode}
                    onChange={(e) => updateField("propertyPostcode", e.target.value)}
                    placeholder="6000"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Title Reference</label>
                  <input
                    className={INPUT_CLS}
                    value={formData.propertyTitleRef}
                    onChange={(e) => updateField("propertyTitleRef", e.target.value)}
                    placeholder="Volume/Folio"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Financials */}
            <CollapsibleSection
              title="Financials"
              open={sections.financials}
              onToggle={() => toggleSection("financials")}
              errors={validationTriggered ? validationErrors["Financials"] : undefined}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Purchase Price ($)</label>
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={formData.purchasePrice}
                    onChange={(e) => updateField("purchasePrice", e.target.value)}
                    placeholder="500000"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Deposit ($)</label>
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={formData.depositAmount}
                    onChange={(e) => updateField("depositAmount", e.target.value)}
                    placeholder="25000"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Deposit Paid Date</label>
                  <input
                    className={INPUT_CLS}
                    type="date"
                    value={formData.depositPaidDate}
                    onChange={(e) => updateField("depositPaidDate", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Balance ($)</label>
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={formData.balanceAmount}
                    onChange={(e) => updateField("balanceAmount", e.target.value)}
                    placeholder="475000"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Finance Clause (days)</label>
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={formData.financeClause}
                    onChange={(e) => updateField("financeClause", e.target.value)}
                    placeholder="14"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Settlement (days)</label>
                  <input
                    className={INPUT_CLS}
                    type="number"
                    value={formData.settlementDays}
                    onChange={(e) => updateField("settlementDays", e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* GST & Compliance */}
            <CollapsibleSection
              title="GST & Compliance"
              open={sections.gst}
              onToggle={() => toggleSection("gst")}
              errors={validationTriggered ? validationErrors["GST & Compliance"] : undefined}
            >
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.gstInclusive}
                    onChange={(e) => updateField("gstInclusive", e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#b8933a] focus:ring-[#b8933a]/40"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">GST Inclusive</span>
                </label>
                <div>
                  <label className={LABEL_CLS}>Compliance Notes</label>
                  <textarea
                    className={INPUT_CLS + " resize-none"}
                    rows={3}
                    value={formData.complianceNotes}
                    onChange={(e) => updateField("complianceNotes", e.target.value)}
                    placeholder="Any compliance notes or conditions..."
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Additional */}
            <CollapsibleSection
              title="Additional Terms"
              open={sections.additional}
              onToggle={() => toggleSection("additional")}
              errors={validationTriggered ? validationErrors["Additional Terms"] : undefined}
            >
              <div className="space-y-3">
                <div>
                  <label className={LABEL_CLS}>Included Chattels</label>
                  <textarea
                    className={INPUT_CLS + " resize-none"}
                    rows={2}
                    value={formData.includedChattels}
                    onChange={(e) => updateField("includedChattels", e.target.value)}
                    placeholder="Dishwasher, blinds, curtains..."
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Special Conditions</label>
                  <textarea
                    className={INPUT_CLS + " resize-none"}
                    rows={3}
                    value={formData.specialConditions}
                    onChange={(e) => updateField("specialConditions", e.target.value)}
                    placeholder="Any special conditions..."
                  />
                </div>
              </div>
            </CollapsibleSection>
          </div>

          {/* Signed document banner */}
          {showSignedBanner && (
            <div className="px-5 py-2 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
              <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300 flex-1">Document signed successfully</p>
              <button
                onClick={() => setShowSignedBanner(false)}
                className="text-emerald-400 hover:text-emerald-600 transition"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-wrap items-stretch gap-2 px-5 py-3 border-t border-gray-200 dark:border-white/[0.06] sm:flex-row flex-col md:flex-row">
            {/* Status badge */}
            {docusignStatus !== "idle" && (
              <span
                className={`px-2 py-1 rounded-full text-[10px] font-semibold self-center ${
                  docusignStatus === "sent"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : docusignStatus === "completed"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : docusignStatus === "declined"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {docusignStatus === "sent"
                  ? "⏳ Waiting for signature…"
                  : docusignStatus === "completed"
                    ? "✅ Signed"
                    : docusignStatus === "declined"
                      ? "❌ Declined"
                      : "🚫 Voided"}
              </span>
            )}
            <button
              onClick={handleGeneratePdf}
              disabled={generating}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#b8933a] text-white hover:bg-[#d4aa55] disabled:opacity-50 transition min-h-[40px] flex-1 sm:flex-none md:flex-none"
            >
              {generating ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
              Generate PDF
            </button>
            {docusignStatus === "idle" ? (
              <button
                onClick={handleSendForSigning}
                disabled={generating}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition min-h-[40px] w-full sm:w-auto md:w-auto sm:flex-1 md:flex-1"
              >
                {generating ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
                Send to DocuSign
              </button>
            ) : docusignStatus === "sent" ? (
              <>
                <button
                  onClick={handleResend}
                  disabled={docusignSending}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition min-h-[40px] flex-1 sm:flex-none md:flex-none"
                >
                  {docusignSending ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
                  Resend
                </button>
                {envelopeViewUrl && (
                  <button
                    onClick={handleViewInDocuSign}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-blue-300 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition min-h-[40px] flex-1 sm:flex-none md:flex-none"
                  >
                    <ExternalLink size={13} /> View in DocuSign
                  </button>
                )}
                <button
                  onClick={() => setShowVoidModal(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition min-h-[40px] flex-1 sm:flex-none md:flex-none"
                >
                  <XCircle size={13} /> Void
                </button>
              </>
            ) : null}
            <button
              onClick={handleUploadToDeal}
              disabled={generating || uploading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#b8933a] text-[#b8933a] hover:bg-[#b8933a]/10 disabled:opacity-50 transition min-h-[40px] flex-1 sm:flex-none md:flex-none"
            >
              {generating || uploading ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
              Upload to Deal
            </button>
            <div className="flex-1" />
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition min-h-[40px]"
            >
              <X size={13} /> Close
            </button>
          </div>

          {/* Void confirmation modal */}
          {showVoidModal && (
            <>
              <div className="fixed inset-0 bg-black/50 z-[9200]" onClick={() => setShowVoidModal(false)} />
              <div className="fixed inset-0 z-[9201] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl max-w-sm w-full p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <XCircle size={18} className="text-red-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Void Envelope</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">This cannot be undone.</p>
                    </div>
                  </div>
                  <textarea
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Reason for voiding (optional)"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none mb-4"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowVoidModal(false);
                        setVoidReason("");
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleVoid}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition"
                    >
                      Void Envelope
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Already sent confirmation modal */}
          {showAlreadySentModal && (
            <>
              <div className="fixed inset-0 bg-black/50 z-[9400]" onClick={() => setShowAlreadySentModal(false)} />
              <div className="fixed inset-0 z-[9401] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl max-w-sm w-full p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <AlertCircle size={18} className="text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Already Sent</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        This document has already been sent for signing.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
                    Would you like to resend the envelope instead?
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowAlreadySentModal(false)}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setShowAlreadySentModal(false);
                        if (docusignEnvelopeId) handleResend();
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
                    >
                      Resend
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Signed document preview modal (auto-opens on completion) */}
          {showSignedPreview && signedPreviewUrl && (
            <>
              <div className="fixed inset-0 bg-black/60 z-[9300]" onClick={() => setShowSignedPreview(false)} />
              <div className="fixed inset-4 sm:inset-8 z-[9301] bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Signed Document</h3>
                  </div>
                  <button
                    onClick={() => setShowSignedPreview(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <iframe src={signedPreviewUrl} className="w-full h-full border-0" title="Signed document" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible Section
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
  errors,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  errors?: ValidationError[];
}) {
  const hasErrors = errors && errors.length > 0;
  return (
    <div className="border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
      <button onClick={onToggle} className={SECTION_BTN_CLS}>
        <span className="flex items-center gap-1.5">
          {title}
          {hasErrors && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-red-500">
              <AlertCircle size={10} />
              {errors!.length}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {children}
          {hasErrors && (
            <div className="mt-2 space-y-1">
              {errors!.map((err, i) => (
                <p key={i} className="text-[10px] text-red-500 flex items-start gap-1">
                  <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
                  {err.fieldLabel}: {err.message.toLowerCase().replace(`${err.fieldLabel.toLowerCase()} `, "")}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OADocumentEditor;
