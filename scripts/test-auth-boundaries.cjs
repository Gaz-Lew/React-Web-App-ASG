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
