/**
 * Zustand Global State Store
 */

import { create } from 'zustand';
import { Lead, Rep, AppSettings, DrapsEntry, CommissionEntry, AuditEntry, DEFAULT_STATUS_COLORS } from '../types';

interface AppState {
  leads: Lead[];
  reps: Rep[];
  currentUser: Rep | null;
  settings: AppSettings;
  statusColors: Record<string, string>;   // hex per LeadStatus, synced from Firestore settings
  drapsEntries: DrapsEntry[];
  commissions: CommissionEntry[];
  auditLog: AuditEntry[];

  // Actions
  setLeads: (leads: Lead[]) => void;
  setReps: (reps: Rep[]) => void;
  setCurrentUser: (user: Rep | null) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  setStatusColors: (colors: Record<string, string>) => void;
  updateLead: (lead: Lead) => void;
  removeLead: (leadId: number) => void;
  setDrapsEntries: (entries: DrapsEntry[]) => void;
  setCommissions: (entries: CommissionEntry[]) => void;
  setAuditLog: (entries: AuditEntry[]) => void;
}

const defaultSettings: AppSettings = {
  commission: {
    dqRate: 0,
    fcRate: 0,
    frRate: 0,
  },
  repTargets: {},
  staleThresholdDays: 14,
};

const loadReps = (): Rep[] => {
  try {
    const stored = localStorage.getItem('asgReps');
    return stored ? JSON.parse(stored) : getDefaultReps();
  } catch {
    return getDefaultReps();
  }
};

function getDefaultReps(): Rep[] {
  return [
    { id: 1, name: 'Garry', active: true, role: 'admin' },
    { id: 2, name: 'Blake', active: true, role: 'rep' },
    { id: 3, name: 'Mike', active: true, role: 'rep' },
    { id: 4, name: 'Josh', active: true, role: 'rep' },
    { id: 5, name: 'Kai', active: true, role: 'rep' },
    { id: 6, name: 'Vinu', active: true, role: 'rep' },
    { id: 7, name: 'Lewis', active: true, role: 'rep' },
    { id: 8, name: 'Joe', active: true, role: 'rep' },
  ];
}

export const useAppStore = create<AppState>((set) => ({
  leads: [],
  reps: loadReps(),
  currentUser: null,
  settings: defaultSettings,
  statusColors: { ...DEFAULT_STATUS_COLORS },
  drapsEntries: [],
  commissions: [],
  auditLog: [],

  setLeads: (leads) => set({ leads }),

  setReps: (reps) => {
    localStorage.setItem('asgReps', JSON.stringify(reps));
    set({ reps });
  },

  setCurrentUser: (currentUser) => set({ currentUser }),

  updateSettings: (newSettings) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...newSettings,
        commission: {
          ...state.settings.commission,
          ...(newSettings.commission || {}),
        },
      },
    })),

  setStatusColors: (statusColors) => set({ statusColors }),

  updateLead: (updatedLead) =>
    set((state) => ({
      leads: state.leads.map((l) => (l.id === updatedLead.id ? updatedLead : l)),
    })),

  removeLead: (leadId) =>
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== leadId),
    })),

  setDrapsEntries: (drapsEntries) => set({ drapsEntries }),
  setCommissions: (commissions) => set({ commissions }),
  setAuditLog: (auditLog) => set({ auditLog }),
}));
