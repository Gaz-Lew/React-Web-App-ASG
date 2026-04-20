# Amplify CRM — System Changelog

> Last updated: April 2026
> Architecture: React 18 + Vite + TypeScript + Firebase (Firestore, Storage, Functions)

---

## 🚀 Current System Overview

The Amplify CRM is a full-featured, real-time sales and training platform built for mortgage broking / financial services. It combines lead management, deal pipeline tracking, AI-assisted training, document generation with e-signature, financial calculators, and team communication — all in a single-page web application.

### Core Capabilities

* **CRM Pipeline** — Leads → Clients → Deals with real-time status tracking
* **AI Training Hub** — Scenario-based roleplay with personality engine and post-session coaching
* **Knowledge Base** — Structured coaching content with smart search and scenario linking
* **Document System** — O&A editor, deal documents, and DocuSign e-signature integration
* **Financial Tools** — PIA and SMSF calculators with client-facing report generation
* **Notes Timeline** — Centralised client notes with source tracking and server timestamps
* **Map + DQ Import** — Geocoded lead visualisation with bulk import pipeline
* **Team Chat** — Real-time messaging with presence, typing, and status indicators
* **Floating Tools** — Draggable calculator and calendar widgets

---

## 🧩 Core Systems Implemented

### 1. CRM Core

* **Leads → Clients → Deals pipeline** with full lifecycle tracking
* **Client Profile** as central hub — two-panel layout (summary left, tabbed content right)
* **Centralised Notes System** (`clientNotes` collection):
  * Source tracking: `appointment`, `call`, `deal`, `manual`
  * Timestamps: `serverTimestamp()` primary + `Date.now()` fallback
  * Rep attribution with `createdBy` / `repName`
  * Important note pinning with visual separation (gold-accented section)
  * Note enhancement (auto-capitalisation, punctuation)
  * Navigation linking — clicking a note's source navigates to the appointment, deal, or call log
* **Smart Search** on knowledge base with tag + content + title weighted ranking

---

### 2. Next Action Engine

* **Intelligent prioritisation** across all leads:
  * Callback scheduled → "Call at {time}" (high)
  * At-risk deals → "URGENT" (urgent)
  * Stuck deals → "Follow up" (medium)
  * No call history → "Initial call needed" (high)
  * Recent call without follow-up → "Follow-up call" (medium)
* **Colour-coded UI** — Red (urgent) / Amber (stuck) / Green (on track)
* **Click-to-action flows** — instant call logger, navigation to deal dashboard
* **Flow Mode** — auto-loads next lead after action completes

---

### 3. AI Training & Coaching System

* **Scenario-based roleplay** with 7+ scenarios:
  * DQ Conversation, Booking Call, First Consult, Finance Run Close
  * SMSF Objection Handling, PIA Explanation, Follow-Up Close, Discovery
* **Personality Engine** (`personalityEngine.ts`):
  * 4 personality types: analytical, skeptical, friendly, busy
  * Traits: riskAverse, priceSensitive, talkative
  * Emotional state model: trust / interest / resistance (0–100 each)
  * Response modifiers: tone, length, deflection, questioning, agreement
  * Personality drift: adapts tone based on trust/resistance levels
  * Imperfection engine: interruption styles, dismissive responses, vague uncertainty
* **Session Feedback** (`sessionFeedback.ts`):
  * Pattern-based strength/weakness/missed-opportunity detection
  * Conversational coaching summary with specific conversation moments
  * Memory-aware analysis (unanswered concerns, rep promises, contradictions)
* **Scenario Variants** — randomised mood + objection set applied at session start
* **Knowledge Structured** (`knowledgeStructured.ts`):
  * 14 structured KB items: objections, scripts, processes, strategies
  * Example responses with "Use this response" and "Practice scenario" buttons
  * Smart search engine with weighted ranking (tag > title > content > examples)

---

### 4. Knowledge Base + AI Coaching

