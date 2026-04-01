import React, { useState, useCallback, useMemo } from 'react';
import { Lead } from '../types';
import { useAppStore } from '../stores/appStore';
import { useLeads, useSaveLead, useAddAuditEntry } from '../hooks/useFirebase';
import { useToast } from '../context/ToastContext';
import { SuburbInput } from '../components/SuburbInput';
import { sanitizePhone, normalizeAUPhone } from '../lib/utils';
import { ClipboardList, Plus, Trash2, CheckCircle, AlertTriangle, RotateCcw, Calendar, Tag, Users } from 'lucide-react';
import { LeadStatus } from '../types';

const MAX_ROWS = 25;
const SUPER_OPTIONS = ['$0-75k', '$75k to 150k', '$150k+', 'Other'];
const EMPLOYMENT_OPTIONS = ['Full Time', 'Part Time', 'Casual', 'Self Employed', 'Retired'];
const IMPORT_STATUSES: LeadStatus[] = ['DQ', 'Live', 'Booked', 'Revisit', 'Not Interested', 'Wrong Number', 'No Answer'];

interface DQRow {
  name: string;
  phone: string;
  houseNum: string;
  street: string;
  suburb: string;
  postcode: string;
  ownership: string;
  superannuation: string;
  employment: string;
  notes: string;
  dqRep: number | '';
}

const emptyRow = (defaultRep: number | '' = ''): DQRow => ({
  name: '', phone: '', houseNum: '', street: '', suburb: '',
  postcode: '', ownership: '', superannuation: '', employment: '', notes: '', dqRep: defaultRep,
});

