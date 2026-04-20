# Amplify CRM — System Architecture

> Version: 1.0 | Last updated: April 2026
> Stack: React 18 + Vite + TypeScript + Firebase (Firestore, Storage, Functions)

---

## 1. 🧠 System Overview

Amplify CRM is a full-featured, real-time sales execution and AI training platform built for mortgage broking and financial services teams.

**Who it serves:**

| Role | Primary Use |
|------|------------|
| **Sales Reps** | Lead management, call logging, appointment tracking, deal progression, AI training |
| **Managers** | Team performance monitoring, deal oversight, commission tracking |
| **Admins** | System configuration, rep management, document templates, DocuSign setup, knowledge base |

**Core purposes:**

1. **CRM** — Lead capture → client conversion → deal pipeline with real-time status tracking
2. **Sales Execution** — Next-action prioritisation, callback management, deal chat, commission allocation
3. **AI Training** — Scenario-based roleplay with personality engine, post-session coaching feedback
4. **Document & Compliance** — O&A form generation, DocuSign e-signature, signed document archiving, deal timeline

---

## 2. 🏗️ Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18 | UI component framework |
| Vite | 5 | Build tool + dev server |
| TypeScript | 5 | Strict type checking across entire codebase |
| Tailwind CSS | 3 | Utility-first styling with custom design tokens |
| Zustand | 4 | Lightweight global state (user session, reps, colour overrides) |
| lucide-react | 0.344 | Icon library |

### Backend (Firebase)

| Service | Purpose |
|---------|---------|
| **Firestore** | Real-time NoSQL database. All CRM data lives here. Uses `onSnapshot` listeners for instant UI updates. |
| **Firebase Storage** | File storage for deal documents, signed PDFs, training materials, profile photos. |
| **Cloud Functions v2** | Server-side logic for DocuSign envelope creation, webhook processing, and status reconciliation. Node.js 22 runtime. |
| **Firebase Hosting** | Static asset hosting and SPA routing via rewrite rules. |

### External Integrations

| Integration | Purpose | Auth Method |
|------------|---------|------------|
| **DocuSign** | E-signature for O&A documents | JWT impersonation (RSA-256) |
| **Google Maps API** | Lead geocoding, traffic layer, map pins | API key |

### AI System (Local, No External LLM)

All AI training logic runs client-side via pattern matching, rule-based analysis, and structured data. No external AI API calls are made.

| Module | File | Purpose |
|--------|------|---------|
| Personality Engine | `src/lib/personalityEngine.ts` | Emotional state model (trust/interest/resistance), imperfection injection, personality drift |
| Session Feedback | `src/lib/sessionFeedback.ts` | Post-session analysis with conversational coaching summary |
| Knowledge Structured | `src/data/knowledgeStructured.ts` | 14 structured KB items, 7 training scenarios, smart search engine |
| AI Insights | `src/lib/aiInsights.ts` | Client brief generation, smart next action with reasoning, note enhancement |

---

## 3. 📁 Project Structure

