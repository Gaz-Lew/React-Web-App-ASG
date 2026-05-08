import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAppStore } from "../../stores/appStore";
import { TRAINING_SCENARIOS } from "../../data/knowledgeStructured";
import { Check, Phone, Calendar, FileText, Sparkles, ArrowRight, ArrowLeft, Play, LayoutDashboard } from "lucide-react";

// Lazy-load the TrainingHub so it doesn't block onboarding render
const TrainingHubPage = lazy(() => import("../../pages/TrainingHub").then((m) => ({ default: m.TrainingHubPage })));

const TOTAL_STEPS = 4;
const amber = "#b8933a";
const STORAGE_KEY = "asg-crm:onboardingStep";

/* ── Step persistence helpers ─────────────────────────────────────────────── */

function getSavedStep(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : 1;
    return n >= 1 && n <= TOTAL_STEPS ? n : 1;
  } catch {
    return 1;
  }
}

function saveStep(step: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(step));
  } catch {
    /* quota — non-fatal */
  }
}

function clearSavedStep() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/* ── Analytics helpers ────────────────────────────────────────────────────── */

async function logAnalyticsEvent(
  repId: number | undefined,
  repName: string | undefined,
  event: string,
  extra?: Record<string, unknown>,
) {
  try {
    await addDoc(collection(db, "analyticsEvents"), {
      event,
      repId,
      repName,
      timestamp: serverTimestamp(),
      clientTimestamp: Date.now(),
      ...extra,
    });
  } catch (err) {
    console.error(`Failed to log ${event} analytics event:`, err);
  }
}

async function logOnboardingCompleted(repId: number, repName: string) {
  await logAnalyticsEvent(repId, repName, "onboarding_completed");
}

function logStepViewed(repId: number | undefined, repName: string | undefined, step: number) {
  // Fire-and-forget — non-blocking
  logAnalyticsEvent(repId, repName, "onboarding_step_viewed", { step }).catch(() => {});
}

/* ── Step definitions ─────────────────────────────────────────────────────── */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: `${amber}20` }}
      >
        <Sparkles className="w-10 h-10" style={{ color: amber }} />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Welcome to Amplify</h1>
      <p className="text-slate-400 text-sm sm:text-base max-w-sm mb-8">
        Your all-in-one CRM to manage leads, book appointments, and close more deals.
      </p>

      <ul className="text-left space-y-4 max-w-xs w-full mb-8">
        <li className="flex items-start gap-3">
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
            style={{ background: `${amber}25` }}
          >
            <Check className="w-3.5 h-3.5" style={{ color: amber }} />
          </div>
          <span className="text-slate-300 text-sm">Track and manage every lead from one central dashboard</span>
        </li>
        <li className="flex items-start gap-3">
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
            style={{ background: `${amber}25` }}
          >
            <Check className="w-3.5 h-3.5" style={{ color: amber }} />
          </div>
          <span className="text-slate-300 text-sm">Book appointments and log call notes in seconds</span>
        </li>
        <li className="flex items-start gap-3">
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
            style={{ background: `${amber}25` }}
          >
            <Check className="w-3.5 h-3.5" style={{ color: amber }} />
          </div>
          <span className="text-slate-300 text-sm">Train with AI roleplay to sharpen your pitch</span>
        </li>
      </ul>

      <button
        onClick={onNext}
        className="px-6 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition flex items-center justify-center"
        style={{ background: amber, minWidth: 200 }}
      >
        Get Started <ArrowRight className="w-4 h-4 ml-2" />
      </button>
    </div>
  );
}

