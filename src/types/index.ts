/**
 * Core TypeScript types for ASG Leads CRM
 */

export type CallResult =
  | 'booked'
  | 'live'
  | 'no-answer'
  | 'not-interested'
  | 'wrong-number'
  | 'callback'
  | 'callback-today'
  | 'back-to-dq';

export type LeadStatus =
  | 'DQ'
  | 'Live'
  | 'Booked'
  | 'Revisit'
  | 'Not Interested'
  | 'Wrong Number'
  | 'No Answer';

// ── Deal Pipeline ─────────────────────────────────────────────────────────────

export type DealStage =
  | 'Booked'
  | 'Appointment Set'
  | 'Appointment Done'
  | 'Application In'
  | 'Under Assessment'
  | 'Approved'
  | 'Settlement'
  | 'Complete';

export interface DealUpdate {
  id: string;
  leadId: number;
  text: string;
  repId: number;
  repName: string;
  timestamp: number;           // ms epoch, used for ordering
  type: 'note' | 'stage_change' | 'system';
  stageFrom?: string;          // set when type === 'stage_change'
  stageTo?: string;
}

export interface CallHistory {
  date: string;
  time: string;
  rep: string;
  repId?: number;              // stored from Session 28+ for rename resilience
  result: CallResult | string;
  notes: string;
}

// ── Deal appointment records ──────────────────────────────────────────────────
export interface ApptDoc {
  name: string;
  url: string;
  storagePath: string;
  uploadedAt: number;
  uploadedBy: string;
}

export interface FCAppt {
  date?: string;
  repId?: number;
  result?: string;  // 'Completed' | 'No Show' | 'Rescheduled' | 'Referred to SMSF - Mike' | 'Declined'
  notes?: string;
  docs?: ApptDoc[];
}

export interface FRAppt {
  date?: string;
  repId?: number;
  result?: string;  // same options as FC
  notes?: string;
  docs?: ApptDoc[];
}

export interface PSAppt {
  date?: string;
  repId?: number;
  result?: string;  // 'Application Submitted' | 'Approved' | 'Declined' | 'Pending'
  propertySold?: string;
  nextApptDate?: string;
  expectedSettlementDate?: string;
  notes?: string;
  docs?: ApptDoc[];
}

export interface RepPayment {
  repId: number;
  repName: string;
  amountOwed: number;
  paid?: boolean;
  paidDate?: string;
  paidBy?: string;           // name of rep who marked as paid
  invoiceUrl?: string;
  invoiceName?: string;
  invoiceStoragePath?: string;
  adminApproved?: boolean;
  adminApprovedBy?: string;
  adminApprovedAt?: number;
}

export interface DealCommissions {
  receivedByRepId?: number;  // the rep who received the lump sum
  totalAmount?: number;      // total commission received
  repPayments?: RepPayment[]; // breakdown of what each involved rep is owed
  notes?: string;
}

export interface Lead {
  id: number;
  name: string;
  phone: string;
  email?: string;

  // Address
  houseNum?: string;
  street?: string;
  suburb: string;
  postcode?: string;

  // Lead info
  ownership?: string;
  superannuation?: string;
  employment?: string;
  dqRep: number;
  status: LeadStatus | string;
  result?: CallResult | string;
  notes?: string;
  leadDate?: string;

  // Call tracking
  lastCall?: string;
  callingRep?: number;
  dealValue?: number;
  timelyAdded?: boolean;

  // Booking
  bookingDate?: string;
  bookingTime?: string;
  appointmentDate?: string;
  appointmentTime?: string;

  // Booked lead rep assignments & outcome
  fcRep?: number;          // FC (Financial Consultant) rep ID
  frRep?: number;          // FR (Financial Representative) rep ID
  psRep?: number;          // PS (Post-Settlement) rep ID
  dnqFellOver?: boolean;   // true = this booking did not qualify / fell over
  dnqNotes?: string;       // reason why it fell over / DNQ notes
  dealStage?: DealStage;   // current stage in the deal pipeline

