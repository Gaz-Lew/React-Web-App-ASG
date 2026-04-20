/**
 * SystemHealthPanel.tsx — Real-time system diagnostics
 *
 * Provides at-a-glance health status for all major subsystems:
 *  1. Firestore connectivity (derived from live settings listener)
 *  2. AI roleplay (last session count + training stats)
 *  3. Voice (browser STT/TTS capability detection)
 *  4. Network (navigator.onLine)
 *  5. Feature flags snapshot (failsafe status)
 *
 * Status colours:
 *  Green  = healthy / enabled
 *  Amber  = degraded / warning
 *  Red    = offline / disabled / error
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Wifi,
  Database,
  Mic,
  MicOff,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Shield,
  Activity,
  Bell,
  BellOff,
  CloudOff,
  AlertCircle,
} from "lucide-react";
import { useAppSettings } from "../hooks/useAppSettings";
import { useTrainingSessions } from "../hooks/useFirebase";
import { useAppStore } from "../stores/appStore";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

// ─────────────────────────────────────────────────────────────────────────────
// Static capability checks (evaluated once at module load)
// ─────────────────────────────────────────────────────────────────────────────

const STT_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const TTS_SUPPORTED =
  typeof window !== "undefined" && "speechSynthesis" in window;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

type HealthStatus = "ok" | "warn" | "error" | "disabled" | "unknown";

const STATUS_STYLES: Record<HealthStatus, { dot: string; text: string; bg: string; border: string }> = {
  ok:       { dot: "bg-green-500",  text: "text-green-700 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-900/20",   border: "border-green-200 dark:border-green-800/40" },
  warn:     { dot: "bg-amber-400",  text: "text-amber-700 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-900/10",   border: "border-amber-200 dark:border-amber-700/40" },
  error:    { dot: "bg-red-500",    text: "text-red-700 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-900/10",       border: "border-red-200 dark:border-red-700/40" },
  disabled: { dot: "bg-gray-400",   text: "text-gray-500 dark:text-gray-400",   bg: "bg-gray-50 dark:bg-gray-900/20",     border: "border-gray-200 dark:border-gray-700/40" },
  unknown:  { dot: "bg-gray-300",   text: "text-gray-400 dark:text-gray-500",   bg: "bg-gray-50 dark:bg-gray-800/20",     border: "border-gray-200 dark:border-gray-700/40" },
};

const STATUS_ICONS: Record<HealthStatus, React.ReactNode> = {
  ok:       <CheckCircle size={13} />,
  warn:     <AlertTriangle size={13} />,
  error:    <XCircle size={13} />,
  disabled: <XCircle size={13} />,
  unknown:  <Clock size={13} />,
};

function HealthCard({
  icon,
  title,
  status,
  detail,
  subdetail,
}: {
  icon: React.ReactNode;
  title: string;
  status: HealthStatus;
  detail: string;
  subdetail?: string;
}) {
  const s = STATUS_STYLES[status];
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${s.bg} ${s.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          {icon}
          <span className="text-xs font-semibold">{title}</span>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "ok" ? "animate-pulse" : ""}`} />
          {STATUS_ICONS[status]}
        </div>
      </div>
      <p className={`text-xs font-medium ${s.text}`}>{detail}</p>
      {subdetail && <p className="text-[10px] text-gray-400 dark:text-gray-500">{subdetail}</p>}
    </div>
  );
}

function FlagRow({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: boolean;
  inverse?: boolean;
}) {
  // inverse = flag being ON is a warning (e.g. disableTraining: true → amber)
  const isHealthy = inverse ? !value : value;
  const status: HealthStatus = isHealthy ? "ok" : "warn";
  const s = STATUS_STYLES[status];

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`flex items-center gap-1 text-xs font-semibold ${s.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {value ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SystemHealthPanel() {
  const { config, loading: settingsLoading, error: settingsError } = useAppSettings();
  const { currentUser } = useAppStore();
  const { sessions } = useTrainingSessions(null); // null = all reps (admin view)
  const { isOnline, isSyncing, queueLength, failedItems } = useOfflineQueue();

  const [online, setOnline]           = useState(navigator.onLine);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  // Track network connectivity
  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Derived metrics ──────────────────────────────────────────────────────

  // Firestore health: settings loaded without error = connected
  const firestoreStatus: HealthStatus =
    !online          ? "error" :
    settingsError    ? "error" :
    settingsLoading  ? "warn"  : "ok";

  const firestoreDetail =
    !online          ? "Network offline" :
    settingsError    ? `Error: ${settingsError.slice(0, 60)}` :
    settingsLoading  ? "Connecting…" :
    "Connected — real-time sync active";

  // Training health: count sessions in last 7 days
  const recentSessions = sessions.filter(
    (s) => Date.now() - s.completedAt < 7 * 86_400_000
  ).length;
  const trainingStatus: HealthStatus =
    config.featureFlags.disableTraining ? "disabled" :
    recentSessions === 0                ? "warn"     : "ok";
  const trainingDetail =
    config.featureFlags.disableTraining ? "Disabled by admin" :
    `${recentSessions} session${recentSessions !== 1 ? "s" : ""} in last 7 days`;
  const trainingSub = sessions.length > 0
    ? `${sessions.length} total sessions in system`
    : "No sessions recorded yet";

  // Voice health
  const voiceStatus: HealthStatus =
    config.featureFlags.disableVoice ? "disabled" :
    !config.featureFlags.enableVoiceMode ? "disabled" :
    !STT_SUPPORTED ? "warn" :
    "ok";
  const voiceDetail =
    config.featureFlags.disableVoice ? "Voice disabled by admin (failsafe)" :
    !config.featureFlags.enableVoiceMode ? "Voice mode turned off in feature flags" :
    STT_SUPPORTED ? "STT supported — Chrome/Edge detected" :
    "STT not available — use Chrome or Edge";
  const voiceSub = TTS_SUPPORTED ? "TTS available" : "TTS not available";

  // Network status
  const networkStatus: HealthStatus = online ? "ok" : "error";

  // Notifications health
  const notifStatus: HealthStatus =
    notifPermission === "unsupported" ? "disabled" :
    notifPermission === "denied"      ? "warn"     :
    notifPermission === "granted"     ? "ok"       : "unknown";
  const notifDetail =
    notifPermission === "unsupported" ? "Push notifications not supported in this browser" :
    notifPermission === "denied"      ? "Notifications blocked by user — enable in browser settings" :
    notifPermission === "granted"     ? "Push notifications enabled" :
    "Notifications not yet requested";

  // Offline queue health
  const offlineQueueStatus: HealthStatus =
    !isOnline        ? "error" :
    failedItems.length > 0 ? "warn"  :
    queueLength > 0  ? "warn"  : "ok";
  const offlineQueueDetail =
    !isOnline
      ? `Offline — ${queueLength} operation${queueLength !== 1 ? "s" : ""} queued`
      : isSyncing
      ? `Syncing ${queueLength} queued operation${queueLength !== 1 ? "s" : ""}…`
      : failedItems.length > 0
      ? `${failedItems.length} operation${failedItems.length !== 1 ? "s" : ""} permanently failed`
      : queueLength > 0
      ? `${queueLength} operation${queueLength !== 1 ? "s" : ""} pending sync`
      : "All writes synced";

  // Read-only mode warning
  const readOnlyActive = config.featureFlags.readOnlyMode;

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity size={16} className="text-amber-500" /> System Health
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time diagnostics for all platform subsystems.
          </p>
        </div>
        <button
          onClick={() => setLastRefresh(Date.now())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Read-only mode alert */}
      {readOnlyActive && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-sm font-semibold text-amber-700 dark:text-amber-300">
          <AlertTriangle size={16} className="flex-shrink-0" />
          READ-ONLY MODE ACTIVE — All write operations are blocked for all users.
        </div>
      )}

      {/* Health cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <HealthCard
          icon={<Database size={14} />}
          title="Firestore"
          status={firestoreStatus}
          detail={firestoreDetail}
          subdetail={`Last checked: ${fmtTime(lastRefresh)}`}
        />
        <HealthCard
          icon={<Wifi size={14} />}
          title="Network"
          status={networkStatus}
          detail={online ? "Online" : "Offline — check your connection"}
          subdetail={online ? "Real-time listeners active" : "App in offline mode (cached data)"}
        />
        <HealthCard
          icon={<Brain size={14} />}
          title="AI Training"
          status={trainingStatus}
          detail={trainingDetail}
          subdetail={trainingSub}
        />
        <HealthCard
          icon={STT_SUPPORTED ? <Mic size={14} /> : <MicOff size={14} />}
          title="Voice"
          status={voiceStatus}
          detail={voiceDetail}
          subdetail={voiceSub}
        />
        <HealthCard
          icon={notifPermission === "granted" ? <Bell size={14} /> : <BellOff size={14} />}
          title="Push Notifications"
          status={notifStatus}
          detail={notifDetail}
          subdetail="FCM — requires Chrome/Edge with service worker"
        />
        <HealthCard
          icon={isOnline ? <Wifi size={14} /> : <CloudOff size={14} />}
          title="Offline Queue"
          status={offlineQueueStatus}
          detail={offlineQueueDetail}
          subdetail={failedItems.length > 0 ? "Visit Connection Settings to clear failed writes" : undefined}
        />
      </div>

      {/* Feature flags status */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Zap size={13} className="text-amber-500" /> Feature Flags Status
        </h3>
        <div>
          <FlagRow label="Voice Mode"        value={config.featureFlags.enableVoiceMode} />
          <FlagRow label="Session Replay"    value={config.featureFlags.enableReplay} />
          <FlagRow label="Training Disabled (failsafe)" value={config.featureFlags.disableTraining} inverse />
          <FlagRow label="Voice Disabled (failsafe)"    value={config.featureFlags.disableVoice} inverse />
          <FlagRow label="Read-Only Mode (failsafe)"    value={config.featureFlags.readOnlyMode} inverse />
        </div>
      </div>

      {/* Active user */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Shield size={13} className="text-amber-500" /> Current Session
        </h3>
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Logged-in user</span>
            <span className="font-medium text-gray-900 dark:text-white">{currentUser?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>Role</span>
            <span className="font-medium text-gray-900 dark:text-white capitalize">{currentUser?.role ?? "rep"}</span>
          </div>
          <div className="flex justify-between">
            <span>Browser</span>
            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">
              {navigator.userAgent.split(" ").slice(-1)[0] ?? "Unknown"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>STT Engine</span>
            <span className={`font-medium ${STT_SUPPORTED ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
              {STT_SUPPORTED ? "Available" : "Not available"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>TTS Engine</span>
            <span className={`font-medium ${TTS_SUPPORTED ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
              {TTS_SUPPORTED ? "Available" : "Not available"}
            </span>
          </div>
        </div>
      </div>

      {/* Timestamp */}
      <p className="text-[10px] text-center text-gray-400 dark:text-gray-500">
        Panel generated at {fmtTime(lastRefresh)} · Data from real-time Firestore listeners
      </p>
    </div>
  );
}

export default SystemHealthPanel;