* **Firestore-backed articles** with HTML content, categories, tags, and pinning
* **AI Coaching Panel** (`AICoachingPanel.tsx`):
  * Natural language search across structured knowledge
  * Type filters (objection / script / process / strategy)
  * Relevance scoring with match highlighting
  * "Use this response" — copies example text for rep use
  * "Practice scenario" — launches linked training scenario via custom event
* **Scenario Selector** — grid of scenario cards with personality badges, difficulty tags, and goals
* **Cross-system linking** — Knowledge Base scenarios launch Training Hub sessions

---

### 5. Document System (Deals + Clients)

* **DealDocuments** (`dealDocuments` collection) with Firebase Storage backend
* **Upload pipeline** with validation and rollback safety:
  * File type validation (PDF, PNG, JPG, DOC, DOCX)
  * 10 MB size limit enforcement
  * Storage upload → Firestore metadata write (with rollback on failure)
* **Document list UI**:
  * Type badges with colour coding: OA (gold), compliance (green), contract (blue), other (grey)
  * Preview for PDFs/images (iframe modal), download for all types
  * Delete with confirmation modal
  * Sorted newest first via `orderBy("createdAt", "desc")`
  * Empty state with call-to-action
* **File naming standard** for signed documents: `{clientName}_{dealId}_OA_Signed_{YYYYMMDD}.pdf`

---

### 6. O&A Document Editor

* **120+ field schema** across 13 sections:
  * Buyer Details (individual, joint, company, trust)
  * Seller Details
  * Property Details (street, lot/plan, title ref, tenure type)
  * Financials (price, deposit, balance, split deposits)
  * Finance Clause (conditional approval, lender, amount, %)
  * Settlement (period, date, time, location, agent)
  * GST (inclusive, exclusive, not applicable, margin scheme)
  * Conveyancer
  * Included Chattels (individual checkboxes)
  * Special Conditions
  * Offer Validity
  * Signatures (buyer, seller, witness)
  * Document Preparation (auto-filled)
* **Conditional logic** — buyer type, finance clause, deposit split
* **Auto-fill from lead + deal data** — name, phone, address, deal value
* **PDF generation** via pdf-lib — fills template form fields, flattens to read-only
* **Fallback PDF** via jsPDF if template not found
* **Document instances** with status tracking: draft → completed → signed → locked

---

### 7. DocuSign Integration

* **Firebase Functions backend** (`functions/src/docusign.ts`):
  * `createDocuSignEnvelope` (onCall) — sends document for signing
  * `resendDocuSignEnvelope` (onCall) — resends pending envelope
  * `voidDocuSignEnvelope` (onCall) — voids sent envelope
  * `syncEnvelopeStatus` (onCall) — on-demand status reconciliation
  * `docusignWebhook` (onRequest) — receives Connect events
* **Security**:
  * JWT impersonation authentication (RSA-256)
  * HMAC-SHA256 webhook signature validation
  * Timestamp-based replay protection (5-minute window)
  * Idempotent event processing via `lastProcessedEventId`
  * Duplicate send prevention (checks for existing active envelope)
* **Envelope lifecycle**:
  * Multi-signer support with routing order
  * Signed PDF auto-upload to Firebase Storage
  * Auto-registration as dealDocument (type: "contract")
  * Document locking during signing (status → locked, editable → false)
  * Rep + admin push notifications on completion
  * Optional compliance email forwarding
* **Deal Events collection** (`dealEvents`):
  * Tracks: docusign_sent, completed, declined, voided, resent, sync_*
  * Timeline visible in deal view

---

### 8. Financial Tools

#### SMSF Calculator

* Embedded standalone app via iframe (`/smsf/index.html`)
* PostMessage bridge sends results → CRM → Firestore (`smsfReports`)
* Dark theme UI alignment with app design system
* "Save to Client" button links report to lead

#### PIA Calculator

* Integrated Property Investment Analysis calculator
* Generates financial reports with projection data
* Save to client and deal linking

---

### 9. Report System (Client-Facing)

* **ReportView** overlay — full-screen modal for SMSF and PIA reports
* **Auto-generated summary insight**:
  * SMSF: delta-based improvement analysis
  * PIA: positive/negative cash flow projection