  // Structured deal appointment data
  fcAppt?: FCAppt;
  frAppt?: FRAppt;
  psAppt?: PSAppt;
  settlementDate?: string;    // actual settlement date (YYYY-MM-DD)
  dealCommissions?: DealCommissions;
  dealComplete?: boolean;
  dealCompleteDate?: string;

  // Callback
  callbackDate?: string;
  callbackTime?: string;

  // Geocoded map coordinates
  lat?: number;
  lng?: number;

  // Door knock outcome (set when lead created via knock mode)
  // Can be a built-in KnockResult value OR a custom pin type ID
  knockResult?: string;

  // Metadata
  createdAt?: number;
  callHistory?: CallHistory[];
  activities?: Activity[];
}

export interface Activity {
  date: string;
  type: string;
  note: string;
  rep?: string;
}

export interface Rep {
  id: number;
  name: string;
  active: boolean;
  role?: 'rep' | 'admin';
  email?: string;
  phone?: string;
  photo?: string;           // Firebase Storage URL for profile photo
  // Financial fields for commissions
  abn?: string;
  bsb?: string;
  accountNumber?: string;
  // Auth credentials (PIN-based login)
  pin?: string;             // 4–6 digit numeric PIN for daily login
  backupPassword?: string;  // text password used if PIN is forgotten
  isSetup?: boolean;        // false/undefined = first-time login required
  // Page access control (undefined / empty = full access; array = restricted to listed pages)
  permissions?: string[];   // e.g. ['map', 'team-chat'] for knock-only reps
  // Activity tracking
  lastLoginAt?: number;     // ms epoch — set on every successful login
  color?: string;           // hex e.g. "#6366f1" — used on calendar blocks and run sheet
  showOnCalendar?: boolean;          // false = rep hidden from DayView column headers + legend
  availableForBookings?: boolean;    // false = rep hidden from AppointmentModal rep dropdown
  allowedServiceTypes?: string[];    // undefined/empty = all types; array = restricted IDs
}

// ── DRAPS (Daily Reporting & Performance Stats) ───────────────────────────────
export interface DrapsEntry {
  id: number;
  date: string;          // YYYY-MM-DD
  repId: number;
  repName: string;

  // Field metrics
  dq: number;            // DQ leads generated
  referrals: number;
  appointments: number;
  presentations: number;
  sold: number;

  // FC (Finance Consultant) metrics
  fcAppts: number;
  fcPresented: number;
  fcBooked: number;

  // FR (Financial Review) metrics
  frAppts: number;
  frPresented: number;
  frBooked: number;

  createdAt: number;
}

// ── Commissions ───────────────────────────────────────────────────────────────
export interface RepAllocation {
  repId: number;
  repName: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  role?: 'DQ' | 'FC' | 'FR';
}

export interface CommissionEntry {
  id: string;
  client1: string;           // required
  client2?: string;          // optional second client
  currentAddress: string;    // clients' current residence
  soldAddress: string;       // property being settled
  settlementDate: string;    // YYYY-MM-DD
  total: number;
  entity: 'Perth' | 'Brisbane';
  reminderEnabled?: boolean;
  repAllocations: RepAllocation[];
  notes?: string;
  createdAt: number;
  createdBy: string;
  // legacy compat
  client?: string;
  address?: string;
}

// ── Saved Invoice Drafts ──────────────────────────────────────────────────────
export interface InvoiceDraft {
  id: string;
  invoiceToType: 'fixed' | 'rep';
  invoiceToFixed: string;
  invoiceToRepId: number | '';
  invoiceDate: string;
  amount: string;
  clientName: string;
  clientAddress: string;
  linkedSettlement: string;
  repId: number | '';
  createdAt: number;
  createdBy: string;
  label?: string;  // optional short name for the draft
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  timestamp: number;
  date: string;     // YYYY-MM-DD
  time: string;     // HH:MM
  user: string;     // rep name
  action: string;   // e.g. 'lead_updated', 'call_logged', 'lead_deleted', 'lead_created'
  detail: string;   // human-readable description
  leadId?: number;
  leadName?: string;
}

