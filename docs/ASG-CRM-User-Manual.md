# ASG Leads CRM
## Professional Training & Operations Manual

---

**Version:** 1.0  
**Prepared for:** ASG Financial Services — All Staff  
**Classification:** Internal Use Only

---

> *This manual covers every feature of the ASG Leads CRM platform. Keep it handy during onboarding and refer back to it whenever you need a refresher. It is written for daily users — no technical background required.*

---

# TABLE OF CONTENTS

1. Introduction
2. System Overview
3. User Roles
4. Dashboard Overview
5. Leads System
6. Deal Management
7. Client Hub
8. Call Logging System
9. Training Hub (AI Roleplay)
10. Script System
11. Rep Dashboard
12. Admin Dashboard
13. Reporting
14. Notifications
15. Offline Mode
16. Best Practices
17. Daily Workflow Example
18. Troubleshooting
19. Glossary

---

---

# SECTION 1: INTRODUCTION

## What Is the ASG Leads CRM?

The ASG Leads CRM is the central operations platform for ASG Financial Services. It is the single place where every lead, deal, client interaction, training session, and performance result is recorded and managed.

Think of it as your digital office — everything your team does during the day lives here, from the moment a lead enters the system to the moment a deal settles.

## What Problems Does It Solve?

Before this system, teams faced several common challenges:

- Leads were tracked in spreadsheets that quickly became outdated
- There was no clear picture of who called whom and when
- Training happened inconsistently, with no way to measure improvement
- Managers had to manually chase reps for activity updates
- Deal progress was unclear and often stalled without anyone noticing

The CRM solves all of these problems in one platform.

## How Everything Connects

The system is designed so that every action feeds into the next:

- A **lead** is called and qualified → it becomes a **deal**
- A **deal** progresses through stages → the client moves into the **Client Hub**
- Activity is automatically tracked → it appears in the **Rep Dashboard**
- Managers review **reports** → they coach using **training data**
- Admins control everything from the **Admin Dashboard**

Nothing falls through the cracks. Every interaction leaves a trail, every deal has a status, and every rep has a performance record.

---

---

# SECTION 2: SYSTEM OVERVIEW

## The Full Ecosystem

The CRM is made up of six core areas. Understanding how they fit together will help you use the system more effectively.

---

### 1. Leads

Leads are the starting point. Every person who may become a client enters the system as a lead. Leads have contact details, a status, and a full history of every call and interaction.

**Where leads come from:**
- Imported from a CSV file
- Pulled directly from a Google Sheet
- Added manually by a rep

---

### 2. Deals

When a lead is qualified and ready to move forward, a deal is created. Deals track the financial transaction — the loan, the application, the settlement. A deal has stages, documents, and a timeline.

---

### 3. Clients

Once a deal is underway, the client record is created in the Client Hub. This is the long-term home for the relationship — documents, notes, and deal history all live here.

---

### 4. Training

The Training Hub is where reps practise their scripts using an AI roleplay partner. Sessions are recorded, scored, and stored. Managers can review performance over time.

---

### 5. Reporting

The reporting area gives managers and admins a clear view of what's happening across the team. Daily stats, deal forecasts, DRAPS activity, and training scores are all visible here.

---

### 6. Admin Controls

The Admin Dashboard is where system-level decisions are made — who has access to what, which features are turned on, what scripts are available, and what thresholds trigger alerts.

---

## How Data Flows

```
Lead Imported
     ↓
Rep Calls Lead → Call Logged → Status Updated
     ↓
Lead Qualified → Deal Created
     ↓
Deal Progresses → Client Record Created
     ↓
Settlement → Commission Recorded
     ↓
All Activity → Rep Dashboard + Manager Reports
```

---

---

# SECTION 3: USER ROLES

The CRM has three roles. Your role determines what you can see and do.

---

## Rep

A rep is a standard team member — a business development manager or consultant who makes calls, logs activity, and runs training sessions.

**A rep can:**
- View and call leads assigned to them or available in the pool
- Log call outcomes and notes
- Create and update deals they are responsible for
- Complete training sessions and view their own scores
- See their own dashboard and performance history
- Submit their DRAPS activity each day
- Receive push notifications for performance alerts

**A rep cannot:**
- See other reps' detailed lead lists or performance (unless shared)
- Access the Admin Dashboard
- Change system settings
- View all reps' combined reports

---

## Manager

A manager has all rep capabilities plus visibility across the team.

**A manager can:**
- View leads and deals across all reps
- Access the daily performance report for all team members
- View training scores and session history for their team
- Receive daily report notifications
- View the Client Hub for all clients
- Export reports

**A manager cannot:**
- Change global system settings
- Manage rep permissions or roles
- Access the Settings History or System Health panels

---

## Admin

An admin has full control over the entire platform.

**An admin can:**
- Do everything a manager can do
- Access the Admin Dashboard
- Manage rep profiles, roles, and access codes
- Change global system settings (thresholds, targets, flags)
- Enable or disable features (voice mode, training, read-only mode)
- Manage scripts (add, edit, delete)
- View the Settings History and roll back changes
- View the System Health panel
- Send manual push notifications to individuals or the whole team
- View the full audit log

---

---

