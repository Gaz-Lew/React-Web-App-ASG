/**
 * TimelyCSVImportModal — Import appointments from a Timely CSV export
 *
 * 3-step wizard:
 *   1. Upload CSV file from Timely
 *   2. Map CSV columns → appointment fields
 *   3. Match service names → ServiceType, staff names → Rep, then import
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { X, Upload, ChevronRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useServiceTypes, useSaveAppointment } from '../hooks/useFirebase';
import { useToast } from '../context/ToastContext';
import { Appointment, AppointmentStatus, ServiceType, Rep } from '../types';

// ── CSV parser (handles quoted fields with embedded commas + escaped quotes) ──

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === '\n' && !inQ) {
      lines.push(cur); cur = '';
    } else if (ch === '\r' && !inQ) {
      // skip
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        cells.push(cell.trim()); cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headerLine, ...dataLines] = nonEmpty;
  return {
    headers: parseRow(headerLine).map(h => h.toLowerCase().trim()),
    rows: dataLines.map(parseRow),
  };
}

// ── Date / time parsers ──────────────────────────────────────────────────────

function parseTimelyDate(raw: string): string {
  if (!raw?.trim()) return '';
  const s = raw.trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // DD-MM-YYYY
  const dmyD = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyD) return `${dmyD[3]}-${dmyD[2].padStart(2,'0')}-${dmyD[1].padStart(2,'0')}`;
  // MM/DD/YYYY (US)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // "24 Mar 2026" or "March 24, 2026"
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

function parseTimelyTime(raw: string): string {
  if (!raw?.trim()) return '';
  const s = raw.trim().toLowerCase().replace(/\s/g, '');
  // HH:MM:SS or HH:MM
  const hms = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hms) return `${hms[1].padStart(2,'0')}:${hms[2]}`;
  // 10:00am / 10:00pm
  const ampm = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = ampm[2];
    if (ampm[3] === 'pm' && h < 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${m}`;
  }
  return '';
}

function parseTimelyStatus(raw: string): AppointmentStatus {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'confirmed' || s === 'confirm') return 'confirmed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'completed' || s === 'done' || s === 'complete') return 'completed';
  if (s === 'no show' || s === 'noshow' || s === 'no-show') return 'no-show';
  if (s === 'pencilled in' || s === 'pencilled-in' || s === 'tentative') return 'pencilled-in';
  return 'pencilled-in';
}

// ── Column aliases (maps Timely CSV headers → our field names) ───────────────

type AppointmentField =
  | 'date' | 'startTime' | 'endTime'
  | 'clientName' | 'clientPhone' | 'clientEmail' | 'clientAddress'
  | 'serviceName' | 'staffName' | 'status' | 'notes';

const ALIASES: Record<string, AppointmentField> = {
  'date': 'date', 'appointment date': 'date', 'appt date': 'date', 'start date': 'date',
  'start': 'startTime', 'start time': 'startTime', 'time': 'startTime', 'from': 'startTime',
  'end': 'endTime', 'end time': 'endTime', 'finish': 'endTime', 'finish time': 'endTime',
  'client': 'clientName', 'client name': 'clientName', 'name': 'clientName', 'customer': 'clientName',
  'mobile': 'clientPhone', 'phone': 'clientPhone', 'client phone': 'clientPhone',
  'client mobile': 'clientPhone', 'contact': 'clientPhone', 'number': 'clientPhone',
  'email': 'clientEmail', 'client email': 'clientEmail', 'e-mail': 'clientEmail',
  'address': 'clientAddress', 'client address': 'clientAddress', 'location': 'clientAddress',
  'service': 'serviceName', 'service name': 'serviceName', 'appointment type': 'serviceName',
  'treatment': 'serviceName', 'type': 'serviceName',
  'staff': 'staffName', 'rep': 'staffName', 'therapist': 'staffName', 'employee': 'staffName',
  'practitioner': 'staffName', 'provider': 'staffName',
  'status': 'status', 'appointment status': 'status', 'booking status': 'status',
  'notes': 'notes', 'client notes': 'notes', 'note': 'notes', 'comments': 'notes',
};

const FIELD_LABELS: Record<AppointmentField, string> = {
  date: 'Date',
  startTime: 'Start Time',
  endTime: 'End Time',
  clientName: 'Client Name',
  clientPhone: 'Client Phone',
  clientEmail: 'Client Email',
  clientAddress: 'Client Address',
  serviceName: 'Service Type',
  staffName: 'Staff / Rep',
  status: 'Status',
  notes: 'Notes',
};

// ── Fuzzy service type matcher ───────────────────────────────────────────────

function fuzzyMatchServiceType(timelyName: string, serviceTypes: ServiceType[]): string {
  const n = timelyName.toLowerCase();
  // Exact match first
  const exact = serviceTypes.find(st => st.name.toLowerCase() === n);
  if (exact) return exact.id;
  // Keyword matching
  if (n.includes('first consult') || n.includes('fc')) {
    const fc = serviceTypes.find(st => st.name.toLowerCase().includes('first consult') && !st.name.toLowerCase().includes('rebook'));
    if (fc) return fc.id;
  }
  if (n.includes('finance run') || (n.includes('finance') && n.includes('run'))) {
    if (n.includes('chase')) {
      const ch = serviceTypes.find(st => st.name.toLowerCase().includes('chase'));
      if (ch) return ch.id;
    }
    if (n.includes('rebook') || n.includes('re-book')) {
      const rb = serviceTypes.find(st => st.name.toLowerCase().includes('rebook') && st.name.toLowerCase().includes('finance'));
      if (rb) return rb.id;
    }
    if (n.includes('no deal') || n.includes('nodeal')) {
      const nd = serviceTypes.find(st => st.name.toLowerCase().includes('no deal'));
      if (nd) return nd.id;
    }
    const fr = serviceTypes.find(st => st.name.toLowerCase().includes('finance run') && !st.name.toLowerCase().includes('chase') && !st.name.toLowerCase().includes('rebook'));
    if (fr) return fr.id;
  }
  if (n.includes('coffee')) {
    const cr = serviceTypes.find(st => st.name.toLowerCase().includes('coffee'));
    if (cr) return cr.id;
  }
  if (n.includes('property sale') || n.includes('sale')) {
    const ps = serviceTypes.find(st => st.name.toLowerCase().includes('property sale') || st.name.toLowerCase() === 'sale');
    if (ps) return ps.id;
  }
  if (n.includes('smsf')) {
    const sm = serviceTypes.find(st => st.name.toLowerCase().includes('smsf'));
    if (sm) return sm.id;
  }
  if (n.includes('settlement') && n.includes('prep')) {
    const sp = serviceTypes.find(st => st.name.toLowerCase().includes('settlement prep'));
    if (sp) return sp.id;
  }
  if (n.includes('settlement')) {
    const s = serviceTypes.find(st => st.name.toLowerCase() === 'settlement');
    if (s) return s.id;
  }
  // Name contains a rep's name + service type (e.g. "Blake - Finance Run") → match the service part
  for (const st of serviceTypes) {
    if (n.includes(st.name.toLowerCase())) return st.id;
  }
  return '';
}

// ── Fuzzy rep matcher ────────────────────────────────────────────────────────

function fuzzyMatchRep(timelyStaff: string, reps: Rep[]): number | '' {
  const n = timelyStaff.toLowerCase().trim();
  if (!n) return '';
  // Exact full name
  const exact = reps.find(r => r.name.toLowerCase() === n);
  if (exact) return exact.id;
  // First name match
  const firstMatch = reps.find(r => n.startsWith(r.name.split(' ')[0].toLowerCase()) || r.name.split(' ')[0].toLowerCase() === n.split(' ')[0]);
  if (firstMatch) return firstMatch.id;
  // Name contains rep's first name
  const contains = reps.find(r => n.includes(r.name.split(' ')[0].toLowerCase()));
  if (contains) return contains.id;
  return '';
}

// ── Main Component ────────────────────────────────────────────────────────────

interface TimelyCSVImportModalProps {
  onClose: () => void;
}

type Step = 1 | 2 | 3;

export function TimelyCSVImportModal({ onClose }: TimelyCSVImportModalProps) {
  const { currentUser, reps } = useAppStore();
  const { serviceTypes } = useServiceTypes();
  const { save: saveAppt } = useSaveAppointment();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<Record<string, AppointmentField | ''>>({});
  const [serviceMap, setServiceMap] = useState<Record<string, string>>({}); // timelyName → serviceTypeId
  const [staffMap, setStaffMap] = useState<Record<string, number | ''>>({}); // timelyStaff → repId
  const [defaultStatus, setDefaultStatus] = useState<AppointmentStatus>('confirmed');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeReps = useMemo(() => reps.filter(r => r.active), [reps]);

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) ?? '';
      const { headers: h, rows: r } = parseCSV(text);
      if (!h.length) { showToast('Could not parse CSV — check the file format', 'error'); return; }
      setHeaders(h);
      setRows(r.filter(row => row.some(c => c.trim())).slice(0, 1000));
      // Auto-map columns
      const auto: Record<string, AppointmentField | ''> = {};
      h.forEach(header => { auto[header] = ALIASES[header] ?? ''; });
      setColMap(auto);
      setStep(2);
    };
    reader.readAsText(file);
  }, [showToast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Step 2 → 3: Build unique service names + staff names for matching ───────

  const getCol = useCallback((row: string[], field: AppointmentField): string => {
    const header = Object.keys(colMap).find(h => colMap[h] === field);
    if (!header) return '';
    const idx = headers.indexOf(header);
    return (row[idx] ?? '').trim();
  }, [colMap, headers]);

  const goToStep3 = useCallback(() => {
    const uniqueServices = [...new Set(rows.map(r => getCol(r, 'serviceName')).filter(Boolean))];
    const uniqueStaff = [...new Set(rows.map(r => getCol(r, 'staffName')).filter(Boolean))];

    const svcMap: Record<string, string> = {};
    uniqueServices.forEach(s => { svcMap[s] = fuzzyMatchServiceType(s, serviceTypes); });
    setServiceMap(svcMap);

    const stMap: Record<string, number | ''> = {};
    uniqueStaff.forEach(s => { stMap[s] = fuzzyMatchRep(s, activeReps); });
    setStaffMap(stMap);

    setStep(3);
  }, [rows, getCol, serviceTypes, activeReps]);

  // ── Step 3: Import ──────────────────────────────────────────────────────────

  const validRows = useMemo(() => rows.filter(row => {
    const date = parseTimelyDate(getCol(row, 'date'));
    const time = parseTimelyTime(getCol(row, 'startTime'));
    return date && time;
  }), [rows, getCol]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    let added = 0, skipped = 0;

    for (const row of validRows) {
      const date = parseTimelyDate(getCol(row, 'date'));
      const startTime = parseTimelyTime(getCol(row, 'startTime'));
      const endTimeRaw = parseTimelyTime(getCol(row, 'endTime'));
      const clientName = getCol(row, 'clientName');
      const clientPhone = getCol(row, 'clientPhone');
      const clientEmail = getCol(row, 'clientEmail');
      const clientAddress = getCol(row, 'clientAddress');
      const timelyService = getCol(row, 'serviceName');
      const timelyStaff = getCol(row, 'staffName');
      const statusRaw = getCol(row, 'status');
      const notes = getCol(row, 'notes');

      const serviceTypeId = serviceMap[timelyService] ?? '';
      const repId = staffMap[timelyStaff] ?? '';

      if (!serviceTypeId || !repId) { skipped++; continue; }

      // Compute duration from start/end time
      let durationMins: number | undefined;
      if (startTime && endTimeRaw) {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTimeRaw.split(':').map(Number);
        const calc = (eh * 60 + em) - (sh * 60 + sm);
        if (calc > 0) durationMins = calc;
      }
      if (!durationMins) {
        const st = serviceTypes.find(s => s.id === serviceTypeId);
        durationMins = st?.defaultDuration;
      }

      // Compute endTime from duration if not in CSV
      let endTime = endTimeRaw || undefined;
      if (!endTime && startTime && durationMins) {
        const [sh, sm] = startTime.split(':').map(Number);
        const endMins = sh * 60 + sm + durationMins;
        endTime = `${String(Math.floor(endMins / 60)).padStart(2,'0')}:${String(endMins % 60).padStart(2,'0')}`;
      }

      const appt: Appointment = {
        id: `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: clientName || 'Unknown',
        serviceTypeId,
        repId: Number(repId),
        date,
        startTime,
        endTime,
        durationMins,
        status: statusRaw ? parseTimelyStatus(statusRaw) : defaultStatus,
        notes: notes || undefined,
        clientName: clientName || undefined,
        clientPhone: clientPhone || undefined,
        clientEmail: clientEmail || undefined,
        clientAddress: clientAddress || undefined,
        createdBy: currentUser?.name ?? 'Import',
        createdAt: Date.now(),
      };

      try {
        await saveAppt(appt);
        added++;
      } catch {
        skipped++;
      }
    }

    setImporting(false);
    setResult({ added, skipped });
    showToast(`✅ ${added} appointment${added !== 1 ? 's' : ''} imported`, 'success');
  }, [validRows, getCol, serviceMap, staffMap, serviceTypes, defaultStatus, currentUser, saveAppt, showToast]);

  // ── UI helpers ──────────────────────────────────────────────────────────────

  const inputCls = 'w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500';
  const unmappedServices = Object.values(serviceMap).filter(v => !v).length;
  const unmappedStaff = Object.values(staffMap).filter(v => !v).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">📥 Import from Timely</h2>
            <p className="text-xs text-gray-400 mt-0.5">Step {step} of 3 — {step === 1 ? 'Upload CSV' : step === 2 ? 'Map Columns' : 'Match & Import'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-[var(--surface)] flex-shrink-0">
          <div className="h-1 bg-amber-500 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
                <p className="font-semibold mb-1">How to export from Timely</p>
                <ol className="list-decimal ml-4 space-y-1 text-xs">
                  <li>In Timely, go to <strong>Reports → Appointments</strong></li>
                  <li>Set your date range (e.g. last 6 months or all time)</li>
                  <li>Click <strong>Export → Download CSV</strong></li>
                  <li>Upload that CSV file below</li>
                </ol>
              </div>

              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-white/[0.08] rounded-xl p-10 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors"
              >
                <Upload size={28} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Drop your Timely CSV here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: Map Columns ─────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Found <strong>{rows.length}</strong> rows. Map each CSV column to an appointment field (auto-detected below).
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/[0.06]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[var(--surface)] text-left">
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500">CSV Column</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500">Sample Value</th>
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500">Maps To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => {
                      const sample = rows.slice(0, 3).map(r => r[i]).filter(Boolean).join(', ');
                      return (
                        <tr key={h} className="border-t border-gray-100 dark:border-white/[0.06]">
                          <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{h}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[120px]">{sample || '—'}</td>
                          <td className="px-3 py-2">
                            <select
                              value={colMap[h] ?? ''}
                              onChange={e => setColMap(prev => ({ ...prev, [h]: e.target.value as AppointmentField | '' }))}
                              className={inputCls + ' text-xs py-1'}
                            >
                              <option value="">— Ignore —</option>
                              {(Object.keys(FIELD_LABELS) as AppointmentField[]).map(f => (
                                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Required fields mapped:</span>
                {(['date', 'startTime', 'serviceName', 'staffName'] as AppointmentField[]).map(f => {
                  const mapped = Object.values(colMap).includes(f);
                  return (
                    <span key={f} className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${mapped ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-[var(--hover)]'}`}>
                      {mapped ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                      {FIELD_LABELS[f]}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 3: Match & Import ──────────────────────────────────────── */}
          {step === 3 && !result && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>{validRows.length}</strong> valid appointments found. Map Timely service names and staff to your system records.
              </p>

              {/* Service type matcher */}
              {Object.keys(serviceMap).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Service Types</p>
                    {unmappedServices > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                        {unmappedServices} unmapped
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
                    {Object.entries(serviceMap).map(([timelyName, stId]) => (
                      <div key={timelyName} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] last:border-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-48 flex-shrink-0 truncate italic">"{timelyName}"</span>
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                        <select
                          value={stId}
                          onChange={e => setServiceMap(prev => ({ ...prev, [timelyName]: e.target.value }))}
                          className={`flex-1 ${inputCls} text-xs py-1 ${!stId ? 'border-amber-300 ring-1 ring-amber-300' : ''}`}
                        >
                          <option value="">— Not mapped (skip) —</option>
                          {serviceTypes.map(st => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff matcher */}
              {Object.keys(staffMap).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Staff Members</p>
                    {unmappedStaff > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                        {unmappedStaff} unmapped
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
                    {Object.entries(staffMap).map(([timelyStaff, repId]) => (
                      <div key={timelyStaff} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] last:border-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-48 flex-shrink-0 truncate italic">"{timelyStaff}"</span>
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                        <select
                          value={repId === '' ? '' : String(repId)}
                          onChange={e => setStaffMap(prev => ({ ...prev, [timelyStaff]: e.target.value ? Number(e.target.value) : '' }))}
                          className={`flex-1 ${inputCls} text-xs py-1 ${repId === '' ? 'border-amber-300 ring-1 ring-amber-300' : ''}`}
                        >
                          <option value="">— Not mapped (skip) —</option>
                          {activeReps.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Default status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Default status (used when CSV status is blank or unrecognised)
                </label>
                <select
                  value={defaultStatus}
                  onChange={e => setDefaultStatus(e.target.value as AppointmentStatus)}
                  className={inputCls}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="pencilled-in">Pencilled In</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {(unmappedServices > 0 || unmappedStaff > 0) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ Rows with unmapped service types or staff will be <strong>skipped</strong> during import.
                </div>
              )}
            </div>
          )}

          {/* ── RESULT ─────────────────────────────────────────────────────── */}
          {result && (
            <div className="text-center py-8 space-y-3">
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <p className="text-lg font-bold text-gray-800 dark:text-gray-200">Import Complete</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="text-green-600 font-semibold">{result.added} appointments</span> imported successfully.
                {result.skipped > 0 && <span className="text-gray-400"> {result.skipped} skipped (missing date, service, or rep).</span>}
              </p>
              <p className="text-xs text-gray-400">They will appear on your Calendar immediately.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/[0.06] flex-shrink-0">
          {result ? (
            <>
              <div className="flex-1" />
              <button onClick={onClose} className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium">
                Done
              </button>
            </>
          ) : (
            <>
              {step > 1 && !importing && (
                <button
                  onClick={() => setStep(s => (s - 1) as Step)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg"
                >
                  ← Back
                </button>
              )}
              <div className="flex-1" />
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg">
                Cancel
              </button>
              {step === 2 && (
                <button
                  onClick={goToStep3}
                  disabled={!Object.values(colMap).includes('date') || !Object.values(colMap).includes('startTime')}
                  className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-40"
                >
                  Next →
                </button>
              )}
              {step === 3 && !importing && (
                <button
                  onClick={handleImport}
                  disabled={validRows.length === 0}
                  className="px-5 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold disabled:opacity-40"
                >
                  Import {validRows.length} Appointments
                </button>
              )}
              {importing && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <Loader2 size={16} className="animate-spin" />
                  Importing...
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
