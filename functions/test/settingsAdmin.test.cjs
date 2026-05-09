const assert = require("node:assert/strict");

const {
  buildSettingsHistoryEntry,
  buildSettingsAuditEntry,
  validateSettingsPayload,
} = require("../lib/settingsAdmin.js");

const serverTimestamp = Symbol("serverTimestamp");
const auth = {
  uid: "firebase-uid-1",
  repId: 42,
  role: "admin",
  signInProvider: "password",
};

const previousSettings = {
  featureFlags: { enableVoiceMode: true },
};
const updates = {
  featureFlags: { enableVoiceMode: false },
};

assert.deepEqual(validateSettingsPayload(updates), updates);
assert.throws(
  () => validateSettingsPayload({ unexpected: true }),
  /Unsupported settings section/,
);

const history = buildSettingsHistoryEntry({
  previousSettings,
  newSettings: updates,
  action: "update",
  actorName: "Admin User",
  auth,
  serverTimestamp,
});

assert.equal(history.changedBy, 42);
assert.equal(history.changedByName, "Admin User");
assert.equal(history.action, "update");
assert.equal(history.authUid, "firebase-uid-1");
assert.equal(history.authRole, "admin");
assert.equal(history.source, "callable");
assert.equal(history.timestamp, serverTimestamp);

const audit = buildSettingsAuditEntry({
  action: "settings_update",
  targetId: "config",
  before: previousSettings,
  after: updates,
  actorName: "Admin User",
  auth,
  serverTimestamp,
});

assert.equal(audit.userId, 42);
assert.equal(audit.userName, "Admin User");
assert.equal(audit.action, "settings_update");
assert.equal(audit.targetType, "appSettings");
assert.equal(audit.targetId, "config");
assert.equal(audit.source, "callable");
assert.equal(audit.timestamp, serverTimestamp);
