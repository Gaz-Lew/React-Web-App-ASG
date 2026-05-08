import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ChevronDown, ChevronRight, FileText, BarChart3, Monitor, Download } from "lucide-react";
import { ReportView } from "../../pages/ReportView";
import { useFirebaseAuthUser } from "../../hooks/useFirebaseAuthUser";

// ── Types ──────────────────────────────────────────────────────────────────

interface SMSFReport {
  id: string;
  userId: number;
  userName: string;
  result: {
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
  };
  createdAt: number;
}

interface PIAReport {
  id: string;
  userId: number;
  userName: string;
  result: {
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
  };
  createdAt: number;
}

type ActiveReport = { type: "smsf"; data: SMSFReport } | { type: "pia"; data: PIAReport } | null;

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtAUD = (v: number | null | undefined) => {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtDate = (ts: number) => {
  try {
    const d = new Date(ts);
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    };
    return d.toLocaleDateString("en-AU", opts);
  } catch {
    return "—";
  }
};

// ── Report Card ────────────────────────────────────────────────────────────

function SMSFCard({ report, onPresent }: { report: SMSFReport; onPresent: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const r = report.result;

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden transition-colors hover:border-amber-300 dark:hover:border-amber-700">
      <div className="flex items-center">
        <button onClick={() => setExpanded((e) => !e)} className="flex-1 flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex-shrink-0">
            SMSF
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(report.createdAt)}</p>
          </div>
          <div className="text-right flex-shrink-0 pr-1">
            <p className="text-sm font-semibold text-[#b8933a]">{fmtAUD(r.smsfBalance)}</p>
            <p className="text-[10px] text-gray-400">projected</p>
          </div>
        </button>
        <div className="flex items-center gap-0 pr-3 flex-shrink-0">
          <button
            onClick={onPresent}
            className="p-1.5 text-gray-400 hover:text-[#b8933a] hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
            title="Present"
          >
            <Monitor size={13} />
          </button>
          <button
            onClick={onPresent}
            className="p-1.5 text-gray-400 hover:text-[#b8933a] hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
            title="Export PDF"
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/[0.06] pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Current Balance</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{fmtAUD(r.currentBalance)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Projected Balance</span>
              <span className="font-medium text-[#b8933a]">{fmtAUD(r.smsfBalance)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Current Growth</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{fmtAUD(r.currentGrowth)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">SMSF Growth</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtAUD(r.smsfGrowth)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Years</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{r.years ?? "—"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Delta</span>
              <span
                className={`font-medium ${r.deltaFinal != null && r.deltaFinal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}
              >
                {fmtAUD(r.deltaFinal)}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Strategy</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{r.strategy ?? "—"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Winner</span>
              <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{r.winner ?? "—"}</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Prepared by {report.userName} · {fmtDate(report.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}

function PIACard({ report, onPresent }: { report: PIAReport; onPresent: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const r = report.result;

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden transition-colors hover:border-amber-300 dark:hover:border-amber-700">
      <div className="flex items-center">
        <button onClick={() => setExpanded((e) => !e)} className="flex-1 flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex-shrink-0">
            PIA
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(report.createdAt)}</p>
          </div>
          <div className="text-right flex-shrink-0 pr-1">
            <p className="text-sm font-semibold text-[#b8933a]">{fmtAUD(r.netPosition)}/wk</p>
            <p className="text-[10px] text-gray-400">net position</p>
          </div>
        </button>
        <div className="flex items-center gap-0 pr-3 flex-shrink-0">
          <button
            onClick={onPresent}
            className="p-1.5 text-gray-400 hover:text-[#b8933a] hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
            title="Present"
          >
            <Monitor size={13} />
          </button>
          <button
            onClick={onPresent}
            className="p-1.5 text-gray-400 hover:text-[#b8933a] hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
            title="Export PDF"
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/[0.06] pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Property Value</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{fmtAUD(r.propertyValue)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Loan Amount</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{fmtAUD(r.loanAmount)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Repayments</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{fmtAUD(r.repayments)}/mo</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Rental Income</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtAUD(r.rentalIncome)}/yr</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Net Position</span>
              <span
                className={`font-medium ${r.netPosition != null && r.netPosition >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}
              >
                {fmtAUD(r.netPosition)}/wk
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Equity</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{fmtAUD(r.equity)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Gross Yield</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {r.grossYield != null ? `${r.grossYield.toFixed(2)}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-white/[0.04]">
              <span className="text-gray-500 dark:text-gray-400">Net Yield</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {r.netYield != null ? `${r.netYield.toFixed(2)}%` : "—"}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Prepared by {report.userName} · {fmtDate(report.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

interface FinancialReportsTabProps {
  clientId: string;
}

export function FinancialReportsTab({ clientId }: FinancialReportsTabProps) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [smsfReports, setSmsfReports] = useState<SMSFReport[]>([]);
  const [piaReports, setPiaReports] = useState<PIAReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ActiveReport>(null);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    const unsubscribes: Unsubscribe[] = [];

    const smsfQ = query(collection(db, "smsfReports"), where("clientId", "==", clientId));
    const piaQ = query(collection(db, "piaReports"), where("clientId", "==", clientId));

    setLoading(true);

    unsubscribes.push(
      onSnapshot(
        smsfQ,
        (snap) => {
          const docs = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<SMSFReport, "id">) }))
            .sort((a, b) => b.createdAt - a.createdAt);
          setSmsfReports(docs);
          setLoading(false);
        },
        (err) => {
          console.error("[FinancialReportsTab] SMSF snapshot error:", err);
          setLoading(false);
        },
      ),
    );

    unsubscribes.push(
      onSnapshot(
        piaQ,
        (snap) => {
          const docs = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<PIAReport, "id">) }))
            .sort((a, b) => b.createdAt - a.createdAt);
          setPiaReports(docs);
          setLoading(false);
        },
        (err) => {
          console.error("[FinancialReportsTab] PIA snapshot error:", err);
          setLoading(false);
        },
      ),
    );

    return () => {
      unsubscribes.forEach((fn) => fn());
    };
  }, [authLoading, currentUser, clientId]);

  const handlePresent = (report: ActiveReport) => {
    setActiveReport(report);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
          style={{ borderColor: "#b8933a", borderTopColor: "transparent" }}
        />
        Loading reports…
      </div>
    );
  }

  const hasReports = smsfReports.length > 0 || piaReports.length > 0;

  if (!hasReports) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-400 dark:text-gray-500">
        <BarChart3 size={32} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">No financial reports yet</p>
        <p className="text-xs mt-1 text-center max-w-xs">
          Run a PIA or SMSF calculation to generate reports for this client.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 space-y-5">
        {/* SMSF Reports */}
        {smsfReports.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-emerald-500" />
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                SMSF Reports
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {smsfReports.length}
              </span>
            </div>
            <div className="space-y-2">
              {smsfReports.map((r) => (
                <SMSFCard key={r.id} report={r} onPresent={() => handlePresent({ type: "smsf", data: r })} />
              ))}
            </div>
          </div>
        )}

        {/* PIA Reports */}
        {piaReports.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-blue-500" />
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                PIA Reports
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {piaReports.length}
              </span>
            </div>
            <div className="space-y-2">
              {piaReports.map((r) => (
                <PIACard key={r.id} report={r} onPresent={() => handlePresent({ type: "pia", data: r })} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full-screen report viewer */}
      {activeReport && (
        <ReportView
          report={{ result: activeReport.data.result, createdAt: activeReport.data.createdAt }}
          type={activeReport.type}
          onClose={() => setActiveReport(null)}
        />
      )}
    </>
  );
}