```
src/
├── App.tsx                    # Root component: layout, routing, floating tools
├── types/
│   └── index.ts               # All TypeScript interfaces (Lead, Deal, ClientNote, etc.)
├── pages/                     # Route-level views, rendered conditionally in App.tsx
│   ├── Dashboard.tsx          # Stats, priority work queue, callback reminders
│   ├── Leads.tsx              # Lead table with filtering, search, bulk actions
│   ├── ClientProfilePage.tsx  # Full-page client hub (notes, documents, reports, history)
│   ├── DealDashboard.tsx      # Deal pipeline with inline editing
│   ├── DealPipeline.tsx       # Kanban-style deal board
│   ├── KnowledgeBase.tsx      # KB articles + AI Coaching panel
│   ├── TrainingHub.tsx        # AI roleplay, courses, videos, recordings
│   ├── Calendar.tsx           # Appointment scheduling (FC/FR/PS)
│   ├── Map.tsx                # Geocoded leads, knock mode, zone drawing
│   └── ...
├── components/                # UI + feature components
│   ├── AIRoleplay.tsx         # Main roleplay session engine (chat + voice)
│   ├── AICoachingPanel.tsx    # Structured knowledge search + scenario launcher
│   ├── OADocumentEditor/      # O&A form editor (120+ fields, conditional logic)
│   ├── FloatingCalculator/    # Draggable calculator widget
│   └── ...
├── hooks/                     # Data + logic hooks
│   ├── useFirebase.ts         # All Firestore hooks (useDeals, useLeads, useDocuSign, etc.)
│   ├── useClientNotes.ts      # Centralised client notes with serverTimestamp
│   └── ...
├── lib/                       # Core engines (pure functions, no React dependencies)
│   ├── personalityEngine.ts   # Emotional state, imperfection, drift
│   ├── sessionFeedback.ts     # Post-session analysis
│   ├── aiInsights.ts          # Client brief, smart next action, note enhancement
│   └── ...
├── data/                      # Structured knowledge + scenario definitions
│   ├── knowledgeStructured.ts # KB items, training scenarios, smart search
│   └── knowledgeBase.ts       # Static HTML article content
├── stores/                    # Zustand stores
│   └── appStore.ts            # User session, reps, status colour overrides
└── context/                   # React context providers
    └── ToastContext.tsx       # Global toast notifications

functions/
└── src/
    ├── index.ts               # Function exports
    └── docusign.ts            # DocuSign envelope CRUD + webhook handler

public/
├── smsf/                      # Legacy standalone SMSF calculator (iframe)
└── pia/                       # Legacy standalone PIA calculator (iframe)
```

---

## 4. 🔄 Application Flow

### Navigation Architecture

The app uses **tab-based navigation** managed by `page` state in `App.tsx` — no external router.

```
App.tsx
├── const [page, setPage] = useState<Page>("dashboard")
├── Sidebar → calls setPage(pageId) on each click
├── useEffect listens to hash for deep links
└── <main> conditionally renders pages:
    {effectivePage === "dashboard" && <DashboardPage />}
    {effectivePage === "leads" && <LeadsPage />}
    {effectivePage === "client-profile" && <ClientProfilePage onNav={setPage} />}
    ...
```

### Lazy Loading

All pages except Leads are lazy-loaded to minimise initial bundle:

```tsx
const DashboardPage = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })));
// ...
<Suspense fallback={<PageLoader />}>
  {effectivePage === "dashboard" && <DashboardPage />}
</Suspense>
```

### Props Flow

* **App → Page**: Pages receive props from App state (e.g., `ClientProfilePage` receives `onNav` callback)
* **Page → Component**: Pages pass data/context to child components
* **Component → Hook**: Components call hooks (e.g., `useClientNotes(clientId)`) for data access
* **Hook → Firestore**: Hooks subscribe to Firestore collections via `onSnapshot`

### Page Resolution

The `effectivePage` variable applies access control — pages not in the user's `permissions` array are blocked, redirecting to dashboard.

---

## 5. 🗄️ Data Architecture (Firestore)

### Collections

| Collection | Purpose | Key Fields |
|-----------|---------|-----------|
| `reps` | Rep profiles, PINs, permissions | `id`, `name`, `pin`, `role`, `active`, `permissions`, `lastLoginAt` |
| `leads` | Lead records (primary CRM entity) | `id`, `name`, `phone`, `email`, `suburb`, `status`, `dqRep`, `callHistory[]`, `callbackDate`, `dealId` |
| `leads/{id}/notes` | Per-lead notes subcollection | `text`, `createdAt`, `createdBy`, `createdById` |
| `leads/{id}/files` | Per-lead file attachments | `name`, `storagePath`, `fileUrl`, `fileSize`, `uploadedBy` |
| `appointments` | Calendar appointments | `title`, `serviceTypeId`, `repId`, `date`, `startTime`, `linkedLeadId`, `status` |
| `clientNotes` | Centralised client timeline notes | `clientId`, `content`, `source`, `sourceId`, `isImportant`, `createdAtTs` (serverTimestamp), `createdAt` (fallback) |
| `deals` | Deal pipeline records | `id`, `leadId`, `clientName`, `status`, `dealValue`, `commissionTotal`, `assignedTo`, `expectedSettlementDate` |
| `dealDocuments` | Deal-scoped documents | `dealId`, `clientId`, `name`, `type` (oa/compliance/contract/other), `fileUrl`, `storagePath` |
| `documentInstances` | Fillable document instances | `type`, `clientId`, `dealId`, `data` (form data), `status`, `signedUrl`, `editable` |
| `docusignEnvelopes` | DocuSign envelope tracking | `dealId`, `envelopeId`, `status`, `signedUrl`, `viewingUrl`, `lastProcessedEventId` |
| `dealEvents` | Deal timeline events | `dealId`, `type`, `message`, `createdBy`, `metadata` |
| `smsfReports` | SMSF calculator results | `clientId`, `result` (JSON), `createdAt` |
| `piaReports` | PIA calculator results | `clientId`, `result` (JSON), `createdAt` |
| `trainingSessions` | AI roleplay session records | `repId`, `scenarioType`, `difficulty`, `score`, `messages[]`, `durationSeconds` |
| `knowledgeBase` | KB articles (HTML content) | `title`, `category`, `content`, `tags[]`, `pinned`, `views` |

