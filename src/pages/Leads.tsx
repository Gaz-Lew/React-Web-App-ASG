import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Lead } from "../types";
import { useLeads, useSaveLead, useDeleteLead, useAddAuditEntry } from "../hooks/useFirebase";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCallbackReminders } from "../hooks/useCallbackReminders";
import { useToast } from "../context/ToastContext";
import { useAppStore } from "../stores/appStore";
import DataTable from "../components/DataTable";
import CallLogger from "../components/CallLogger";
import { LeadSidebar } from "../components/LeadSidebar";
import { AddLeadModal } from "../components/AddLeadModal";
import { reportWriteResult } from "../hooks/useNetworkStatus";
import { Loader } from "lucide-react";
import { getNextAction } from "../lib/nextAction";
import { injectRowFlashStyles } from "../lib/animation";

function isTerminalLeadStatus(status: string | undefined): boolean {
  return status === "_deleted" || status === "lost" || status === "Not Interested" || status === "Wrong Number";
}

interface LeadsPageProps {
  addLeadOpen?: boolean;
  onAddLeadOpenChange?: (open: boolean) => void;
  pendingCallLeadId?: number | null;
  onPendingCallLeadConsumed?: () => void;
  initialFilter?: string | null;
  onFilterCleared?: () => void;
}

