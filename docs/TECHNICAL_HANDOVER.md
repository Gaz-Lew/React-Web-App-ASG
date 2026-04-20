# ASG CRM — Technical Handover Document

> **System:** ASG Leads CRM (Amplify Solutions Group)
> **Firebase Project:** `amplify-leads-2026`
> **Hosting Site:** `amplify-leads-2026`
> **Tech Stack:** React 18 + TypeScript + Tailwind + Firebase (Firestore + Storage)
> **State Management:** Zustand
> **Routing:** In-memory tab-based navigation (no react-router)

---

## 1. SYSTEM OVERVIEW

### What It Is

A CRM built for a financial/property services team (Amplify Solutions Group) operating in Perth and Brisbane. The system manages the full lifecycle of property-owner leads from initial contact through to settlement and commission payout.

### Core Purpose

Track homeowners (leads) through a multi-stage sales pipeline, coordinate a team of sales reps, manage appointments and bookings, and forecast commission revenue.

### Main Workflows

1. **Lead → Call → Booking → Deal → Settlement → Commission**
   - Leads are ingested (manual entry, CSV import, DQ import, door-knock mode)
   - Reps call leads and log outcomes (connected, no answer, callback, booked, not interested, wrong number)
   - When a lead is **booked**, a `Deal` document is auto-created and linked via `lead.dealId`
   - The deal progresses through stages: Booked → Appointment Set → Appointment Done → Application In → Under Assessment → Approved → Settlement → Complete
   - At settlement, commission is calculated and tracked per rep allocation

2. **Training + Roleplay**
   - Structured training courses with modules (video/text/checklist)
   - AI roleplay system with 5 persona types and 5 scenarios (booking call, door knock, first consult, follow-up, property sale)
   - Objection injection with 3-tier difficulty, scoring on objection handling / questioning / closing

3. **Reporting + Forecasting**
   - Weighted pipeline forecasting (lead 20%, conditional 50%, unconditional 80%, settled 100%)
   - Company and per-rep targets tracked against actuals
   - KPI dashboards with conversion funnels, call charts, status breakdowns
   - CSV/PDF export

---

## 2. ARCHITECTURE

### Frontend

| Layer | Technology |
|-------|-----------|
| Framework | React 18 (functional components + hooks) |
| Language | TypeScript (strict mode, ES2020) |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 (custom theme: gold `#b8933a`, brass, panel/sidebar colours) |
| Icons | lucide-react |
| State | Zustand (global store) + local `useState`/`useMemo` |
| UI Scale | Custom `useUiScale()` hook — responsive `fontSize` scaling from 0.75 to 1.0 |
| Dark Mode | Class-based toggle on `<html>`, persisted to localStorage |

### Backend

| Service | Usage |
|---------|-------|
| **Firestore** | Primary data store — all business data (leads, deals, reps, settings, etc.) |
| **Firebase Storage** | File attachments, profile photos, PDF documents, form templates, invoice PDFs |
| **Firebase Auth** | Initialized but **NOT used** for authentication. PIN-based auth is custom-built |
| **Cloud Functions** | Single callable function `getPropertyInsights` (placeholder, not wired into UI) |
| **Hosting** | Firebase Hosting, deployed via `npm run deploy` |

### Auth Model

**PIN-based custom auth** — no Firebase Auth used for login:
1. Rep selects name from roster
2. First-time: enter access code `9090` → set email, PIN (4-6 digits), backup password
3. Subsequent: enter PIN
4. Forgot PIN → enter backup password → reset PIN
5. Admin bypass: `/GLadmin` URL triggers auto-login (initials `GL` + code `8711`)

### Data Flow

```
leads (collection) ← onSnapshot → Zustand store → DataTable / Sidebar / Map
  │
  ├─ call logged → status mapped (booked → "booked") → if booked, create deal
  │     ↓
  └─ leads/{id}/dealId → links to → deals (collection)
                              ↓
                        DealDashboard reads deals + fetches linked lead on-demand
                              ↓
                        ReportsDashboard aggregates deals for forecasting
```

All pages subscribe to Firestore via `onSnapshot` hooks that sync to local state. There is **no SSR** — this is a pure SPA.

---

## 3. FIRESTORE DATA MODELS

### Top-Level Collections

