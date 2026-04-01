import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';

const TimelyCSVImportModal = lazy(() =>
  import('../components/TimelyCSVImportModal').then((m) => ({ default: m.TimelyCSVImportModal }))
);
import { useAppStore } from '../stores/appStore';
import { useToast } from '../context/ToastContext';
import {
  useLeads, useSaveLead, useDeleteLead,
  useServiceTypes, useSaveServiceType, useAppointments, useSaveAppointment, useDeleteAppointment,
} from '../hooks/useFirebase';
import { Lead, Rep, Appointment, AppointmentStatus, ServiceType } from '../types';
import { LeadSidebar } from '../components/LeadSidebar';
import { AppointmentModal } from '../components/AppointmentModal';

export const DEFAULT_SERVICE_TYPES: Omit<ServiceType, 'id'>[] = [
  // General (amber #f59e0b)
  { name: 'Contract Signing',           category: 'General',            color: '#f59e0b', defaultDuration: 20,  sortOrder: 10 },
  { name: 'Super Referral',             category: 'General',            color: '#f59e0b', defaultDuration: 45,  sortOrder: 20 },
  { name: 'Call to Confirm',            category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 30 },
  { name: 'Pre-Approval',               category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 40 },
  { name: 'Settlement Preparation',     category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 50 },
  { name: 'Settlement',                 category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 60 },
  { name: 'Valuation',                  category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 70 },
  { name: 'Client Follow Up',           category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 80 },
  { name: 'Inspection',                 category: 'General',            color: '#f59e0b', defaultDuration: 30,  sortOrder: 90 },
  { name: 'Central Park Estate (FC/FR)',category: 'General',            color: '#f59e0b', defaultDuration: 60,  sortOrder: 100 },
  // First Consult (red #ef4444)
  { name: 'First Consult',              category: 'First Consult',      color: '#ef4444', defaultDuration: 45,  sortOrder: 110 },
  { name: 'First Consult (ReBook)',     category: 'First Consult',      color: '#ef4444', defaultDuration: 45,  sortOrder: 120 },
  // Finance (blue #3b82f6)
  { name: 'Finance Run',                category: 'Finance',            color: '#3b82f6', defaultDuration: 60,  sortOrder: 130 },
  { name: 'Finance Run - Chase Up',     category: 'Finance',            color: '#3b82f6', defaultDuration: 60,  sortOrder: 140 },
  { name: 'Finance Run - NO Deal',      category: 'Finance',            color: '#3b82f6', defaultDuration: 60,  sortOrder: 150 },
  { name: 'Finance Run (ReBook)',       category: 'Finance',            color: '#3b82f6', defaultDuration: 60,  sortOrder: 160 },
  { name: 'Coffee Run',                 category: 'Finance',            color: '#3b82f6', defaultDuration: 30,  sortOrder: 170 },
  { name: 'Referrals',                  category: 'Finance',            color: '#3b82f6', defaultDuration: 60,  sortOrder: 180 },
  // Property Sale (green #22c55e)
  { name: 'Sale',                       category: 'Property Sale',      color: '#22c55e', defaultDuration: 60,  sortOrder: 190 },
  { name: 'Sale (ReBook)',              category: 'Property Sale',      color: '#22c55e', defaultDuration: 60,  sortOrder: 200 },
  // Site/Lot Viewings (teal #14b8a6)
  { name: 'Site/Lot Viewing',           category: 'Site/Lot Viewings',  color: '#14b8a6', defaultDuration: 60,  sortOrder: 210 },
  // Lead Re-Engagement (orange #f97316)
  { name: 'Lead Re-Engagement',         category: 'Lead Re-Engagement', color: '#f97316', defaultDuration: 30,  sortOrder: 220 },
  // Zoom Meeting (purple #8b5cf6)
  { name: 'Zoom Meeting with Nick',     category: 'Zoom Meeting',       color: '#8b5cf6', defaultDuration: 45,  sortOrder: 230 },
];

function resolveEventColor(
  repId: number | undefined,
  serviceTypeId: string,
  reps: Rep[],
  serviceTypes: ServiceType[]
): string {
  if (repId) {
    const repColor = reps.find(r => r.id === repId)?.color;
    if (repColor) return repColor;
  }
  return serviceTypes.find(s => s.id === serviceTypeId)?.color ?? '#9ca3af';
}

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 19;
const SLOT_MINS = 30;
const SLOT_HEIGHT_PX = 40;

// ── Timely-style service column definitions ───────────────────────────────────
interface CalendarColumnDef {
  key: string;
  label: string;
  headerColor: string;
}

const CALENDAR_COLUMNS: CalendarColumnDef[] = [
  { key: 'first-consult',  label: 'First Consult',  headerColor: '#ef4444' },
  { key: 'finance-run',    label: 'Finance Run',     headerColor: '#3b82f6' },
  { key: 'property-sale',  label: 'Property Sale',   headerColor: '#22c55e' },
  { key: 'smsf',           label: 'SMSF',            headerColor: '#8b5cf6' },
  { key: 'coffee-runs',    label: 'Coffee Runs',     headerColor: '#f97316' },
  { key: 'sam-roberts',    label: 'Sam Roberts',     headerColor: '#14b8a6' },
];

function getColumnForEvent(ev: CalendarEvent, serviceTypes: ServiceType[]): string {
  // Lead overlays: route by source type
  if (ev.isLeadOverlay) {
    if (ev.source === 'fc-appt' || ev.source === 'booking') return 'first-consult';
    if (ev.source === 'fr-appt') return 'finance-run';
    if (ev.source === 'settlement') return 'property-sale';
    return 'first-consult';
  }
  const st = serviceTypes.find(s => s.id === ev.appointmentData?.serviceTypeId);
  const name = (st?.name ?? '').toLowerCase();
  const cat = (st?.category ?? '').toLowerCase();
  if (cat === 'first consult' || name.includes('first consult')) return 'first-consult';
  if (name.includes('finance run')) return 'finance-run';
  if (cat === 'property sale' || (name.includes('sale') && !name.includes('rebook'))) return 'property-sale';
  if (name.includes('smsf') || name.includes('super referral')) return 'smsf';
  if (name.includes('coffee') || name.includes('referral')) return 'coffee-runs';
  return 'sam-roberts'; // catch-all
}