export interface RepTarget {
  weeklyDQ?: number;
  monthlyDQ?: number;
  weeklyBookings?: number;
  monthlyBookings?: number;
}

export interface SyncConfig {
  url: string;
  tab: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalMins: number; // 5, 15, 30, 60
  lastSyncAt?: number;          // epoch ms
  lastSyncResult?: 'success' | 'error' | 'partial';
  lastSyncSummary?: string;     // e.g. "↓12 imported, ↑2174 pushed"
}

export interface AppSettings {
  commission: {
    dqRate: number;   // % of deal value going to DQ rep, default 0
    fcRate: number;   // % going to FC rep
    frRate: number;   // % going to FR rep
  };
  repTargets: Record<number, RepTarget>;  // keyed by rep.id
  staleThresholdDays: number;             // days without contact before a lead is "stale", default 14
  statusColors?: Record<string, string>;  // hex colours per LeadStatus, persisted in Firestore
  sheets?: SyncConfig;
}

export interface FilterOptions {
  repId?: number;
  suburb?: string;
  status?: string;
}

/** Default hex colours for each LeadStatus — used as fallback when no custom colour is saved */
export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  'DQ':               '#3b82f6',  // blue
  'Live':             '#22c55e',  // green
  'Booked':           '#8b5cf6',  // violet/purple
  'Revisit':          '#f97316',  // orange
  'Not Interested':   '#ef4444',  // red
  'Wrong Number':     '#6b7280',  // gray
  'No Answer':        '#ec4899',  // pink/magenta
};

// ── Knock Mode ────────────────────────────────────────────────────────────────

/** Outcome of a door knock — drives pin colour on the map */
export type KnockResult =
  | 'not-interested'    // Red    #ef4444
  | 'no-answer'         // Orange #f97316
  | 'skipped'           // Grey   #6b7280
  | 'dq-complete'       // Green  #22c55e
  | 'parents-not-home'; // Blue   #3b82f6

/** A custom pin type created by an admin in the Pin Legend */
export interface CustomPinType {
  id: string;         // `pin_${timestamp}_${rand}`
  name: string;       // display name e.g. "Busy — Call Back"
  color: string;      // hex colour
  createdAt: number;
  createdBy: string;
}

// ── Team Chat ─────────────────────────────────────────────────────────────────

export type ChatMessageType = 'text' | 'location' | 'status' | 'file';

export interface ChatMessage {
  id: string;
  repId: number;
  repName: string;
  text: string;
  type: ChatMessageType;
  lat?: number;       // set when type === 'location'
  lng?: number;
  timestamp: number;  // ms epoch — used for sorting + unread tracking
  createdAt: number;
  fileUrl?: string;   // download URL for attached file
  fileName?: string;  // original file name
  fileType?: string;  // MIME type
  fileSize?: number;  // bytes
  reactions?: Record<string, number[]>; // emoji → array of repIds who reacted
}

/** A knocked territory zone drawn on the map, assigned to one or more reps */
export interface KnockZone {
  id: string;          // `zone_${timestamp}_${rand}`
  name?: string;       // optional label e.g. "Block A North"
  // Multi-rep (new — preferred)
  repIds?: number[];
  repNames?: string[];
  // Legacy single-rep (backwards compat with older zone docs in Firestore)
  repId?: number;
  repName?: string;
  date: string;        // YYYY-MM-DD
  polygon: Array<{ lat: number; lng: number }>;
  color: string;       // hex colour
  createdAt: number;
  createdBy: string;
}

// ── Knowledge Base ──────────────────────────────────────────────────────────

export type KBCategory =
  | 'Getting Started'
  | 'Leads'
  | 'Calls'
  | 'DQ Import'
  | 'Map'
  | 'Team Chat'
  | 'Calendar'
  | 'Deal Dashboard'
  | 'Documents'
  | 'Admin'
  | 'Commissions'
  | 'Sync'
  | 'Client Hub'
  | 'Other';