# SECTION 4: DASHBOARD OVERVIEW

## Main Dashboard

When you log in, you land on the main Dashboard. This gives you a quick view of what is happening right now across the business.

**What you'll see:**
- A summary of today's lead activity
- Recent call results
- Upcoming appointments
- Quick-access buttons to the most common actions
- A live indicator showing whether you're online or offline

Use this page to orient yourself at the start of each day before diving into calls or admin tasks.

---

## Deal Dashboard

The Deal Dashboard is where the financial side of the business lives. It has four views:

### Pipeline View
Shows all active deals arranged by stage. You can see at a glance which deals are early in the process and which are close to settlement. Each deal card shows the client name, stage, assigned rep, and deal value.

### Stats View
Shows totals and summaries — how many deals are active, how many settled this month, total commission value, and conversion rates. Useful for weekly review meetings.

### Chase List
This is one of the most important views. It shows deals that have not been updated recently — deals that are "stuck." Any deal that hasn't had a note or status change in a set number of days appears here in amber or red.

The Chase List is your signal to take action. A stuck deal is a deal at risk.

### Forecast View
Shows projected settlements based on current deal stages. Useful for managers planning team capacity and targets.

---

## Rep Dashboard

Every rep has their own personal dashboard. This page shows:

- Calls made today vs target
- Appointments booked today vs target
- Deals created this week
- Commission earned (settled deals)
- Training sessions completed this week
- A progress bar for each weekly target
- The DRAPS funnel (Dials → Responses → Appointments → Presentations → Sales)
- A live activity feed of the last 10 calls
- Training skill breakdown (opening, rapport, qualification, value delivery, closing)

This is the page to check before your daily standup and at the end of each day.

---

## Reports Dashboard

Available to managers and admins. Shows a sortable table of all reps and their performance for any selected date.

**Columns include:**
- Rep name
- Calls
- Appointments booked
- Deals created
- Deals settled
- Commission earned
- Training sessions
- Average training score
- DRAPS activity (D/R/A/P/S format)

You can sort by any column and export to CSV for external reporting.

---

---

# SECTION 5: LEADS SYSTEM

## What Is a Lead?

A lead is a person or household who may become a client. They have a name, phone number, address, and a status that reflects where they are in the sales process.

Every lead has a full history attached to it — every call, every note, every status change is recorded automatically.

---

## Importing Leads

### Option 1: CSV Import

1. Click **CSV** in the top toolbar (on the Leads page)
2. Select your CSV file from your computer
3. The system will show you a preview of the data
4. Match your CSV columns to the correct fields (name, phone, address, etc.)
5. Click **Import**
6. A confirmation toast will appear showing how many leads were imported

> **Tip:** Make sure your CSV has at least a name and phone number. Leads without contact details cannot be called.

### Option 2: Google Sheets Quick Pull

If your team uses a shared Google Sheet to receive leads:

1. Ask your admin to configure the Sheet URL in the sync settings
2. Once set up, a **Quick Pull** button appears at the bottom of the sidebar
3. Click it to pull the latest leads from the sheet directly into the CRM
4. New leads will appear in your lead list immediately

### Option 3: Add Manually

1. Click the gold **+ Add Lead** button in the top right corner
2. Fill in the lead's details (name, phone, address, suburb)
3. Click **Save**
4. The lead appears in your list immediately

---

## Using the Map

The Map page shows all your leads plotted geographically. This is useful for:

- Planning call routes if you're doing in-person visits
- Identifying geographic clusters of leads
- Visualising coverage across suburbs

**How to use the map:**
1. Navigate to **Map** in the sidebar
2. Leads appear as pins on the map
3. Click any pin to see the lead's details
4. Click **Open Lead** to go directly to their record

> **Note:** The map requires an internet connection. It will not load in offline mode.

---

## The Lead List

The Leads page shows all your leads in a filterable, searchable list.

**You can filter by:**
- Status (New, Contacted, Qualified, Booked, Lost)
- Rep assigned
- Date range
- Suburb or area

**You can search by:**
- Name
- Phone number
- Address or suburb

Click any lead to open their full record in the sidebar.

---

## Lead Statuses

| Status | Meaning |
|--------|---------|
| **New** | Just imported — not yet contacted |
| **Contacted** | Called at least once |
| **Qualified** | Interested and meets the criteria |
| **Booked** | An appointment has been scheduled |
| **Lost** | No longer a viable lead |

Statuses update automatically when you log a call outcome, or you can update them manually.

---

## Updating a Lead

1. Click the lead in the list to open their record
2. Update their status, notes, or appointment details
3. Changes save automatically in real time

---

---

# SECTION 6: DEAL MANAGEMENT

## When Does a Lead Become a Deal?

A lead becomes a deal when they are **qualified** — meaning they have expressed genuine interest and meet the financial criteria to move forward.

At this point, a deal is created in the system. This does not replace the lead record — both exist simultaneously. The lead shows the contact history; the deal tracks the financial transaction.

---

## Creating a Deal

1. Open the lead's record
2. Click **Create Deal** (or navigate to the Deal Dashboard and click **New Deal**)
3. Fill in:
   - Client name (pre-filled from the lead)
   - Deal value (estimated loan or transaction amount)
   - Stage (start at "Booked" if an appointment is confirmed)
   - Assigned rep