#### `leads` (doc ID: stringified number)

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | Cryptographic ID from `generateLeadId()` |
| `name` | string | Full name |
| `phone` | string | AU mobile, normalised |
| `email` | string? | Optional |
| `houseNum`, `street`, `suburb`, `postcode` | string? | Address |
| `ownership` | string? | Own/renting/etc |
| `superannuation` | string? | Super fund info |
| `employment` | string? | Employment status |
| `dqRep` | number | Rep ID who generated the lead |
| `status` | LeadStatus \| string | Canonical: `new`, `contacted`, `qualified`, `booked`, `lost`. Legacy: `DQ`, `Live`, `Booked`, `Revisit`, `Not Interested`, `Wrong Number`, `No Answer` |
| `result` | CallResult? | Last call outcome |
| `notes` | string? | Free-text notes |
| `leadDate` | string? | Date lead was generated |
| `dealId` | string? | Firestore doc ID in `deals` collection (set when `result === 'booked'`) |
| `lastCall` | string? | ISO date of last call |
| `callingRep` | number? | Rep ID who made last call |
| `dealValue` | number? | Estimated deal value |
| `bookingDate`, `bookingTime` | string? | Original booking date/time |
| `appointmentDate`, `appointmentTime` | string? | Appointment date/time |
| `fcRep`, `frRep`, `psRep` | number? | Assigned rep IDs for each stage |
| `dnqFellOver` | boolean? | Booking did not qualify |
| `dnqNotes` | string? | Reason for DNQ |
| `dealStage` | DealStage? | `Booked` → `Complete` |
| `fcAppt`, `frAppt`, `psAppt` | object? | Structured appointment objects (date, repId, result, notes, docs[]) |
| `settlementDate` | string? | Actual settlement date |
| `dealCommissions` | object? | `{ receivedByRepId, totalAmount, repPayments[] }` |
| `dealComplete` | boolean? | |
| `dealCompleteDate` | string? | |
| `callbackDate`, `callbackTime` | string? | |
| `nextContactDate` | string? | ISO date for follow-up engine |
| `lat`, `lng` | number? | Geocoded coordinates |
| `knockResult` | string? | Door knock outcome |
| `createdAt` | number? | Epoch ms |
| `callHistory` | CallHistory[]? | Append-only call log |
| `activities` | Activity[]? | Activity log |
| `timelyAdded` | boolean? | Imported from Timely CSV |

**Subcollections:**
- `leads/{id}/notes` — `LeadNote` documents
- `leads/{id}/files` — `LeadFile` documents
- `leads/{id}/presence` — ephemeral "who is viewing" tracking
- `leads/{id}/dealUpdates` — deal pipeline message board

#### `deals` (auto-generated string ID)

| Field | Type | Notes |
|-------|------|-------|
| `clientName` | string | Display name |
| `leadId` | string | FK → leads collection (stringified number) |
| `status` | DealStatus | `lead` → `conditional` → `unconditional` → `settled` → `lost` |
| `dealValue` | number | Total deal value |
| `commissionTotal` | number | Expected commission |
| `commissionPaid` | number | Amount paid out so far |
| `expectedSettlementDate` | string | YYYY-MM-DD |
| `contractSignedDate` | string? | |
| `financeApprovedDate` | string? | |
| `assignedTo` | number | Rep ID |
| `lastUpdate` | number | Epoch ms — used for stuck/at-risk logic |
| `notes` | DealNote[] | `{ id, text, createdAt, createdBy, createdById }` |
| `createdAt` | number | Epoch ms |
| `createdBy` | string | Rep name |

#### `reps` (doc ID: stringified number)

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | |
| `name` | string | |
| `active` | boolean | |
| `role` | `"rep"` \| `"admin"` | |
| `email` | string? | PIN recovery |
| `phone` | string? | |
| `photo` | string? | Firebase Storage URL |
| `abn`, `bsb`, `accountNumber` | string? | Commission payment details |
| `pin` | string? | 4-6 digit numeric |
| `backupPassword` | string? | Text password for PIN recovery |
| `isSetup` | boolean | false = first-time login flow |
| `permissions` | string[]? | Empty/undefined = full access; array = restricted page list |
| `lastLoginAt` | number? | Epoch ms |
| `color` | string? | Hex — calendar block colour |
| `showOnCalendar` | boolean? | false = hidden from DayView |
| `availableForBookings` | boolean? | false = hidden from appointment dropdown |
| `allowedServiceTypes` | string[]? | Empty = all types; array = restricted |

#### `settings/main` (fixed doc ID `"main"`)

| Field | Type | Notes |
|-------|------|-------|
| `commission.dqRate` | number | % of deal value for DQ rep |
| `commission.fcRate` | number | % for FC rep |
| `commission.frRate` | number | % for FR rep |
| `repTargets` | `Record<number, RepTarget>` | Keyed by rep.id: `{ weeklyDQ, monthlyDQ, weeklyBookings, monthlyBookings }` |
| `staleThresholdDays` | number | Days without contact before "stale", default 14 |
| `statusColors` | `Record<string, string>`? | Hex colours per LeadStatus |
| `sheets` | SyncConfig? | Google Sheets sync: `{ url, tab, autoSyncEnabled, autoSyncIntervalMins, lastSyncAt, lastSyncResult, lastSyncSummary }` |

#### `draps` (doc ID: stringified number)