// Service type → short abbreviation shown inside booking block (e.g. "FR · Joe")
function getServiceAbbr(serviceName: string): string {
  const n = serviceName.toLowerCase().replace(/[()]/g, '');
  if (n.includes('first consult')) return n.includes('rebook') ? 'FC ReBook' : 'FC';
  if (n.includes('finance run')) {
    if (n.includes('chase')) return 'FR Chase';
    if (n.includes('no deal')) return 'FR No Deal';
    if (n.includes('rebook')) return 'FR ReBook';
    return 'FR';
  }
  if (n.includes('coffee')) return 'CR';
  if (n.includes('referral')) {
    if (n.includes('joe')) return 'Ref Joe';
    if (n.includes('sam')) return 'Ref Sam';
    return 'Ref';
  }
  if (n.includes('property sale') || (n.includes('sale') && !n.includes('rebook'))) return 'PS';
  if (n.includes('sale') && n.includes('rebook')) return 'PS ReBook';
  if (n.includes('smsf')) return 'SMSF';
  if (n.includes('super referral') || n.includes('super')) return 'Super';
  if (n.includes('settlement prep')) return 'S.Prep';
  if (n.includes('settlement')) return 'Settle';
  if (n.includes('zoom')) return 'Zoom';
  if (n.includes('valuation')) return 'Val';
  if (n.includes('inspection')) return 'Insp';
  if (n.includes('signing')) return 'Sign';
  if (n.includes('pre-approval') || n.includes('pre approval')) return 'Pre-Appr';
  if (n.includes('follow up')) return 'Follow Up';
  if (n.includes('re-engagement') || n.includes('re engagement')) return 'Re-Eng';
  if (n.includes('central park')) return 'CP';
  // Fallback: initials of each word, max 5 chars
  return serviceName.split(/[\s-]+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 5);
}

// Greedy column-packing for overlapping events within a service column
function assignOverlapLayout(evs: CalendarEvent[]): Array<CalendarEvent & { evLeft: string; evWidth: string }> {
  if (evs.length === 0) return [];
  const toMins = (t: string) => {
    const [h, m] = (t || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const toStr = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const sorted = [...evs].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const colEnds: string[] = [];
  const assign: number[] = sorted.map(ev => {
    const sm = toMins(ev.startTime);
    for (let i = 0; i < colEnds.length; i++) {
      if (toMins(colEnds[i]) <= sm) {
        colEnds[i] = toStr(sm + (ev.durationMins ?? 30));
        return i;
      }
    }
    colEnds.push(toStr(sm + (ev.durationMins ?? 30)));
    return colEnds.length - 1;
  });
  const total = Math.max(colEnds.length, 1);
  return sorted.map((ev, i) => ({
    ...ev,
    evLeft: `${Math.round((assign[i] / total) * 100)}%`,
    evWidth: `${Math.round(100 / total)}%`,
  }));
}

type CalendarView = 'day' | 'week' | 'agenda';

type CalendarEventSource = 'appointment' | 'callback' | 'booking' | 'fc-appt' | 'fr-appt' | 'ps-appt' | 'settlement';

interface CalendarEvent {
  id: string;
  source: CalendarEventSource;
  date: string;
  startTime: string;
  endTime?: string;
  durationMins?: number;
  title: string;
  repId?: number;
  color: string;
  isLeadOverlay: boolean;
  appointmentData?: Appointment;
  leadId?: number;
}

const STATUS_BADGE_COLORS: Record<AppointmentStatus, string> = {
  'pencilled-in':           'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400',
  'confirmed':              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'arrived':                'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'started':                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'completed':              'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'no-show':                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'cancelled':              'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-500',
  'rebook-fc':              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'rebook-fr':              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'fc-complete-fr-booked':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'stopped-at-door':        'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'presented-no-sale':      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'did-not-qualify':        'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  'pencilled-in':           'Pencilled In',
  'confirmed':              'Confirmed',
  'arrived':                'Arrived',
  'started':                'Started',
  'completed':              'Completed',
  'no-show':                'No Show',
  'cancelled':              'Cancelled',
  'rebook-fc':              'ReBook FC',
  'rebook-fr':              'ReBook FR',
  'fc-complete-fr-booked':  'FC Done - FR Booked',
  'stopped-at-door':        'Stopped At Door',
  'presented-no-sale':      'Presented No Sale',
  'did-not-qualify':        'Did Not Qualify',
};

// ── Helper functions ──────────────────────────────────────────────────────────

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function formatDateLabel(dateStr: string, view: CalendarView): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (view === 'day') return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'week') {
    const weekDates = getWeekDates(dateStr);
    const start = new Date(weekDates[0] + 'T00:00:00');
    const end = new Date(weekDates[6] + 'T00:00:00');
    const startStr = start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function getWeekDates(date: string): string[] {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd.toISOString().split('T')[0];
  });
}