4. Click **Save**
5. The deal appears in the Pipeline view

> **Important:** Each lead should have only one active deal. The system flags duplicates to prevent confusion.

---

## Deal Stages

Deals move through stages as they progress. The stages are:

| Stage | What It Means |
|-------|--------------|
| **Booked** | Appointment scheduled but not yet completed |
| **Appointment Set** | First meeting confirmed |
| **Appointment Done** | First meeting completed |
| **Application In** | Loan application submitted |
| **Under Assessment** | Application being reviewed by lender |
| **Approved** | Lender has approved the application |
| **Settlement** | Settlement date confirmed |
| **Complete** | Deal has settled — commission recorded |

To move a deal to the next stage:
1. Open the deal from the Pipeline
2. Click the stage you want to move to
3. Add a note explaining the update
4. Save

---

## Keeping Deals Updated

**This is critical.** A deal that goes without an update for more than a set number of days (configured by your admin) will appear on the Chase List and may be flagged at-risk.

Best practice: **Update your deals every time something happens.** Even a short note like "Spoke with client — still waiting on bank response" keeps the deal active and your manager informed.

---

## The Chase List

The Chase List automatically surfaces deals that need attention. A deal appears here if:

- It has not had any update in several days
- The settlement date is approaching but the deal is still in an early stage

**How to use the Chase List:**
1. Go to **Deal Dashboard → Chase List**
2. Review each flagged deal
3. Call the client or take whatever action is needed
4. Log an update — this removes the deal from the Chase List

---

## Settlement Tracking

Once a deal settles, mark it as **Complete** and record the settlement details. The system will:

- Record the settlement date
- Calculate commission based on the configured split
- Add the result to the rep's dashboard
- Include it in the daily and monthly reports

---

---

# SECTION 7: CLIENT HUB

## What Is the Client Hub?

The Client Hub is the long-term record for each client. While the Leads page tracks the outreach process and the Deal Dashboard tracks the transaction, the Client Hub stores everything related to the ongoing relationship.

---

## How Clients Are Created

A client record is created automatically when a lead converts to a deal. You do not need to create it separately.

---

## What You'll Find in a Client Record

- **Basic details:** Name, contact information, address
- **Linked deal:** The deal associated with this client, including its current stage and history
- **Documents:** Any uploaded files (application forms, approvals, ID documents, settlement letters)
- **Notes and updates:** A full history of all interactions
- **DRAPS and appointment records:** All scheduled and completed meetings

---

## Uploading Documents

1. Open the client's record in the Client Hub
2. Click **Upload Document**
3. Select the file from your computer (PDF, image, or Word document)
4. Add a label (e.g. "Signed Application Form" or "Approval Letter")
5. Click **Upload**
6. The document is saved securely and accessible to all authorised staff

---

## Linking Deals to Clients

If a client has multiple deals over time (e.g. a refinance after an initial purchase), each deal can be linked to the same client record. This gives a complete financial history in one place.

---

---

# SECTION 8: CALL LOGGING SYSTEM

## Why Logging Calls Matters

Every call you make needs to be logged. This is not optional — it is the foundation of your activity record, your performance stats, and your team's reporting.

A logged call tells the system:
- You called this lead
- When you called them
- What the outcome was
- What you discussed

Without logging, your stats will not reflect your actual effort.

---

## How to Log a Call

1. Open the lead's record
2. Click **Log Call**
3. Select the **outcome** from the list (see below)
4. Add **notes** — even a brief summary is helpful
5. If an appointment was booked, fill in the appointment details
6. Click **Save**

The call is added to the lead's history immediately and counted in your daily stats.

---

## Call Outcomes

| Outcome | When to Use |
|---------|------------|
| **Connected** | You spoke with the person |
| **No Answer** | Phone rang but no one picked up |
| **Callback** | They asked you to call back at a specific time |
| **Booked** | You secured an appointment during this call |
| **Not Interested** | They declined clearly |
| **Wrong Number** | The number is incorrect or belongs to someone else |

---

## Setting Callbacks

If a lead asks you to call back:

1. Select **Callback** as the outcome
2. Enter the callback date and time
3. Save

The system will highlight callback leads in your list when it's time to call them. You'll also see a badge on the Leads page showing how many callbacks are due.

---

## How Call Logging Affects Your Stats

Every call you log contributes to:

- Your **Calls Today** count on the Rep Dashboard
- Your **DRAPS** activity (under Dials)
- The team's daily report
- Your weekly performance totals

The more accurately you log, the more accurate your numbers will be.

---

---

# SECTION 9: TRAINING HUB (AI ROLEPLAY)

## What Is the Training Hub?

The Training Hub is where you practise your sales skills using an AI conversation partner. The AI plays the role of a prospect — it pushes back, asks questions, and responds the way a real client might.

Every session is recorded, scored, and stored. Over time, you can track your improvement across five key skills.

---

## Why Use the Training Hub?

- **Safe to practise:** No real client is ever affected
- **Consistent feedback:** You get scored on the same criteria every time
- **Trackable improvement:** Your scores are stored and shown on your dashboard
- **Script mastery:** Running your script regularly builds confidence and fluency

