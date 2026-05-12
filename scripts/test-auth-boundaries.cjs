const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const settingsService = fs.readFileSync(path.join(root, "src/lib/settingsService.ts"), "utf8");
const firestoreRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

assert.equal(
  /falling back to Firestore|HISTORY_COL|AUDIT_COL|saveSettingsVersion|setDoc\(CONFIG_DOC|addDoc\(AUDIT_COL/.test(settingsService),
  false,
  "settingsService must not contain direct Firestore fallback writes for migrated settings/audit flows.",
);

for (const collectionName of ["settingsHistory", "auditLogs", "audit"]) {
  const pattern = new RegExp(`match /${collectionName}/\\{docId\\} \\{[\\s\\S]*?allow create: if false;`);
  assert.equal(
    pattern.test(firestoreRules),
    true,
    `${collectionName} must deny direct client creates now that callable authority exists.`,
  );
}

assert.match(
  firestoreRules,
  /function canUseOperationalApp\(\) \{\s*return request\.auth != null;\s*\}/,
  "rules must keep an explicit anonymous-compatible operational session bridge during UID/claims migration.",
);

for (const collectionName of [
  "reps",
  "leads",
  "deals",
  "dealDocuments",
  "draps",
  "commissions",
  "invoiceDrafts",
  "knockZones",
  "customPinTypes",
  "clientGroups",
  "clientNotes",
  "piaReports",
  "smsfReports",
  "calendarServiceTypes",
  "appointments",
  "knowledgeBase",
  "documentLibrary",
  "formTemplates",
  "trainingSessions",
  "trainingDocuments",
  "trainingVideos",
  "trainingRecordings",
  "calculatorStates",
  "settings",
]) {
  const pattern = new RegExp(`match /${collectionName}/\\{[^}]+\\} \\{[\\s\\S]*?allow read, write: if canUseOperationalApp\\(\\);`);
  assert.equal(
    pattern.test(firestoreRules),
    true,
    `${collectionName} must use the operational session bridge instead of non-anonymous isAuthenticated().`,
  );
}

assert.match(
  firestoreRules,
  /match \/appSettings\/\{docId\} \{[\s\S]*?allow read: if canUseOperationalApp\(\);[\s\S]*?allow write: if canUseOperationalApp\(\)\s*&& docId != "config";/,
  "appSettings must allow anonymous-compatible reads while keeping appSettings/config direct writes blocked.",
);

assert.match(
  firestoreRules,
  /function hasElevatedRole\(\) \{\s*return isAuthenticated\(\)/,
  "elevated/admin access must continue to require non-anonymous authenticated users.",
);