### Key Relationships

```
reps ──1:N──> leads (via dqRep)
leads ──0:1──> deals (via dealId / leadId)
leads ──1:N──> clientNotes (via clientId = lead.id)
deals ──1:N──> dealDocuments (via dealId)
deals ──1:N──> dealEvents (via dealId)
deals ──1:N──> docusignEnvelopes (via dealId)
leads ──1:N──> appointments (via linkedLeadId)
```

---

## 6. 🔗 Data Flow

### Lead → Client → Deal

```
1. Lead created (DQ Import or manual entry)
   ↓
2. Rep calls lead → logs call → sets status
   ↓
3. Status = "Booked" → creates Deal document in Firestore
   ↓
4. Lead's dealId field updated → links lead ↔ deal
   ↓
5. Deal progresses through pipeline: lead → conditional → unconditional → settled
```

### Notes System (Multi-Source)

```
1. Note created from any source:
   - Manual: rep types in ClientProfilePage → Notes tab
   - Appointment: AppointmentModal saves notes → calls createClientNote()
   - Call: Call logger → calls createClientNote()
   - Deal: Deal activity → calls createClientNote()
   ↓
2. All notes saved to clientNotes collection with:
   - source: "manual" | "appointment" | "call" | "deal"
   - sourceId: ID of originating document
   - createdAtTs: serverTimestamp() (primary)
   - createdAt: Date.now() (fallback)
   ↓
3. ClientProfilePage subscribes via useClientNotes(clientId)
   → Sorted: important first, then by createdAt DESC
   → Displayed in Notes tab with source badges
```

### Document Upload → Storage → Firestore

```
1. User selects file → validation (type: PDF/PNG/JPG/DOC/DOCX, size: ≤10MB)
   ↓
2. uploadFile() uploads to Firebase Storage at /deals/{dealId}/{timestamp}_{name}
   ↓
3. Returns download URL
   ↓
4. Metadata written to dealDocuments collection
   ↓
5. If Firestore write fails → rollback: delete file from Storage
   ↓
6. Real-time listener updates UI → document appears in list
```

### DocuSign Flow

```
1. Rep fills O&A form → generates PDF (pdf-lib or jsPDF fallback)
   ↓
2. Rep clicks "Send to DocuSign" → useDocuSign hook calls Firebase Function
   ↓
3. createDocuSignEnvelope (onCall):
   a. Checks for existing active envelope (prevents duplicates)
   b. Downloads PDF from Storage or URL
   c. Creates DocuSign envelope via API (JWT auth)
   d. Stores envelope record in docusignEnvelopes
   e. Locks document instance (status → "locked", editable → false)
   ↓
4. Client signs via DocuSign email link
   ↓
5. docusignWebhook (onRequest) receives Connect event:
   a. Validates HMAC-SHA256 signature
   b. Validates timestamp (rejects events >5 min old)
   c. Checks lastProcessedEventId (idempotency)
   d. Downloads signed PDF from DocuSign API
   e. Uploads to Storage at /deals/{dealId}/signed/{clientName}_{dealId}_OA_Signed_{YYYYMMDD}.pdf
   f. Registers as dealDocument (type: "contract")
   g. Updates document instance (status → "signed")
   h. Creates dealEvent (type: "docusign_completed")
   i. Sends push notification to rep + admin
   ↓
6. Rep sees signed document in deal documents list
```