Daily Reporting & Performance Stats.

| Field | Type |
|-------|------|
| `date` | string (YYYY-MM-DD) |
| `repId` | number |
| `repName` | string |
| `dq`, `referrals`, `appointments`, `presentations`, `sold` | number |
| `fcAppts`, `fcPresented`, `fcBooked` | number |
| `frAppts`, `frPresented`, `frBooked` | number |
| `createdAt` | number |

#### `commissions` (auto-generated string ID)

| Field | Type |
|-------|------|
| `client1`, `client2` | string |
| `currentAddress` | string |
| `soldAddress` | string |
| `settlementDate` | string (YYYY-MM-DD) |
| `total` | number |
| `entity` | `"Perth"` \| `"Brisbane"` |
| `reminderEnabled` | boolean? |
| `repAllocations` | `RepAllocation[]` | `{ repId, repName, amount, paid, paidAt, role }` |
| `notes` | string? |
| `createdAt` | number |
| `createdBy` | string |

#### `invoiceDrafts` (auto-generated string ID)

| Field | Type |
|-------|------|
| `invoiceToType` | `"fixed"` \| `"rep"` |
| `invoiceToFixed` | string |
| `invoiceToRepId` | number \| `""` |
| `invoiceDate`, `amount`, `clientName`, `clientAddress`, `linkedSettlement` | string |
| `repId` | number \| `""` |
| `createdAt` | number |
| `createdBy` | string |
| `label` | string? |

#### `audit` (auto-generated string ID)

| Field | Type |
|-------|------|
| `timestamp` | number |
| `date`, `time` | string |
| `user` | string |
| `action` | string | (e.g. `lead_updated`, `call_logged`) |
| `detail` | string |
| `leadId`, `leadName` | number \| string? |

#### `knockZones` (doc ID: `zone_${timestamp}_${rand}`)

| Field | Type |
|-------|------|
| `name` | string? |
| `repIds` | number[]? | Multi-rep (new, preferred) |
| `repNames` | string[]? | |
| `repId`, `repName` | number \| string? | Legacy single-rep |
| `date` | string (YYYY-MM-DD) |
| `polygon` | `{ lat, lng }[]` |
| `color` | string (hex) |
| `createdAt` | number |
| `createdBy` | string |

#### `customPinTypes` (doc ID: `pin_${timestamp}_${rand}`)

| Field | Type |
|-------|------|
| `name` | string |
| `color` | string (hex) |
| `createdAt` | number |
| `createdBy` | string |

#### `teamChat` (auto-generated string ID)

| Field | Type |
|-------|------|
| `repId`, `repName` | number, string |
| `text` | string |
| `type` | `"text"` \| `"location"` \| `"status"` \| `"file"` |
| `lat`, `lng` | number? |
| `timestamp`, `createdAt` | number |
| `fileUrl`, `fileName`, `fileType`, `fileSize` | string, number? |
| `reactions` | `Record<string, number[]>`? | emoji → repIds |

#### `dmChannels/{channelId}/messages` (subcollection)

Same `ChatMessage` schema as `teamChat`.

#### `knowledgeBase` (auto-generated string ID)

| Field | Type |
|-------|------|
| `title` | string |
| `category` | KBCategory (13 options) |
| `content` | string (HTML from rich text) |
| `tags` | string[] |
| `pinned` | boolean |
| `createdAt`, `updatedAt` | number |
| `createdBy` | string |
| `views` | number |

#### `documentLibrary` (auto-generated string ID)

| Field | Type |
|-------|------|
| `name`, `description`, `category` | string |
| `storagePath`, `downloadUrl`, `fileType` | string |
| `fileSize` | number |
| `uploadedBy` | string |
| `uploadedAt` | number |
| `formFields` | `DocFormField[]`? | `{ id, label, type, options?, autoFill? }` |
| `sortOrder` | number? |

#### `formTemplates` (auto-generated string ID)

| Field | Type |
|-------|------|
| `name`, `description` | string |
| `type` | `"builder"` \| `"pdf"` |
| `fields` | `FormTemplateField[]` |
| `pdfUrl`, `pdfStoragePath` | string? |
| `version` | number? |
| `versionHistory` | array? |
| `createdBy`, `createdAt`, `updatedAt` | number, string |
| `sortOrder` | number? |

#### `calendarServiceTypes` (auto-generated string ID)

| Field | Type |
|-------|------|
| `name` | string |
| `category` | `"Finance"` \| `"Property Sale"` \| `"General"` |
| `color` | string (hex) |
| `defaultDuration` | number (minutes) |
| `sortOrder` | number? |

#### `appointments` (auto-generated string ID)