* **Client context header**: prepared for/by with date
* **Professional PDF layout** with gold accent branding
* **Print → PDF export** with clean styling
* **Presentation mode** (fullscreen via Fullscreen API)
* **Disclaimer + next step CTA** sections
* **No internal CRM data exposure** — only report-relevant fields

---

### 10. Map + DQ Import

* **Lead geocoding** — batch + single address geocoding via Google Maps API
* **Traffic layer** toggle with controls panel
* **Knock Mode** — quick pin dropping, zone drawing, and zone library
* **DQ Import**:
  * Fill Lead mode (structured form entry)
  * Bulk import with background geocoding
  * Suburb ↔ postcode sync
  * Duplicate detection with amber highlighting
  * Phone number auto-formatting (Australian format)

---

### 11. Team Chat System

* **Presence tracking** via heartbeat mechanism
* **"Active now"** indicators on rep avatars
* **Typing indicators** in direct message threads
* **Status expiry** — 24-hour automatic reset
* **Group channel** (#team) + direct messages
* **File attachments** (images, PDFs, documents)
* **Location sharing** with Google Maps links

---

### 12. Floating Tools

* **Floating Calculator**:
  * Draggable + resizable panel
  * Standard + scientific operations
  * Keyboard support (0-9, operators, Enter, Backspace)
  * Calculation history (last 3 entries)
  * Copy result to clipboard
  * localStorage persistence (position + size)
  * Dark/light theme toggle
  * Independent state from other floating tools
* **Floating Calendar**:
  * Month view with appointment indicators
  * Draggable positioning
  * Theme synchronised with calculator

---

## ⚙️ Architecture Notes

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript (strict mode) |
| Styling | Tailwind CSS with custom design tokens |
| State | Zustand (user session, reps, status colours) |
| Database | Firestore (real-time via `onSnapshot`) |
| Storage | Firebase Storage (documents, photos, PDFs) |
| Backend | Firebase Cloud Functions v2 (Node.js 22) |
| Auth | PIN-based session (custom token with claims) |
| Routing | Tab-based (no external router, managed in `App.tsx`) |
| Code Splitting | `React.lazy()` on all pages except Leads |

### Key Patterns

* **Server timestamps** with client-side fallback — all `clientNotes` use `serverTimestamp()` + `Date.now()` dual write
* **Real-time listeners** via `onSnapshot` — no manual polling
* **Component isolation** — floating tools manage independent state, no shared global state
* **Document lifecycle** — draft → completed → signed → locked, with status transitions
* **Error resilience** — rollback on failed writes, fallback generators, graceful degradation

---

## ⚠️ Known Issues / In Progress

* **Deal Dashboard** — intermittent permission errors when scoped query (`where("assignedTo")`) fails; fallback query shows all deals as workaround
* **Voice AI** — potential mic/TTS overlap in rapid voice mode switching; mitigated by `stopSpeech()` + `stopListening()` sequencing
* **SMSF iframe** — legacy standalone calculator with partial CRM integration (postMessage bridge works, but UI not fully embedded)
* **Floating tools** — calculator and calendar can overlap if dragged to same position; z-index separation minimises conflict

---

## 🧠 Planned Upgrades (Next Phase)

### 1. AI Training Realism

* [ ] **Conversation memory** — track objections raised, concerns unanswered, rep promises made
* [ ] **Personality drift** — dynamic tone changes based on trust/resistance thresholds
* [ ] **Imperfection engine** — interruption responses, dismissive replies, vague uncertainty
* [ ] **Scenario variants** — randomised mood + objection set per session
* [x] *Foundation implemented* — `personalityEngine.ts`, `sessionFeedback.ts`, `knowledgeStructured.ts`

---

### 2. Client Profile as Full Hub

* [x] Full-screen two-panel layout (summary + tabs)
* [x] Notes tab with AI Insights panel
* [ ] Unified appointments view (pull from `appointments` collection by `linkedLeadId`)
* [ ] Reports tab with SMSF/PIA report history
* [ ] Deal timeline integration
* [ ] Document linking from client profile (not just deal)

---

### 3. AI Learning Portal

* [ ] Upload custom scripts / documents for training
* [ ] Tag content by scenario + persona
* [ ] Voice selection per scenario (custom TTS voices)
* [ ] Multiple personality presets per rep
* [ ] Progress tracking + performance trends

---

### 4. Deal System Expansion

* [ ] Compliance workflow automation (checklist per deal stage)
* [ ] Email ingestion → auto-attach documents to deal
* [ ] O&A → DocuSign → compliance pipeline automation
* [ ] Deal event timeline in deal dashboard
* [ ] Commission split calculator with invoice generation

---

### 5. UI / UX Premium Upgrade

* [ ] Reduce visual clutter on map + dashboard
* [ ] Improved information hierarchy + spacing consistency
* [ ] Consistent interaction patterns across all pages
* [ ] Mobile-first refinement for all floating tools
* [ ] Accessibility improvements (keyboard navigation, ARIA labels)

---

### 6. Floating Tools Expansion

* [ ] Calendar widget toggle (mini month view from floating button)
* [ ] Daily schedule snapshot (appointments for today)
* [ ] Booking density indicator on calendar
* [ ] Quick-note creation from floating panel
* [ ] Context-aware tool suggestions based on current page

---

## ✅ Build Status

| Check | Status |
|-------|--------|
| TypeScript | 0 errors |
| Vite build | passing |
| Firebase hosting | deployed |
| Firestore rules | configured |
| Firebase functions | deployed |

---

## 📂 Key File Map (for AI / Developer Reference)

### Frontend Core

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root layout, routing, global state, floating tools mount |
| `src/types/index.ts` | All TypeScript interfaces (Lead, Deal, ClientNote, etc.) |
| `src/hooks/useFirebase.ts` | All Firestore hooks (useDeals, useLeads, useDocuSign, etc.) |
| `src/stores/appStore.ts` | Zustand global state (user, reps, colours) |

### AI Training

| File | Purpose |
|------|---------|
| `src/lib/personalityEngine.ts` | Emotional state, imperfection injection, personality drift |
| `src/lib/sessionFeedback.ts` | Post-session analysis with conversational coaching summary |
| `src/data/knowledgeStructured.ts` | Structured KB items, training scenarios, smart search |
| `src/components/AICoachingPanel.tsx` | AI coaching UI with search + scenario linking |
| `src/components/AIRoleplay.tsx` | Main roleplay session engine with voice + chat |
| `src/pages/TrainingHub.tsx` | Training hub with scenario selector + tabs |

### Documents

| File | Purpose |
|------|---------|
| `src/components/OADocumentEditor/OADocumentEditor.tsx` | O&A form editor with 120+ fields |
| `src/components/OADocumentEditor/oaPdfGenerator.ts` | PDF template filling via pdf-lib |
| `src/components/OADocumentEditor/useDocumentInstances.ts` | Firestore hooks for document instances |
| `src/hooks/useDocuSign.ts` | Frontend hook for DocuSign envelope operations |
| `functions/src/docusign.ts` | Firebase Functions for DocuSign (send, resend, void, webhook) |
| `src/components/FloatingCalculator/` | Draggable calculator with history + themes |

### Notes & Timeline

| File | Purpose |
|------|---------|
| `src/hooks/useClientNotes.ts` | Hook for centralized client notes with serverTimestamp |
| `src/pages/ClientProfilePage.tsx` | Full-page client profile with notes + AI insights |
| `src/lib/aiInsights.ts` | Client brief generation + smart next action with reasoning |

### Knowledge Base

| File | Purpose |
|------|---------|
| `src/pages/KnowledgeBase.tsx` | KB articles + AI Coaching tab toggle |
| `src/data/knowledgeBase.ts` | Static KB article content (HTML) |

---

*This document is maintained to reflect the current system state. Last comprehensive update: April 2026.*