---

## 7. ⚙️ Core Engines

### nextAction.ts

**Location:** `src/lib/nextAction.ts` (referenced; logic also inlined in DealDashboard)

**How it works:**
Pure function that evaluates lead state and returns a single action recommendation.

```typescript
getNextAction(lead, notesCount, lastActivityAt, appointments)
→ { label: string, urgency: "urgent" | "high" | "medium" | "low" | "" }
```

**Rule chain (first match wins):**

| Priority | Condition | Output |
|----------|----------|--------|
| 1 | No notes + no call history + no appointments | "Call" (high) |
| 2 | Status = Live + no linked appointments | "Book Appt" (high) |
| 3 | Any appointment = cancelled/no-show | "Reschedule" (high) |
| 4 | Last activity > 3 days ago | "Follow up" (medium) |
| 5 | None of above | "" (low) |

**UI Integration:** Dashboard Priority Work Queue + Lead Sidebar banner.

### dates.ts

Centralised date formatting, validation, and correction:

* `formatDate(dateStr)` → "14 Apr 2026" (en-AU locale)
* `parseDate(input)` → YYYY-MM-DD (handles DD/MM/YYYY, DD-MM-YYYY, ISO)
* `correctFutureDate(dateStr)` → if date is in the past and intended for future, adjusts

### personalityEngine.ts

**Emotional State Model:**

```typescript
interface EmotionalState {
  trust: number;      // 0–100: increases with acknowledgment, questioning
  interest: number;   // 0–100: increases with value propositions, specifics
  resistance: number; // 0–100: increases with pushiness, vagueness, ignored concerns
}
```

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `createInitialEmotionalState(personality)` | Sets base trust/interest/resistance per personality type |
| `updateEmotionalState(state, personality, userMessage, exchangeCount)` | Updates emotional state after each user message |
| `getResponseModifier(context)` | Returns tone, length, deflection, questioning, agreement flags |
| `adaptResponseToPersonality(baseResponse, personality, state)` | Adapts base response to personality quirks |
| `injectImperfection(response, personality, state)` | 20% short/dismissive, 20% interruption, 15% vague uncertainty |
| `applyPersonalityDrift(response, personality, state)` | Trust >70 → warmer tone; Resistance >70 → defensive/shorter |

### sessionFeedback.ts

**Analyses session transcript:**

```typescript
analyseSession(messages, scenario, score, memory)
→ { strengths[], weaknesses[], missedOpportunities[], overallScore, coachingSummary }
```

**Detection patterns:**
* **Strengths:** Questions asked (contains "?"), concern acknowledgments, substantive responses (>40 chars), score thresholds
* **Weaknesses:** Short responses (<12 chars), no questions, no acknowledgments, low scores
* **Missed Opportunities:** Ignored AI concerns, no value proposition, no urgency, no closing attempt, didn't explore goals
* **Coaching Summary:** Conversational summary referencing specific exchange numbers and moments

### knowledgeStructured.ts

**Structured KB Items (14 total):**

| Type | Count | Examples |
|------|-------|---------|
| Objection | 4 | SMSF risk, fees too high, need time, already have adviser |
| Script | 3 | DQ opening, FC structure, FR close |
| Process | 2 | Lead-to-deal pipeline, callback handling |
| Strategy | 3 | Value reframe, urgency creation, PIA explanation |

**Smart Search Algorithm:**

```
score = (tagMatches × 10) + (titleMatches × 15) + (contentMatches × 3) + (exampleMatches × 1)
normalised = min(1, score / maxPossible)
```

Results sorted by score descending, returned with matched tags and content snippets.

---

## 8. 🤖 AI Training System

### Scenario Structure

7 predefined scenarios, each with:

```typescript
interface TrainingScenario {
  id: string;
  title: string;
  personality: { type, traits, openingLine, responseStyle };
  linkedKBIds: string[];        // KB items referenced
  difficulty: "easy" | "medium" | "hard";
  goal: string;
  maxExchanges: number;
}
```

### Personality Traits

