/**
 * DealDashboard.tsx
 *
 * Two-tab deal pipeline view:
 *  - Active Deals: Booked leads that are not yet complete
 *  - Completed Settlements: leads with dealComplete === true
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Lead, Rep, FCAppt, FRAppt, PSAppt, RepPayment, DealCommissions, DealUpdate, ApptDoc } from '../types';
import { useLeads, useSaveLead, useDealUpdates, useAddDealUpdate } from '../hooks/useFirebase';
import { useAppStore } from '../stores/appStore';
import { useToast } from '../context/ToastContext';
import { uploadFile } from '../lib/storage';
import {
  ChevronDown, ChevronRight, Send, FileText, Search,
  TrendingUp, Users, Calendar, CheckCircle2, X, Loader,
  Paperclip, Download, MessageSquare, DollarSign, Home,
  Check, Clock, AlertTriangle, Trash2,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const FC_RESULTS = ['Completed', 'No Show', 'Rescheduled', 'Referred to SMSF - Mike', 'Declined'];
const FR_RESULTS = ['Completed', 'No Show', 'Rescheduled', 'Referred to SMSF - Mike', 'Declined'];
const PS_RESULTS = ['Application Submitted', 'Approved', 'Declined', 'Pending'];

const inp = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';
const sel = inp;

// ── Helpers ───────────────────────────────────────────────────────────────────

function repName(id: number | undefined, reps: Rep[]): string {
  if (!id) return '—';
  return reps.find((r) => r.id === id)?.name ?? '—';
}

function formatDate(d?: string): string {
  if (!d) return '—';
  const parsed = new Date(d + 'T00:00:00');
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
}

function resultColor(result?: string): string {
  if (!result) return '';
  const r = result.toLowerCase();
  if (r === 'completed' || r === 'approved' || r === 'application submitted') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
  if (r === 'declined' || r === 'no show') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
}

function RepAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const sz = size === 'md' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';
  return (
    <div className={`${sz} rounded-full bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ── DealChatSection ───────────────────────────────────────────────────────────

function DealChatSection({ leadId, currentUser }: { leadId: number; currentUser: Rep }) {
  const { updates, loading } = useDealUpdates(leadId);
  const { add } = useAddDealUpdate();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [updates.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    await add(leadId, {
      leadId,
      text: trimmed,
      repId: currentUser.id,
      repName: currentUser.name,
      timestamp: Date.now(),
      type: 'note',
    });
    setText('');
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col">
      <div className="overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 240 }}>
        {loading && (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader size={16} className="animate-spin mr-2" /> Loading…
          </div>
        )}
        {!loading && updates.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4 italic">
            No updates yet — be the first to post!
          </p>
        )}
        {updates.map((u) =>
          u.type === 'stage_change' || u.type === 'system' ? (
            <div key={u.id} className="flex justify-center">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-xs text-amber-700 dark:text-amber-300">
                <TrendingUp size={10} />
                <span>{u.text}</span>
                <span className="text-gray-400 dark:text-gray-600 ml-1">· {formatTs(u.timestamp)}</span>
              </div>
            </div>
          ) : (
            <div key={u.id} className="flex gap-2">
              <RepAvatar name={u.repName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{u.repName}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatTs(u.timestamp)}</span>
                </div>
                <div className="mt-0.5 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-[var(--surface)] rounded-xl rounded-tl-sm px-3 py-2 leading-relaxed">
                  {u.text}
                </div>
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
        <textarea
          className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
          rows={2}
          placeholder="Add a deal update… (Enter to send, Shift+Enter for newline)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="self-end px-3 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-40 transition"
          title="Send"
        >
          {sending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

// ── ApptDocsList ──────────────────────────────────────────────────────────────

function ApptDocsList({ docs, onDelete, canDelete }: { docs: ApptDoc[]; onDelete?: (doc: ApptDoc) => void; canDelete?: boolean }) {
  if (!docs.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {docs.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[var(--surface)] rounded-lg px-3 py-1.5">
          <FileText size={12} className="flex-shrink-0 text-amber-500" />
          <span className="flex-1 truncate">{d.name}</span>
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{d.uploadedBy} · {formatDate(new Date(d.uploadedAt).toISOString().split('T')[0])}</span>
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:text-amber-400 flex-shrink-0" title="Download">
            <Download size={12} />
          </a>
          {canDelete && onDelete && (
            <button onClick={() => onDelete(d)} className="text-red-400 hover:text-red-500 flex-shrink-0" title="Remove">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── AppointmentSection ────────────────────────────────────────────────────────

interface ApptSectionProps {
  title: string;
  data: FCAppt | FRAppt;
  reps: Rep[];
  results: string[];
  onSave: (updated: FCAppt | FRAppt) => Promise<void>;
  currentUserName: string;
  sectionKey: 'fc' | 'fr';
  leadId: number;
}

function AppointmentSection({ title, data, reps, results, onSave, currentUserName, sectionKey, leadId }: ApptSectionProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<FCAppt | FRAppt>(data);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasData = !!data.result;

  useEffect(() => { setLocal(data); }, [data]);

  const upd = (key: string, val: unknown) => setLocal((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `dealDocs/${leadId}/${sectionKey}/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      const doc: ApptDoc = {
        name: file.name,
        url,
        storagePath: path,
        uploadedAt: Date.now(),
        uploadedBy: currentUserName,
      };
      const newDocs = [...(local.docs ?? []), doc];
      const updated = { ...local, docs: newDocs };
      setLocal(updated);
      await onSave(updated);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteDoc = async (doc: ApptDoc) => {
    const newDocs = (local.docs ?? []).filter((d) => d.storagePath !== doc.storagePath);
    const updated = { ...local, docs: newDocs };
    setLocal(updated);
    await onSave(updated);
  };

  return (
    <div className={`rounded-xl border ${hasData ? 'border-l-4 border-l-green-400 border-gray-200 dark:border-white/[0.06]' : 'border-gray-200 dark:border-white/[0.06]'}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--hover)] rounded-xl text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        <Calendar size={14} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1">{title}</span>
        {hasData && (
          <>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultColor(data.result)}`}>{data.result}</span>
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          </>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
              <input type="date" value={local.date ?? ''} onChange={(e) => upd('date', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rep</label>
              <select value={local.repId ?? ''} onChange={(e) => upd('repId', e.target.value ? Number(e.target.value) : undefined)} className={sel}>
                <option value="">— Select Rep —</option>
                {reps.filter((r) => r.active !== false).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Result</label>
            <select value={local.result ?? ''} onChange={(e) => upd('result', e.target.value || undefined)} className={sel}>
              <option value="">— Select Result —</option>
              {results.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea rows={2} value={local.notes ?? ''} onChange={(e) => upd('notes', e.target.value || undefined)} className={`${inp} resize-none`} placeholder="Any notes…" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Documents</label>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 disabled:opacity-50"
              >
                {uploading ? <Loader size={11} className="animate-spin" /> : <Paperclip size={11} />}
                Attach
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
            <ApptDocsList docs={local.docs ?? []} onDelete={handleDeleteDoc} canDelete />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold disabled:opacity-50 transition"
          >
            {saving ? <Loader size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── PSAppointmentSection ──────────────────────────────────────────────────────

function PSAppointmentSection({
  data, reps, onSave, currentUserName, leadId,
}: {
  data: PSAppt; reps: Rep[]; onSave: (updated: PSAppt) => Promise<void>; currentUserName: string; leadId: number;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<PSAppt>(data);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasData = !!data.result;

  useEffect(() => { setLocal(data); }, [data]);

  const upd = (key: string, val: unknown) => setLocal((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `dealDocs/${leadId}/ps/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      const doc: ApptDoc = { name: file.name, url, storagePath: path, uploadedAt: Date.now(), uploadedBy: currentUserName };
      const newDocs = [...(local.docs ?? []), doc];
      const updated = { ...local, docs: newDocs };
      setLocal(updated);
      await onSave(updated);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteDoc = async (doc: ApptDoc) => {
    const newDocs = (local.docs ?? []).filter((d) => d.storagePath !== doc.storagePath);
    const updated = { ...local, docs: newDocs };
    setLocal(updated);
    await onSave(updated);
  };

  return (
    <div className={`rounded-xl border ${hasData ? 'border-l-4 border-l-green-400 border-gray-200 dark:border-white/[0.06]' : 'border-gray-200 dark:border-white/[0.06]'}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--hover)] rounded-xl text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        <Home size={14} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1">PS Appointment</span>
        {hasData && (
          <>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultColor(data.result)}`}>{data.result}</span>
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          </>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
              <input type="date" value={local.date ?? ''} onChange={(e) => upd('date', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rep</label>
              <select value={local.repId ?? ''} onChange={(e) => upd('repId', e.target.value ? Number(e.target.value) : undefined)} className={sel}>
                <option value="">— Select Rep —</option>
                {reps.filter((r) => r.active !== false).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Result</label>
            <select value={local.result ?? ''} onChange={(e) => upd('result', e.target.value || undefined)} className={sel}>
              <option value="">— Select Result —</option>
              {PS_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Property Sold</label>
            <input value={local.propertySold ?? ''} onChange={(e) => upd('propertySold', e.target.value || undefined)} className={inp} placeholder="Address of property sold" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Next Appointment Date</label>
              <input type="date" value={local.nextApptDate ?? ''} onChange={(e) => upd('nextApptDate', e.target.value || undefined)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Expected Settlement Date</label>
              <input type="date" value={local.expectedSettlementDate ?? ''} onChange={(e) => upd('expectedSettlementDate', e.target.value || undefined)} className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea rows={2} value={local.notes ?? ''} onChange={(e) => upd('notes', e.target.value || undefined)} className={`${inp} resize-none`} placeholder="Any notes…" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Documents</label>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 disabled:opacity-50">
                {uploading ? <Loader size={11} className="animate-spin" /> : <Paperclip size={11} />}
                Attach
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
            <ApptDocsList docs={local.docs ?? []} onDelete={handleDeleteDoc} canDelete />
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold disabled:opacity-50 transition">
            {saving ? <Loader size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── SettlementSection ─────────────────────────────────────────────────────────

function SettlementSection({ settlementDate, onSave }: { settlementDate?: string; onSave: (date: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(settlementDate ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDate(settlementDate ?? ''); }, [settlementDate]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(date);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={`rounded-xl border ${settlementDate ? 'border-l-4 border-l-green-400 border-gray-200 dark:border-white/[0.06]' : 'border-gray-200 dark:border-white/[0.06]'}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--hover)] rounded-xl text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        <CheckCircle2 size={14} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1">Settlement Date</span>
        {settlementDate && (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(settlementDate)}</span>
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          </>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Actual Settlement Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </div>
          <button onClick={handleSave} disabled={saving || !date} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold disabled:opacity-50 transition">
            {saving ? <Loader size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── CommissionsSection ────────────────────────────────────────────────────────

function CommissionsSection({
  data, reps, onSave, currentUser, isAdmin, dealComplete, onMarkComplete, settlementDate,
}: {
  data?: DealCommissions;
  reps: Rep[];
  onSave: (d: DealCommissions) => Promise<void>;
  currentUser: Rep;
  isAdmin: boolean;
  dealComplete: boolean;
  onMarkComplete: () => Promise<void>;
  settlementDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [totalAmount, setTotalAmount] = useState(String(data?.totalAmount ?? ''));
  const [receivedByRepId, setReceivedByRepId] = useState<number | ''>(data?.receivedByRepId ?? '');
  const [payments, setPayments] = useState<RepPayment[]>(data?.repPayments ?? []);
  const [notes, setNotes] = useState(data?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completing, setCompleting] = useState(false);
  const hasData = (data?.totalAmount ?? 0) > 0;

  useEffect(() => {
    setTotalAmount(String(data?.totalAmount ?? ''));
    setReceivedByRepId(data?.receivedByRepId ?? '');
    setPayments(data?.repPayments ?? []);
    setNotes(data?.notes ?? '');
  }, [data]);

  const totalNum = parseFloat(totalAmount) || 0;
  const allocatedTotal = payments.reduce((s, p) => s + (p.amountOwed || 0), 0);
  const remaining = totalNum - allocatedTotal;

  const activeReps = reps.filter((r) => r.active !== false);

  const addPayment = () => setPayments((p) => [...p, { repId: 0, repName: '', amountOwed: 0 }]);
  const removePayment = (i: number) => setPayments((p) => p.filter((_, idx) => idx !== i));
  const updatePayment = (i: number, key: keyof RepPayment, val: unknown) =>
    setPayments((p) => p.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      receivedByRepId: receivedByRepId || undefined,
      totalAmount: totalNum || undefined,
      repPayments: payments.filter((p) => p.repId && p.amountOwed > 0),
      notes: notes || undefined,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleComplete = async () => {
    setCompleting(true);
    await onMarkComplete();
    setCompleting(false);
  };

  const canComplete = !dealComplete && !!settlementDate && totalNum > 0;

  return (
    <div className={`rounded-xl border ${hasData ? 'border-l-4 border-l-green-400 border-gray-200 dark:border-white/[0.06]' : 'border-gray-200 dark:border-white/[0.06]'}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--hover)] rounded-xl text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        <DollarSign size={14} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1">Commission Distribution</span>
        {hasData && (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">${(data?.totalAmount ?? 0).toLocaleString()}</span>
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          </>
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Commissions Received ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className={`${inp} pl-7`} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Received by</label>
              <select value={receivedByRepId} onChange={(e) => setReceivedByRepId(e.target.value ? Number(e.target.value) : '')} className={sel}>
                <option value="">— Select Rep —</option>
                {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Commission Breakdown</span>
              {totalNum > 0 && (
                <span className={`text-xs font-semibold ${Math.abs(remaining) < 0.01 ? 'text-green-600 dark:text-green-400' : remaining < 0 ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
                  {Math.abs(remaining) < 0.01 ? '✓ Balanced' : remaining > 0 ? `$${remaining.toFixed(2)} unallocated` : `$${Math.abs(remaining).toFixed(2)} over`}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {payments.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={p.repId || ''}
                    onChange={(e) => {
                      const rep = activeReps.find((r) => r.id === Number(e.target.value));
                      updatePayment(i, 'repId', Number(e.target.value));
                      if (rep) updatePayment(i, 'repName', rep.name);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    <option value="">— Rep —</option>
                    {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div className="relative w-32 flex-shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={p.amountOwed || ''}
                      onChange={(e) => updatePayment(i, 'amountOwed', parseFloat(e.target.value) || 0)}
                      className="w-full pl-7 pr-2 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder="0.00"
                    />
                  </div>
                  <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-500 flex-shrink-0 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addPayment} className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 flex items-center gap-1">
              + Add Rep
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} resize-none`} placeholder="Any commission notes…" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold disabled:opacity-50 transition">
              {saving ? <Loader size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
              {saved ? 'Saved ✓' : 'Save'}
            </button>
            {!dealComplete && (
              <button
                onClick={handleComplete}
                disabled={!canComplete || completing}
                title={!settlementDate ? 'Set settlement date first' : totalNum === 0 ? 'Enter total amount first' : 'Mark this deal as complete'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold disabled:opacity-40 transition"
              >
                {completing ? <Loader size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Mark Deal as Complete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ActiveDealCard ────────────────────────────────────────────────────────────

function ActiveDealCard({
  lead, reps, currentUser, isAdmin, onSave,
}: {
  lead: Lead; reps: Rep[]; currentUser: Rep; isAdmin: boolean; onSave: (lead: Lead) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [dnqToggle, setDnqToggle] = useState(lead.dnqFellOver ?? false);
  const [dnqNotes, setDnqNotes] = useState(lead.dnqNotes ?? '');
  const [savingDnq, setSavingDnq] = useState(false);

  const toggleSection = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));

  const dqRep = repName(lead.dqRep, reps);
  const suburb = lead.suburb || '—';

  const handleSaveFcAppt = useCallback(async (updated: FCAppt | FRAppt) => {
    onSave({ ...lead, fcAppt: updated as FCAppt });
  }, [lead, onSave]);

  const handleSaveFrAppt = useCallback(async (updated: FCAppt | FRAppt) => {
    onSave({ ...lead, frAppt: updated as FRAppt });
  }, [lead, onSave]);

  const handleSavePsAppt = useCallback(async (updated: PSAppt) => {
    onSave({ ...lead, psAppt: updated });
  }, [lead, onSave]);

  const handleSaveSettlement = useCallback(async (date: string) => {
    onSave({ ...lead, settlementDate: date });
  }, [lead, onSave]);

  const handleSaveCommissions = useCallback(async (d: DealCommissions) => {
    onSave({ ...lead, dealCommissions: d });
  }, [lead, onSave]);

  const handleMarkComplete = useCallback(async () => {
    onSave({ ...lead, dealComplete: true, dealCompleteDate: new Date().toISOString().split('T')[0] });
  }, [lead, onSave]);

  const handleSaveDnq = async () => {
    setSavingDnq(true);
    onSave({ ...lead, dnqFellOver: dnqToggle, dnqNotes });
    setSavingDnq(false);
  };

  const sectionHasData = (key: 'fc' | 'fr' | 'ps' | 'settlement' | 'commissions') => {
    if (key === 'fc') return !!lead.fcAppt?.result;
    if (key === 'fr') return !!lead.frAppt?.result;
    if (key === 'ps') return !!lead.psAppt?.result;
    if (key === 'settlement') return !!lead.settlementDate;
    if (key === 'commissions') return (lead.dealCommissions?.totalAmount ?? 0) > 0;
    return false;
  };

  return (
    <div className={`bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] transition-shadow ${expanded ? 'shadow-md border-amber-300 dark:border-amber-700' : 'hover:shadow-sm'} ${lead.dnqFellOver ? 'border-l-4 border-l-red-400' : ''}`}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-900 dark:text-white">{lead.name}</span>
            {lead.dnqFellOver && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">❌ DNQ / Fell Over</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-gray-400 dark:text-gray-500">
            <span>{suburb}</span>
            <span>·</span>
            <span>DQ: {dqRep}</span>
            {lead.bookingDate && <><span>·</span><span>Booked: {formatDate(lead.bookingDate)}</span></>}
          </div>
          {/* Section dots */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {(['fc', 'fr', 'ps', 'settlement', 'commissions'] as const).map((k) => (
              <span key={k} className={`w-2 h-2 rounded-full ${sectionHasData(k) ? 'bg-green-400' : 'bg-gray-200 dark:bg-slate-700'}`} title={k} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newVal = !dnqToggle;
              setDnqToggle(newVal);
              onSave({ ...lead, dnqFellOver: newVal, dnqNotes: newVal ? dnqNotes : '' });
            }}
            className={`text-xs px-2 py-1 rounded-lg border font-medium transition ${dnqToggle ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700' : 'text-gray-400 border-gray-200 dark:border-white/[0.06] hover:border-red-300'}`}
            title="Toggle DNQ / Fell Over"
          >
            DNQ
          </button>
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
          {/* DNQ notes */}
          {dnqToggle && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 space-y-2">
              <label className="block text-xs font-semibold text-red-600 dark:text-red-400">DNQ / Fell Over — Reason</label>
              <textarea
                rows={2}
                value={dnqNotes}
                onChange={(e) => setDnqNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                placeholder="Why did this deal fall over?"
              />
              <button onClick={handleSaveDnq} disabled={savingDnq} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-400 disabled:opacity-50 transition">
                Save
              </button>
            </div>
          )}

          {/* FC Appointment */}
          <AppointmentSection
            title="FC Appointment"
            data={lead.fcAppt ?? {}}
            reps={reps}
            results={FC_RESULTS}
            onSave={handleSaveFcAppt}
            currentUserName={currentUser.name}
            sectionKey="fc"
            leadId={lead.id}
          />

          {/* FR Appointment */}
          <AppointmentSection
            title="FR Appointment"
            data={lead.frAppt ?? {}}
            reps={reps}
            results={FR_RESULTS}
            onSave={handleSaveFrAppt}
            currentUserName={currentUser.name}
            sectionKey="fr"
            leadId={lead.id}
          />

          {/* PS Appointment */}
          <PSAppointmentSection
            data={lead.psAppt ?? {}}
            reps={reps}
            onSave={handleSavePsAppt}
            currentUserName={currentUser.name}
            leadId={lead.id}
          />

          {/* Settlement Date */}
          <SettlementSection settlementDate={lead.settlementDate} onSave={handleSaveSettlement} />

          {/* Commissions */}
          <CommissionsSection
            data={lead.dealCommissions}
            reps={reps}
            onSave={handleSaveCommissions}
            currentUser={currentUser}
            isAdmin={isAdmin}
            dealComplete={lead.dealComplete ?? false}
            onMarkComplete={handleMarkComplete}
            settlementDate={lead.settlementDate}
          />

          {/* Deal Chat */}
          <div className="rounded-xl border border-gray-200 dark:border-white/[0.06]">
            <button
              className="w-full px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--hover)] rounded-xl text-left"
              onClick={() => toggleSection('chat')}
            >
              {openSections['chat'] ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
              <MessageSquare size={14} className="text-amber-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">💬 Deal Chat</span>
            </button>
            {openSections['chat'] && (
              <div className="px-4 pb-4">
                <DealChatSection leadId={lead.id} currentUser={currentUser} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CompletedDealCard ─────────────────────────────────────────────────────────

function CompletedDealCard({
  lead, reps, currentUser, isAdmin, onSave,
}: {
  lead: Lead; reps: Rep[]; currentUser: Rep; isAdmin: boolean; onSave: (lead: Lead) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [paidDates, setPaidDates] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const dc = lead.dealCommissions;
  const payments = dc?.repPayments ?? [];
  const receivedByName = repName(dc?.receivedByRepId, reps);
  const isReceiver = dc?.receivedByRepId === currentUser.id;

  const handleTogglePaid = async (repId: number, currentPaid: boolean) => {
    const now = new Date().toISOString().split('T')[0];
    const newPayments = payments.map((p) =>
      p.repId === repId
        ? { ...p, paid: !currentPaid, paidDate: !currentPaid ? (paidDates[repId] || now) : undefined, paidBy: !currentPaid ? currentUser.name : undefined }
        : p
    );
    onSave({ ...lead, dealCommissions: { ...dc, repPayments: newPayments } });
  };

  const handleAdminApprove = async (repId: number) => {
    const newPayments = payments.map((p) =>
      p.repId === repId
        ? { ...p, adminApproved: true, adminApprovedBy: currentUser.name, adminApprovedAt: Date.now() }
        : p
    );
    onSave({ ...lead, dealCommissions: { ...dc, repPayments: newPayments } });
  };

  const handleInvoiceUpload = async (repId: number, file: File) => {
    setUploading((u) => ({ ...u, [repId]: true }));
    try {
      const path = `dealDocs/${lead.id}/invoices/${repId}_${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      const newPayments = payments.map((p) =>
        p.repId === repId ? { ...p, invoiceUrl: url, invoiceName: file.name, invoiceStoragePath: path } : p
      );
      onSave({ ...lead, dealCommissions: { ...dc, repPayments: newPayments } });
    } finally {
      setUploading((u) => ({ ...u, [repId]: false }));
    }
  };

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded((e) => !e)}>
        <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-900 dark:text-white">{lead.name}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Settled</span>
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {lead.suburb} · Settled: {formatDate(lead.settlementDate)} · Total: ${(dc?.totalAmount ?? 0).toLocaleString()} received by {receivedByName}
          </div>
        </div>
        {expanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rep Payments</div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.repId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[var(--surface)] flex-wrap">
                <RepAvatar name={p.repName} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{p.repName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">${p.amountOwed.toLocaleString()} owed</div>
                  {p.paid && p.paidDate && (
                    <div className="text-xs text-green-600 dark:text-green-400">Paid {formatDate(p.paidDate)} by {p.paidBy}</div>
                  )}
                  {p.adminApproved && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Admin Approved by {p.adminApprovedBy}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {/* Paid status badge */}
                  {p.paid ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Paid</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Unpaid</span>
                  )}

                  {/* Receiver can mark paid + upload invoice */}
                  {isReceiver && (
                    <>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={paidDates[p.repId] ?? ''}
                          onChange={(e) => setPaidDates((d) => ({ ...d, [p.repId]: e.target.value }))}
                          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                        <button
                          onClick={() => handleTogglePaid(p.repId, p.paid ?? false)}
                          className={`text-xs px-2 py-1 rounded-lg border font-medium transition ${p.paid ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-white/[0.08]' : 'bg-green-500 text-white border-transparent hover:bg-green-400'}`}
                        >
                          {p.paid ? 'Undo' : '✓ Mark Paid'}
                        </button>
                      </div>
                      <div>
                        <input
                          type="file"
                          className="hidden"
                          ref={(el) => { fileRefs.current[p.repId] = el; }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInvoiceUpload(p.repId, f); }}
                        />
                        {p.invoiceUrl ? (
                          <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500">
                            <Download size={11} /> Invoice
                          </a>
                        ) : (
                          <button
                            onClick={() => fileRefs.current[p.repId]?.click()}
                            disabled={uploading[p.repId]}
                            className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-500 disabled:opacity-50"
                          >
                            {uploading[p.repId] ? <Loader size={11} className="animate-spin" /> : <Paperclip size={11} />}
                            Upload Invoice
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {/* Admin can approve paid payments */}
                  {isAdmin && p.paid && !p.adminApproved && (
                    <button
                      onClick={() => handleAdminApprove(p.repId)}
                      className="text-xs px-2 py-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 font-medium transition"
                    >
                      ✓ Approve
                    </button>
                  )}
                </div>
              </div>
            ))}
            {payments.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">No rep payment breakdown recorded.</p>
            )}
          </div>

          {dc?.notes && (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-[var(--surface)] rounded-lg px-3 py-2">
              {dc.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DealDashboardPage ─────────────────────────────────────────────────────────

export function DealDashboardPage() {
  const { leads } = useLeads();
  const { reps, currentUser } = useAppStore();
  const { save: saveLead } = useSaveLead();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [search, setSearch] = useState('');
  const [filterRep, setFilterRep] = useState<number | 'all'>('all');

  const isAdmin = currentUser?.role === 'admin';
  const activeReps = reps.filter((r) => r.active !== false);

  const matchesSearch = useCallback((lead: Lead) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return lead.name.toLowerCase().includes(q) || (lead.suburb ?? '').toLowerCase().includes(q);
  }, [search]);

  const matchesRep = useCallback((lead: Lead) => {
    if (filterRep === 'all') return true;
    return lead.dqRep === filterRep || lead.fcRep === filterRep || lead.frRep === filterRep || lead.psRep === filterRep;
  }, [filterRep]);

  const activeDeals = useMemo(
    () => leads
      .filter((l) => l.status === 'Booked' && !l.dealComplete && matchesSearch(l) && matchesRep(l))
      .sort((a, b) => (b.leadDate ?? '').localeCompare(a.leadDate ?? '')),
    [leads, matchesSearch, matchesRep]
  );

  const completedDeals = useMemo(
    () => leads
      .filter((l) => l.dealComplete === true && matchesSearch(l) && matchesRep(l))
      .sort((a, b) => (b.dealCompleteDate ?? '').localeCompare(a.dealCompleteDate ?? '')),
    [leads, matchesSearch, matchesRep]
  );

  const counts = useMemo(() => ({
    active: leads.filter((l) => l.status === 'Booked' && !l.dealComplete).length,
    completed: leads.filter((l) => l.dealComplete === true).length,
    fcDone: leads.filter((l) => l.status === 'Booked' && !l.dealComplete && l.fcAppt?.result === 'Completed').length,
    frDone: leads.filter((l) => l.status === 'Booked' && !l.dealComplete && l.frAppt?.result === 'Completed').length,
    settlement: leads.filter((l) => l.status === 'Booked' && !l.dealComplete && !!l.settlementDate).length,
  }), [leads]);

  const handleSaveLead = useCallback(async (updated: Lead) => {
    const ok = await saveLead(updated);
    if (!ok) showToast('Failed to save', 'error');
    return ok;
  }, [saveLead, showToast]);

  const handleSaveLeadSync = useCallback((updated: Lead) => {
    handleSaveLead(updated);
  }, [handleSaveLead]);

  if (!currentUser) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-amber-500" />
            Deal Dashboard
          </h1>
          {/* Stats row */}
          <div className="flex flex-wrap gap-3 mt-3">
            {[
              { icon: <Users size={13} />, label: 'Active', value: counts.active, color: 'text-amber-600 dark:text-amber-400' },
              { icon: <Calendar size={13} />, label: 'FC Done', value: counts.fcDone, color: 'text-blue-600 dark:text-blue-400' },
              { icon: <Calendar size={13} />, label: 'FR Done', value: counts.frDone, color: 'text-indigo-600 dark:text-indigo-400' },
              { icon: <Home size={13} />, label: 'Settlement Set', value: counts.settlement, color: 'text-purple-600 dark:text-purple-400' },
              { icon: <CheckCircle2 size={13} />, label: 'Completed', value: counts.completed, color: 'text-green-600 dark:text-green-400' },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06]">
                <span className={color}>{icon}</span>
                <span className={`text-base font-bold ${color}`}>{value}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-white/[0.06]">
          {([['active', 'Active Deals'], ['completed', 'Completed Settlements']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                tab === key
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {label} ({key === 'active' ? counts.active : counts.completed})
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[150px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name or suburb…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
          <select
            value={filterRep}
            onChange={(e) => setFilterRep(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            <option value="all">All Reps</option>
            {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {(search || filterRep !== 'all') && (
            <button onClick={() => { setSearch(''); setFilterRep('all'); }} className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 dark:border-white/[0.06] hover:border-gray-300 transition">
              <X size={12} /> Clear
            </button>
          )}
          <span className="text-sm text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {tab === 'active' ? activeDeals.length : completedDeals.length} deal{(tab === 'active' ? activeDeals.length : completedDeals.length) !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Deal list */}
        {tab === 'active' && (
          activeDeals.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <TrendingUp size={40} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm">{leads.filter((l) => l.status === 'Booked' && !l.dealComplete).length === 0 ? 'No active deals yet.' : 'No deals match your filters.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDeals.map((lead) => (
                <ActiveDealCard
                  key={lead.id}
                  lead={lead}
                  reps={reps}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  onSave={handleSaveLeadSync}
                />
              ))}
            </div>
          )
        )}

        {tab === 'completed' && (
          completedDeals.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <CheckCircle2 size={40} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm">{leads.filter((l) => l.dealComplete).length === 0 ? 'No completed deals yet.' : 'No deals match your filters.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedDeals.map((lead) => (
                <CompletedDealCard
                  key={lead.id}
                  lead={lead}
                  reps={reps}
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  onSave={handleSaveLeadSync}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