| Field | Type |
|-------|------|
| `title` | string (client name display label) |
| `serviceTypeId` | string (FK → ServiceType) |
| `repId` | number |
| `date` | string (YYYY-MM-DD) |
| `startTime`, `endTime` | string (HH:MM 24-hour) |
| `durationMins` | number? |
| `status` | AppointmentStatus (12 options) |
| `notes` | string? |
| `clientName`, `clientPhone`, `clientEmail`, `clientAddress` | string? |
| `linkedLeadId` | number? |
| `createdBy` | string |
| `createdAt` | number |
| `reminderEmailSent`, `reminderSmsSent`, `confirmationSent` | boolean? | (stored but not rendered)

#### `properties` (auto-generated)

Created by Cloud Function `getPropertyInsights`. Not wired into UI.

---

## 4. CORE FEATURES (CURRENT STATE)

### A. Leads System

**File:** `src/pages/Leads.tsx`

- **Lead tracking**: Full CRUD via `DataTable` component with inline editing of phone, suburb, status, ownership, superannuation, employment, DQ rep
- **Call logging**: `CallLogger` modal — standardised outcomes (`connected`, `no_answer`, `callback`, `booked`, `not_interested`, `wrong_number`). Each outcome conditionally shows fields:
  - `booked` → requires booking date/time → auto-creates Deal
  - `callback` → requires callback date/time
  - Others → notes only
- **Status mapping**: CallResult → LeadStatus (`booked` → `"booked"`, `not_interested` → `"lost"`, etc.)
- **Soft delete**: Lead marked `status: "_deleted"` → 5-second undo window → hard delete of document + subcollections (`presence`, `files`)
- **Lead sidebar**: Slide-out panel (`LeadSidebar`) with full lead details, structured appointments, notes subcollection, file attachments, deal updates
- **Add Lead Modal**: `AddLeadModal` with validation, suburb autocomplete
- **CSV Import**: `CSVImportModal` and `TimelyCSVImportModal` for bulk imports
- **DQ Import**: Dedicated `DQImportPage` with specialised import flow

### B. Deal Dashboard

**File:** `src/pages/DealDashboard.tsx`

- **Deal pipeline**: All deals ordered by `createdAt desc`
- **Stats bar**: Active deals, pipeline value, expected commission, outstanding, settled (this month), lost
- **Stage breakdown**: Filter buttons for each status + `Chase` (stuck > 7 days, not at-risk) + `At Risk` (stuck > 7 days AND settlement within 7 days)
- **Intelligence flags**:
  - `isStuck`: !complete && `daysSince(lastUpdate)` > `STUCK_DAYS` (7)
  - `isAtRisk`: !complete && stuck && `daysUntil(expectedSettlementDate)` ≤ `AT_RISK_DAYS` (7)
  - `overdue`: `expectedSettlementDate` < today
- **Next Action engine**: Priority order: callback scheduled → at-risk → stuck → no call history → call
- **Inline editing**: Commission paid and settlement date can be edited inline in the table row
- **Deal drawer**: Full-screen on mobile, right panel on desktop. Shows:
  - Client info, status dropdown, deal value
  - Financial breakdown (commission %, outstanding)
  - Linked lead details (fetched on-demand via `useLinkedLead`)
  - Deal notes (add/view)
  - Unified timeline (deal notes + lead call history merged)
  - Commission payment breakdown (`RepPayment[]`)
- **Responsive**: Card list on mobile, full table on desktop

### C. Call Logging System

**File:** `src/components/CallLogger.tsx`

- Modal triggered from Leads page, Map page, or Dashboard
- Rep selector defaults to current user
- Validation: dates must be YYYY-MM-DD, times must be HH:MM
- On `booked`:
  1. Checks if `lead.dealId` already exists → reuses it
  2. Otherwise calls `useCreateDeal()` → creates new deal in `deals` collection → links via `lead.dealId`
- Appends to `callHistory[]` (append-only, never mutated)
- Status mapped via `statusMap` record
- Audit entry added via `useAddAuditEntry`

### D. Reporting Dashboard

**File:** `src/pages/ReportsDashboard.tsx`

- **Date range selector**: This Week / This Month / Last Month / Custom
- **KPI grid**: Active deals, pipeline value, settled value, total commission, commission outstanding, lead→booked rate, booked→settled rate
- **Charts**: Status breakdown, conversion funnel, rep performance bars
- **Forecasting**:
  - Weighted pipeline = Σ(dealValue × stageWeight) where weights: lead=0.2, conditional=0.5, unconditional=0.8, settled=1.0
  - Company target from `settings.main` (not yet stored in settings — currently calculated from deal data)
  - Per-rep targets from `settings.repTargets`
  - Progress bars with % complete and remaining values
  - Underperforming rep highlighting
- **Risk section**: Deals that are stuck (>7 days) or at-risk
- **Paginated deal table**: All deals in date range with status, value, rep, settlement date
- **CSV export**: KPI data + deal table export
- **PDF export**: via jsPDF