export function LeadsPage({
  addLeadOpen = false,
  onAddLeadOpenChange,
  pendingCallLeadId,
  onPendingCallLeadConsumed,
  initialFilter,
  onFilterCleared,
}: LeadsPageProps) {
  const { leads, loading: leadsLoading, error: leadsError, loadMore, hasMore, loadingMore } = useLeads();
  const { save: saveLead, loading: saveLoading, error: saveError } = useSaveLead();
  const { remove: deleteLead, loading: deleteLoading } = useDeleteLead();
  const { add: addAudit } = useAddAuditEntry();
  const { showToast } = useToast();
  const { currentUser } = useAppStore();

  // ── Phase 5.2 — Failed-write retry buffer (lead update path only) ────────
  const [lastFailedSave, setLastFailedSave] = useState<Lead | null>(null);
  const [retrying, setRetrying] = useState(false);

  // ── Phase 7 — minimal audit logger (status + callback changes) ───────────
  const logLeadAudit = useCallback(
    async (action: string, detail: string, leadId: number, leadName: string) => {
      if (!currentUser) return;
      const now = new Date();
      await addAudit({
        timestamp: now.getTime(),
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().slice(0, 5),
        user: currentUser.name,
        action,
        detail,
        leadId,
        leadName,
      });
    },
    [currentUser, addAudit],
  );
  useCallbackReminders(leads);

  // Inject row flash keyframes once
  useEffect(() => {
    injectRowFlashStyles();
  }, []);

  // Row flash feedback
  const [flashedLeadId, setFlashedLeadId] = useState<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores the last AI-suggested action used in the sidebar, keyed by lead ID
  // to prevent cross-lead attribution. Cleared on every status_change write.
  const lastAIContextRef = useRef<{ leadId: string; action: string } | null>(null);

  const flashRow = useCallback((leadId: number) => {
    setFlashedLeadId(leadId);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashedLeadId(null), 600);
  }, []);

  const showFeedback = useCallback((msg: string) => {
    setActionFeedback(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setActionFeedback(null), 2500);
  }, []);

  const handleAIScriptUsed = useCallback((leadId: string | number, action: string) => {
    lastAIContextRef.current = { leadId: String(leadId), action };
  }, []);

  // Apply filter from Dashboard navigation
  const filteredLeads = useMemo(() => {
    if (!initialFilter) return leads;
    if (initialFilter === "no-contact") {
      return leads.filter((l) => !isTerminalLeadStatus(l.status) && (!l.callHistory || l.callHistory.length === 0));
    }
    if (initialFilter === "clients-no-fc") {
      return leads.filter((l) => (l.status === "Booked" || l.status === "booked") && !l.fcAppt?.date);
    }
    if (initialFilter === "overdue-callbacks") {
      const today = new Date().toISOString().split("T")[0];
      return leads
        .filter((l) => !isTerminalLeadStatus(l.status) && l.callbackDate && l.callbackDate < today)
        .sort((a, b) => (a.callbackDate ?? "").localeCompare(b.callbackDate ?? ""));
    }
    if (initialFilter === "overdue-followups") {
      const today = new Date().toISOString().split("T")[0];
      return leads
        .filter((l) => !isTerminalLeadStatus(l.status) && l.nextContactDate && l.nextContactDate < today)
        .sort((a, b) => (a.nextContactDate ?? "").localeCompare(b.nextContactDate ?? ""));
    }
    return leads;
  }, [leads, initialFilter]);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCallLogger, setShowCallLogger] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // ── Soft delete undo state ────────────────────────────────────────────────
  const [undoLead, setUndoLead] = useState<Lead | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalLeadRef = useRef<Lead | null>(null);

  // Sync external addLeadOpen → internal close handler
  const setShowAddLead = useCallback(
    (open: boolean) => {
      onAddLeadOpenChange?.(open);
    },
    [onAddLeadOpenChange],
  );
  const showAddLead = addLeadOpen;

  // ── Pending call from Dashboard ─────────────────────────────────────────────
  useEffect(() => {
    if (!pendingCallLeadId || leads.length === 0) return;
    const lead = leads.find((l) => l.id === pendingCallLeadId);
    if (lead) {
      setSelectedLead(lead);
      setShowCallLogger(true);
      setShowSidebar(false);
      onPendingCallLeadConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCallLeadId, leads]);

  // ── Lead selection ──────────────────────────────────────────────────────────
  const handleSelectLead = useCallback((lead: Lead) => {
    originalLeadRef.current = lead;
    setSelectedLead(lead);
    setShowSidebar(true);
    setShowCallLogger(false);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setShowSidebar(false);
    setSelectedLead(null);
  }, []);

  // ── Call logger ─────────────────────────────────────────────────────────────
  const handleAddCall = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowCallLogger(true);
    setShowSidebar(false);
  }, []);

  const handleSaveCall = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (ok) {
        showToast(`✅ Call logged for ${updatedLead.name}`, "success");
        flashRow(updatedLead.id);
        showFeedback("Call logged ✓");
        setShowCallLogger(false);
        setSelectedLead(null);

        // ── Flow mode: auto-select next highest priority lead ─────────────
        const nextLead = filteredLeads
          .filter((l) => l.id !== updatedLead.id && l.status !== "_deleted")
          .sort((a, b) => {
            const aAction = getNextAction(a);
            const bAction = getNextAction(b);
            const priorityVal = { high: 0, medium: 1, low: 2 };
            return (priorityVal[aAction.priority] ?? 2) - (priorityVal[bAction.priority] ?? 2);
          })[0];
        if (nextLead) {
          setTimeout(() => {
            setSelectedLead(nextLead);
            setShowSidebar(true);
          }, 300);
        }
      } else {
        showToast("❌ Failed to save call. Please try again.", "error");
      }
    },
    [saveLead, showToast, flashRow, showFeedback, filteredLeads],
  );

  // ── Sidebar save ────────────────────────────────────────────────────────────
  const handleSaveLead = useCallback(
    async (updatedLead: Lead) => {
      const prev = originalLeadRef.current;
      const ok = await saveLead(updatedLead);
      reportWriteResult(ok);
      if (ok) {
        originalLeadRef.current = updatedLead;
        setLastFailedSave(null);
        flashRow(updatedLead.id);
        showFeedback("Updated ✓");
        showToast(`✅ ${updatedLead.name} saved`, "success");

        // Phase 7 — audit only field-level changes worth tracking
        if (prev) {
          if (prev.status !== updatedLead.status) {
            // Read and clear atomically — lead ID guard prevents cross-lead attribution
            const stored = lastAIContextRef.current;
            const contextAction =
              stored?.leadId === String(updatedLead.id) ? stored.action : undefined;
            lastAIContextRef.current = null;

            void logLeadAudit(
              "lead_status_changed",
              `Status: ${prev.status} → ${updatedLead.status}`,
              updatedLead.id,
              updatedLead.name,
            );
            void addDoc(collection(db, "auditLogs"), {
              type: "status_change",
              entityId: updatedLead.id,
              previousValue: prev.status,
              newValue: updatedLead.status,
              userId: String(currentUser?.id ?? "unknown"),
              timestamp: Date.now(),
              source: contextAction ? "ai" : "manual",
              ...(contextAction ? { contextAction } : {}),
            }).catch((err) => console.warn("[audit]", err));
          }
          if ((prev.callbackDate || "") !== (updatedLead.callbackDate || "")) {
            void logLeadAudit(
              "lead_callback_updated",
              `Callback: ${prev.callbackDate || "—"} → ${updatedLead.callbackDate || "—"}`,
              updatedLead.id,
              updatedLead.name,
            );
            void addDoc(collection(db, "auditLogs"), {
              type: "callback_update",
              entityId: updatedLead.id,
              previousValue: prev.callbackDate ?? "",
              newValue: updatedLead.callbackDate ?? "",
              userId: String(currentUser?.id ?? "unknown"),
              timestamp: Date.now(),
              source: "manual",
            }).catch((err) => console.warn("[audit]", err));
          }
        }
      } else {
        setLastFailedSave(updatedLead);
        showToast("❌ Failed to save. Tap retry to try again.", "error");
      }
    },
    [saveLead, showToast, flashRow, showFeedback, logLeadAudit],
  );

  // ── Phase 5.2 — Retry handler ────────────────────────────────────────────
  const handleRetrySave = useCallback(async () => {
    if (!lastFailedSave || retrying) return;
    setRetrying(true);
    const ok = await saveLead(lastFailedSave);
    reportWriteResult(ok);
    setRetrying(false);
    if (ok) {
      setLastFailedSave(null);
      flashRow(lastFailedSave.id);
      showToast(`✅ ${lastFailedSave.name} saved`, "success");
    } else {
      showToast("❌ Retry failed. Check your connection.", "error");
    }
  }, [lastFailedSave, retrying, saveLead, flashRow, showToast]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDeleteLead = useCallback(
    async (lead: Lead) => {
      // Step 1: Mark as _deleted (instant visual removal)
      const ok = await saveLead({ ...lead, status: "_deleted" as Lead["status"] });
      if (!ok) {
        showToast("❌ Failed to delete. Please try again.", "error");
        return;
      }

      setShowSidebar(false);
      setSelectedLead(null);

      // Show undo toast — the lead disappears from the table immediately
      setUndoLead(lead);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(async () => {
        // Step 2: Real delete after 5s if not undone
        await deleteLead(lead.id);
        setUndoLead(null);
      }, 5000);
    },
    [saveLead, deleteLead, showToast],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!undoLead) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Restore original status
    await saveLead(undoLead);
    setUndoLead(null);
    showToast(`↩️ ${undoLead.name} restored`, "success");
  }, [undoLead, saveLead, showToast]);

  // ── Inline cell edit from DataTable ─────────────────────────────────────────
  const handleUpdateLead = useCallback(
    async (updatedLead: Lead) => {
      const ok = await saveLead(updatedLead);
      if (!ok) showToast("❌ Failed to save. Please try again.", "error");
    },
    [saveLead, showToast],
  );

  // ── Next Action click → instant response ─────────────────────────────────────
  const handleNextAction = useCallback(
    (lead: Lead) => {
      const hasContact = (lead.callHistory?.length ?? 0) > 0;
      // No contact or follow-up → open CallLogger immediately
      if (!hasContact || lead.status === "new" || lead.status === "contacted" || lead.status === "qualified") {
        handleAddCall(lead);
        return;
      }
      // Callback scheduled → open CallLogger
      if (lead.callbackDate) {
        handleAddCall(lead);
        return;
      }
      // Booked → open sidebar for full client view
      if (lead.status === "booked" || lead.status === "Booked") {
        setSelectedLead(lead);
        setShowSidebar(true);
        setShowCallLogger(false);
        return;
      }
      // Fallback → open sidebar
      handleSelectLead(lead);
    },
    [handleAddCall, handleSelectLead],
  );

  // ── Add lead ────────────────────────────────────────────────────────────────
  const handleAddLead = useCallback(
    async (newLead: Lead) => {
      const ok = await saveLead(newLead);
      if (ok) {
        showToast(`✅ ${newLead.name} added`, "success");
      } else {
        showToast("❌ Failed to add lead.", "error");
      }
    },
    [saveLead, showToast],
  );

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (leadsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface)]">
        <div className="text-center">
          <Loader size={40} className="animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (leadsError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface)]">
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Failed to load leads</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">{leadsError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 transition font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[var(--surface)] overflow-hidden">
      {/* Notification permission hint */}
      {"Notification" in window && Notification.permission === "denied" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">
          <span>🔔</span>
          <span>
            Browser notifications are blocked — callback reminders won't fire. To enable: open your browser settings →
            Site Settings → Notifications → allow this site.
          </span>
        </div>
      )}

      {/* Filter indicator banner */}
      {initialFilter && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">
          <span className="font-semibold">
            {initialFilter === "no-contact" && "📞 Filter: Leads with no contact yet"}
            {initialFilter === "clients-no-fc" && "📋 Filter: Clients needing FC booking"}
            {initialFilter === "overdue-callbacks" && "Filter: Overdue callbacks"}
            {initialFilter === "overdue-followups" && "Filter: Overdue follow-ups"}
          </span>
          <button
            onClick={onFilterCleared}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
          >
            <span>Clear filter</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Body: table + optional inline sidebar on lg+ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Action feedback indicator */}
        {actionFeedback && (
          <div className="absolute top-4 right-4 z-50 px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-medium shadow-lg animate-pulse pointer-events-none">
            {actionFeedback}
          </div>
        )}
        {/* Table — fills space; sidebar sits beside it on lg+ */}
        <div className="flex-1 overflow-hidden min-w-0 transition-all duration-200">
          <DataTable
            leads={filteredLeads}
            loading={leadsLoading}
            onSelectLead={handleSelectLead}
            onAddCall={handleAddCall}
            onDeleteLead={handleDeleteLead}
            onUpdateLead={handleUpdateLead}
            onNextAction={handleNextAction}
            flashedLeadId={flashedLeadId}
            currentUserId={currentUser?.id}
            isAdmin={currentUser?.role === "admin"}
            loadMore={loadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
            forceAllTab={Boolean(initialFilter)}
          />
        </div>

      </div>

      {/* Lead detail modal — centered overlay on all screen sizes */}
      {showSidebar && selectedLead && (
        <LeadSidebar
          lead={selectedLead}
          onClose={handleCloseSidebar}
          onSave={handleSaveLead}
          onDelete={handleDeleteLead}
          onCall={handleAddCall}
          onAIScriptUsed={handleAIScriptUsed}
        />
      )}

      {/* Call Logger Modal */}
      {selectedLead && (
        <CallLogger
          lead={selectedLead}
          isOpen={showCallLogger}
          onClose={() => {
            setShowCallLogger(false);
            setSelectedLead(null);
          }}
          onSave={handleSaveCall}
        />
      )}

      {/* Add Lead Modal */}
      {showAddLead && <AddLeadModal onClose={() => setShowAddLead(false)} onSave={handleAddLead} />}

      {/* Saving overlay */}
      {(saveLoading || deleteLoading) && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[100]">
          <div className="bg-[var(--surface)] rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <Loader size={20} className="animate-spin text-amber-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {saveLoading ? "Saving..." : "Deleting..."}
            </span>
          </div>
        </div>
      )}

      {saveError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 text-sm">
          Error: {saveError}
        </div>
      )}

      {lastFailedSave && (
        <div className="fixed bottom-16 right-4 z-[9998] flex items-center gap-3 bg-red-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm">
          <span>⚠️ Save failed for <strong>{lastFailedSave.name}</strong></span>
          <button
            onClick={handleRetrySave}
            disabled={retrying}
            className="ml-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Undo delete toast — bottom-left so it doesn't clash with regular toasts */}
      {undoLead && (
        <div className="fixed bottom-4 left-4 z-[9998] flex items-center gap-3 bg-gray-900 dark:bg-slate-700 text-white px-4 py-3 rounded-xl shadow-xl text-sm animate-in slide-in-from-left-4 fade-in duration-300">
          <span>
            🗑️ <strong>{undoLead.name}</strong> deleted
          </span>
          <button
            onClick={handleUndoDelete}
            className="ml-1 px-3 py-1 bg-[#b8933a] hover:bg-[#d4aa55] text-white rounded-lg font-semibold text-xs transition"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default LeadsPage;
