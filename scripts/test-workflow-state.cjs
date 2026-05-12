const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "asg-workflow-state-"));

execFileSync(
  process.platform === "win32" ? process.env.ComSpec : "npx",
  [
    ...(process.platform === "win32" ? ["/c", "npx"] : []),
    "tsc",
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--jsx",
    "react-jsx",
    "--esModuleInterop",
    "--skipLibCheck",
    "--outDir",
    outDir,
    path.join(repoRoot, "src/lib/workflowState.ts"),
    path.join(repoRoot, "src/lib/nextAction.ts"),
  ],
  { cwd: repoRoot, stdio: "pipe" },
);

const workflow = require(path.join(outDir, "lib/workflowState.js"));
const { getNextAction } = require(path.join(outDir, "lib/nextAction.js"));

const now = new Date("2026-05-10T03:00:00+08:00").getTime();

function lead(overrides) {
  return {
    id: 1,
    name: "Test Lead",
    suburb: "Perth",
    status: "contacted",
    callHistory: [{ date: "2026-05-08", time: "09:00", result: "connected" }],
    lastCall: "2026-05-08T09:00:00+08:00",
    ...overrides,
  };
}

assert.equal(workflow.todayInPerth(new Date("2026-05-09T23:30:00Z")), "2026-05-10");

assert.equal(workflow.isTerminalLeadStatus("Not Interested"), true);
assert.equal(workflow.isTerminalLeadStatus("contacted"), false);

const overdueCallback = workflow.getWorkflowState(
  lead({ callbackDate: "2026-05-09", callbackTime: "10:30", nextContactDate: "2026-05-08" }),
  { now },
);
assert.equal(overdueCallback.queueType, "callback");
assert.equal(overdueCallback.priority, "high");
assert.equal(overdueCallback.isActionable, true);

const scheduledCallback = workflow.getWorkflowState(
  lead({ lastCall: "2026-05-01T09:00:00+08:00", callbackDate: "2026-05-15", callbackTime: "11:00" }),
  { now },
);
assert.equal(scheduledCallback.queueType, "callback");
assert.equal(scheduledCallback.priority, "medium");
assert.equal(getNextAction(scheduledCallback.lead ?? lead({ callbackDate: "2026-05-15", callbackTime: "11:00" })).type, "callback");

const dueFollowUp = workflow.getWorkflowState(
  lead({ callbackDate: undefined, callbackTime: undefined, nextContactDate: "2026-05-10" }),
  { now },
);
assert.equal(dueFollowUp.queueType, "followup");
assert.equal(dueFollowUp.priority, "medium");

const terminalCallback = workflow.getWorkflowState(
  lead({ status: "Not Interested", callbackDate: "2026-05-09", nextContactDate: "2026-05-09" }),
  { now },
);
assert.equal(terminalCallback.isActionable, false);
assert.equal(terminalCallback.queueType, "terminal");

const bookedWithFallback = getNextAction(lead({
  status: "Booked",
  callbackDate: undefined,
  nextContactDate: undefined,
  appointmentDate: "2026-05-20",
  bookingTime: "14:00",
}));
assert.equal(bookedWithFallback.type, "booked");
assert.match(bookedWithFallback.reason, /2026-05-20/);

const donePatch = workflow.buildInboxDonePatch(lead({
  callbackDate: "2026-05-09",
  callbackTime: "10:30",
  nextContactDate: "2026-05-10",
}), { now });
assert.equal(donePatch.status, "contacted");
assert.equal(donePatch.callbackDate, null);
assert.equal(donePatch.callbackTime, null);
assert.equal(donePatch.nextContactDate, null);
assert.equal(donePatch.lastCall, "2026-05-09T19:00:00.000Z");
assert.equal(donePatch.callHistory.length, 2);

console.log("Workflow state checks passed");