---

## Starting a Training Session

1. Navigate to **Training** in the sidebar
2. You'll see the Training Hub with your recent sessions and performance stats
3. Click **Start New Session**
4. Choose your **script** (see Section 10 for script selection)
5. Choose your **difficulty:**
   - **Easy** — The AI is cooperative and agreeable
   - **Medium** — The AI asks questions and needs convincing
   - **Hard** — The AI is sceptical and resistant
6. Choose your **mode:**
   - **Chat Mode** — You type your responses
   - **Voice Mode** — You speak your responses (requires microphone)
7. Click **Begin**

---

## Chat Mode

In Chat Mode, the AI speaks first (its text appears on screen). You type your response and press Enter or click Send.

The conversation continues back and forth until you:
- Complete all sections of the script
- Choose to end the session

This mode is ideal for practising your script wording without pressure.

---

## Voice Mode

In Voice Mode, the AI speaks out loud through your speakers. You respond by clicking the microphone button and speaking.

The AI listens, processes what you said, and responds verbally.

**Tips for Voice Mode:**
- Use Chrome or Edge for best results
- Speak clearly and at a natural pace
- Wait for the AI to finish speaking before you respond
- Use a headset if available to reduce echo

> **Note:** Voice Mode must be enabled by your admin. If you don't see the voice option, contact your admin.

---

## During the Session

The session is divided into five sections, each testing a different skill:

| Section | What It Tests |
|---------|--------------|
| **Opening** | How you introduce yourself and establish the call purpose |
| **Rapport** | How you build connection and trust early in the conversation |
| **Qualification** | How you identify needs, situation, and eligibility |
| **Value Delivery** | How you present the opportunity and benefits |
| **Closing** | How you ask for the appointment or commitment |

You'll work through all five sections in order. The AI adapts based on your responses.

---

## Ending a Session

When you've completed the script or want to stop:

1. Click **End Session**
2. The system will display your **feedback and score**
3. Each section is scored out of 8 points (total out of 40)
4. Strengths and areas for improvement are listed
5. Your score is saved to your training history

---

## Viewing Your Results

After a session ends:

- Your score appears immediately on screen
- A breakdown by section is shown (Opening 6/8, Rapport 7/8, etc.)
- Written feedback explains what went well and what to improve
- Your session is saved to the Training Dashboard

On the Training Dashboard, you'll see:
- A list of all your past sessions
- Your average score over time
- Your weakest skill area (highlighted for focus)
- A button to **replay** any previous session

---

## Replaying a Session

Want to hear a past session again?

1. Go to the Training Dashboard
2. Find the session you want to review
3. Click **View** (the eye icon)
4. The session replay will open, showing the full conversation
5. Scroll through the exchange to review your responses

This is useful for self-review and manager coaching sessions.

---

---

# SECTION 10: SCRIPT SYSTEM

## What Are Scripts?

Scripts are the structured conversation guides used during training sessions. They define what the AI will ask and what a successful response looks like at each stage.

---

## Types of Scripts

### Pre-Built Scripts
These are scripts created and managed by your admin. They are available to all reps and represent the company's approved sales approach.

To use a pre-built script:
1. When starting a training session, click **Select Script**
2. Choose from the list of available scripts
3. Each script shows its name and a short description
4. Click **Use This Script**

### Custom Scripts
If you want to practise a specific scenario not covered by the pre-built options, you can create a custom script.

To create a custom script:
1. When starting a training session, choose **Custom Script**
2. Type or paste your script content
3. The AI will use this as the basis for the conversation

> **Note:** Custom scripts are for practice only. They are not saved to the admin script library unless your admin adds them.

---

## When to Use Each Type

| Situation | Script Type to Use |
|-----------|-------------------|
| Standard daily practice | Pre-built company script |
| Practising for a specific objection | Custom script focused on that objection |
| Onboarding a new rep | Pre-built scripts (easiest difficulty first) |
| Preparing for a high-value call | Custom script mirroring the real scenario |

---

## How Admins Manage Scripts

Admins can add, edit, or remove scripts from the Admin Dashboard. Any changes appear immediately for all reps. If a script you were using disappears, ask your admin — it may have been updated or replaced.

---

---

# SECTION 11: REP DASHBOARD

## Your Personal Performance Centre

The Rep Dashboard is your personal view of how you are performing. It is updated in real time and gives you everything you need to manage your day.

Access it from the sidebar under **My Dashboard**.

---

## Row 1: Today at a Glance

Six KPI cards show your key numbers for today:

| Card | What It Shows |
|------|--------------|
| **Calls Today** | Total calls logged today |
| **Appointments** | Appointments booked today |
| **Leads Created** | New leads you qualified today |
| **Deals Settled** | Deals that settled today |
| **Commission Today** | Commission from today's settlements |
| **Training This Week** | Number of training sessions completed this week |

Each card shows a trend arrow comparing today's number to yesterday's.

---

## Row 2: Progress vs Targets

Progress bars show how close you are to your weekly targets:

- Calls vs weekly call target
- Appointments vs weekly bookings target
- Training sessions vs weekly session target

The bars fill from left to right. Aim to be at 100% or above by end of week.

