/**
 * Commissions / Comms Calculator
 *
 * - Settlement tracking (Perth / Brisbane)
 * - Client 1 + Client 2, current address, sold property address
 * - Optional settlement-date reminder
 * - Rep allocations with paid / unpaid tracking
 * - Push-to-Invoice: generates a downloadable PDF tax invoice
 */

import React, { useState, useMemo, useCallback } from "react";
import { jsPDF } from "jspdf";
import { CommissionEntry, Rep, InvoiceDraft } from "../types";
import { useAppStore } from "../stores/appStore";
import {
  useCommissions,
  useSaveCommission,
  useDeleteCommission,
  useInvoiceDrafts,
  useSaveInvoiceDraft,
  useDeleteInvoiceDraft,
} from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import {
  DollarSign,
  Plus,
  Trash2,
  X,
  Check,
  FileText,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Bell,
  BellOff,
  Save,
  FolderOpen,
} from "lucide-react";
import { formatCurrency } from "../lib/utils";

type Entity = "Perth" | "Brisbane";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function genId() {
  return `comm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function fmtDate(iso: string) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ── Company details lookup for invoice header ─────────────────────────────────
const COMPANY_DETAILS: Record<string, { name: string; address: string[]; abn: string }> = {
  ASG: {
    name: "Amplify Solutions Group",
    address: ["Unit 14C, 1/1 The Esplanade", "Mount Pleasant", "Perth  WA 6153"],
    abn: "43 663 126 725",
  },
  SJS: {
    name: "SJS Solutions Corp",
    address: ["PO Box 3330", "Success", "Perth  WA 6964"],
    abn: "89 622 469 845",
  },
};

// ── Invoice PDF generator ─────────────────────────────────────────────────────
function generateInvoicePDF(opts: {
  invoiceTo: string; // "ASG", "SJS", or rep name
  invoiceDate: string;
  amount: number;
  clientName: string;
  clientAddress: string;
  settlementAddress: string;
  repName: string;
  repAbn?: string;
  repBsb?: string;
  repAccount?: string;
  entity: Entity;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = 210;
  const margin = 20;
  const col2 = 120;

  // Resolve company details (ASG / SJS), fall back to plain name for rep invoices
  const company = COMPANY_DETAILS[opts.invoiceTo];

  // Header bar — taller to accommodate company address
  const headerH = 42;
  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setTextColor(255, 255, 255);

  // Left: "TAX INVOICE"
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", margin, 17);

  // Right: company name + address
  if (company) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(company.name, pageW - margin, 13, { align: "right" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    company.address.forEach((line, i) => {
      doc.text(line, pageW - margin, 20 + i * 5.5, { align: "right" });
    });
  } else {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(opts.invoiceTo, pageW - margin, 17, { align: "right" });
  }

  // Invoice meta
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  let y = headerH + 8;

  // Left: From (rep)
  doc.setFont("helvetica", "bold");
  doc.text("FROM", margin, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text(opts.repName, margin, y);
  y += 5;
  if (opts.repAbn) {
    doc.text(`ABN: ${opts.repAbn}`, margin, y);
    y += 5;
  }
  if (opts.repBsb) {
    doc.text(`BSB: ${opts.repBsb}`, margin, y);
    y += 5;
  }
  if (opts.repAccount) {
    doc.text(`Account: ${opts.repAccount}`, margin, y);
    y += 5;
  }

  // Right: Invoice details + INVOICE TO
  let ry = headerH + 8;
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE TO", col2, ry);
  doc.setFont("helvetica", "normal");
  ry += 5;
  if (company) {
    doc.text(company.name, col2, ry);
    ry += 5;
    doc.text(`ABN: ${company.abn}`, col2, ry);
    ry += 8;
  } else {
    doc.text(opts.invoiceTo, col2, ry);
    ry += 8;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Invoice Date:", col2, ry);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(opts.invoiceDate), col2 + 28, ry);
  ry += 6;

  // Divider
  y = Math.max(y, ry) + 6;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Client details section
  doc.setFont("helvetica", "bold");
  doc.text("CLIENT DETAILS", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(`Client Name: ${opts.clientName}`, margin, y);
  y += 5;
  doc.text(`Current Address: ${opts.clientAddress}`, margin, y);
  y += 5;
  doc.text(`Property Settled: ${opts.settlementAddress}`, margin, y);
  y += 10;

  // Line items table header
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, y, pageW - margin * 2, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Description", margin + 2, y + 5.5);
  doc.text("Amount (inc. GST)", pageW - margin - 2, y + 5.5, { align: "right" });
  y += 8;

  // Line item
  doc.setTextColor(50, 50, 50);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(220, 220, 220);
  doc.rect(margin, y, pageW - margin * 2, 14);
  doc.text(`Commission — Property Settlement`, margin + 2, y + 5.5);
  doc.text(`Client: ${opts.clientName}`, margin + 2, y + 10.5);
  doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(opts.amount), pageW - margin - 2, y + 8, { align: "right" });
  y += 14;

  // Total row
  doc.setFillColor(30, 30, 30);
  doc.rect(margin, y, pageW - margin * 2, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", margin + 2, y + 6.5);
  doc.text(formatCurrency(opts.amount), pageW - margin - 2, y + 6.5, { align: "right" });
  y += 18;

  // Payment details
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT DETAILS", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (opts.repBsb) {
    doc.text(`BSB: ${opts.repBsb}`, margin, y);
    y += 5;
  }
  if (opts.repAccount) {
    doc.text(`Account Number: ${opts.repAccount}`, margin, y);
    y += 5;
  }
  doc.text(`Account Name: ${opts.repName}`, margin, y);
  y += 5;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated by ASG Live Leads · ${new Date().toLocaleDateString("en-AU")}`, pageW / 2, 285, {
    align: "center",
  });

  const filename = `Invoice_${opts.repName.replace(/\s+/g, "_")}_${opts.invoiceDate}.pdf`;
  doc.save(filename);
}

