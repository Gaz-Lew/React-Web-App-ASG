import React, { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { useToast } from "../context/ToastContext";
import { useAppStore } from "../stores/appStore";

interface SMSFResult {
  projectedBalance: number | null;
  contributions: number | null;
  strategy: string | null;
  timestamp: number;
  currentBalance: number | null;
  currentGrowth: number | null;
  smsfBalance: number | null;
  smsfGrowth: number | null;
  years: number | null;
  winner: string | null;
  deltaFinal: number | null;
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

export function SMSFPage() {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [smsfResult, setSmsfResult] = useState<SMSFResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { showToast } = useToast();
  const { currentUser, leads } = useAppStore();

  // Refs for use inside stable closures
  const selectedClientIdRef = useRef<string | null>(null);
  const leadsRef = useRef(leads);
  const hydratedClientRef = useRef<string | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send client data to SMSF iframe via postMessage
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
  const loadClient = useCallback((clientData: { name?: string; income?: number; balance?: number }) => {
    if (!iframeRef.current) return;
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "LOAD_CLIENT",
          payload: {
            name: clientData.name ?? "",
            income: clientData.income ?? 0,
            balance: clientData.balance ?? 0,
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
    (window as unknown as Record<string, unknown>).__smsfLoadClient = loadClient;
    return () => {
      delete (window as unknown as Record<string, unknown>).__smsfLoadClient;
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
          where("type", "==", "smsf"),
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
              where("type", "==", "smsf"),
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
        console.warn("[SMSF] Failed to load state:", err);
      }
    })();
  }, [selectedClientId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for messages from the iframe (SMSF_READY and SMSF_RESULT)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;

      if (e.data.type === "SMSF_READY") {
        setLoaded(true);
        return;
      }

      if (e.data.type === "SMSF_STATE") {
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
              doc(db, "calculatorStates", `smsf_${clientId}`),
              {
                clientId,
                clientGroupId: client?.clientGroupId ?? null,
                type: "smsf",
                state: payload,
                updatedAt: Date.now(),
              },
              { merge: true },
            );
          } catch (err) {
            console.warn("[SMSF] Failed to save state:", err);
          }
        }, 500);
        return;
      }

      if (e.data.type === "SMSF_RESULT") {
        try {
          const payload = e.data.payload;
          if (!payload || typeof payload !== "object") return;

          setSmsfResult({
            projectedBalance: typeof payload.projectedBalance === "number" ? payload.projectedBalance : null,
            contributions: typeof payload.contributions === "number" ? payload.contributions : null,
            strategy: typeof payload.strategy === "string" ? payload.strategy : null,
            timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
            currentBalance: typeof payload.currentBalance === "number" ? payload.currentBalance : null,
            currentGrowth: typeof payload.currentGrowth === "number" ? payload.currentGrowth : null,
            smsfBalance: typeof payload.smsfBalance === "number" ? payload.smsfBalance : null,
            smsfGrowth: typeof payload.smsfGrowth === "number" ? payload.smsfGrowth : null,
            years: typeof payload.years === "number" ? payload.years : null,
            winner: typeof payload.winner === "string" ? payload.winner : null,
            deltaFinal: typeof payload.deltaFinal === "number" ? payload.deltaFinal : null,
          });
        } catch (err) {
          console.warn("[SMSFPage] Error parsing SMSF_RESULT:", err);
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

  // Save result to Firestore
  const handleSave = useCallback(async () => {
    if (!smsfResult) return;
    if (!currentUser) {
      showToast("Not logged in — cannot save", "error");
      return;
    }

    const selectedClient = (leads || []).find(
      (l) => String(l.id) === String(selectedClientId)
    );

    setSaving(true);
    try {
      await addDoc(collection(db, "smsfReports"), {
        userId: currentUser.id,
        userName: currentUser.name,
        clientId: selectedClientId ?? null,
        clientGroupId: selectedClient?.clientGroupId ?? null,
        type: "smsf",
        result: smsfResult,
        createdAt: Date.now(),
      });
      showToast("✅ SMSF report saved", "success");
    } catch (err) {
      console.error("[SMSFPage] Failed to save report:", err);
      showToast("Failed to save report", "error");
    } finally {
      setSaving(false);
    }
  }, [smsfResult, currentUser, showToast, selectedClientId, leads]);

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
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
                <path d="M12 17v4" />
                <path d="M8 21h8" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-[var(--text)] leading-tight">SMSF Calculator</h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Superannuation strategy modelling</p>
            </div>
          </div>

          {/* Save button + result summary */}
          <div className="flex items-center gap-3">
            {smsfResult && (
              <div className="hidden sm:flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span>
                  SMSF: <span className="text-[#b8933a] font-semibold">{fmtAUD(smsfResult.smsfBalance)}</span>
                </span>
                <span>
                  vs Current: <span className="text-[#b8933a] font-semibold">{fmtAUD(smsfResult.deltaFinal)}</span>
                </span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={!smsfResult || saving}
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
                "Save to Client"
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Result summary bar (mobile) */}
      {smsfResult && (
        <div className="flex-shrink-0 sm:hidden bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              SMSF: <span className="text-[#b8933a] font-semibold">{fmtAUD(smsfResult.smsfBalance)}</span>
            </span>
            <span>
              Δ: <span className="text-[#b8933a] font-semibold">{fmtAUD(smsfResult.deltaFinal)}</span>
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
              <p className="text-sm text-[var(--text-muted)]">Loading SMSF Calculator…</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]">
            <div className="text-center max-w-sm px-6">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Failed to load the SMSF Calculator. Please try refreshing the page.
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
          src="/smsf/index.html"
          title="SMSF Calculator"
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