---

## Row 3: Deal Performance

A summary of your deal activity:

- Active deals in your pipeline
- Deals by stage
- Total pipeline value
- Deals at risk (flagged by the Chase List)

---

## Row 4: Training Performance

- Your last 5 training sessions with scores
- A skill bar breakdown showing your average across Opening, Rapport, Qualification, Value Delivery, and Closing
- Your weakest area is highlighted — focus your practice here

---

## Row 5: DRAPS Funnel

Your DRAPS activity for today, shown as a funnel:

**D → R → A → P → S**

| Letter | Stands For | Meaning |
|--------|-----------|---------|
| D | Dials | Total calls attempted |
| R | Responses | Calls where someone answered |
| A | Appointments | Appointments booked |
| P | Presentations | Appointments that resulted in a meeting |
| S | Sales | Closed deals |

Conversion rates between each stage are shown so you can identify where leads are dropping off.

---

## Row 6: Activity Feed

The last 10 calls you logged, shown in reverse chronological order. Each entry shows:
- Lead name
- Call time and date
- Outcome
- A colour-coded badge (green for connected, amber for callback, red for not interested)

---

---

# SECTION 12: ADMIN DASHBOARD

## Overview

The Admin Dashboard is the control centre for the entire platform. It is only accessible to admins.

Access it from **Admin** in the sidebar.

---

## Tab 1: Team Management

Manage all reps in the system.

**What you can do:**
- View all reps and their roles
- Edit a rep's name, role (rep / manager / admin), and PIN
- Enable or disable a rep's account
- Toggle **Alerts Enabled** for individual reps (controls whether they receive performance notifications)
- Reset access codes

**To add a new rep:**
1. Click **Add Rep**
2. Enter their name, role, and set a PIN
3. Click **Save**
4. The rep can now log in using their name and PIN

---

## Tab 2: Script Management

Manage the scripts available to all reps for training.

**What you can do:**
- View all existing scripts
- Add a new script (give it a name, category, and content)
- Edit an existing script
- Delete a script

> **Caution:** Deleting a script does not affect past training sessions, but reps will no longer be able to select it for new sessions.

---

## Tab 3: System Settings

Control global platform behaviour. All changes take effect immediately for all users.

### Deal Settings
- **Stuck Deal Threshold:** Number of days without an update before a deal appears on the Chase List (default: 7 days)
- **At-Risk Threshold:** Number of days before settlement when a stuck deal is flagged at-risk (default: 7 days)

### Training Settings
- **Weekly Session Target:** How many training sessions a rep is expected to complete per week (default: 3)
- **Minimum Score for Hard Mode:** The average score a rep must reach before they can access Hard difficulty (default: 28 out of 40)

### AI Behaviour
- **Thinking Delay:** How long the AI pauses before responding (makes it feel more natural)
- **Silence Timeout:** How long voice mode waits before detecting the rep has stopped speaking
- **Interruption:** Whether speaking while the AI is talking cuts it off

### Feature Flags
- **Voice Mode:** Turn voice training on or off for all reps
- **Session Replay:** Allow reps to replay past sessions

### Failsafe Controls
These are emergency switches. Use them carefully.

| Control | Effect |
|---------|--------|
| **Disable Training** | Immediately blocks all training sessions for all reps |
| **Disable Voice** | Turns off all speech input and output |
| **Read-Only Mode** | Blocks all data writes — the system becomes view-only |

> **Warning:** Read-Only Mode is for emergencies only (e.g. database maintenance). No rep will be able to log calls, create deals, or save any data while it is active.

---

## Tab 4: Daily Report

A full view of today's (or any selected date's) performance for every rep. Same as the Reports Dashboard described in Section 13.

---

## Tab 5: System Health

A real-time diagnostic panel showing the status of all platform subsystems:

| Panel | What It Checks |
|-------|---------------|
| **Firestore** | Whether the database connection is active |
| **Network** | Whether the app is online |
| **AI Training** | How many training sessions occurred recently |
| **Voice** | Whether the browser supports speech features |
| **Push Notifications** | Whether notification permission is granted |
| **Offline Queue** | Whether any writes are pending or have failed |

Use this panel when investigating a reported issue.

---

## Tab 6: Settings History

Every change made to System Settings is automatically versioned and stored. This tab shows the full log.

**For each entry you can see:**
- Who made the change and when
- What was changed (before and after values)
- Whether it was a settings update or a rollback

**To roll back a change:**
1. Find the entry you want to restore
2. Click **Rollback**
3. Confirm the action
4. The system immediately restores the previous settings

> The rollback itself is also recorded, so you can always undo a rollback if needed.

---

## Audit Log

The audit log records every significant action across the platform — deal updates, settings changes, role changes, and more. It is visible to admins under the Team Management section.

Use it to investigate disputes or unusual activity.

---

---

# SECTION 13: REPORTING

## Daily Performance Report

Available to managers and admins. Found under **Admin → Daily Report** or **Reports** in the sidebar.

### How to Use It

1. Navigate to the Daily Report
2. The report defaults to today's date
3. Use the **date selector** to view any past date
4. The table shows all reps and their metrics for that day

### Data Source Indicator