// ── Push to Invoice modal ─────────────────────────────────────────────────────
function InvoiceModal({ entries, onClose }: { entries: CommissionEntry[]; onClose: () => void }) {
  const { reps, currentUser } = useAppStore();
  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);
  const { drafts } = useInvoiceDrafts();
  const { save: saveDraft } = useSaveInvoiceDraft();
  const { remove: removeDraft } = useDeleteInvoiceDraft();
  const { showToast } = useToast();

  const INVOICE_TO_FIXED: Array<{ value: string; label: string }> = [
    { value: "ASG", label: "Amplify Solutions Group (ASG)" },
    { value: "SJS", label: "SJS Solutions Corp" },
  ];

  const [invoiceToType, setInvoiceToType] = useState<"fixed" | "rep">("fixed");
  const [invoiceToFixed, setInvoiceToFixed] = useState("ASG");
  const [invoiceToRepId, setInvoiceToRepId] = useState<number | "">(activeReps[0]?.id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [linkedSettlement, setLinkedSettlement] = useState<string>("");
  const [repId, setRepId] = useState<number | "">(activeReps[0]?.id ?? "");
  const [error, setError] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [showDrafts, setShowDrafts] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Auto-fill from linked settlement
  const handleLinkSettlement = (id: string) => {
    setLinkedSettlement(id);
    if (!id) return;
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setClientName(entry.client1 ?? entry.client ?? "");
    setClientAddress(entry.currentAddress ?? entry.address ?? "");
    if (!draftLabel) setDraftLabel(`${entry.client1 ?? entry.client ?? ""} — ${fmtDate(entry.settlementDate)}`);
  };

  // Load a saved draft
  const loadDraft = (draft: InvoiceDraft) => {
    setInvoiceToType(draft.invoiceToType);
    setInvoiceToFixed(draft.invoiceToFixed);
    setInvoiceToRepId(draft.invoiceToRepId);
    setInvoiceDate(draft.invoiceDate);
    setAmount(draft.amount);
    setClientName(draft.clientName);
    setClientAddress(draft.clientAddress);
    setLinkedSettlement(draft.linkedSettlement);
    setRepId(draft.repId);
    setDraftLabel(draft.label ?? "");
    setShowDrafts(false);
    showToast("✅ Draft loaded", "success");
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    const draft: InvoiceDraft = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      invoiceToType,
      invoiceToFixed,
      invoiceToRepId,
      invoiceDate,
      amount,
      clientName,
      clientAddress,
      linkedSettlement,
      repId,
      label: draftLabel.trim() || clientName.trim() || "Untitled Invoice",
      createdAt: Date.now(),
      createdBy: currentUser?.name ?? "Unknown",
    };
    const ok = await saveDraft(draft);
    setSavingDraft(false);
    if (ok) showToast("✅ Invoice saved as draft", "success");
    else showToast("Failed to save draft", "error");
  };

  const selectedRep: Rep | undefined = reps.find((r) => r.id === Number(repId));
  // For company invoices use the key ('ASG'/'SJS') so generateInvoicePDF can look up full details
  // For rep invoices use the rep name directly
  const invoiceToLabel =
    invoiceToType === "fixed"
      ? invoiceToFixed // key like 'ASG' or 'SJS' — PDF generator does the lookup
      : (reps.find((r) => r.id === Number(invoiceToRepId))?.name ?? "");
  const linkedEntry = entries.find((e) => e.id === linkedSettlement);

  const handleGenerate = () => {
    if (!clientName.trim()) {
      setError("Client name is required");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Amount is required");
      return;
    }
    if (!repId) {
      setError("Select the rep issuing the invoice");
      return;
    }
    if (!invoiceDate) {
      setError("Invoice date is required");
      return;
    }

    generateInvoicePDF({
      invoiceTo: invoiceToLabel,
      invoiceDate,
      amount: parseFloat(amount),
      clientName: clientName.trim(),
      clientAddress: clientAddress.trim(),
      settlementAddress: linkedEntry?.soldAddress ?? linkedEntry?.address ?? "",
      repName: selectedRep?.name ?? "",
      repAbn: selectedRep?.abn,
      repBsb: selectedRep?.bsb,
      repAccount: selectedRep?.accountNumber,
      entity: linkedEntry?.entity ?? "Perth",
    });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-amber-500" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Generate Invoice PDF</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Load drafts button */}
              <button
                onClick={() => setShowDrafts((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
              >
                <FolderOpen size={13} /> Drafts {drafts.length > 0 && `(${drafts.length})`}
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition text-gray-500"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Drafts panel */}
          {showDrafts && (
            <div className="border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)] px-6 py-3 max-h-48 overflow-y-auto">
              {drafts.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No saved drafts yet</p>
              ) : (
                <div className="space-y-1">
                  {drafts.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 py-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {d.label || d.clientName || "Untitled"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {fmtDate(d.invoiceDate)} · {d.amount ? `$${d.amount}` : "—"} · by {d.createdBy}
                        </p>
                      </div>
                      <button
                        onClick={() => loadDraft(d)}
                        className="px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => removeDraft(d.id)}
                        className="p-1 text-gray-300 dark:text-slate-600 hover:text-red-500 transition rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Draft label */}
            <Field label="Invoice Label (for saving as draft)">
              <input
                className={inp}
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="e.g. Smith Settlement — Apr 2026"
              />
            </Field>

            {/* Who is being invoiced */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Invoicing</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setInvoiceToType("fixed")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${invoiceToType === "fixed" ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"}`}
                >
                  Company
                </button>
                <button
                  onClick={() => setInvoiceToType("rep")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${invoiceToType === "rep" ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"}`}
                >
                  Rep
                </button>
              </div>
              {invoiceToType === "fixed" ? (
                <select className={inp} value={invoiceToFixed} onChange={(e) => setInvoiceToFixed(e.target.value)}>
                  {INVOICE_TO_FIXED.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className={inp}
                  value={invoiceToRepId}
                  onChange={(e) => setInvoiceToRepId(Number(e.target.value))}
                >
                  {activeReps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice Date *">
                <input
                  type="date"
                  className={inp}
                  value={invoiceDate}
                  onChange={(e) => {
                    setInvoiceDate(e.target.value);
                    setError("");
                  }}
                />
              </Field>
              <Field label="Amount ($) *">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inp}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError("");
                  }}
                  placeholder="0.00"
                />
              </Field>
            </div>

            <Field label="Link to Settlement (optional)">
              <select
                className={inp}
                value={linkedSettlement}
                onChange={(e) => {
                  handleLinkSettlement(e.target.value);
                  setError("");
                }}
              >
                <option value="">— Not linked —</option>
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.client1 ?? e.client} · {e.soldAddress ?? e.address} · {fmtDate(e.settlementDate)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Client Name *">
              <input
                className={inp}
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  setError("");
                }}
                placeholder="John Smith"
              />
            </Field>

            <Field label="Client Current Address">
              <input
                className={inp}
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="123 Current St, Suburb"
              />
            </Field>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Rep Issuing Invoice *
              </label>
              <select
                className={inp}
                value={repId}
                onChange={(e) => {
                  setRepId(Number(e.target.value));
                  setError("");
                }}
              >
                <option value="">— Select rep —</option>
                {activeReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {selectedRep && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-[var(--surface)] rounded-lg text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                  {selectedRep.abn ? (
                    <p>ABN: {selectedRep.abn}</p>
                  ) : (
                    <p className="text-amber-500">⚠️ ABN not set — update in Admin</p>
                  )}
                  {selectedRep.bsb ? (
                    <p>BSB: {selectedRep.bsb}</p>
                  ) : (
                    <p className="text-amber-500">⚠️ BSB not set — update in Admin</p>
                  )}
                  {selectedRep.accountNumber ? (
                    <p>Account: {selectedRep.accountNumber}</p>
                  ) : (
                    <p className="text-amber-500">⚠️ Account not set — update in Admin</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] disabled:opacity-50 transition"
            >
              <Save size={14} /> {savingDraft ? "Saving…" : "Save for Later"}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition text-sm"
              >
                <FileText size={14} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── New settlement modal ──────────────────────────────────────────────────────
function NewCommissionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (entry: CommissionEntry) => Promise<void>;
}) {
  const { reps, currentUser } = useAppStore();
  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);

  const [client1, setClient1] = useState("");
  const [client2, setClient2] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [soldAddress, setSoldAddress] = useState("");
  const [settlementDate, setSettlementDate] = useState("");
  const [total, setTotal] = useState("");
  const [entity, setEntity] = useState<Entity>("Perth");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [notes, setNotes] = useState("");
  // Fixed DQ / FC / FR rep rows
  const [dqRepId, setDqRepId] = useState<number | "">("");
  const [dqAmount, setDqAmount] = useState("");
  const [fcRepId, setFcRepId] = useState<number | "">("");
  const [fcAmount, setFcAmount] = useState("");
  const [frRepId, setFrRepId] = useState<number | "">("");
  const [frAmount, setFrAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalNum = parseFloat(total) || 0;
  const allocatedTotal =
    (dqRepId !== "" ? parseFloat(dqAmount) || 0 : 0) +
    (fcRepId !== "" ? parseFloat(fcAmount) || 0 : 0) +
    (frRepId !== "" ? parseFloat(frAmount) || 0 : 0);
  const remaining = totalNum - allocatedTotal;

  const handleSave = async () => {
    if (!client1.trim()) {
      setError("Client 1 name is required");
      return;
    }
    if (!currentAddress.trim()) {
      setError("Current address is required");
      return;
    }
    if (!soldAddress.trim()) {
      setError("Property sold address is required");
      return;
    }
    if (!settlementDate) {
      setError("Expected settlement date is required");
      return;
    }
    if (!totalNum) {
      setError("Total amount is required");
      return;
    }
    setSaving(true);

    // Schedule reminder via Notification API if enabled
    if (reminderEnabled && settlementDate) {
      const settleMs = new Date(settlementDate).getTime();
      const reminderMs = settleMs - 2 * 24 * 60 * 60 * 1000; // 2 days before
      const delayMs = reminderMs - Date.now();
      if (delayMs > 0 && "Notification" in window) {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            setTimeout(() => {
              new Notification(`📋 Settlement Reminder`, {
                body: `${client1}${client2 ? " & " + client2 : ""} — settlement due in 2 days`,
                tag: `settlement-${Date.now()}`,
              });
            }, delayMs);
          }
        });
      }
    }

    const entry: CommissionEntry = {
      id: genId(),
      client1: client1.trim(),
      client2: client2.trim() || undefined,
      currentAddress: currentAddress.trim(),
      soldAddress: soldAddress.trim(),
      settlementDate,
      total: totalNum,
      entity,
      reminderEnabled,
      notes: notes.trim() || undefined,
      repAllocations: [
        dqRepId !== "" && parseFloat(dqAmount) > 0
          ? {
              repId: dqRepId as number,
              repName: activeReps.find((r) => r.id === dqRepId)?.name ?? "",
              amount: parseFloat(dqAmount),
              paid: false,
              role: "DQ" as const,
            }
          : null,
        fcRepId !== "" && parseFloat(fcAmount) > 0
          ? {
              repId: fcRepId as number,
              repName: activeReps.find((r) => r.id === fcRepId)?.name ?? "",
              amount: parseFloat(fcAmount),
              paid: false,
              role: "FC" as const,
            }
          : null,
        frRepId !== "" && parseFloat(frAmount) > 0
          ? {
              repId: frRepId as number,
              repName: activeReps.find((r) => r.id === frRepId)?.name ?? "",
              amount: parseFloat(frAmount),
              paid: false,
              role: "FR" as const,
            }
          : null,
      ].filter((a): a is NonNullable<typeof a> => a !== null),
      createdAt: Date.now(),
      createdBy: currentUser?.name ?? "Unknown",
    };
    await onSave(entry);
    setSaving(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-amber-500" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">New Settlement</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition text-gray-500"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Client details */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Client Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Client 1 Name *">
                  <input
                    className={inp}
                    value={client1}
                    onChange={(e) => {
                      setClient1(e.target.value);
                      setError("");
                    }}
                    placeholder="John Smith"
                  />
                </Field>
                <Field label="Client 2 Name (optional)">
                  <input
                    className={inp}
                    value={client2}
                    onChange={(e) => setClient2(e.target.value)}
                    placeholder="Jane Smith"
                  />
                </Field>
                <Field label="Clients' Current Address *">
                  <input
                    className={inp}
                    value={currentAddress}
                    onChange={(e) => {
                      setCurrentAddress(e.target.value);
                      setError("");
                    }}
                    placeholder="123 Current St, Suburb"
                  />
                </Field>
                <Field label="Property Sold Address *">
                  <input
                    className={inp}
                    value={soldAddress}
                    onChange={(e) => {
                      setSoldAddress(e.target.value);
                      setError("");
                    }}
                    placeholder="456 Sold St, Suburb"
                  />
                </Field>
              </div>
            </div>

            {/* Settlement details */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Settlement Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Expected Settlement Date *">
                  <input
                    type="date"
                    className={inp}
                    value={settlementDate}
                    onChange={(e) => {
                      setSettlementDate(e.target.value);
                      setError("");
                    }}
                  />
                </Field>
                <Field label="Office">
                  <select className={inp} value={entity} onChange={(e) => setEntity(e.target.value as Entity)}>
                    <option value="Perth">ASG Perth</option>
                    <option value="Brisbane">ASG Brisbane</option>
                  </select>
                </Field>
                <Field label="Total Commission ($) *">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={inp}
                    value={total}
                    onChange={(e) => {
                      setTotal(e.target.value);
                      setError("");
                    }}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Notes">
                  <input
                    className={inp}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes"
                  />
                </Field>
              </div>

              {/* Reminder toggle */}
              <button
                type="button"
                onClick={() => setReminderEnabled((v) => !v)}
                className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                  reminderEnabled
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                    : "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                }`}
              >
                {reminderEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                {reminderEnabled
                  ? "Reminder set — notify 2 days before settlement"
                  : "Set reminder near settlement date"}
              </button>
            </div>

            {/* Rep allocations — fixed DQ / FC / FR rows */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Rep Allocations
                </p>
                {totalNum > 0 && (
                  <span
                    className={`text-xs font-medium ${Math.abs(remaining) < 0.01 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    Remaining: {formatCurrency(remaining)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {(
                  [
                    { label: "DQ Rep", repId: dqRepId, setRepId: setDqRepId, amount: dqAmount, setAmount: setDqAmount },
                    { label: "FC Rep", repId: fcRepId, setRepId: setFcRepId, amount: fcAmount, setAmount: setFcAmount },
                    { label: "FR Rep", repId: frRepId, setRepId: setFrRepId, amount: frAmount, setAmount: setFrAmount },
                  ] as const
                ).map(({ label, repId, setRepId, amount, setAmount }) => (
                  <div key={label} className="flex items-center gap-2">
                    {/* Role badge */}
                    <span className="w-14 flex-shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400 text-right pr-1">
                      {label}
                    </span>
                    {/* Rep dropdown */}
                    <select
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={repId}
                      onChange={(e) => {
                        setRepId(e.target.value === "" ? "" : Number(e.target.value));
                        if (e.target.value === "") setAmount("");
                      }}
                    >
                      <option value="">— None —</option>
                      {activeReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {/* Amount input — only shown when a rep is selected */}
                    <div
                      className={`relative transition-all ${repId !== "" ? "opacity-100 w-32" : "opacity-0 w-0 overflow-hidden"}`}
                    >
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="pl-6 pr-2 py-1.5 w-32 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 disabled:opacity-50 transition text-sm"
            >
              {saving ? "Saving…" : "Save Settlement"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Settlement card ───────────────────────────────────────────────────────────
function CommissionCard({
  entry,
  onDelete,
  onTogglePaid,
}: {
  entry: CommissionEntry;
  onDelete: () => void;
  onTogglePaid: (repId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const paidCount = entry.repAllocations.filter((a) => a.paid).length;
  const totalAllocated = entry.repAllocations.reduce((s, a) => s + a.amount, 0);

  const displayName = entry.client1 ?? entry.client ?? "—";
  const displayAddress = entry.soldAddress ?? entry.address ?? "—";
  const entityLabel =
    entry.entity === "Perth" ? "ASG Perth" : entry.entity === "Brisbane" ? "ASG Brisbane" : (entry.entity as string);

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
      <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white">
              {displayName}
              {entry.client2 ? ` & ${entry.client2}` : ""}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                entry.entity === "Perth"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400"
              }`}
            >
              {entityLabel}
            </span>
            {entry.reminderEnabled && (
              <span title="Reminder set" className="text-amber-500">
                <Bell size={12} />
              </span>
            )}
            {paidCount === entry.repAllocations.length && entry.repAllocations.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                All Paid
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sold: {displayAddress}</p>
          {(entry.currentAddress ?? entry.address) && entry.currentAddress !== entry.soldAddress && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Current: {entry.currentAddress}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>Settlement: {fmtDate(entry.settlementDate)}</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(entry.total)}</span>
            {entry.repAllocations.length > 0 && (
              <span>
                {paidCount}/{entry.repAllocations.length} paid
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-500 font-medium">Delete?</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition"
              >
                <Check size={13} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
                className="p-1.5 rounded bg-gray-100 dark:bg-[var(--surface)] text-gray-500 hover:bg-gray-200 transition"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              className="p-1.5 rounded text-gray-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              <Trash2 size={13} />
            </button>
          )}
          {expanded ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.06] px-4 pb-4 pt-3">
          {entry.repAllocations.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No rep allocations</p>
          ) : (
            <div className="space-y-2">
              {entry.repAllocations.map((alloc) => (
                <div key={alloc.repId} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      alloc.paid
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {alloc.repName[0]}
                  </div>
                  {alloc.role && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex-shrink-0">
                      {alloc.role}
                    </span>
                  )}
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{alloc.repName}</span>
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">
                    {formatCurrency(alloc.amount)}
                  </span>
                  <button
                    onClick={() => onTogglePaid(alloc.repId)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
                      alloc.paid
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600"
                    }`}
                  >
                    {alloc.paid ? (
                      <>
                        <Check size={11} /> Paid
                      </>
                    ) : (
                      "Mark Paid"
                    )}
                  </button>
                </div>
              ))}
              <div className="flex justify-between text-xs text-gray-400 pt-1 border-t border-gray-100 dark:border-white/[0.06] mt-2">
                <span>Allocated: {formatCurrency(totalAllocated)}</span>
                <span>Remaining: {formatCurrency(entry.total - totalAllocated)}</span>
              </div>
            </div>
          )}
          {entry.notes && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">{entry.notes}</p>}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function CommissionsPage() {
  const { entries, loading } = useCommissions();
  const { save } = useSaveCommission();
  const { remove } = useDeleteCommission();
  const { showToast } = useToast();

  const [showNew, setShowNew] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [filterEntity, setFilterEntity] = useState<"all" | Entity>("all");
  const [filterPaid, setFilterPaid] = useState<"all" | "unpaid" | "paid">("all");
  const [generatingReport, setGeneratingReport] = useState(false);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (filterEntity !== "all" && e.entity !== filterEntity) return false;
        if (filterPaid === "unpaid") return e.repAllocations.some((a) => !a.paid);
        if (filterPaid === "paid") return e.repAllocations.every((a) => a.paid) || e.repAllocations.length === 0;
        return true;
      }),
    [entries, filterEntity, filterPaid],
  );

  const totalSettlements = useMemo(() => entries.reduce((s, e) => s + e.total, 0), [entries]);
  const totalAllocated = useMemo(
    () => entries.reduce((s, e) => s + e.repAllocations.reduce((r, a) => r + a.amount, 0), 0),
    [entries],
  );
  const totalPaid = useMemo(
    () => entries.reduce((s, e) => s + e.repAllocations.filter((a) => a.paid).reduce((r, a) => r + a.amount, 0), 0),
    [entries],
  );

  const handleSave = async (entry: CommissionEntry) => {
    const ok = await save(entry);
    if (ok) showToast("✅ Settlement saved", "success");
    else showToast("Failed to save", "error");
  };

  const handleDelete = async (id: string) => {
    const ok = await remove(id);
    if (ok) showToast("Entry deleted", "success");
  };

  const handleTogglePaid = async (entry: CommissionEntry, repId: number) => {
    const updated: CommissionEntry = {
      ...entry,
      repAllocations: entry.repAllocations.map((a) =>
        a.repId === repId
          ? { ...a, paid: !a.paid, paidAt: !a.paid ? new Date().toISOString().split("T")[0] : undefined }
          : a,
      ),
    };
    await save(updated);
  };

  const handleMonthlyReport = useCallback(async () => {
    setGeneratingReport(true);
    try {
      const { jsPDF: JSPDF } = await import("jspdf");
      const pdf = new JSPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthLabel = now.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

      // Filter to current month
      const monthEntries = entries.filter((e) => {
        const d = new Date(e.settlementDate);
        return d >= monthStart && d <= monthEnd;
      });

      const pageW = 210;
      const margin = 15;
      let y = margin;

      // Header bar
      pdf.setFillColor(245, 158, 11); // amber
      pdf.rect(0, 0, pageW, 20, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("ASG Live Leads — Commission Report", margin, 13);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(monthLabel, pageW - margin - pdf.getTextWidth(monthLabel), 13);
      y = 28;

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${monthEntries.length} Settlement(s) in ${monthLabel}`, margin, y);
      y += 8;

      // Per-settlement details
      monthEntries.forEach((entry, idx) => {
        if (y > 260) {
          pdf.addPage();
          y = margin;
        }
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.setFillColor(249, 250, 251);
        pdf.rect(margin, y - 4, pageW - margin * 2, 7, "F");
        pdf.text(
          `${idx + 1}. ${entry.client1}${entry.client2 ? ` & ${entry.client2}` : ""} — ${entry.entity}`,
          margin + 1,
          y,
        );
        y += 5;
        pdf.setFont("helvetica", "normal");
        pdf.text(
          `Settlement: ${entry.settlementDate}   Address: ${entry.soldAddress ?? entry.address ?? ""}   Total: $${entry.total.toLocaleString()}`,
          margin + 2,
          y,
        );
        y += 4;
        (entry.repAllocations ?? []).forEach((ra) => {
          if (y > 270) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(
            `  ${ra.role ?? "Rep"}: ${ra.repName} — $${ra.amount.toLocaleString()} (${ra.paid ? "Paid ✓" : "Unpaid"})`,
            margin + 4,
            y,
          );
          y += 4;
        });
        y += 3;
      });

      // Summary table by rep
      if (y > 220) {
        pdf.addPage();
        y = margin;
      }
      y += 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("Rep Summary", margin, y);
      y += 5;

      // Aggregate by rep
      const repTotals: Record<string, { total: number; paid: number; unpaid: number }> = {};
      monthEntries.forEach((e) => {
        (e.repAllocations ?? []).forEach((ra) => {
          if (!repTotals[ra.repName]) repTotals[ra.repName] = { total: 0, paid: 0, unpaid: 0 };
          repTotals[ra.repName].total += ra.amount;
          if (ra.paid) repTotals[ra.repName].paid += ra.amount;
          else repTotals[ra.repName].unpaid += ra.amount;
        });
      });

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      const colX = [margin, 70, 115, 155];
      pdf.text("Rep", colX[0], y);
      pdf.text("Total", colX[1], y);
      pdf.text("Paid", colX[2], y);
      pdf.text("Unpaid", colX[3], y);
      y += 4;
      pdf.setFont("helvetica", "normal");
      Object.entries(repTotals).forEach(([name, t]) => {
        if (y > 275) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(name, colX[0], y);
        pdf.text(`$${t.total.toLocaleString()}`, colX[1], y);
        pdf.text(`$${t.paid.toLocaleString()}`, colX[2], y);
        pdf.text(`$${t.unpaid.toLocaleString()}`, colX[3], y);
        y += 5;
      });

      // Footer
      y += 5;
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Generated: ${now.toLocaleString("en-AU")}`, margin, y);

      pdf.save(`commission-report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.pdf`);
    } catch (err) {
      console.error("Report generation failed:", err);
    } finally {
      setGeneratingReport(false);
    }
  }, [entries]);

  return (
    <>
      {showNew && <NewCommissionModal onClose={() => setShowNew(false)} onSave={handleSave} />}
      {showInvoice && <InvoiceModal entries={entries} onClose={() => setShowInvoice(false)} />}

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[var(--bg)] p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <DollarSign size={20} className="text-amber-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Commissions</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMonthlyReport}
              disabled={generatingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50"
            >
              📊 {generatingReport ? "Generating…" : "Monthly Report"}
            </button>
            <button
              onClick={() => setShowInvoice(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition text-sm"
            >
              <FileText size={15} /> Push to Invoice
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition text-sm"
            >
              <Plus size={15} /> New Settlement
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
            <div className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalSettlements)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total Settlements</div>
          </div>
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
            <div className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalPaid)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Paid to Reps</div>
          </div>
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalAllocated - totalPaid)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Outstanding</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden">
            {(
              [
                ["all", "All"],
                ["Perth", "ASG Perth"],
                ["Brisbane", "ASG Brisbane"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterEntity(val as "all" | Entity)}
                className={`px-3 py-1.5 text-xs font-medium transition ${filterEntity === val ? "bg-amber-500 text-white" : "bg-white dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden">
            {(
              [
                ["all", "All"],
                ["unpaid", "Unpaid"],
                ["paid", "Paid"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterPaid(val)}
                className={`px-3 py-1.5 text-xs font-medium transition ${filterPaid === val ? "bg-amber-500 text-white" : "bg-white dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} settlements</span>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            {entries.length === 0
              ? 'No settlements yet — click "New Settlement" to add one'
              : "No settlements match your filters"}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((entry) => (
              <CommissionCard
                key={entry.id}
                entry={entry}
                onDelete={() => handleDelete(entry.id)}
                onTogglePaid={(repId) => handleTogglePaid(entry, repId)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// helpers
const inp =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default CommissionsPage;