### E. Forecasting + Targets

- **Weighted pipeline**: Calculated in `ReportsDashboard` using `STAGE_WEIGHTS` map
- **Company targets**: Not yet persisted in `settings/main` — currently derived from deal data
- **Rep targets**: `settings.repTargets` keyed by rep ID: `{ weeklyDQ, monthlyDQ, weeklyBookings, monthlyBookings }`
- **Progress tracking**: Per-rep revenue generated vs target revenue, with progress bar and remaining amount

### F. Map / Knock System

**File:** `src/pages/Map.tsx`

- **Google Maps** integration via `@react-google-maps/api`
- **Marker clustering** via `@googlemaps/markerclusterer`
- **Pins**: Colour-coded by lead status using custom SVG marker
- **Filters**: Status chips, rep dropdown, suburb dropdown, text search
- **Info panel**: Click marker → lead details + quick call/sidebar
- **Knock Mode**:
  - Toggle on → click map → reverse geocode → populate address fields
  - Knock result selection: `not-interested`, `no-answer`, `skipped`, `dq-complete`, `parents-not-home`
  - Creates new lead with lat/lng + knockResult
- **Zone Drawing**:
  - Polygon drawing mode for territories
  - Assign to one or more reps
  - Zone date tracking for historical knock coverage
- **Custom Pin Types**: Admin-created pin types with custom names and colours
- **Geolocation**: Centres on user's location on first load, cached in localStorage (`asgUserLocation`)
- **Always starts in Hybrid view** (satellite + labels)

### G. Knowledge Base

**File:** `src/pages/KnowledgeBase.tsx`

- Article browser with category filtering (13 categories)
- Search by title/tags
- Pinning support
- View count tracking
- Rich HTML content from Firestore
- `KnowledgeLayout` component shared with Admin Guide

### H. Training Hub

**File:** `src/pages/TrainingHub.tsx`

- **Courses list**: Training courses from `trainingCourses` collection with progress bars
- **Course view**: Modules from `trainingModules` collection (video/text/checklist types)
- **Progress tracking**: `userProgress` collection — per-user, per-module completion
- **SOP quick reference**: Queries `knowledgeBase` collection filtering by tag `"SOP"`
- **AI Roleplay integration**: Embedded `AIRoleplayPage` component

### I. AI Roleplay System

**File:** `src/components/AIRoleplay.tsx`

- **5 Persona types**:
  - `skeptical_professional` — analytical, guarded
  - `time_poor_parent` — distracted, rushed
  - `price_sensitive` — frugal, cautious
  - `friendly_non_committal` — agreeable, avoids decisions
  - `motivated_seller` — interested, ready to engage
- **5 Scenarios**: `booking_call`, `door_knock`, `first_consult`, `follow_up`, `property_sale`
- **3 Difficulty levels**: easy, medium, hard
- **Objection library**: 3 tiers (soft, moderate, hard) with 7-10 objections each
- **Conversation flow**: neutral → resistance → softening
- **Objection injection**: Every 2-3 exchanges
- **Scoring**: `objectionHandling`, `questioning`, `closing`, `total`
- **Session states**: `setup` → `active` → `ended`
- **Max exchanges**: Configurable per scenario (default 12)
- **AI prompt engineering**: System prompt enforces short responses, no assistance, push back with objections, gradual softening
- **Session persistence**: Saved to Firestore (collection TBD — currently not wired to a specific collection)

---

## 5. BUSINESS LOGIC (IMPORTANT)

### Deal Creation Rules

1. Triggered **only** when call result = `"booked"` in CallLogger
2. `useCreateDeal()` creates a document in `deals` collection with:
   - `clientName` = `lead.name`
   - `leadId` = `String(lead.id)`
   - `status` = `"lead"`
   - `assignedTo` = `callingRep` (the rep who logged the call)
   - `dealValue` = `lead.dealValue` (or 0)
   - `commissionTotal` = 0, `commissionPaid` = 0
   - `notes` = [], `lastUpdate` = Date.now(), `createdAt` = Date.now()
3. The returned deal ID is stored in `lead.dealId`
4. **Duplicate prevention**: If `lead.dealId` already exists, the existing deal is reused — no new deal is created

### Status Flow

**Lead statuses** (canonical writes):
```
new → contacted → qualified → booked → lost
```

**Legacy statuses** (read-only compat): `DQ`, `Live`, `Booked`, `Revisit`, `Not Interested`, `Wrong Number`, `No Answer`

**Deal statuses**:
```
lead → conditional → unconditional → settled | lost
```

**Deal stages** (on lead document):
```
Booked → Appointment Set → Appointment Done → Application In → Under Assessment → Approved → Settlement → Complete
```

### Commission Tracking