A badge at the top of the report tells you where the data is coming from:

- **Live data** (amber): Computed in real time from today's activity — this is always accurate for the current day
- **Aggregated data** (blue): Pre-computed data for past dates — stored overnight by the system
- **No data** (grey): No activity found for the selected date

### Sorting the Table

Click any column header to sort by that metric. Click again to reverse the order. The column with the best performer for that metric is highlighted in green.

### Exporting to CSV

Click **Export CSV** to download the full report as a spreadsheet. The file is named with the date for easy filing.

---

## Rep Dashboard Stats

Individual reps can view their own historical stats from the Rep Dashboard. Weekly totals and training history are always available.

---

## DRAPS Reporting

DRAPS data is submitted by reps each day (see Section 11). It is visible on:

- The rep's own DRAPS & Stats page
- The manager's daily report
- The rep's personal dashboard funnel

---

---

# SECTION 14: NOTIFICATIONS

## What Are Notifications?

The CRM sends push notifications directly to your browser or device to keep you informed. You don't need to have the app open to receive them.

---

## Enabling Notifications

When you first log in, the system will ask for permission to send notifications.

1. A browser prompt will appear saying **"ASG CRM wants to send notifications"**
2. Click **Allow**
3. Done — you will now receive notifications automatically

> If you missed this prompt or accidentally clicked Block, you can re-enable notifications in your browser settings. Ask your admin for help if needed.

---

## Types of Notifications

### Performance Alerts (Reps)
These are sent during the day if your activity falls below expected levels. Your admin can enable or disable these per rep.

| Alert | When It Fires | What It Says |
|-------|--------------|-------------|
| **Activity Check** | After midday if you've made zero calls | Encourages you to start making calls |
| **Keep It Up** | After 3 PM if calls are below 50% of target | Shows how many more calls to reach your goal |
| **Almost There** | When you reach 80% of your daily target | Motivates you to push to 100% |
| **Tomorrow's a New Day** | After 5 PM if you missed today's target | Summarises the day and resets expectations |

### Daily Report Ready (Managers and Admins)
Sent each evening when the day's performance report has been compiled. Tap the notification to go directly to the report.

---

## Notification Best Practices

- Keep notifications **allowed** at all times while working
- If you're receiving too many alerts, speak to your admin about adjusting your target settings
- Notifications are only sent during business hours

---

---

# SECTION 15: OFFLINE MODE

## What Happens When the Internet Drops?

The CRM is designed to keep working even when your internet connection drops. This is called **offline mode**.

When you lose connection:
- An **"Offline"** indicator appears in the top bar
- The app continues to show the data it last loaded
- You can continue working — logging calls, adding notes, and updating deals

---

## What Still Works Offline

| Feature | Works Offline? |
|---------|---------------|
| Viewing existing leads | ✅ Yes |
| Viewing existing deals | ✅ Yes |
| Logging a call | ✅ Yes (queued for later) |
| Updating a deal | ✅ Yes (queued for later) |
| Adding notes | ✅ Yes (queued for later) |
| The map | ❌ No (requires internet) |
| Training (AI Roleplay) | ❌ No (requires internet) |
| Push notifications | ❌ No (requires internet) |

---

## What Happens to Data You Save Offline?

When you save something while offline, it is stored in a **queue** on your device. The queue holds your changes safely until the connection returns.

You'll see the queue status in the top bar:

| Status | Meaning |
|--------|---------|
| **Offline · 3 queued** | You're offline with 3 pending saves |
| **Syncing 3…** | Connection returned — uploading your changes |
| **Synced ✓** | All changes saved successfully |

---

## What If a Save Fails?

If a queued item fails to save after multiple attempts (e.g. due to a server issue), it will be marked as **failed**. You'll see a warning badge in the top bar.

If this happens:
1. Note what data was affected
2. Contact your admin
3. The admin can investigate the error log

> Data that fails to sync is never lost without warning. The system will always alert you if something couldn't be saved.

---

---

# SECTION 16: BEST PRACTICES

## Managing Leads Effectively

**Do:**
- Log every call, even if it was just a voicemail
- Update lead status every time it changes
- Add a note whenever you speak with a lead, even briefly
- Use the callback feature so you never forget a scheduled call
- Import leads promptly — stale leads become harder to convert

**Don't:**
- Leave leads as "New" after you've called them
- Skip logging a call because it was short
- Create duplicate leads (use the search function first)

---

## Keeping Deals Updated

**Do:**
- Add a note to your deals at least every 3 days
- Move deals through stages promptly when something happens
- Check the Chase List every Monday morning
- Record the settlement date and commission as soon as a deal closes

**Don't:**
- Let deals go more than a week without an update
- Change deal stages without adding a note explaining why
- Create a deal without linking it to the correct lead

---

## Using Training Effectively