function StepCoreActions({ onNavigate }: { onNavigate: (action: "leads" | "calendar" | "client-hub") => void }) {
  const actions = [
    {
      icon: <Phone className="w-6 h-6" />,
      label: "Call a lead",
      desc: "Log outcomes and build rapport",
      action: "leads" as const,
    },
    {
      icon: <Calendar className="w-6 h-6" />,
      label: "Book appointment",
      desc: "Schedule and manage your calendar",
      action: "calendar" as const,
    },
    {
      icon: <FileText className="w-6 h-6" />,
      label: "Log notes",
      desc: "Record every interaction for follow-up",
      action: "client-hub" as const,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Core Actions</h2>
      <p className="text-slate-400 text-sm mb-6">These are the three things you'll do every day. Tap one to try it.</p>

      <div className="grid grid-cols-1 gap-4 max-w-sm w-full mb-8">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => onNavigate(a.action)}
            className="flex items-center gap-4 p-4 rounded-xl text-left transition hover:bg-white/10 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${amber}20`, color: amber }}
            >
              {a.icon}
            </div>
            <div>
              <p className="text-white text-sm font-semibold">{a.label}</p>
              <p className="text-slate-400 text-xs">{a.desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 ml-auto text-slate-500 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function StepAITraining({ onTryPractice }: { onTryPractice: () => void }) {
  const defaultScenario = TRAINING_SCENARIOS.find((s) => s.difficulty === "easy") ?? TRAINING_SCENARIOS[0];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
        style={{ background: `${amber}20` }}
      >
        <Sparkles className="w-8 h-8" style={{ color: amber }} />
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">AI Training</h2>
      <p className="text-slate-400 text-sm max-w-sm mb-6">
        Practice your pitch with our AI roleplay engine. It simulates real prospects so you can refine your approach
        before making live calls.
      </p>

      {defaultScenario && (
        <div
          className="max-w-sm w-full rounded-xl p-4 mb-6 text-left"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Try this</p>
          <p className="text-white text-sm font-semibold">{defaultScenario.title}</p>
          <p className="text-slate-400 text-xs mt-1">{defaultScenario.description}</p>
          <p className="text-slate-500 text-xs mt-1">~2 mins · Easy difficulty</p>
        </div>
      )}

      <button
        onClick={onTryPractice}
        className="px-6 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition flex items-center justify-center"
        style={{ background: amber, minWidth: 240 }}
      >
        <Play className="w-4 h-4 mr-2" /> Try a Practice Scenario
      </button>
    </div>
  );
}

function StepComplete({ onFinish, completing }: { onFinish: () => void; completing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
      {/* Animated check circle */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{
          background: "rgba(34, 197, 94, 0.15)",
          animation: "pulse 2s ease-in-out infinite",
        }}
      >
        <Check className="w-10 h-10 text-green-400" />
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">You're All Set!</h2>
      <p className="text-slate-400 text-sm sm:text-base max-w-sm mb-2">
        Head to your dashboard to start managing leads and booking appointments.
      </p>
      <p className="text-sm max-w-sm mb-8" style={{ color: `${amber}cc` }}>
        You're ready to go. Let's book your first appointment.
      </p>

      <button
        onClick={onFinish}
        disabled={completing}
        className="px-6 py-2.5 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition flex items-center justify-center disabled:opacity-50"
        style={{
          background: amber,
          minWidth: 220,
          boxShadow: `0 0 24px ${amber}40, 0 0 48px ${amber}20`,
        }}
      >
        {completing ? (
          <>
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin mr-2" />
            Saving…
          </>
        ) : (
          <>
            <LayoutDashboard className="w-4 h-4 mr-2" /> Go to Dashboard
          </>
        )}
      </button>
    </div>
  );
}

/* ── Training mode overlay ────────────────────────────────────────────────── */

function TrainingOverlay({ onBack }: { onBack: () => void }) {
  const didLaunchRef = useRef(false);

  // Launch the default easy scenario when the overlay mounts
  useEffect(() => {
    if (didLaunchRef.current) return;
    didLaunchRef.current = true;
    const easyScenario = TRAINING_SCENARIOS.find((s) => s.difficulty === "easy");
    if (easyScenario) {
      window.dispatchEvent(new CustomEvent("launch-scenario", { detail: easyScenario.id }));
    }
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#0a0e1a]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Back to Onboarding
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading Training Hub…</div>
          }
        >
          <TrainingHubPage />
        </Suspense>
      </div>
    </div>
  );
}

/* ── Main OnboardingFlow ──────────────────────────────────────────────────── */

interface OnboardingFlowProps {
  onComplete: () => void;
  onNavigate?: (page: "leads" | "calendar" | "client-hub") => void;
}

export function OnboardingFlow({ onComplete, onNavigate }: OnboardingFlowProps) {
  const { currentUser } = useAppStore();
  const [step, setStep] = useState(getSavedStep);
  const [showTraining, setShowTraining] = useState(false);
  const [completing, setCompleting] = useState(false);
  const hasLoggedRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // ── 1. Lock background scroll ─────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, []);

  // ── 2. Focus management ───────────────────────────────────────────────
  useEffect(() => {
    // Focus the modal root on mount
    modalRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const root = modalRef.current;
      if (!root) return;

      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) return;

      // Trap focus within the modal
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // ── 3. ESC key protection ─────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, []);

  // ── Persist step to localStorage ──────────────────────────────────────
  useEffect(() => {
    saveStep(step);
  }, [step]);

  // ── 5. Step analytics ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    logStepViewed(currentUser.id, currentUser.name, step);
  }, [step, currentUser]);

  const handleComplete = useCallback(async () => {
    if (!currentUser) return;
    setCompleting(true);
    try {
      await updateDoc(doc(db, "reps", String(currentUser.id)), {
        hasCompletedOnboarding: true,
      });
      // Analytics event (once only)
      if (!hasLoggedRef.current) {
        hasLoggedRef.current = true;
        await logOnboardingCompleted(currentUser.id, currentUser.name);
      }
    } catch (err) {
      console.error("Failed to mark onboarding complete:", err);
    } finally {
      setCompleting(false);
      clearSavedStep();
      onComplete();
    }
  }, [currentUser, onComplete]);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  }, [step]);

  const handlePrev = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
  }, [step]);

  const handleTryPractice = useCallback(() => {
    setShowTraining(true);
  }, []);

  const handleBackFromTraining = useCallback(() => {
    setShowTraining(false);
  }, []);

  const handleCoreAction = useCallback(
    (action: "leads" | "calendar" | "client-hub") => {
      if (onNavigate) {
        onNavigate(action);
      }
      // Advance to next step after the action
      if (step < TOTAL_STEPS) {
        setStep((s) => s + 1);
      }
    },
    [onNavigate, step],
  );

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center outline-none"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full h-full max-w-2xl mx-auto flex flex-col overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0f1322 0%, #0a0e1a 100%)",
          maxWidth: "100%",
        }}
      >
        {/* Training overlay */}
        {showTraining && <TrainingOverlay onBack={handleBackFromTraining} />}

        {/* Progress bar */}
        {!showTraining && (
          <div className="px-4 sm:px-6 pt-6 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">
                Step {step} of {TOTAL_STEPS}
              </span>
              {step > 1 && step < TOTAL_STEPS && (
                <button onClick={handlePrev} className="text-xs text-slate-500 hover:text-slate-300 transition">
                  Back
                </button>
              )}
            </div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(step / TOTAL_STEPS) * 100}%`,
                  background: amber,
                }}
              />
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col">
            {step === 1 && <StepWelcome onNext={handleNext} />}
            {step === 2 && <StepCoreActions onNavigate={handleCoreAction} />}
            {step === 3 && <StepAITraining onTryPractice={handleTryPractice} />}
            {step === 4 && <StepComplete onFinish={handleComplete} completing={completing} />}
          </div>

          {/* Skip link (steps 1-3) */}
          {!showTraining && step < TOTAL_STEPS && (
            <div className="pb-6 text-center">
              <button
                onClick={() => setStep(TOTAL_STEPS)}
                className="text-xs text-slate-600 hover:text-slate-400 transition"
              >
                Skip to end
              </button>
            </div>
          )}
        </div>

        {/* Completing spinner overlay */}
        {completing && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: amber, borderTopColor: "transparent" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