- Commission rates configured in `settings.main.commission` (`dqRate`, `fcRate`, `frRate`)
- `Deal.commissionTotal` = expected commission amount
- `Deal.commissionPaid` = amount actually paid out
- `Deal.dealCommissions` = structured breakdown with `repPayments[]` tracking who is owed what
- `CommissionEntry` collection tracks settled deals with `repAllocations[]` (role: DQ/FC/FR)
- Outstanding = `commissionTotal - commissionPaid`

### Forecast Calculation

```
weightedPipeline = Σ(dealValue × STAGE_WEIGHT[status])
```

Where:
- `lead` → 0.2
- `conditional` → 0.5
- `unconditional` → 0.8
- `settled` → 1.0
- `lost` → excluded

### Chase Logic

```
isStuck = !isComplete(status) && daysSince(lastUpdate) > STUCK_DAYS (7)
```

### At Risk Logic

```
isAtRisk = isStuck && daysUntil(expectedSettlementDate) >= 0 && daysUntil(expectedSettlementDate) <= AT_RISK_DAYS (7)
```

### Automation Rules

**File:** `src/lib/automation.ts`

Single active rule: **Inactive 3 days → schedule follow-up**
- Conditions: `!lead.nextContactDate` && `!TERMINAL_STATUSES.has(lead.status)` && `lastActivity > 3 days ago`
- Action: Set `nextContactDate = tomorrow`
- Pure function — caller writes back to Firestore

### Next Action Engine

**File:** `src/lib/nextAction.ts`

Priority-ordered rule chain:
1. No contact made → **Call** (high)
2. Qualified + no appointment → **Book Appt** (high)
3. Missed/cancelled appointment → **Reschedule** (high)
4. No activity in 3+ days → **Follow Up** (medium)
5. All up to date → **Up to Date** (low)

---

## 6. UI STRUCTURE

### Layout

```
<AppShell>
  ├── (not logged in) → <LoginScreen>
  └── (logged in)
      ├── <Sidebar> (left, collapsible on mobile)
      │   ├── Top: Dashboard, Team Chat, Map, Calendar
      │   ├── LEADS: Leads, DQ Import, DRAPS
      │   ├── SALES: Clients, Deal Dashboard, Reports, Comms Calculator
      │   ├── DOCUMENTS & TRAINING: Documents, Knowledge Base, Training
      │   └── SYSTEM: Settings, Admin, Admin Guide
      ├── <TopBar> (page title, dark mode, UI scale, logout)
      └── <main>
          ├── leads → <LeadsPage> (eager)
          └── all others → lazy <React.Suspense fallback={<PageLoader>}>
```

### Key UI Patterns

- **Drawers**: `LeadSidebar` — desktop: fixed right panel (40% width); mobile: full-screen overlay
- **Modals**: AddLead, CallLogger, CSVImport, SheetsSync, AppointmentModal, FormFiller, PdfFormFiller
- **Tables**: `DataTable` — sortable, filterable, inline editable cells
- **Cards**: Stat cards with gradient backgrounds, icons, trend indicators
- **Charts**: SVG donut chart (`DonutChart`), bar charts (CSS-based)
- **Mobile responsiveness**:
  - UI scale auto-adjusts via `useUiScale()` (0.75–1.0 based on viewport)
  - Deal rows → cards on mobile
  - Drawers → full-screen on mobile
  - Touch targets: min 44px

---

## 7. PERFORMANCE STRATEGY

### Firestore

- **Single `onSnapshot` per collection** — each page subscribes once
- **Leads**: One global listener in `useLeads()` — all pages share the same data via Zustand
- **Deals**: Separate listener in `useDeals()` — only DealDashboard and ReportsDashboard use it
- **Linked lead fetch**: `useLinkedLead()` uses `getDoc()` (one-time read) — only called when a deal drawer is opened
- **Subcollections**: NOT loaded by default — fetched on-demand when sidebar opens
- **Strip undefined**: All Firestore writes pass through `stripUndefined()` to avoid write errors

### Client-Side Aggregation

- All filtering, sorting, and calculations done in `useMemo`
- No server-side pagination — all data loaded client-side
- Status breakdowns, KPIs, forecasts computed via `useMemo` over raw arrays

### Zustand Store

- `leads`, `reps` synced from Firestore listeners → Zustand
- `reps` persisted to localStorage (`asg-crm:reps`) for offline cache
- `currentUser` persists across navigation (not page reloads)
- Individual field updates via `updateLead()` (immutable map)

### React Optimisations

- `React.lazy()` for all pages except `LeadsPage`
- `useCallback` on all event handlers passed to children
- `useMemo` for filtered/sorted arrays
- No `useEffect` chains for derived state — all computed inline

---

## 8. CODE STRUCTURE