| Trait | Effect |
|-------|--------|
| `riskAverse: true` | Interest drops if risk not addressed after 3+ exchanges |
| `priceSensitive: true` | Interest drops if fees mentioned without value framing |
| `talkative: true` | Longer responses, more conversational |

### Conversation Flow

```
1. User selects scenario → personality + emotional state initialised
   ↓
2. AI sends opening line (from scenario definition)
   ↓
3. User sends message → emotional state updated
   ↓
4. AI generates response:
   a. Scenario engine produces base response
   b. adaptResponseToPersonality() applies quirks
   c. applyPersonalityDrift() adjusts for trust/resistance
   d. injectImperfection() adds human-like variability
   e. getNaturalResponseDelay() (400–1200ms) applied
   ↓
5. Steps 3-4 repeat until maxExchanges or user ends session
   ↓
6. analyseSession() generates feedback
```

### Coaching Output

```typescript
{
  strengths: string[];       // e.g. "Asked 3 questions — good discovery approach"
  weaknesses: string[];      // e.g. "No questions asked during the conversation"
  missedOpportunities: string[]; // e.g. "Client expressed uncertainty — could have probed further"
  overallScore: number;      // 0–100
  coachingSummary: string;   // Conversational: "You lost them around exchange 3..."
}
```

---

## 9. 📄 Document System

### Upload Flow

```
User selects file
  → Validation: type (PDF/PNG/JPG/DOC/DOCX), size (≤10MB)
  → uploadFile() → Firebase Storage: /deals/{dealId}/{timestamp}_{name}
  → Returns downloadUrl
  → addDoc() → dealDocuments collection
  → If Firestore fails → deleteFile() from Storage (rollback)
  → Real-time UI update
```

### Document Types