function navigateDate(date: string, view: CalendarView, direction: -1 | 1): string {
  // Parse as local date components to avoid UTC timezone shift (AU is UTC+8/10/11)
  const [y, m, day] = date.split('-').map(Number);
  const d = new Date(y, m - 1, day); // month is 0-indexed; creates LOCAL midnight
  if (view === 'day') d.setDate(d.getDate() + direction);
  else if (view === 'week') d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function slotTopPx(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const minsFromStart = (h - GRID_START_HOUR) * 60 + m;
  return (minsFromStart / SLOT_MINS) * SLOT_HEIGHT_PX;
}

function durationHeightPx(mins: number): number {
  return Math.max((mins / SLOT_MINS) * SLOT_HEIGHT_PX, SLOT_HEIGHT_PX * 0.6);
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${m}${ampm}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

interface ToolbarProps {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  focusDate: string;
  onFocusDateChange: (d: string) => void;
  reps: Rep[];
  repFilter: number | 'all';
  onRepFilter: (r: number | 'all') => void;
  serviceTypes: ServiceType[];
  serviceFilter: string[];
  onServiceFilter: (s: string[]) => void;
  onRunSheet?: () => void;
  onImportTimely?: () => void;
  showLegend?: boolean;
  onLegendToggle?: () => void;
}

function CalendarToolbar({
  view, onViewChange, focusDate, onFocusDateChange,
  reps, repFilter, onRepFilter, serviceTypes, serviceFilter, onServiceFilter,
  onRunSheet, onImportTimely, showLegend, onLegendToggle,
}: ToolbarProps) {
  const btnBase = 'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors';
  const btnActive = 'bg-amber-500 text-white';
  const btnInactive = 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700';

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* View toggle */}
      <div className="flex gap-1">
        {(['day', 'week', 'agenda'] as CalendarView[]).map((v) => (
          <button key={v} onClick={() => onViewChange(v)} className={`${btnBase} ${view === v ? btnActive : btnInactive}`}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <button
          onClick={() => onFocusDateChange(navigateDate(focusDate, view, -1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate px-1">
          {formatDateLabel(focusDate, view)}
        </span>
        <button
          onClick={() => onFocusDateChange(navigateDate(focusDate, view, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => onFocusDateChange(todayStr())}
          className={`${btnBase} ${btnInactive} text-xs`}
        >
          Today
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <select
          value={repFilter}
          onChange={e => onRepFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
        >
          <option value="all">All Staff</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button
          onClick={() => onLegendToggle?.()}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${showLegend ? 'bg-slate-700 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
        >
          🎨 <span className="hidden sm:inline">Legend</span>
        </button>
        <button
          onClick={() => onImportTimely?.()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
        >
          📥 <span className="hidden sm:inline">Import Timely</span>
        </button>
        <button
          onClick={() => onRunSheet?.()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
        >
          📋 <span className="hidden sm:inline">Run Sheet</span>
        </button>
      </div>
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────────────────────────

interface DayViewProps {
  events: CalendarEvent[];
  focusDate: string;
  reps: Rep[];
  repFilter: number | 'all';
  serviceTypes: ServiceType[];
  hiddenRepIds?: Set<number>;
  columns?: CalendarColumnDef[];
  onSlotClick: (slot: { date: string; time: string }) => void;
  onEventClick: (ev: CalendarEvent) => void;
}

function DayView({ events, focusDate, reps, repFilter, serviceTypes, hiddenRepIds, columns, onSlotClick, onEventClick }: DayViewProps) {
  const effectiveColumns = columns ?? CALENDAR_COLUMNS;
  const [currentTimePx, setCurrentTimePx] = useState<number | null>(null);
  const isToday = focusDate === todayStr();

  useEffect(() => {
    if (!isToday) { setCurrentTimePx(null); return; }
    const update = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      if (h < GRID_START_HOUR || h >= GRID_END_HOUR) { setCurrentTimePx(null); return; }
      setCurrentTimePx(((h - GRID_START_HOUR) * 60 + m) / SLOT_MINS * SLOT_HEIGHT_PX);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [isToday]);

  const totalSlots = (GRID_END_HOUR - GRID_START_HOUR) * (60 / SLOT_MINS);
  const gridHeight = totalSlots * SLOT_HEIGHT_PX;
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);

  // Events for this day, filtered by rep/hidden
  const dayEvents = useMemo(() => events.filter(ev => {
    if (ev.date !== focusDate) return false;
    if (repFilter !== 'all' && ev.repId !== repFilter) return false;
    if (ev.repId !== undefined && hiddenRepIds?.has(ev.repId)) return false;
    return true;
  }), [events, focusDate, repFilter, hiddenRepIds]);

  // Group events into service-type columns
  const columnEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    effectiveColumns.forEach(col => map.set(col.key, []));
    dayEvents.forEach(ev => {
      const key = getColumnForEvent(ev, serviceTypes);
      map.get(key)?.push(ev);
    });
    return map;
  }, [dayEvents, serviceTypes]);

  return (
    <div className="flex-1 flex overflow-hidden h-full">
      {/* Time labels column */}
      <div className="w-14 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 overflow-y-auto">
        {/* Spacer matching column header height */}
        <div style={{ height: 48 }} />
        <div className="relative" style={{ height: gridHeight + 32 }}>
          {hours.map(h => (
            <div
              key={h}
              className="absolute text-xs text-gray-400 dark:text-gray-500 text-right pr-2"
              style={{ top: (h - GRID_START_HOUR) * 2 * SLOT_HEIGHT_PX - 8, width: '100%' }}
            >
              {h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
            </div>
          ))}
        </div>
      </div>

      {/* Service-type columns */}
      <div className="flex-1 overflow-auto">
        <div className="flex" style={{ minWidth: effectiveColumns.length * 160 }}>
          {effectiveColumns.map(col => {
            const colEvs = columnEvents.get(col.key) ?? [];
            const positioned = assignOverlapLayout(colEvs);

            return (
              <div key={col.key} className="border-r border-gray-200 dark:border-slate-700 flex-1" style={{ minWidth: 160 }}>
                {/* Column header */}
                <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                  {/* Colour accent bar */}
                  <div className="h-1 w-full" style={{ backgroundColor: col.headerColor }} />
                  <div className="px-2 py-2 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{col.label}</span>
                    {colEvs.length > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white flex-shrink-0"
                        style={{ backgroundColor: col.headerColor }}
                      >
                        {colEvs.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Time grid */}
                <div className="relative" style={{ height: gridHeight }}>
                  {/* Clickable slots */}
                  {Array.from({ length: totalSlots }, (_, i) => {
                    const slotH = GRID_START_HOUR + Math.floor(i / 2);
                    const slotM = i % 2 === 0 ? '00' : '30';
                    const timeStr = `${String(slotH).padStart(2, '0')}:${slotM}`;
                    return (
                      <div
                        key={i}
                        onClick={() => onSlotClick({ date: focusDate, time: timeStr })}
                        className={`absolute w-full cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-900/10 transition-colors ${
                          i % 2 === 0
                            ? 'border-t border-gray-200 dark:border-slate-700'
                            : 'border-t border-gray-100 dark:border-slate-800/60'
                        }`}
                        style={{ top: i * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                      />
                    );
                  })}

                  {/* Current-time red line */}
                  {currentTimePx !== null && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{ top: currentTimePx }}
                    >
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  )}

                  {/* Event blocks — Timely style: service-type colour block, client name + abbr·rep label */}
                  {positioned.map(ev => {
                    const top = slotTopPx(ev.startTime);
                    const height = durationHeightPx(ev.durationMins ?? 30);
                    const rep = reps.find(r => r.id === ev.repId);
                    const repColor = rep?.color ?? '#9ca3af';
                    const blockColor = col.headerColor; // colour = service type (column), not rep
                    const isTall = height >= 52;
                    const isMed  = height >= 36;

                    // Build the "FR · Joe" tag shown below client name
                    const st = serviceTypes.find(s => s.id === ev.appointmentData?.serviceTypeId);
                    const abbr = st ? getServiceAbbr(st.name) : null;
                    const repFirst = rep?.name.split(' ')[0].toUpperCase() ?? null;
                    const typeRepTag = abbr && repFirst
                      ? `${abbr} · ${repFirst}`
                      : abbr ?? repFirst ?? null;

                    // For lead overlays (dashed), keep simpler styling
                    const isDashed = ev.isLeadOverlay;

                    return (
                      <div
                        key={ev.id}
                        onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                        className="absolute overflow-hidden rounded-md cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all z-10 select-none"
                        style={{
                          top,
                          height,
                          left: `calc(${ev.evLeft} + 2px)`,
                          width: `calc(${ev.evWidth} - 4px)`,
                          // Service-type tint background; rep colour on left border
                          backgroundColor: blockColor + '22',
                          borderLeft: `4px solid ${repColor}`,
                          borderTop: isDashed ? `1px dashed ${blockColor}88` : `1px solid ${blockColor}44`,
                          borderRight: isDashed ? `1px dashed ${blockColor}88` : `1px solid ${blockColor}33`,
                          borderBottom: isDashed ? `1px dashed ${blockColor}88` : `1px solid ${blockColor}33`,
                        }}
                      >
                        <div className="px-1.5 pt-0.5 pb-1 h-full flex flex-col overflow-hidden gap-0">
                          {isDashed && (
                            <span className="self-end text-[9px] opacity-60 leading-none">🔗</span>
                          )}

                          {/* ── PRIMARY: Client name ── */}
                          <div
                            className="text-xs font-extrabold leading-tight truncate"
                            style={{ color: blockColor }}
                          >
                            {ev.title}
                          </div>

                          {/* ── SECONDARY: Type abbr · Rep name (e.g. "FR · JOE") ── */}
                          {typeRepTag && (
                            <div
                              className="text-[10px] font-bold leading-tight truncate tracking-wide"
                              style={{ color: repColor }}
                            >
                              {typeRepTag}
                            </div>
                          )}

                          {/* ── Time range ── */}
                          {ev.startTime && isMed && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                              {formatTime(ev.startTime)}
                              {ev.endTime ? ` – ${formatTime(ev.endTime)}` : ''}
                            </div>
                          )}

                          {/* ── Status badge (bottom, only on tall blocks) ── */}
                          {ev.appointmentData && isTall && (
                            <div className="mt-auto pt-0.5">
                              <span className={`px-1 py-0.5 rounded text-[9px] font-semibold ${STATUS_BADGE_COLORS[ev.appointmentData.status]}`}>
                                {STATUS_LABELS[ev.appointmentData.status]}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────

interface WeekViewProps {
  events: CalendarEvent[];
  focusDate: string;
  reps: Rep[];
  serviceTypes: ServiceType[];
  onSlotClick: (slot: { date: string; time: string; repId?: number }) => void;
  onEventClick: (ev: CalendarEvent) => void;
  onDayClick: (date: string) => void;
}

function WeekView({ events, focusDate, reps, serviceTypes, onSlotClick, onEventClick, onDayClick }: WeekViewProps) {
  const weekDates = getWeekDates(focusDate);
  const today = todayStr();
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex-1 overflow-auto h-full">
      <div className="grid grid-cols-7 min-w-[700px]">
        {weekDates.map((date, idx) => {
          const dayEvents = events.filter(ev => ev.date === date);
          const timedEvents = dayEvents.filter(ev => ev.startTime).slice(0, 4);
          const allDayEvents = dayEvents.filter(ev => !ev.startTime);
          const overflow = dayEvents.filter(ev => ev.startTime).length - 4;
          const d = new Date(date + 'T00:00:00');
          const dayNum = d.getDate();
          const isToday = date === today;

          return (
            <div key={date} className="border-r border-b border-gray-200 dark:border-slate-700 min-h-[120px]">
              {/* Day header */}
              <div
                onClick={() => onDayClick(date)}
                className={`px-2 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-200 dark:border-slate-700 ${isToday ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-white dark:bg-slate-900'}`}
              >
                <div className="text-xs text-gray-500 dark:text-gray-400">{DAY_NAMES[idx]}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-amber-600' : 'text-gray-800 dark:text-gray-200'}`}>{dayNum}</div>
              </div>

              {/* All-day events */}
              {allDayEvents.map(ev => (
                <div
                  key={ev.id}
                  onClick={() => onEventClick(ev)}
                  className="mx-1 mb-1 mt-1 px-1.5 py-0.5 rounded text-xs cursor-pointer truncate font-medium"
                  style={{ backgroundColor: ev.color + '33', borderLeft: `3px solid ${ev.color}` }}
                >
                  {ev.isLeadOverlay ? '🔗 ' : ''}{ev.title}
                </div>
              ))}

              {/* Timed events */}
              <div className="px-1 py-1 space-y-0.5">
                {timedEvents.map(ev => {
                  const st = serviceTypes.find(s => s.id === ev.appointmentData?.serviceTypeId);
                  const rep = reps.find(r => r.id === ev.repId);
                  const abbr = st ? getServiceAbbr(st.name) : null;
                  const repFirst = rep?.name.split(' ')[0].toUpperCase();
                  const tag = abbr && repFirst ? `${abbr} · ${repFirst}` : abbr ?? repFirst ?? null;
                  const blockColor = ev.color; // service type colour
                  const repColor = rep?.color ?? ev.color;
                  return (
                    <div
                      key={ev.id}
                      onClick={() => onEventClick(ev)}
                      className="rounded px-1 py-0.5 cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: blockColor + '22', borderLeft: `2px solid ${repColor}` }}
                    >
                      <div className="text-[10px] font-bold truncate" style={{ color: blockColor }}>
                        {ev.isLeadOverlay ? '🔗 ' : ''}{ev.title}
                      </div>
                      {tag && (
                        <div className="text-[9px] font-semibold truncate" style={{ color: repColor }}>
                          {tag}
                        </div>
                      )}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <button
                    onClick={() => onDayClick(date)}
                    className="text-[10px] text-amber-600 hover:underline px-1"
                  >
                    +{overflow} more
                  </button>
                )}
                {/* Click to add */}
                <div
                  onClick={() => onSlotClick({ date, time: '09:00' })}
                  className="text-[10px] text-gray-300 dark:text-gray-600 hover:text-gray-500 cursor-pointer px-1 py-1"
                >
                  + Add
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Agenda View ───────────────────────────────────────────────────────────────

interface AgendaViewProps {
  events: CalendarEvent[];
  focusDate: string;
  leads: Lead[];
  reps: Rep[];
  serviceTypes: ServiceType[];
  onEventClick: (ev: CalendarEvent) => void;
  onLeadClick: (lead: Lead) => void;
}

function AgendaView({ events, focusDate, leads, reps, serviceTypes, onEventClick, onLeadClick }: AgendaViewProps) {
  const [daysAhead, setDaysAhead] = useState(30);
  const today = todayStr();
  const start = focusDate >= today ? focusDate : today;

  const endDate = useMemo(() => {
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  }, [start, daysAhead]);

  const groupedEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events
      .filter(ev => ev.date >= start && ev.date <= endDate)
      .forEach(ev => {
        if (!map.has(ev.date)) map.set(ev.date, []);
        map.get(ev.date)!.push(ev);
      });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, evs]) => ({
        date,
        label: new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        events: evs.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
      }));
  }, [events, start, endDate]);

  if (groupedEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        <div className="text-center">
          <Calendar size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No appointments in the next {daysAhead} days</p>
          <button onClick={() => setDaysAhead(d => d + 30)} className="mt-2 text-sm text-amber-600 hover:underline">
            Load more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {groupedEvents.map(group => (
        <div key={group.date}>
          <div className={`px-4 py-2 flex items-center gap-2 sticky top-0 z-10 ${group.date === today ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-gray-50 dark:bg-slate-800/50'} border-b border-gray-200 dark:border-slate-700`}>
            <span className={`text-sm font-semibold ${group.date === today ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>{group.label}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400">{group.events.length}</span>
          </div>
          {group.events.map(ev => {
            const st = ev.source === 'appointment' && ev.appointmentData
              ? serviceTypes.find(s => s.id === ev.appointmentData!.serviceTypeId)
              : null;
            const rep = reps.find(r => r.id === ev.repId);
            return (
              <div
                key={ev.id}
                onClick={() => {
                  if (ev.isLeadOverlay && ev.leadId) {
                    const lead = leads.find(l => l.id === ev.leadId);
                    if (lead) onLeadClick(lead);
                  } else {
                    onEventClick(ev);
                  }
                }}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <div className="w-16 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {ev.startTime ? formatTime(ev.startTime) : 'All day'}
                  {ev.endTime && <span className="block">{formatTime(ev.endTime)}</span>}
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ev.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {ev.isLeadOverlay && <span className="mr-1 text-xs">🔗</span>}{ev.title}
                  </div>
                  {st && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{st.name}</div>}
                  {ev.source !== 'appointment' && (
                    <div className="text-xs text-gray-400 capitalize">{ev.source.replace('-', ' ')}</div>
                  )}
                </div>
                {rep && <div className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 hidden sm:block">{rep.name}</div>}
                {ev.appointmentData && <StatusBadge status={ev.appointmentData.status} />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="p-4 text-center">
        <button onClick={() => setDaysAhead(d => d + 30)} className="text-sm text-amber-600 hover:underline px-4 py-2">
          Load next 30 days
        </button>
      </div>
    </div>
  );
}

// ── Run Sheet Modal ───────────────────────────────────────────────────────────

interface RunSheetModalProps {
  events: CalendarEvent[];
  focusDate: string;
  reps: Rep[];
  serviceTypes: ServiceType[];
  repFilter: number | 'all';
  onClose: () => void;
}

function RunSheetModal({ events, focusDate, reps, serviceTypes, repFilter, onClose }: RunSheetModalProps) {
  const todayEvents = useMemo(() => {
    return events
      .filter(e => e.date === focusDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events, focusDate]);

  const repName = repFilter === 'all'
    ? 'All Staff'
    : reps.find(r => r.id === repFilter)?.name ?? 'Unknown';

  const handlePrint = () => window.print();

  const formatTimeAMPM = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const getAddress = (event: CalendarEvent): string => {
    if (event.appointmentData?.clientAddress) return event.appointmentData.clientAddress;
    return '';
  };

  const getPhone = (event: CalendarEvent): string => {
    if (event.appointmentData?.clientPhone) return event.appointmentData.clientPhone;
    return '';
  };

  const getServiceName = (event: CalendarEvent): string => {
    if (!event.appointmentData) return event.source;
    return serviceTypes.find(s => s.id === event.appointmentData!.serviceTypeId)?.name ?? event.title;
  };

  const repColor = repFilter !== 'all' ? reps.find(r => r.id === repFilter)?.color : undefined;
  const formattedDate = new Date(focusDate + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto no-print">
      {/* Screen controls — hidden on print */}
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-3 no-print">
          <h2 className="text-lg font-bold text-white">Run Sheet</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg"
            >
              🖨️ Print
            </button>
            <button onClick={onClose} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg">
              ✕ Close
            </button>
          </div>
        </div>

        {/* Printable content */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden print-sheet">
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-200" style={{ borderTopColor: repColor ?? '#f59e0b', borderTopWidth: 4 }}>
            <div className="flex items-center gap-3">
              {repColor && <div className="w-4 h-4 rounded-full" style={{ backgroundColor: repColor }} />}
              <div>
                <h1 className="text-xl font-bold text-gray-900">Run Sheet — {repName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{formattedDate}</p>
              </div>
            </div>
          </div>

          {/* Appointments */}
          {todayEvents.length === 0 ? (
            <div className="px-8 py-12 text-center text-gray-400">
              <p className="text-lg">No appointments for this day</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {todayEvents.map((event) => {
                const address = getAddress(event);
                const phone = getPhone(event);
                const mapsUrl = address
                  ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
                  : null;
                const repForEvent = event.repId ? reps.find(r => r.id === event.repId) : null;
                return (
                  <div key={event.id} className="px-8 py-5 flex gap-6">
                    {/* Time column */}
                    <div className="w-24 flex-shrink-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatTimeAMPM(event.startTime)}
                      </div>
                      {event.endTime && (
                        <div className="text-xs text-gray-400 mt-0.5">→ {formatTimeAMPM(event.endTime)}</div>
                      )}
                    </div>
                    {/* Colour bar */}
                    <div className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: event.color }} />
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{event.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{getServiceName(event)}</p>
                        </div>
                        {repForEvent && repFilter === 'all' && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: repForEvent.color ?? '#9ca3af' }} />
                            <span className="text-xs text-gray-500">{repForEvent.name}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        {phone && (
                          <p className="text-sm text-gray-700">
                            📞 <a href={`tel:${phone}`} className="no-print">{phone}</a>
                            <span className="print-only hidden">{phone}</span>
                          </p>
                        )}
                        {address && (
                          <p className="text-sm text-gray-700">
                            📍 {mapsUrl ? (
                              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline no-print">
                                {address}
                              </a>
                            ) : address}
                            <span className="print-only hidden">{address}</span>
                          </p>
                        )}
                        {event.appointmentData?.notes && (
                          <p className="text-sm text-gray-500 italic">{event.appointmentData.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              ASG Live Leads — Generated {new Date().toLocaleDateString('en-AU')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar Legend ───────────────────────────────────────────────────────────

const LEGEND_CATEGORY_ORDER = ['First Consult', 'Finance Run', 'Property Sale', 'SMSF', 'Coffee Runs', 'General', 'Finance'];

interface CalendarLegendProps {
  reps: Rep[];
  serviceTypes: ServiceType[];
  hiddenRepIds: Set<number>;
  hiddenServiceTypeIds: Set<string>;
  columnOrder: string[];
  onToggleRep: (id: number) => void;
  onToggleServiceType: (id: string) => void;
  onMoveColumn: (key: string, dir: 'up' | 'down') => void;
  onDateJump: (date: string) => void;
  onClose: () => void;
}

function CalendarLegend({
  reps, serviceTypes, hiddenRepIds, hiddenServiceTypeIds, columnOrder,
  onToggleRep, onToggleServiceType, onMoveColumn, onDateJump, onClose,
}: CalendarLegendProps) {
  const [jumpDate, setJumpDate] = useState('');
  const categories = Array.from(new Set(serviceTypes.map(s => s.category))).sort((a, b) => {
    const ai = LEGEND_CATEGORY_ORDER.indexOf(a);
    const bi = LEGEND_CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="absolute top-14 right-4 z-30 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 p-4 max-h-[75vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Legend & Filters</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700">
          <X size={14} />
        </button>
      </div>

      {/* Team Members */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Team Members</p>
      <div className="space-y-1 mb-4">
        {reps.map(rep => (
          <label key={rep.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-gray-50 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              checked={!hiddenRepIds.has(rep.id)}
              onChange={() => onToggleRep(rep.id)}
              className="rounded accent-amber-500"
            />
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: rep.color ?? '#9ca3af' }} />
            <span className="text-sm text-gray-700 dark:text-gray-300">{rep.name}</span>
          </label>
        ))}
      </div>

      {/* Appointment Types by category */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Appointment Types</p>
      {categories.map(cat => (
        <div key={cat} className="mb-2.5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 px-1">{cat}</p>
          <div className="space-y-1">
            {serviceTypes.filter(s => s.category === cat).map(st => (
              <label key={st.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-gray-50 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={!hiddenServiceTypeIds.has(st.id)}
                  onChange={() => onToggleServiceType(st.id)}
                  className="rounded accent-amber-500"
                />
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st.color }} />
                <span className="text-xs text-gray-700 dark:text-gray-300">{st.name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Jump to date */}
      <div className="mt-3 border-t border-gray-200 dark:border-slate-700 pt-3">
        <p className="text-xs text-gray-500 dark:text-gray-500 mb-1.5">Jump to date</p>
        <input
          type="date"
          value={jumpDate}
          onChange={e => {
            setJumpDate(e.target.value);
            if (e.target.value) { onDateJump(e.target.value); onClose(); }
          }}
          className="w-full text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200"
        />
      </div>

      {/* Column Order */}
      <div className="mt-3 border-t border-gray-200 dark:border-slate-700 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Column Order</p>
        <div className="space-y-0.5">
          {columnOrder.map((key, idx) => {
            const col = CALENDAR_COLUMNS.find(c => c.key === key);
            if (!col) return null;
            return (
              <div key={key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-slate-800">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.headerColor }} />
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{col.label}</span>
                <button
                  disabled={idx === 0}
                  onClick={() => onMoveColumn(key, 'up')}
                  className="px-1 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                  title="Move left"
                >↑</button>
                <button
                  disabled={idx === columnOrder.length - 1}
                  onClick={() => onMoveColumn(key, 'down')}
                  className="px-1 text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                  title="Move right"
                >↓</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Calendar Client Panel ─────────────────────────────────────────────────────

interface CalendarClientPanelProps {
  lead: Lead;
  reps: Rep[];
  serviceTypes: ServiceType[];
  events: CalendarEvent[];
  onEditAppointment: (appt: Appointment) => void;
  onViewProfile: (lead: Lead) => void;
  onClose: () => void;
}

function CalendarClientPanel({
  lead, reps, serviceTypes, events, onEditAppointment, onViewProfile, onClose,
}: CalendarClientPanelProps) {
  const relatedAppointments = events
    .filter(ev => ev.leadId === lead.id && ev.appointmentData)
    .map(ev => ev.appointmentData!);

  return (
    <div className="hidden lg:flex flex-col w-96 flex-shrink-0 border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{lead.name}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Contact info */}
        <div className="space-y-1">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-amber-600 hover:underline">
              📞 {lead.phone}
            </a>
          )}
          {lead.suburb && <p className="text-sm text-gray-500 dark:text-gray-400">📍 {lead.suburb}</p>}
          {lead.dealStage && (
            <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs font-medium">
              {lead.dealStage}
            </span>
          )}
        </div>

        {/* Calendar appointments linked to this lead */}
        {relatedAppointments.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Appointments</p>
            <div className="space-y-2">
              {relatedAppointments.map(appt => {
                const st = serviceTypes.find(s => s.id === appt.serviceTypeId);
                const rep = reps.find(r => r.id === appt.repId);
                return (
                  <div key={appt.id} className="p-2.5 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{st?.name ?? 'Appointment'}</span>
                      <StatusBadge status={appt.status} />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(appt.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {appt.startTime && ` · ${formatTime(appt.startTime)}`}
                      {rep && ` · ${rep.name.split(' ')[0]}`}
                    </div>
                    {appt.notes && <p className="text-xs text-gray-400 mt-1 italic">{appt.notes}</p>}
                    <button
                      onClick={() => onEditAppointment(appt)}
                      className="mt-1.5 text-xs text-amber-600 hover:underline"
                    >
                      ✏️ Edit appointment
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent call history */}
        {lead.callHistory && lead.callHistory.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Calls</p>
            <div className="space-y-1.5">
              {lead.callHistory.slice(-5).reverse().map((call, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 flex-shrink-0 w-16">
                    {new Date(call.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{String(call.result).replace(/-/g, ' ')}</span>
                  {call.rep && <span className="text-gray-400">· {call.rep}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line">{lead.notes}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700">
        <button
          onClick={() => onViewProfile(lead)}
          className="w-full px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium"
        >
          View Full Profile →
        </button>
      </div>
    </div>
  );
}

// ── Main CalendarPage ─────────────────────────────────────────────────────────

interface CalendarPageProps {
  onViewClientProfile?: (lead: Lead) => void;
}

export function CalendarPage({ onViewClientProfile }: CalendarPageProps) {
  const { currentUser, reps } = useAppStore();
  const { showToast } = useToast();
  const { leads } = useLeads();
  const { save: saveLead } = useSaveLead();
  const { remove: deleteLead } = useDeleteLead();
  const { serviceTypes } = useServiceTypes();
  const { save: saveSvcType } = useSaveServiceType();
  const { save: saveAppt } = useSaveAppointment();
  const { remove: deleteAppt } = useDeleteAppointment();
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const handleLoadDefaultServiceTypes = async () => {
    setLoadingDefaults(true);
    try {
      for (const st of DEFAULT_SERVICE_TYPES) {
        const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await saveSvcType({ id, ...st });
        await new Promise(r => setTimeout(r, 60));
      }
      showToast(`✅ ${DEFAULT_SERVICE_TYPES.length} service types loaded`, 'success');
    } catch {
      showToast('❌ Failed to load defaults', 'error');
    } finally {
      setLoadingDefaults(false);
    }
  };

  // Column ordering — persisted to localStorage
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('asgCalColOrder');
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        const allKeys = CALENDAR_COLUMNS.map(c => c.key);
        const valid = parsed.filter(k => allKeys.includes(k));
        const missing = allKeys.filter(k => !valid.includes(k));
        return [...valid, ...missing];
      }
    } catch { /* ignore */ }
    return CALENDAR_COLUMNS.map(c => c.key);
  });

  const orderedColumns = useMemo(() =>
    columnOrder.map(k => CALENDAR_COLUMNS.find(c => c.key === k)).filter(Boolean) as typeof CALENDAR_COLUMNS,
    [columnOrder]
  );

  const handleMoveColumn = (key: string, dir: 'up' | 'down') => {
    setColumnOrder(prev => {
      const arr = [...prev];
      const idx = arr.indexOf(key);
      if (dir === 'up' && idx > 0) { [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]; }
      else if (dir === 'down' && idx < arr.length - 1) { [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; }
      localStorage.setItem('asgCalColOrder', JSON.stringify(arr));
      return arr;
    });
  };

  const [view, setView] = useState<CalendarView>('day');
  const [focusDate, setFocusDate] = useState<string>(todayStr());
  const [repFilter, setRepFilter] = useState<number | 'all'>('all');
  const [serviceFilter, setServiceFilter] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [prefilledTime, setPrefilledTime] = useState<{ date: string; time: string; repId?: number } | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showRunSheet, setShowRunSheet] = useState(false);
  const [showTimelyImport, setShowTimelyImport] = useState(false);
  // Legend + filtering
  const [showLegend, setShowLegend] = useState(false);
  const [hiddenRepIds, setHiddenRepIds] = useState<Set<number>>(new Set());
  const [hiddenServiceTypeIds, setHiddenServiceTypeIds] = useState<Set<string>>(new Set());
  // Client panel (shows when clicking linked calendar appointment)
  const [clientPanelLead, setClientPanelLead] = useState<Lead | null>(null);

  // Reps visible on calendar (respect showOnCalendar flag)
  const visibleReps = useMemo(() =>
    reps.filter(r => r.active && r.showOnCalendar !== false),
    [reps]
  );

  const dateRange = useMemo(() => {
    const d = new Date(focusDate + 'T00:00:00');
    const from = new Date(d);
    from.setDate(from.getDate() - 14);
    const to = new Date(d);
    to.setDate(to.getDate() + 45);
    return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
  }, [focusDate]);

  const { appointments } = useAppointments(dateRange);

  const allEvents = useMemo((): CalendarEvent[] => {
    const events: CalendarEvent[] = [];

    // Standalone appointments
    appointments.forEach((a) => {
      events.push({
        id: a.id,
        source: 'appointment',
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        durationMins: a.durationMins,
        title: a.title,
        repId: a.repId,
        color: resolveEventColor(a.repId, a.serviceTypeId, reps, serviceTypes),
        isLeadOverlay: false,
        appointmentData: a,
      });
    });

    // Lead overlays
    leads.forEach((lead) => {
      const leadId = lead.id;
      const name = lead.name ?? 'Unknown';

      if (lead.callbackDate && lead.status === 'Revisit') {
        events.push({
          id: `lead-${leadId}-cb`,
          source: 'callback',
          date: lead.callbackDate,
          startTime: lead.callbackTime ?? '',
          title: `📞 ${name}`,
          repId: lead.dqRep,
          color: '#f97316',
          isLeadOverlay: true,
          leadId,
        });
      }
      if (lead.bookingDate) {
        events.push({
          id: `lead-${leadId}-bk`,
          source: 'booking',
          date: lead.bookingDate,
          startTime: lead.bookingTime ?? '',
          title: `🗓 ${name}`,
          repId: lead.fcRep ?? lead.dqRep,
          color: '#8b5cf6',
          isLeadOverlay: true,
          leadId,
        });
      }
      if (lead.fcAppt?.date) {
        events.push({
          id: `lead-${leadId}-fc`,
          source: 'fc-appt',
          date: lead.fcAppt.date,
          startTime: '',
          title: `FC: ${name}`,
          repId: lead.fcAppt.repId ?? lead.fcRep,
          color: '#ef4444',
          isLeadOverlay: true,
          leadId,
        });
      }
      if (lead.frAppt?.date) {
        events.push({
          id: `lead-${leadId}-fr`,
          source: 'fr-appt',
          date: lead.frAppt.date,
          startTime: '',
          title: `FR: ${name}`,
          repId: lead.frAppt.repId ?? lead.frRep,
          color: '#22c55e',
          isLeadOverlay: true,
          leadId,
        });
      }
      if (lead.settlementDate) {
        events.push({
          id: `lead-${leadId}-st`,
          source: 'settlement',
          date: lead.settlementDate,
          startTime: '',
          title: `🏦 ${name}`,
          repId: lead.psRep,
          color: '#f59e0b',
          isLeadOverlay: true,
          leadId,
        });
      }
    });

    return events;
  }, [appointments, leads, serviceTypes, reps]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((ev) => {
      if (repFilter !== 'all' && ev.repId !== repFilter) return false;
      if (serviceFilter.length > 0 && ev.source === 'appointment' && ev.appointmentData) {
        if (!serviceFilter.includes(ev.appointmentData.serviceTypeId)) return false;
      }
      // Legend hide filters
      if (ev.repId !== undefined && hiddenRepIds.has(ev.repId)) return false;
      if (ev.appointmentData && hiddenServiceTypeIds.has(ev.appointmentData.serviceTypeId)) return false;
      return true;
    });
  }, [allEvents, repFilter, serviceFilter, hiddenRepIds, hiddenServiceTypeIds]);

  const handleSaveAppt = async (appt: Appointment) => {
    const ok = await saveAppt(appt);
    if (ok) showToast('✅ Appointment saved', 'success');
    else showToast('❌ Failed to save appointment', 'error');
    setModalOpen(false);
    setEditingAppt(null);
  };

  const handleDeleteAppt = async (id: string) => {
    await deleteAppt(id);
    showToast('Appointment deleted', 'success');
    setModalOpen(false);
    setEditingAppt(null);
  };

  const handleEventClick = useCallback((ev: CalendarEvent) => {
    if (ev.isLeadOverlay && ev.leadId) {
      const lead = leads.find(l => l.id === ev.leadId) ?? null;
      setSelectedLead(lead);
    } else if (ev.appointmentData) {
      // If appointment is linked to a lead, open client panel instead of modal
      const linkedLead = ev.appointmentData.linkedLeadId
        ? leads.find(l => l.id === ev.appointmentData!.linkedLeadId) ?? null
        : null;
      if (linkedLead) {
        setClientPanelLead(linkedLead);
        setSelectedLead(null);
      } else {
        setClientPanelLead(null);
        setEditingAppt(ev.appointmentData);
        setPrefilledTime(null);
        setModalOpen(true);
      }
    }
  }, [leads]);

  const handleSaveLeadFromSidebar = useCallback((lead: Lead) => {
    saveLead(lead);
  }, [saveLead]);

  const handleDeleteLeadFromSidebar = useCallback((lead: Lead) => {
    deleteLead(lead.id);
    setSelectedLead(null);
  }, [deleteLead]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-slate-900">
      <div className="relative">
        <CalendarToolbar
          view={view}
          onViewChange={setView}
          focusDate={focusDate}
          onFocusDateChange={setFocusDate}
          reps={visibleReps}
          repFilter={repFilter}
          onRepFilter={setRepFilter}
          serviceTypes={serviceTypes}
          serviceFilter={serviceFilter}
          onServiceFilter={setServiceFilter}
          onRunSheet={() => setShowRunSheet(true)}
          onImportTimely={() => setShowTimelyImport(true)}
          showLegend={showLegend}
          onLegendToggle={() => setShowLegend(s => !s)}
        />
        {showLegend && (
          <CalendarLegend
            reps={visibleReps}
            serviceTypes={serviceTypes}
            hiddenRepIds={hiddenRepIds}
            hiddenServiceTypeIds={hiddenServiceTypeIds}
            columnOrder={columnOrder}
            onMoveColumn={handleMoveColumn}
            onToggleRep={(id) => setHiddenRepIds(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })}
            onToggleServiceType={(id) => setHiddenServiceTypeIds(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })}
            onDateJump={(date) => { setFocusDate(date); }}
            onClose={() => setShowLegend(false)}
          />
        )}
      </div>

      {/* Empty service types banner */}
      {serviceTypes.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300 flex-shrink-0">
          <span className="text-base">📋</span>
          <span className="flex-1">No appointment types configured — the calendar columns won't show until you load the defaults.</span>
          {isAdmin && (
            <button
              onClick={handleLoadDefaultServiceTypes}
              disabled={loadingDefaults}
              className="px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 transition flex-shrink-0"
            >
              {loadingDefaults ? 'Loading…' : 'Load Defaults'}
            </button>
          )}
          {!isAdmin && <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">Ask your manager to load service types in Admin → Calendar Settings.</span>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {view === 'day' && (
            <DayView
              events={filteredEvents}
              focusDate={focusDate}
              reps={visibleReps}
              repFilter={repFilter}
              serviceTypes={serviceTypes}
              hiddenRepIds={hiddenRepIds}
              columns={orderedColumns}
              onSlotClick={(slot) => { setPrefilledTime(slot); setEditingAppt(null); setModalOpen(true); }}
              onEventClick={handleEventClick}
            />
          )}
          {view === 'week' && (
            <WeekView
              events={filteredEvents}
              focusDate={focusDate}
              reps={visibleReps}
              serviceTypes={serviceTypes}
              onSlotClick={(slot) => { setPrefilledTime(slot); setEditingAppt(null); setModalOpen(true); }}
              onEventClick={handleEventClick}
              onDayClick={(date) => { setFocusDate(date); setView('day'); }}
            />
          )}
          {view === 'agenda' && (
            <AgendaView
              events={filteredEvents}
              focusDate={focusDate}
              leads={leads}
              reps={visibleReps}
              serviceTypes={serviceTypes}
              onEventClick={handleEventClick}
              onLeadClick={setSelectedLead}
            />
          )}
        </div>

        {/* Client panel — shown when clicking appointment linked to a lead */}
        {clientPanelLead && (
          <CalendarClientPanel
            lead={clientPanelLead}
            reps={reps}
            serviceTypes={serviceTypes}
            events={allEvents}
            onEditAppointment={(appt) => {
              setClientPanelLead(null);
              setEditingAppt(appt);
              setPrefilledTime(null);
              setModalOpen(true);
            }}
            onViewProfile={(lead) => {
              setClientPanelLead(null);
              onViewClientProfile?.(lead);
            }}
            onClose={() => setClientPanelLead(null)}
          />
        )}
      </div>

      {selectedLead && (
        <LeadSidebar
          lead={selectedLead}
          mode="modal"
          onClose={() => setSelectedLead(null)}
          onSave={handleSaveLeadFromSidebar}
          onDelete={handleDeleteLeadFromSidebar}
          onCall={() => {}}
        />
      )}

      {modalOpen && currentUser && (
        <AppointmentModal
          appointment={editingAppt}
          prefilled={prefilledTime}
          serviceTypes={serviceTypes}
          reps={reps}
          leads={leads}
          currentUser={currentUser}
          onSave={handleSaveAppt}
          onDelete={handleDeleteAppt}
          onClose={() => { setModalOpen(false); setEditingAppt(null); }}
        />
      )}

      {showRunSheet && (
        <RunSheetModal
          events={filteredEvents}
          focusDate={focusDate}
          reps={reps}
          serviceTypes={serviceTypes}
          repFilter={repFilter}
          onClose={() => setShowRunSheet(false)}
        />
      )}

      {showTimelyImport && (
        <Suspense fallback={null}>
          <TimelyCSVImportModal
            onClose={() => setShowTimelyImport(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