```
src/
├── main.tsx                    # React entry point
├── App.tsx                     # Root: ErrorBoundary > ToastProvider > AppShell (login, sidebar, routing)
├── vite-env.d.ts               # Vite env type declarations
│
├── components/                 # 16 shared components
│   ├── AddLeadModal.tsx        # Create lead modal
│   ├── AIRoleplay.tsx          # AI roleplay training (1417 lines)
│   ├── AppointmentModal.tsx    # Calendar appointment CRUD
│   ├── CallLogger.tsx          # Call logging modal (411 lines)
│   ├── CSVImportModal.tsx      # CSV import wizard
│   ├── DataTable.tsx           # Main leads table (inline editing, sorting, filtering)
│   ├── DonutChart.tsx          # SVG donut chart
│   ├── DQImportModal.tsx       # DQ lead import
│   ├── ErrorBoundary.tsx       # React error boundary (class)
│   ├── FormFillerModal.tsx     # Builder-based form filler
│   ├── KnowledgeLayout.tsx     # Shared KB/Admin Guide layout
│   ├── LeadSidebar.tsx         # Slide-out lead detail panel
│   ├── PdfFormFillerModal.tsx  # PDF AcroForm filler (pdf-lib)
│   ├── SheetsSyncModal.tsx     # Google Sheets sync config
│   ├── SuburbInput.tsx         # Suburb autocomplete
│   └── TimelyCSVImportModal.ts # Alternative CSV import
│
├── context/
│   └── ToastContext.tsx        # Toast notification system
│
├── data/
│   ├── knowledgeBase.ts        # ADMIN_GUIDE_SECTIONS (10-section HTML guide)
│   └── waSuburbs.ts            # ~250 Western Australian suburbs
│
├── hooks/
│   ├── useFirebase.ts          # ~60 Firestore hooks (1172 lines) — EVERY collection
│   └── useCallbackReminders.ts # Browser notifications for callbacks due within 24h
│
├── lib/
│   ├── firebase.ts             # Firebase init (multi-tab persistence)
│   ├── utils.ts                # Formatting, validation, CSV export
│   ├── idGenerator.ts          # Cryptographic ID generation (crypto.getRandomValues)
│   ├── automation.ts           # Pure-function automation rules
│   ├── followUp.ts             # Follow-up date evaluation
│   ├── nextAction.ts           # Next Action Engine (priority rule chain)
│   ├── statusConfig.ts         # Status colour resolution
│   └── storage.ts              # Firebase Storage utilities
│
├── pages/                      # 19 page components
│   ├── Admin.tsx               # Admin settings (4171 lines) — reps, permissions, colours, commission, Sheets sync, service types, pin legend
│   ├── AdminGuide.tsx          # In-app admin guide
│   ├── Calendar.tsx            # Full calendar (DayView/WeekView) + DEFAULT_SERVICE_TYPES
│   ├── ClientHub.tsx           # Client-facing view of booked leads
│   ├── Commissions.tsx         # Commission calculator + settlement tracker
│   ├── Dashboard.tsx           # Hero dashboard (stats, charts, priority queue, follow-up engine)
│   ├── DealDashboard.tsx       # Deal pipeline overview (1993 lines)
│   ├── DealPipeline.tsx        # Individual deal Kanban (exported, unclear if routed)
│   ├── DocumentCentre.tsx      # Document library + upload + PDF preview + form filling
│   ├── DQImport.tsx            # DQ lead import page
│   ├── Draps.tsx               # Daily Reporting & Performance Stats
│   ├── KnowledgeBase.tsx       # Knowledge base browser
│   ├── Leads.tsx               # Main leads table + sidebar + call logger (341 lines)
│   ├── Map.tsx                 # Google Maps + knock mode + zones (2169 lines)
│   ├── ReportsDashboard.tsx    # Reports + analytics + forecasting (1446 lines)
│   ├── TeamChat.tsx            # Group chat + DMs + emoji reactions
│   ├── TrainingHub.tsx         # Training courses + modules + AI roleplay (870 lines)
│   ├── migrateDealStatuses.example.js  # Migration script example
│   └── seedDealPipeline.example.js       # Seeding script example
│
├── stores/
│   └── appStore.ts             # Zustand global state
│
├── styles/
│   └── globals.css             # Global CSS (Tailwind + custom variables)
│
└── types/
    └── index.ts                # All TypeScript types/interfaces (barrel export)
```

### Key Hooks/Utilities