export function DQImportPage() {
  const { reps, currentUser } = useAppStore();
  const activeReps = reps.filter((r) => r.active !== false);
  const formerReps = reps.filter((r) => r.active === false);
  const { leads: existingLeads } = useLeads();
  const { save: saveLead } = useSaveLead();
  const { add: addAudit } = useAddAuditEntry();
  const { showToast } = useToast();

  // Batch controls — apply to the whole import at once
  const [batchDate, setBatchDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [batchStatus, setBatchStatus] = useState<LeadStatus>('DQ');
  const [batchRep, setBatchRep] = useState<number | ''>(currentUser?.id ?? '');

  const freshRows = useCallback(
    () => Array.from({ length: 5 }, () => emptyRow(batchRep)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // intentionally omit batchRep — only used at mount/reset time
  );

  const [rows, setRows] = useState<DQRow[]>(freshRows);
  const [errors, setErrors] = useState<Record<number, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(0);

  // When batch rep changes, update ALL rows to match (individual rows can still be overridden)
  const handleBatchRepChange = useCallback((repId: number | '') => {
    setBatchRep(repId);
    if (repId !== '') {
      setRows((prev) => prev.map((r) => ({ ...r, dqRep: repId })));
    }
  }, []);

  // ── Duplicate address detection ──────────────────────────────────────────────
  const existingAddressKeys = useMemo(() => {
    const keys = new Set<string>();
    existingLeads.forEach((l) => {
      const key = `${l.houseNum ?? ''} ${l.street ?? ''} ${l.suburb ?? ''}`.toLowerCase().trim().replace(/\s+/g, ' ');
      if (key.replace(/\s/g, '')) keys.add(key);
    });
    return keys;
  }, [existingLeads]);

  const isDuplicateAddress = useCallback((row: DQRow): boolean => {
    if (!row.suburb.trim()) return false;
    const key = `${row.houseNum} ${row.street} ${row.suburb}`.toLowerCase().trim().replace(/\s+/g, ' ');
    return existingAddressKeys.has(key);
  }, [existingAddressKeys]);

  // ── Row helpers ──────────────────────────────────────────────────────────────
  const updateRow = useCallback((i: number, field: keyof DQRow, value: string | number) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    setErrors((prev) => {
      if (!prev[i]) return prev;
      const { [i]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const addRow = useCallback(() => {
    if (rows.length >= MAX_ROWS) return;
    setRows((prev) => [...prev, emptyRow(batchRep)]);
  }, [rows.length, batchRep]);

  const removeRow = useCallback((i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setErrors((prev) => {
      const next: Record<number, string[]> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const num = Number(k);
        if (num < i) next[num] = v;
        else if (num > i) next[num - 1] = v;
      });
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const repId = currentUser?.id ?? '';
    setBatchDate(new Date().toISOString().split('T')[0]);
    setBatchStatus('DQ');
    setBatchRep(repId);
    setRows(Array.from({ length: 5 }, () => emptyRow(repId)));
    setErrors({});
    setLastSaved(0);
  }, [currentUser]);

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const newErrors: Record<number, string[]> = {};
    rows.forEach((row, i) => {
      const hasAnyData = row.name.trim() || row.phone.trim() || row.suburb.trim();
      if (!hasAnyData) return;
      const rowErrors: string[] = [];
      if (!row.name.trim()) rowErrors.push('Name');
      if (!row.phone.trim()) rowErrors.push('Contact Number');
      if (!row.suburb.trim()) rowErrors.push('Suburb');
      if (!row.dqRep) rowErrors.push('Rep');
      if (rowErrors.length) newErrors[i] = rowErrors;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;

    const valid = rows.filter(
      (r) => r.name.trim() && r.phone.trim() && r.suburb.trim() && r.dqRep
    );

    if (valid.length === 0) {
      setErrors({ 0: ['Fill in at least one complete row (Name, Phone, Suburb, Rep)'] });
      return;
    }

    setSaving(true);
    const leads: Lead[] = valid.map((r) => ({
      id: Date.now() + Math.random(),
      name: r.name.trim(),
      phone: normalizeAUPhone(r.phone.trim()),
      houseNum: r.houseNum.trim() || undefined,
      street: r.street.trim() || undefined,
      suburb: r.suburb.trim(),
      postcode: r.postcode.trim() || undefined,
      ownership: r.ownership || undefined,
      superannuation: r.superannuation || undefined,
      employment: r.employment || undefined,
      notes: r.notes.trim() || undefined,
      dqRep: Number(r.dqRep),
      status: batchStatus,
      leadDate: batchDate,
      createdAt: Date.now(),
      callHistory: [],
    }));

    let saved = 0;
    for (const lead of leads) {
      const ok = await saveLead(lead);
      if (ok) {
        saved++;
        if (currentUser) {
          const now = new Date();
          await addAudit({
            timestamp: now.getTime(),
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().slice(0, 5),
            user: currentUser.name,
            action: 'lead_created',
            detail: `DQ imported: ${lead.name}`,
            leadId: lead.id,
            leadName: lead.name,
          });
        }
      }
    }

    setSaving(false);
    setLastSaved(saved);
    if (saved < leads.length) showToast(`⚠️ ${leads.length - saved} lead(s) failed to save`, 'error');
    showToast(`✅ ${saved} lead${saved !== 1 ? 's' : ''} imported`, 'success');

    // Reset to fresh rows after short delay (use current batchRep, not stale closure)
    const repAtSave = batchRep;
    setTimeout(() => {
      setRows(Array.from({ length: 5 }, () => emptyRow(repAtSave)));
      setErrors({});
      setLastSaved(0);
    }, 1800);
  };

  const filledCount = rows.filter(
    (r) => r.name.trim() && r.phone.trim() && r.suburb.trim() && r.dqRep
  ).length;

  const dupCount = rows.filter((r) => r.name.trim() && isDuplicateAddress(r)).length;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[var(--surface)] overflow-hidden">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">DQ Lead Import</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
            {rows.length} / {MAX_ROWS} rows
          </span>
        </div>

        {/* Batch date picker */}
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-amber-500 flex-shrink-0" />
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
            Lead Date
          </label>
          <input
            type="date"
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* Batch status selector */}
        <div className="flex items-center gap-2">
          <Tag size={15} className="text-amber-500 flex-shrink-0" />
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
            Import as
          </label>
          <select
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value as LeadStatus)}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {IMPORT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Batch DQ rep selector — sets ALL rows at once */}
        <div className="flex items-center gap-2">
          <Users size={15} className="text-amber-500 flex-shrink-0" />
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
            DQ Rep
          </label>
          <select
            value={batchRep}
            onChange={(e) => handleBatchRepChange(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">— Select rep —</option>
            {activeReps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            {formerReps.length > 0 && (
              <optgroup label="── Former Staff ──">
                {formerReps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/[0.06] rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
        >
          <RotateCcw size={14} />
          Clear All
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: '1400px' }}>
          <thead className="sticky top-0 bg-gray-50 dark:bg-[var(--surface)] z-10">
            <tr>
              <th className={thCls} style={{ width: 36 }}>#</th>
              <th className={thCls} style={{ minWidth: 150 }}>Full Name *</th>
              <th className={thCls} style={{ minWidth: 130 }}>Contact Number *</th>
              <th className={thCls} style={{ width: 64 }}>House #</th>
              <th className={thCls} style={{ minWidth: 130 }}>Street</th>
              <th className={thCls} style={{ minWidth: 110 }}>Suburb *</th>
              <th className={thCls} style={{ width: 72 }}>Postcode</th>
              <th className={thCls} style={{ width: 110 }}>Renter/Owner</th>
              <th className={thCls} style={{ width: 120 }}>Super</th>
              <th className={thCls} style={{ width: 120 }}>Employment</th>
              <th className={thCls} style={{ minWidth: 200 }}>Notes</th>
              <th className={thCls} style={{ minWidth: 120 }}>Rep Name *</th>
              <th className={thCls} style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowError = errors[i];
              const isDup = isDuplicateAddress(row);
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-100 dark:border-white/[0.06] ${
                    rowError
                      ? 'bg-red-50 dark:bg-red-900/10'
                      : isDup
                      ? 'bg-amber-50/60 dark:bg-amber-900/10'
                      : 'hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50'
                  }`}
                >
                  {/* Row # / Duplicate indicator */}
                  <td className="px-3 py-1.5 text-xs text-gray-400 text-center">
                    {isDup ? (
                      <span title="Address already exists in leads" className="inline-flex items-center justify-center text-amber-500">
                        <AlertTriangle size={13} />
                      </span>
                    ) : (
                      i + 1
                    )}
                  </td>

                  {/* Name */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(!!rowError?.includes('Name'))}
                      placeholder="John Smith"
                      value={row.name}
                      onChange={(e) => updateRow(i, 'name', e.target.value)}
                    />
                  </td>

                  {/* Phone */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(!!rowError?.includes('Contact Number'))}
                      placeholder="04xx xxx xxx"
                      value={row.phone}
                      onChange={(e) => updateRow(i, 'phone', sanitizePhone(e.target.value))}
                    />
                  </td>

                  {/* House # */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="12"
                      value={row.houseNum}
                      onChange={(e) => updateRow(i, 'houseNum', e.target.value)}
                      style={{ width: 52 }}
                    />
                  </td>

                  {/* Street */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="Street name"
                      value={row.street}
                      onChange={(e) => updateRow(i, 'street', e.target.value)}
                    />
                  </td>

                  {/* Suburb */}
                  <td className="px-1.5 py-1">
                    <SuburbInput
                      value={row.suburb}
                      onChange={(v) => updateRow(i, 'suburb', v)}
                      className={inputCls(!!rowError?.includes('Suburb'))}
                      placeholder="Suburb"
                    />
                  </td>

                  {/* Postcode */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="3000"
                      value={row.postcode}
                      onChange={(e) => updateRow(i, 'postcode', e.target.value)}
                      style={{ width: 60 }}
                    />
                  </td>

                  {/* Renter/Owner */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls}
                      value={row.ownership}
                      onChange={(e) => updateRow(i, 'ownership', e.target.value)}
                    >
                      <option value="">—</option>
                      <option>Renter</option>
                      <option>Owner</option>
                    </select>
                  </td>

                  {/* Superannuation */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls}
                      value={row.superannuation}
                      onChange={(e) => updateRow(i, 'superannuation', e.target.value)}
                    >
                      <option value="">—</option>
                      {SUPER_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>

                  {/* Employment */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls}
                      value={row.employment}
                      onChange={(e) => updateRow(i, 'employment', e.target.value)}
                    >
                      <option value="">—</option>
                      {EMPLOYMENT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>

                  {/* Notes */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="Any notes about this lead..."
                      value={row.notes}
                      onChange={(e) => updateRow(i, 'notes', e.target.value)}
                    />
                  </td>

                  {/* Rep */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls + (rowError?.includes('Rep') ? ' border-red-500' : '')}
                      value={row.dqRep}
                      onChange={(e) => updateRow(i, 'dqRep', Number(e.target.value))}
                    >
                      <option value="">— Rep —</option>
                      {activeReps.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                      {formerReps.length > 0 && (
                        <optgroup label="── Former ──">
                          {formerReps.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>

                  {/* Remove */}
                  <td className="px-1.5 py-1 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="p-1 text-gray-400 hover:text-red-500 transition rounded"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)] flex-shrink-0 gap-4">
        <button
          onClick={addRow}
          disabled={rows.length >= MAX_ROWS}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-white/[0.08] rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Plus size={14} />
          Add Row
        </button>

        <div className="flex items-center gap-3">
          {filledCount > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filledCount} lead{filledCount !== 1 ? 's' : ''} ready to import
            </span>
          )}
          {dupCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <AlertTriangle size={12} />
              {dupCount} duplicate address{dupCount !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || filledCount === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
          >
            {lastSaved > 0 ? (
              <><CheckCircle size={15} /> Imported!</>
            ) : saving ? (
              'Saving...'
            ) : (
              `Import ${filledCount > 0 ? filledCount : ''} Lead${filledCount !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const thCls = 'px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-white/[0.06] whitespace-nowrap';
const inputCls = (hasError: boolean) =>
  `w-full px-2 py-1 rounded border text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400 ${
    hasError ? 'border-red-400' : 'border-gray-200 dark:border-white/[0.06]'
  }`;
const selectCls = 'w-full px-2 py-1 rounded border border-gray-200 dark:border-white/[0.06] text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400';

export default DQImportPage;
