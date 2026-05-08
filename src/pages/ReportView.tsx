import { useEffect, useRef } from "react";
import { X, Download, Monitor } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

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

type ReportType = "smsf" | "pia";

interface ReportViewProps {
  report: { result: SMSFResult | PIAResult; createdAt: number };
  type: ReportType;
  onClose: () => void;
  clientName?: string;
  repName?: string;
}

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

const fmtDateLong = (ts: number) => {
  try {
    return new Date(ts).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

// ── Report View Component ──────────────────────────────────────────────────

export function ReportView({ report, type, onClose, clientName, repName }: ReportViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Trap Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const isSMSF = type === "smsf";
  const r = report.result as SMSFResult | PIAResult;

  const title = isSMSF ? "SMSF Strategy Report" : "Property Investment Analysis";
  const subtitle = isSMSF ? "Superannuation Strategy Modelling" : "Property Investment Analysis Report";

  // ── Auto-generated summary insight ────────────────────────────────────
  const summaryText = (() => {
    if (isSMSF) {
      const s = r as SMSFResult;
      const delta = s.deltaFinal ?? 0;
      return delta > 0
        ? `Switching to an SMSF could improve your position by $${delta.toLocaleString("en-AU")} over the selected period.`
        : `Based on current inputs, remaining in your current structure may be more suitable.`;
    }
    const p = r as PIAResult;
    const net = p.netPosition ?? 0;
    return net > 0
      ? `This property is projected to generate approximately $${net.toLocaleString("en-AU")}/week in positive cash flow.`
      : `This property is projected to require approximately $${Math.abs(net).toLocaleString("en-AU")}/week in support.`;
  })();

  const handlePresent = () => {
    try {
      const el = contentRef.current;
      if (el && typeof el.requestFullscreen === "function") {
        el.requestFullscreen();
      }
    } catch {
      // Fullscreen API not supported — continue without it
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9000] bg-black/70 backdrop-blur-sm print:hidden" onClick={onClose} />

      {/* Full-screen report panel */}
      <div
        ref={contentRef}
        className="fixed inset-0 z-[9001] flex items-center justify-center overflow-y-auto print:static print:z-auto print:overflow-visible"
      >
        <div
          id="report-content"
          className="relative w-full max-w-[900px] mx-4 my-8 print:mx-0 print:my-0 print:max-w-none bg-white dark:bg-[#111114] rounded-2xl shadow-2xl print:shadow-none print:rounded-none"
        >
          {/* Close button — hidden during print */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06] print:hidden bg-white/80 dark:bg-[#111114]/80 backdrop-blur-md rounded-t-2xl">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePresent}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition"
                title="Full screen presentation mode"
              >
                <Monitor size={13} /> Present
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition"
                title="Export as PDF"
              >
                <Download size={13} /> Export PDF
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Report body */}
          <div className="px-8 sm:px-12 py-10 print:px-10 print:py-10">
            {/* Header */}
            <div className="text-center mb-8 print:mb-6">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-1" style={{ color: "#b8933a" }}>
                Amplify Solutions Group
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white print:text-black leading-tight">
                {title}
              </h1>
              <p className="text-sm text-gray-400 dark:text-gray-500 print:text-gray-600 mt-1">{subtitle}</p>
              <div className="mt-3 flex items-center justify-center gap-3 text-xs text-gray-400 dark:text-gray-500 print:text-gray-600">
                <span>Prepared: {fmtDateLong(report.createdAt)}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 print:bg-gray-400" />
                <span className="capitalize">{isSMSF ? "SMSF" : "PIA"} Report</span>
              </div>
              <div className="mt-4 w-16 h-px mx-auto" style={{ background: "#b8933a" }} />
            </div>

            {/* Client Context */}
            <div className="mb-8 print:mb-6">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-300 print:text-gray-800">
                {clientName ? (
                  <span>
                    Prepared for:{" "}
                    <strong className="text-gray-900 dark:text-white print:text-black">{clientName}</strong>
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 print:text-gray-600">
                    Prepared for: <em>Valued Client</em>
                  </span>
                )}
                {repName && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 print:bg-gray-400" />
                    <span>
                      Prepared by: <strong className="text-gray-900 dark:text-white print:text-black">{repName}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Summary Insight */}
            <div
              className="mb-10 print:mb-8 rounded-xl border-l-4 p-5 print:p-4"
              style={{ borderColor: "#b8933a", backgroundColor: "rgba(184,147,58,0.06)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#b8933a" }}>
                Summary Insight
              </p>
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-200 print:text-gray-800 leading-relaxed">
                {summaryText}
              </p>
            </div>

            {/* SMSF Content */}
            {isSMSF &&
              (() => {
                const s = r as SMSFResult;
                const deltaPositive = (s.deltaFinal ?? 0) >= 0;
                return (
                  <div className="space-y-8 print:space-y-6">
                    {/* Key metric — big number */}
                    <div className="text-center py-6 print:py-4">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-1">
                        Projected Super Balance
                      </p>
                      <p className="text-4xl sm:text-5xl font-bold print:text-3xl" style={{ color: "#b8933a" }}>
                        {fmtAUD(s.smsfBalance)}
                      </p>
                      {s.years != null && (
                        <p className="text-sm text-gray-400 dark:text-gray-500 print:text-gray-600 mt-1">
                          over {s.years} year{s.years !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>

                    {/* Comparison grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-4">
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Current Balance
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-gray-900 dark:text-white print:text-black">
                          {fmtAUD(s.currentBalance)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Projected Balance
                        </p>
                        <p className="text-2xl font-bold print:text-xl" style={{ color: "#b8933a" }}>
                          {fmtAUD(s.smsfBalance)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Current Growth
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-gray-900 dark:text-white print:text-black">
                          {fmtAUD(s.currentGrowth)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          SMSF Growth
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-emerald-600 print:text-emerald-700">
                          {fmtAUD(s.smsfGrowth)}
                        </p>
                      </div>
                    </div>

                    {/* Delta */}
                    <div className="text-center py-4 print:py-3">
                      <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-1">
                        Difference
                      </p>
                      <p
                        className={`text-3xl font-bold print:text-2xl ${deltaPositive ? "text-emerald-600 print:text-emerald-700" : "text-red-500 print:text-red-700"}`}
                      >
                        {deltaPositive ? "+" : ""}
                        {fmtAUD(s.deltaFinal)}
                      </p>
                      {s.strategy && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 mt-1">
                          Strategy: {s.strategy}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* PIA Content */}
            {!isSMSF &&
              (() => {
                const p = r as PIAResult;
                const netPositive = (p.netPosition ?? 0) >= 0;
                return (
                  <div className="space-y-8 print:space-y-6">
                    {/* Key metric — big number */}
                    <div className="text-center py-6 print:py-4">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-1">
                        Weekly Net Position
                      </p>
                      <p
                        className={`text-4xl sm:text-5xl font-bold print:text-3xl ${netPositive ? "text-emerald-600 print:text-emerald-700" : "text-red-500 print:text-red-700"}`}
                      >
                        {fmtAUD(p.netPosition)}
                        <span className="text-lg sm:text-xl font-normal text-gray-400 print:text-gray-600">/wk</span>
                      </p>
                    </div>

                    {/* Property details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-4">
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Property Value
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-gray-900 dark:text-white print:text-black">
                          {fmtAUD(p.propertyValue)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Loan Amount
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-gray-900 dark:text-white print:text-black">
                          {fmtAUD(p.loanAmount)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Monthly Repayments
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-gray-900 dark:text-white print:text-black">
                          {fmtAUD(p.repayments)}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-5 print:p-4">
                        <p className="text-xs text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-2">
                          Annual Rental Income
                        </p>
                        <p className="text-2xl font-bold print:text-xl text-emerald-600 print:text-emerald-700">
                          {fmtAUD(p.rentalIncome)}
                        </p>
                      </div>
                    </div>

                    {/* Additional metrics */}
                    <div className="grid grid-cols-3 gap-4 print:gap-3">
                      <div className="text-center bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-4 print:p-3">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-1">
                          Equity
                        </p>
                        <p className="text-lg font-bold print:text-base text-gray-900 dark:text-white print:text-black">
                          {fmtAUD(p.equity)}
                        </p>
                      </div>
                      <div className="text-center bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-4 print:p-3">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-1">
                          Gross Yield
                        </p>
                        <p className="text-lg font-bold print:text-base text-gray-900 dark:text-white print:text-black">
                          {p.grossYield != null ? `${p.grossYield.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div className="text-center bg-gray-50 dark:bg-white/[0.03] print:bg-gray-50 rounded-xl p-4 print:p-3">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 print:text-gray-600 uppercase tracking-wide mb-1">
                          Net Yield
                        </p>
                        <p className="text-lg font-bold print:text-base text-gray-900 dark:text-white print:text-black">
                          {p.netYield != null ? `${p.netYield.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Next Step CTA */}
            <div
              className="mt-10 print:mt-8 text-center rounded-xl border border-dashed p-6 print:p-4"
              style={{ borderColor: "rgba(184,147,58,0.3)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#b8933a" }}>
                Next Step
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 print:text-gray-700 leading-relaxed">
                Review this strategy with your consultant to determine the best course of action.
              </p>
            </div>

            {/* Footer */}
            <div className="mt-10 pt-6 border-t border-gray-100 dark:border-white/[0.06] print:border-gray-400 print:mt-6 print:pt-4">
              <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 print:text-gray-500 leading-relaxed max-w-lg mx-auto mb-3">
                This report is based on current assumptions and inputs. It is indicative only and does not constitute
                financial advice.
              </p>
              <p className="text-center text-[10px] text-gray-300 dark:text-gray-600 print:text-gray-500 leading-relaxed max-w-lg mx-auto">
                All figures are estimates and should be verified with qualified professionals before making investment
                decisions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            margin: 0;
            padding: 0;
          }
          .print\\:hidden {
            display: none !important;
          }
          #report-content {
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 24px !important;
          }
          #report-content * {
            page-break-inside: avoid;
          }
          #report-content > div > div {
            page-break-inside: avoid;
          }
          @page {
            margin: 12mm;
          }
        }
      `}</style>
    </>
  );
}