| Hook/Utility | Purpose |
|---|---|
| `useLeads()` | Real-time listener for all leads |
| `useSaveLead()` | `setDoc` with `merge: true` + `stripUndefined` |
| `useDeleteLead()` | Deletes subcollections (`presence`, `files`) then document |
| `useCreateDeal()` | `addDoc` to `deals` collection, returns doc ID |
| `useReps()` | Real-time listener for reps |
| `useAppSettings()` | Listener for `settings/main` |
| `useKnockZones()` | Real-time listener for map zones |
| `useTeamChat()` / `useSendChatMessage()` | Group chat with 150-message cap |
| `useDirectMessages()` / `useSendDirectMessage()` | DM channels |
| `useFormTemplates()` / `useSaveFormTemplate()` | Form template CRUD |
| `useServiceTypes()` / `useAppointments()` | Calendar data |
| `useLeadNotes()` / `useLeadFiles()` | Lead subcollection CRUD |
| `useDealUpdates()` | Deal message board |
| `applyAutomation(lead)` | Pure function: inactive 3 days → set follow-up |
| `getNextAction({ lead, notesCount, appointments })` | Pure function: priority rule chain |
| `deriveLastActivityAt(lead, latestNoteAt)` | Derives most recent activity timestamp |

---

## 9. CURRENT LIMITATIONS / NEXT STEPS

### Incomplete or Partially Implemented

1. **AI Roleplay sessions not persisted** — Session scores and chat logs are held in local state only. No Firestore collection is written to. Needs a `roleplaySessions` collection.
2. **Training courses/modules not seeded** — `trainingCourses` and `trainingModules` collections exist in code but likely have no data in Firestore. Needs seeding script.
3. **Company targets not in settings** — Forecasting reads targets from deal data, not from `settings/main`. The `settings` model has no `companyTarget` field yet.
4. **DealPipeline page** — `DealPipeline.tsx` exists and exports a component but is **not routed** in `App.tsx`. It may be unused or intended as a future Kanban view.
5. **Cloud Function `getPropertyInsights`** — Placeholder function. Not called from the frontend. `properties` collection is unused.
6. **Appointment reminders** — `reminderEmailSent`, `reminderSmsSent`, `confirmationSent` fields exist on `Appointment` but no sending logic exists.
7. **Google Sheets sync** — UI for `SheetsSyncModal` exists with `SyncConfig` in settings, but the actual sync logic (pull/push) is likely incomplete or relies on external scripts.
8. **PDF form filler** — `PdfFormFillerModal` uses `pdf-lib` for AcroForm filling. Works but may have edge cases with complex forms.
9. **Client Hub** — `ClientHubPage` shows booked leads in a client-facing view. Likely incomplete — no auth separation between rep and client views.

### Technical Debt

1. **No router** — Tab-based navigation via `useState<Page>` works but makes deep linking, bookmarks, and browser history impossible. Consider adding `react-router` or at minimum URL hash routing.
2. **Massive files** — `Admin.tsx` (4171 lines), `Map.tsx` (2169 lines), `DealDashboard.tsx` (1993 lines), `AIRoleplay.tsx` (1417 lines). These should be split into smaller sub-components.
3. **No Firestore security rules documented** — Rules are not in the repo (likely configured in Firebase Console). Should be exported and version-controlled.
4. **Magic numbers** — Access code `9090`, admin code `8711`, initials `GL` are hardcoded in `App.tsx`. Should be in environment variables or Firestore config.
5. **No E2E or unit tests** — Zero test coverage.
6. **`any` types** — Several components use `any` for lead/deal data instead of proper types.
7. **Call history as array** — `callHistory` is an embedded array on the lead document. At scale (>100 calls per lead) this will cause document size issues. Should be migrated to a subcollection.
8. **No pagination** — All leads and deals are loaded in full. Will become slow at >5000 records.
9. **No optimistic updates** — All writes wait for Firestore confirmation before updating UI.

### Recommended Next Steps

1. Add Firestore security rules to the repo
2. Migrate `callHistory` from embedded array to `leads/{id}/callHistory` subcollection
3. Add pagination or virtual scrolling to DataTable
4. Implement URL-based routing (react-router or hash routing)
5. Seed training courses/modules data
6. Persist AI roleplay sessions to Firestore
7. Add company revenue targets to `settings/main`
8. Split large files (Admin, Map, DealDashboard, AIRoleplay) into smaller modules
9. Add unit tests for pure functions (`applyAutomation`, `getNextAction`, `deriveLastActivityAt`)
10. Implement appointment reminder sending (email/SMS via Cloud Functions)

---

## 10. ENVIRONMENT VARIABLES

Required in `.env` (see `.env.example`):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GOOGLE_MAPS_API_KEY=          # or VITE_GOOGLE_PLACES_API_KEY
VITE_GOOGLE_SHEETS_API_KEY=        # optional, falls back to PLACES key
```

---

## 11. DEPLOYMENT

```bash
# Development
npm run dev        # Vite dev server on port 5173

# Production
npm run build      # tsc + vite build → dist/
npm run deploy     # build + firebase deploy --only hosting

# Lint
npm run lint       # eslint with TypeScript + React rules
```

Firebase project: `amplify-leads-2026`
Hosting site: `amplify-leads-2026`

---

*Document generated from codebase analysis. Last updated: 2026-04-09.*
