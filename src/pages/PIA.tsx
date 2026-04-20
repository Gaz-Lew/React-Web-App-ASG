import React, { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useToast } from "../context/ToastContext";
import { useAppStore } from "../stores/appStore";

interface PIAResult {
  propertyValue: number | null;
  loanAmount: number | null;
  repayments: number | null;
  rentalIncome: number | null;
  netPosition: number | null;
  timestamp: number;
  grossYield: number | null;
  netYield: number | null;
  equity: number | null;
  weeklyShortfall: number | null;
  strategy: string | null;
}

const fmtAUD = (v: number | null) => {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
};

export function PIAPage() {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [piaResult, setPiaResult] = useState<PIAResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkedToClient, setLinkedToClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [lastSavedUrl, setLastSavedUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { showToast } = useToast();
  const { currentUser, leads } = useAppStore();
  const storage = getStorage();

  // Refs for use inside stable closures
  const selectedClientIdRef = useRef<string | null>(null);
  const leadsRef = useRef(leads);
  const hydratedClientRef = useRef<string | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send client data to PIA iframe via postMessage
  useEffect(() => {
    if (!loaded || !iframeRef.current) return;

    const timer = setTimeout(() => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "CRM_CONTEXT",
            payload: {
              source: "asg-crm",
              theme: "dark",
              userId: currentUser?.id ?? null,
              userName: currentUser?.name ?? null,
            },
          },
          "*",
        );
      } catch {
        // cross-origin — silently ignore
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [loaded, currentUser]);

  // Expose a method the CRM can call to load a specific client
  const loadClient = useCallback((clientData: { name?: string; income?: number; deposit?: number }) => {
    if (!iframeRef.current) return;
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "LOAD_CLIENT",
          payload: {
            name: clientData.name ?? "",
            income: clientData.income ?? 0,
            deposit: clientData.deposit ?? 0,
          },
        },
        "*",
      );
    } catch {
      // cross-origin — silently ignore
    }
  }, []);

  // Make loadClient available globally via window
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__piaLoadClient = loadClient;
    return () => {
      delete (window as unknown as Record<string, unknown>).__piaLoadClient;
    };
  }, [loadClient]);

  // Keep refs in sync so closures always see latest values
  useEffect(() => { selectedClientIdRef.current = selectedClientId; }, [selectedClientId]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  // Load persisted state when client is selected or iframe becomes ready
  useEffect(() => {
    if (!selectedClientId || !loaded) return;
    if (hydratedClientRef.current === selectedClientId) return;
    hydratedClientRef.current = selectedClientId;

    (async () => {
      try {
        const q = query(
          collection(db, "calculatorStates"),
          where("clientId", "==", selectedClientId),
          where("type", "==", "pia"),
        );
        const snap = await getDocs(q);
        let state: Record<string, unknown> | null = null;

        if (!snap.empty) {
          state = snap.docs[0].data().state as Record<string, unknown>;
        } else {
          const client = (leadsRef.current || []).find(
            (l) => String(l.id) === String(selectedClientId),
          );
          if (client?.clientGroupId) {
            const gq = query(
              collection(db, "calculatorStates"),
              where("clientGroupId", "==", client.clientGroupId),
              where("type", "==", "pia"),
            );
            const gSnap = await getDocs(gq);
            if (!gSnap.empty) {
              state = gSnap.docs[0].data().state as Record<string, unknown>;
            }
          }
        }

        if (state) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "RESTORE_STATE", payload: state },
            "*",
          );
        }
      } catch (err) {
        console.warn("[PIA] Failed to load state:", err);
      }
    })();
  }, [selectedClientId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoize selected client lookup
  const selectedClient = (leads || []).find(
    (l) => String(l.id) === String(selectedClientId)
  ) || null;

  // Listen for messages from the iframe (PIA_READY and PIA_RESULT)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;

      if (e.data.type === "PIA_READY") {
        setLoaded(true);
        return;
      }

      if (e.data.type === "PIA_STATE") {
        const payload = e.data.payload;
        if (!payload || typeof payload !== "object") return;
        const clientId = selectedClientIdRef.current;
        if (!clientId) return;
        if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
        saveStateTimerRef.current = setTimeout(async () => {
          try {
            const client = (leadsRef.current || []).find(
              (l) => String(l.id) === String(clientId),
            );
            await setDoc(
              doc(db, "calculatorStates", `pia_${clientId}`),
              {
                clientId,
                clientGroupId: client?.clientGroupId ?? null,
                type: "pia",
                state: payload,
                updatedAt: Date.now(),
              },
              { merge: true },
            );
          } catch (err) {
            console.warn("[PIA] Failed to save state:", err);
          }
        }, 500);
        return;
      }

      if (e.data.type === "PIA_RESULT") {
        try {
          const payload = e.data.payload;
          if (!payload || typeof payload !== "object") return;

          setPiaResult({
            propertyValue: typeof payload.propertyValue === "number" ? payload.propertyValue : null,
            loanAmount: typeof payload.loanAmount === "number" ? payload.loanAmount : null,
            repayments: typeof payload.repayments === "number" ? payload.repayments : null,
            rentalIncome: typeof payload.rentalIncome === "number" ? payload.rentalIncome : null,
            netPosition: typeof payload.netPosition === "number" ? payload.netPosition : null,
            timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
            grossYield: typeof payload.grossYield === "number" ? payload.grossYield : null,
            netYield: typeof payload.netYield === "number" ? payload.netYield : null,
            equity: typeof payload.equity === "number" ? payload.equity : null,
            weeklyShortfall: typeof payload.weeklyShortfall === "number" ? payload.weeklyShortfall : null,
            strategy: typeof payload.strategy === "string" ? payload.strategy : null,
          });
        } catch (err) {
          console.warn("[PIAPage] Error parsing PIA_RESULT:", err);
        }
        return;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Fallback timeout: if iframe doesn't signal ready, show after 3s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setLoaded(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loaded]);

  // Auto-load selected client data into PIA iframe
  useEffect(() => {
    if (!linkedToClient) return;
    if (!selectedClientId) return;
    if (!iframeRef.current || !loaded) return;

    const selectedClient = (leads || []).find(
      (l) => String(l.id) === String(selectedClientId)
    );

    if (!selectedClient) return;

    try {
      (window as any).__piaLoadClient?.({
        name: selectedClient.name ?? "",
        income: selectedClient.income ?? 0,
        deposit: selectedClient.deposit ?? 0,
      });
    } catch {
      // silent fail
    }
  }, [selectedClientId, linkedToClient, leads, loaded]);

  // Save result to Firestore
  const handleSave = useCallback(async () => {
    if (!piaResult) return;
    if (!currentUser) {
      showToast("Not logged in — cannot save", "error");
      return;
    }

    setSaving(true);
    try {
      let pdfUrl: string | null = null;

      try {
        const blob: Blob = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("PDF timeout"));
          }, 5000);

          const handler = (e: MessageEvent) => {
            if (e.data?.type === "PIA_PDF") {
              clearTimeout(timeout);
              window.removeEventListener("message", handler);
              resolve(e.data.blob);
            }
          };

          window.addEventListener("message", handler);

          iframeRef.current?.contentWindow?.postMessage(
            { type: "EXPORT_PDF" },
            "*"
          );
        });

        const fileRef = ref(
          storage,
          `piaReports/${currentUser.id}_${Date.now()}.pdf`
        );

        await uploadBytes(fileRef, blob);
        pdfUrl = await getDownloadURL(fileRef);
      } catch (err) {
        console.warn("[PIA] PDF upload failed", err);
      }

      await addDoc(collection(db, "piaReports"), {
        userId: currentUser.id,
        userName: currentUser.name,
        clientId: selectedClientId ?? null,
        clientGroupId: selectedClient?.clientGroupId ?? null,
        type: "pia",
        result: piaResult,
        pdfUrl: pdfUrl,
        createdAt: Date.now(),
      });
      if (pdfUrl) setLastSavedUrl(pdfUrl);
      showToast("✅ PIA report saved", "success");
    } catch (err) {
      console.error("[PIAPage] Failed to save report:", err);
      showToast("Failed to save report", "error");
    } finally {
      setSaving(false);
    }
  }, [piaResult, currentUser, showToast, storage, selectedClientId, selectedClient]);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      {/* Page Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(184,147,58,0.15)" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#b8933a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-[var(--text)] leading-tight">PIA Calculator</h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Property investment analysis</p>
            </div>
          </div>

          {/* Save button + result summary */}
          <div className="flex items-center gap-3">
            {piaResult && (
              <div className="hidden sm:flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span>
                  Value: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.propertyValue)}</span>
                </span>
                <span>
                  Net: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.netPosition)}/wk</span>
                </span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={!piaResult || saving}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#b8933a" }}
            >
              {saving ? (
                <>
                  <svg
                    className="w-3.5 h-3.5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
            {lastSavedUrl && (
              <button
                onClick={() => window.open(lastSavedUrl, "_blank")}
                className="ml-2 text-xs underline text-[#b8933a] hover:opacity-80 transition"
              >
                View last report
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Select Client to Link */}
      <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 py-3">
        <label className="text-xs sm:text-sm font-medium text-[var(--text)] block mb-2">Link to Client</label>
        <select
          value={selectedClientId || ""}
          onChange={(e) => {
            const clientId = e.target.value || null;
            setSelectedClientId(clientId);
            if (clientId) {
              setLinkedToClient(true);
            }
          }}
          className="w-full px-3 py-2 rounded-lg text-xs sm:text-sm border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#b8933a]"
        >
          <option value="">Select a client…</option>
          {(leads || []).map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.firstName} {lead.lastName}
            </option>
          ))}
        </select>
        <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-1.5">Fields will auto-fill once a client is selected</p>
        {selectedClient && (
          <div className="mt-2 px-2 py-1.5 bg-[var(--bg)] rounded-md border border-[#b8933a] border-opacity-30">
            <span className="text-xs text-[var(--text-muted)]">
              Linked to:{" "}
              <span className="text-[#b8933a] font-medium">
                {selectedClient.firstName} {selectedClient.lastName}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Result summary bar (mobile) */}
      {piaResult && (
        <div className="flex-shrink-0 sm:hidden bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              Value: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.propertyValue)}</span>
            </span>
            <span>
              Net: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.netPosition)}/wk</span>
            </span>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Loading overlay */}
        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]">
            <div className="text-center">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                style={{ borderColor: "#b8933a", borderTopColor: "transparent" }}
              />
              <p className="text-sm text-[var(--text-muted)]">Loading PIA Calculator…</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]">
            <div className="text-center max-w-sm px-6">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Failed to load the PIA Calculator. Please try refreshing the page.
              </p>
              <button
                onClick={() => {
                  setHasError(false);
                  setLoaded(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#b8933a" }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Iframe */}
        <iframe
          ref={iframeRef}
          src="/pia/index.html"
          title="PIA Calculator"
          className="w-full h-full border-0"
          style={{
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.4s ease-in-out",
            background: "var(--bg)",
          }}
          onLoad={() => {
            // The iframe will postMessage when ready; fallback handles the rest
          }}
          onError={() => setHasError(true)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