export interface KBArticle {
  id: string;
  title: string;
  category: KBCategory;
  content: string;       // HTML from rich text editor
  tags: string[];
  pinned: boolean;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  views: number;
}

// ── Document Centre ─────────────────────────────────────────────────────────

export interface DocFormField {
  id: string;
  label: string;
  type: 'text' | 'date' | 'select';
  options?: string[];
  autoFill?: 'leadName' | 'leadAddress' | 'leadPhone' | 'repName' | 'today';
}

export interface LibraryDocument {
  id: string;
  name: string;
  description: string;
  category: string;
  storagePath: string;
  downloadUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: number;
  formFields?: DocFormField[];
  sortOrder?: number;   // admin-controlled display order; lower = first
}

// ── Fillable Form Templates ──────────────────────────────────────────────────

export type FormFieldType = 'text' | 'textarea' | 'date' | 'select' | 'checkbox' | 'signature';

export type FormFieldAutoFill =
  | 'leadName' | 'leadPhone' | 'leadEmail' | 'leadAddress'
  | 'leadSuburb' | 'leadPostcode' | 'leadOwnership' | 'repName' | 'today';

export interface FormTemplateField {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[];        // for 'select' type
  required?: boolean;
  autoFill?: FormFieldAutoFill;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  /** 'builder' = custom field-builder form (default/legacy), 'pdf' = uploaded AcroForm PDF */
  type?: 'builder' | 'pdf';
  fields: FormTemplateField[];
  /** Firebase Storage download URL — only set when type === 'pdf' */
  pdfUrl?: string;
  /** Firebase Storage path — only set when type === 'pdf', used for deletion */
  pdfStoragePath?: string;
  /** Version number — starts at 1, increments on each PDF replacement */
  version?: number;
  /** History of replaced PDF versions */
  versionHistory?: Array<{
    version: number;
    pdfUrl: string;
    pdfStoragePath: string;
    replacedAt: number;
    replacedBy: string;
  }>;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  sortOrder?: number;   // admin-controlled display order; lower = first
}

// ── Lead File Attachments ───────────────────────────────────────────────────

export interface LeadFile {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  fileType: string;
  fileSize: number;
  type: 'document' | 'photo' | 'file';
  uploadedBy: string;
  uploadedAt: number;
  linkedDocumentId?: string;
}

// ── Calendar / Appointments ─────────────────────────────────────────────────

export interface ServiceType {
  id: string;
  name: string;             // "Finance Run", "Contract Signing"
  category: string;         // "Finance" | "Property Sale" | "General"
  color: string;            // hex e.g. "#6366f1"
  defaultDuration: number;  // minutes (30/60/90/120)
  sortOrder?: number;
}

export type AppointmentStatus =
  | 'pencilled-in'           // Not yet confirmed (default new appt)
  | 'confirmed'              // Confirmed with client
  | 'arrived'                // Client arrived
  | 'started'                // In progress
  | 'completed'              // Done (generic outcome)
  | 'no-show'                // Client didn't show
  | 'cancelled'              // Cancelled
  | 'rebook-fc'              // ReBook - First Consult (FC)
  | 'rebook-fr'              // ReBook - Finance Run (FR)
  | 'fc-complete-fr-booked'  // FC Complete - FR Booked
  | 'stopped-at-door'        // Stopped At Door (SAD)
  | 'presented-no-sale'      // Presented No Sale (PNS)
  | 'did-not-qualify';       // Did Not Qualify (DNQ)

export interface Appointment {
  id: string;
  title: string;              // client name display label
  serviceTypeId: string;      // FK → ServiceType.id
  repId: number;              // FK → Rep.id
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:MM 24-hour
  endTime?: string;
  durationMins?: number;      // pre-computed for Day view block height
  status: AppointmentStatus;
  notes?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  linkedLeadId?: number;      // optional link to Lead
  createdBy: string;
  createdAt: number;          // ms epoch
  // Future scaffold — stored in Firestore, not rendered in UI yet:
  reminderEmailSent?: boolean;
  reminderSmsSent?: boolean;
  confirmationSent?: boolean;
}
