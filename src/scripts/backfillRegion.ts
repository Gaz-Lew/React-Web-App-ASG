/**
 * backfillRegion.ts — One-time migration: stamp missing region / updatedAt fields
 * on legacy Firestore documents.
 *
 * Collections updated:
 *   - leads      stamps: region (default "brisbane"), updatedAt (if missing)
 *   - auditLogs  stamps: region only (no updatedAt needed)
 *
 * Safety guarantees:
 *   - Only updates docs where the field is undefined/null (idempotent)
 *   - Never overwrites an existing region or updatedAt value
 *   - Never deletes documents or modifies other fields
 *   - Processes in batches of 500 (Firestore write limit)
 *
 * ── Prerequisites ────────────────────────────────────────────────────────────
 *   npm install --save-dev ts-node dotenv
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   npx ts-node --esm src/scripts/backfillRegion.ts
 *
 * Reads credentials from .env (VITE_FIREBASE_* variables).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env from project root (two levels up from src/scripts/)
dotenv.config({ path: resolve(__dirname, "../../.env") });

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";

// ── Firebase init (reads VITE_* vars from .env) ───────────────────────────────

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const requiredKeys = ["apiKey", "projectId"] as const;
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    console.error(`[backfill] Missing env var for ${key}. Check your .env file.`);
    process.exit(1);
  }
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_REGION = "brisbane";
const BATCH_SIZE = 500;

// Single timestamp for the entire run — all backfilled docs get the same value.
// This keeps ordering deterministic and avoids drift across batches.
const RUN_TIMESTAMP = Date.now();

// ── Leads backfill (region + updatedAt) ───────────────────────────────────────

async function backfillLeads(): Promise<void> {
  console.log('\n[backfill] Scanning "leads"...');

  const snapshot = await getDocs(collection(db, "leads"));
  console.log(`[backfill]   Total docs: ${snapshot.size}`);

  // Collect docs that are missing region, updatedAt, or both
  type PendingUpdate = { id: string; fields: Record<string, unknown> };
  const toUpdate: PendingUpdate[] = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const fields: Record<string, unknown> = {};
    if (!data.region)    fields.region    = DEFAULT_REGION;
    if (!data.updatedAt) fields.updatedAt = RUN_TIMESTAMP;
    if (Object.keys(fields).length > 0) {
      toUpdate.push({ id: docSnap.id, fields });
    }
  }

  const missingRegion    = toUpdate.filter((u) => "region"    in u.fields).length;
  const missingUpdatedAt = toUpdate.filter((u) => "updatedAt" in u.fields).length;
  console.log(`[backfill]   Missing region:    ${missingRegion}`);
  console.log(`[backfill]   Missing updatedAt: ${missingUpdatedAt}`);

  if (toUpdate.length === 0) {
    console.log(`[backfill]   Nothing to update. Already fully backfilled.`);
    return;
  }

  let totalUpdated = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const { id, fields } of chunk) {
      // update() merges — only sets the missing fields, leaves everything else untouched
      batch.update(doc(db, "leads", id), fields);
    }

    await batch.commit();
    totalUpdated += chunk.length;
    console.log(
      `[backfill]   Updated ${totalUpdated}/${toUpdate.length}` +
      ` (batch ${Math.ceil(totalUpdated / BATCH_SIZE)}/${Math.ceil(toUpdate.length / BATCH_SIZE)})`,
    );
  }

  console.log(`[backfill]   Done. ${totalUpdated} leads updated.`);
}

// ── auditLogs backfill (region only) ─────────────────────────────────────────

async function backfillAuditLogs(): Promise<void> {
  console.log('\n[backfill] Scanning "auditLogs"...');

  const snapshot = await getDocs(collection(db, "auditLogs"));
  console.log(`[backfill]   Total docs: ${snapshot.size}`);

  const toUpdate = snapshot.docs.filter((d) => !d.data().region);
  console.log(`[backfill]   Missing region: ${toUpdate.length}`);

  if (toUpdate.length === 0) {
    console.log(`[backfill]   Nothing to update. Already fully backfilled.`);
    return;
  }

  let totalUpdated = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const docSnap of chunk) {
      batch.update(doc(db, "auditLogs", docSnap.id), { region: DEFAULT_REGION });
    }

    await batch.commit();
    totalUpdated += chunk.length;
    console.log(
      `[backfill]   Updated ${totalUpdated}/${toUpdate.length}` +
      ` (batch ${Math.ceil(totalUpdated / BATCH_SIZE)}/${Math.ceil(toUpdate.length / BATCH_SIZE)})`,
    );
  }

  console.log(`[backfill]   Done. ${totalUpdated} auditLog entries updated.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function backfillRegion(): Promise<void> {
  console.log("[backfill] Starting backfill...");
  console.log(`[backfill] Default region:    "${DEFAULT_REGION}"`);
  console.log(`[backfill] updatedAt fallback: ${RUN_TIMESTAMP}`);

  await backfillLeads();
  await backfillAuditLogs();

  console.log("\n[backfill] ✓ Backfill complete.");
  console.log("[backfill]   Verify in Firestore Console:");
  console.log("  - leads:     no docs missing region or updatedAt");
  console.log("  - auditLogs: no docs missing region");
}

backfillRegion().then(() => process.exit(0)).catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