**Do:**
- Complete at least 3 training sessions per week (or your admin's target)
- Start on Easy or Medium difficulty and work up to Hard
- Read the AI's feedback after each session — it's specific and useful
- Use Voice Mode when you're comfortable with the script
- Practise the same script multiple times until the score improves

**Don't:**
- Rush through sessions just to hit the count — quality matters
- Ignore the feedback section at the end
- Stay on Easy difficulty once you've mastered it
- Practise only when you're new — regular practice maintains sharpness

---

## Common Mistakes to Avoid

| Mistake | Why It's a Problem | What to Do Instead |
|---------|-------------------|--------------------|
| Not logging calls | Your stats won't reflect your effort | Log every call immediately after it ends |
| Creating a deal without a linked lead | Breaks reporting and client history | Always create deals from the lead record |
| Ignoring the Chase List | Deals stall and may be lost | Review the Chase List every Monday |
| Using the wrong script difficulty | Too easy = no growth; too hard too early = frustration | Match difficulty to your current skill level |
| Leaving notifications turned off | You miss important alerts | Keep notifications allowed while working |

---

---

# SECTION 17: DAILY WORKFLOW EXAMPLE

Here is a realistic example of a productive day using the CRM.

---

## 7:45 AM — Start of Day Preparation

Sarah logs into the CRM. She goes to her **Rep Dashboard** to check her targets for the day.

- Her daily call target is 20 calls
- She has 2 callbacks due this morning
- She has no training sessions completed this week yet (target is 3)

She checks the **Leads** page and sorts by **Callback** to see who she needs to call first. She also checks the **Chase List** — one of her deals hasn't been updated in 6 days.

She makes a quick note to update that deal after her morning calls.

---

## 9:00 AM — Morning Call Block

Sarah starts calling. For each call:

1. She opens the lead in the CRM
2. Makes the call
3. Immediately logs the outcome:
   - If connected — logs the call, adds notes, updates status
   - If no answer — logs "No Answer" with the time
   - If booked — logs "Booked", fills in the appointment details

By 10:30 AM she's completed 12 calls and booked 1 appointment.

---

## 10:30 AM — Deal Update

Sarah opens her deal pipeline and finds the deal that was flagged on the Chase List. She calls the client, gets an update, and adds a note: *"Spoke with client — lender is still reviewing. Follow up next Tuesday."*

The deal is updated. It drops off the Chase List.

---

## 11:00 AM — Training Session

Sarah has a 30-minute break in calls. She opens the **Training Hub** and runs a Medium difficulty session using the standard company script.

She works through all five sections. The AI gives her some pushback on the closing section. At the end, she scores 31/40.

The feedback highlights that her closing could be more direct. She makes a note to practise a stronger close next session.

---

## 12:00 PM — Lunch + Notifications

While on lunch, Sarah receives a notification: *"Keep It Up 💪 — 12 calls logged, 8 more to hit your daily target."*

She knows she needs to pick up the pace in the afternoon.

---

## 1:00 PM — Afternoon Call Block

Sarah returns to her call list and focuses on the remaining leads. She completes another 10 calls.

At 2:30 PM she qualifies a strong lead and creates a deal:
1. She opens the lead record
2. Clicks **Create Deal**
3. Fills in the deal value ($450,000)
4. Sets the stage to "Booked" (appointment confirmed for Friday)
5. Saves

The deal appears in her pipeline.

---

## 4:00 PM — End of Day Review

Sarah opens her **Rep Dashboard**:
- Calls Today: 22 ✅ (target was 20)
- Appointments: 1 ✅
- Training Sessions: 1 (2 more to go this week)

She receives a final notification: *"Almost There! 🎯 — Great work today, you hit your call target."*

She does a final check of her leads list to make sure all calls are logged and statuses are current. She closes the CRM and finishes her day.

---

---

# SECTION 18: TROUBLESHOOTING

## "I Can't Log In"

**Check:**
- Are you selecting your name correctly from the list?
- Is your PIN correct? PINs are 4 to 8 digits.
- Has your account been set up? Ask your admin to confirm.
- Try refreshing the page (press F5 or Ctrl+R)

**If none of these help:** Contact your admin to reset your PIN.

---

## "My Calls Are Not Showing in My Stats"

**Check:**
- Did you click Save after logging the call?
- Are you offline? If so, your calls are queued and will sync when you reconnect.
- Check the top bar — is there a syncing indicator?

**If the problem persists:** Ask your admin to check the error log.

---

## "The Map Is Not Loading"

**Check:**
- Are you connected to the internet?
- Try refreshing the page
- Check if the map works in a different browser (Chrome is recommended)

**Note:** The map requires an active internet connection and will not load in offline mode.

---

## "Voice Mode Is Not Working"

**Check:**
- Is Voice Mode enabled? Ask your admin.
- Are you using Chrome or Edge? Voice features require these browsers.
- Has your browser been given microphone permission?
  - In Chrome: click the padlock icon in the address bar → check Microphone is set to "Allow"
- Is your microphone plugged in and working?

---

## "The AI Isn't Responding in Training"

**Check:**
- Are you connected to the internet?
- Has the Training feature been disabled? Check with your admin.
- Try ending the session and starting a new one
- Refresh the page if the issue persists

---

## "I See 'Offline · X Queued' in the Top Bar"

This is normal when your internet connection drops. The number shows how many actions are waiting to sync.

**What to do:**
- Wait for your connection to return — syncing happens automatically
- You can keep working while offline
- Once online, the indicator will change to "Syncing…" then "Synced ✓"

---

## "A Deal Is Showing as Stuck But I Just Updated It"

**Check:**
- Was the update saved? Look for a confirmation or the Synced indicator.
- Was the update a meaningful change? Simply viewing a deal does not reset the stuck timer — you need to add a note or change the stage.

---

## "I'm Getting Too Many Notifications"

Speak to your admin. They can:
- Adjust your daily call target
- Disable performance alerts for your account specifically

---

## "Something Seems Wrong With the Data"

If you see data that looks incorrect — missing leads, wrong stats, deals in the wrong stage:

1. Do not try to manually fix data unless you are certain of the correct values
2. Screenshot the issue if possible
3. Report it to your admin with as much detail as you can
4. Your admin can review the audit log to trace what happened

---

---

# SECTION 19: GLOSSARY

---

**Activity Feed**
A reverse-chronological list of your most recent calls, visible on the Rep Dashboard.

**Admin**
The highest user role. Admins have full access to all features including system settings, rep management, and the audit log.

**Appointment**
A scheduled meeting between a rep and a lead or client. Appointments are logged as FC Appointments (First Call) or FR Appointments (Follow-up / Review).

**At-Risk Deal**
A deal that is both stuck (not recently updated) and has a settlement date approaching. Shown with a red flag on the Chase List.

**Audit Log**
A complete record of all significant actions in the system — who did what and when. Visible to admins.

**Callback**
A call outcome where the lead has asked to be called back at a specific time. The CRM tracks these and surfaces them when it's time to call.

**Chase List**
A list of deals that have not been updated recently and need attention. Found on the Deal Dashboard.

**Client Hub**
The section of the CRM where long-term client records are stored, including documents, deal history, and contact details.

**Commission**
The financial reward earned by a rep when a deal settles. Recorded in the system and included in reporting.

**Connected**
A call outcome where you successfully spoke with the lead or client.

**Deal**
A financial transaction (typically a loan or investment) in progress. Created when a lead is qualified and moves toward settlement.

**Deal Stage**
The current phase of a deal in the pipeline. Stages run from Booked through to Complete.

**DRAPS**
An activity tracking framework used to measure sales funnel performance.
- **D** = Dials (total calls made)
- **R** = Responses (calls answered)
- **A** = Appointments (meetings booked)
- **P** = Presentations (meetings completed)
- **S** = Sales (deals closed)

**Feature Flag**
A system setting that turns a specific feature on or off for all users. Managed by admins in System Settings.

**FCM**
Firebase Cloud Messaging — the underlying technology that delivers push notifications to your browser or device.

**Hard Mode**
The most challenging training difficulty. The AI is sceptical and resistant, requiring strong scripting and handling of objections.

**KPI**
Key Performance Indicator — a measurable metric used to evaluate performance. Examples: calls today, appointments booked, deals closed.

**Lead**
A person or household who may become a client. Leads enter the system through import, manual entry, or Google Sheets integration.

**Lead Status**
The current stage of a lead in the sales process: New → Contacted → Qualified → Booked → Lost.

**Manager**
A user role with team-wide visibility. Managers can view all reps' activity and reports but cannot change system settings.

**Offline Queue**
A list of data changes that have been saved locally while the app is offline, waiting to be uploaded when the connection returns.

**Pipeline**
The visual layout of all active deals arranged by stage. Found on the Deal Dashboard.

**Push Notification**
An alert sent directly to your browser or device by the CRM. Used for performance alerts and daily report reminders.

**Qualified Lead**
A lead who has expressed genuine interest and meets the financial criteria to move forward — the trigger for creating a deal.

**Read-Only Mode**
An emergency system setting that prevents all data changes. Used during maintenance. No rep can save anything while this is active.

**Replay**
A feature that allows you to review the full conversation from a past training session.

**Rep**
A standard user — a business development manager or consultant who makes calls and manages leads and deals.

**Rollback**
The process of restoring a previous version of system settings after a change was made. Accessible to admins in the Settings History tab.

**Script**
A structured sales conversation guide used as the basis for AI training sessions. Scripts define the flow of the conversation and what the AI will respond to.

**Section Score**
The score earned in each individual section of a training session (Opening, Rapport, Qualification, Value Delivery, Closing). Each is scored out of 8.

**Settlement**
The completion of a financial transaction — the moment a deal closes and commission is earned.

**Stuck Deal**
A deal that has not been updated for more than a set number of days (configured by your admin). Appears on the Chase List.

**Target**
A performance goal set for a rep. Examples: 20 calls per day, 5 appointments per week, 3 training sessions per week.

**Training Hub**
The section of the CRM where AI roleplay training sessions take place.

**VAPID Key**
A technical credential used to enable push notifications. Managed by your admin — reps do not need to interact with this directly.

**Voice Mode**
A training session mode where the rep speaks their responses out loud and the AI responds verbally.

**Weekly Target**
The total expected output for a week — calls, appointments, or training sessions.

---

---

# DOCUMENT END

---

**ASG Financial Services — Internal Operations Manual**  
*For staff use only. Not for external distribution.*  
*All information is subject to change. Contact your admin for the latest system configuration.*

---

*This document was prepared to support the onboarding and ongoing development of all ASG CRM users. For technical support, contact your system administrator.*