| Type | Label | Badge Colour |
|------|-------|-------------|
| `oa` | Offer & Acceptance | Gold (#b8933a) |
| `compliance` | Compliance | Green (#22c55e) |
| `contract` | Contract | Blue (#3b82f6) |
| `other` | Other | Grey (#6b7280) |

### Preview + Download + Delete

* **Preview:** PDFs and images open in iframe modal; other types show "Download only"
* **Download:** Direct link to Storage URL (opens in new tab)
* **Delete:** Confirmation modal → deleteFile() from Storage → deleteDoc() from Firestore

---

## 10. ✍️ O&A + DocuSign Pipeline

### Step-by-Step

```
1. Rep opens O&A Editor from Deal Dashboard
   ↓
2. Form auto-fills from lead + deal data
   ↓
3. Rep completes 120+ fields across 13 sections
   ↓
4. Auto-save to documentInstances (1.5s debounce)
   ↓
5. Rep clicks "Send to DocuSign"
   ↓
6. generateOAPdf() → pdf-lib fills template OR jsPDF fallback
   ↓
7. PDF uploaded to Storage
   ↓
8. createDocuSignEnvelope() → Firebase Function → DocuSign API
   ↓
9. Envelope created → docusignEnvelopes record stored
   ↓
10. Document instance locked (status → "locked", editable → false)
   ↓
11. Client signs via DocuSign email link
   ↓
12. DocuSign webhook → Firebase Function:
    a. HMAC + timestamp validation
    b. Download signed PDF
    c. Upload to Storage
    d. Register as dealDocument
    e. Update document instance (status → "signed")
    f. Create dealEvent
    g. Notify rep + admin
    ↓
13. Rep sees signed PDF in deal documents
```

### Document Locking

When envelope is sent:
```typescript
await updateDoc(doc(db, "documentInstances", instanceId), {
  status: "locked",
  editable: false,
  envelopeId,
  updatedAt: serverTimestamp(),
});
```

Prevents edits while document is awaiting signature.

### Resend / Void Logic

| Action | Endpoint | Effect |
|--------|----------|--------|
| Resend | `resendDocuSignEnvelope(envelopeId)` | PUT to DocuSign with `{status: "sent"}`, updates Firestore |
| Void | `voidDocuSignEnvelope(envelopeId, reason)` | PUT to DocuSign with `{status: "voided"}`, creates dealEvent, notifies rep |

---

## 11. 📊 Financial Tools Integration

### SMSF Calculator

**Architecture:** Standalone app embedded via iframe at `/smsf/index.html`.

```
SMSF iframe
  ↓ user clicks "Save to Client"
  ↓ window.parent.postMessage({ type: "smsf-result", data: {... } }, "*")
  ↓
Parent (SMSFPage.tsx)
  ↓ receives message
  ↓ saves to smsfReports collection (Firestore)
  ↓ links to clientId via leadId
  ↓
ClientProfilePage → Reports tab
  ↓ queries smsfReports where clientId == X
  ↓ displays report history
```

### PIA Calculator

**Architecture:** Standalone app at `/pia/index.html`, same postMessage bridge pattern.

Result saved to `piaReports` collection with identical clientId linking.

### Report Generation

ReportView component renders SMSF/PIA reports with:
* Client context header (prepared for/by)
* Auto-generated summary insight
* Full-screen presentation mode
* Print → PDF export

---

## 12. 🧩 UI Systems

### Sidebar Navigation

* Fixed left sidebar with page links
* Active page highlighted with gold accent
* Pages not in user's `permissions` array are hidden
* Collapsible on mobile (hamburger menu)

### Dashboard

* **Today's Focus** — calls today, overdue callbacks, upcoming appointments
* **Priority Work Queue** — top 15 leads sorted by next-action priority
* **Stats Bar** — active deals, pipeline value, expected commission, settled this month

### Client Profile (Hub)

Two-panel layout:
* **Left (1/3 width):** Contact info, key metrics, linked document count
* **Right (2/3 width):** Tabbed content — Details, Documents, Notes, Reports, History

Notes tab includes AI Insights panel (client brief, concerns, suggested approach).

### Floating Calculator

* Circular button (bottom-right, z-index 9999)
* Drag via pointer events with viewport clamping
* Click opens resizable panel with standard calculator
* History (last 3 calculations), copy result, keyboard support
* Independent state from other floating tools

---

## 13. ⚠️ Known Limitations

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Deal Dashboard permission errors** | Scoped query `where("assignedTo")` may fail for some users; shows "Unable to load deals" | Fallback query (no where filter) shows all deals with warning toast |
| **Voice AI duplication** | Rapid mic/TTS switching can cause overlapping transcripts | Mitigated by `stopSpeech()` + `stopListening()` sequencing before each start |
| **SMSF iframe legacy** | Standalone calculator not fully embedded in CRM UI | PostMessage bridge works for saving results; UI migration planned |
| **Floating tool overlap** | Calculator (z-9999) and Calendar (z-9998) can overlap if dragged to same position | z-index separation minimises conflict; users can reposition |
| **Firestore composite index** | `clientNotes` collection requires `clientId ASC + createdAt DESC` index | Auto-created on first query; 1-2 minute delay after index creation |

---

## 14. 🚀 Extension Points

### AI Realism Upgrades

**Where to plug in:** `src/lib/personalityEngine.ts`, `src/lib/sessionFeedback.ts`, `src/components/AIRoleplay.tsx`

Current foundation already supports:
* Conversation memory (`ConversationMemory` interface implemented)
* Personality drift (`applyPersonalityDrift()` implemented)
* Imperfection engine (`injectImperfection()` implemented)
* Scenario variants (`generateScenarioVariant()` implemented)

Next: Wire these into the roleplay session loop in `AIRoleplay.tsx` (currently generated but not yet consumed).

### Learning Portal

**Where to plug in:** New page at `src/pages/LearningPortal.tsx`, added to `App.tsx` routing.

Would add:
* Custom script upload → stored in Firestore `trainingScripts` collection
* Tagging by scenario + persona
* Voice selection per scenario
* Progress tracking in `trainingProgress` collection

### Multi-Tenant Support

**Where to plug in:** Add `organisationId` field to all top-level collections. Update Firestore security rules to scope reads/writes by org.

Currently single-tenant (all data visible to authenticated users).

### Additional Tools/Widgets

**Where to plug in:** New floating component in `App.tsx` alongside `<FloatingCalculator />` and `<FloatingCalendar />`.

Examples: quick-note creator, daily schedule snapshot, booking density indicator.

---

*This document is the definitive architecture reference. For change history, see `CHANGELOG.md`.*
