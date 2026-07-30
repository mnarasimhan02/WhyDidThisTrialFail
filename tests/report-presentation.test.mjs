import test from "node:test";
import assert from "node:assert/strict";
import { conciseFinding, displayOutcome, evidenceStatus, primaryCategory, scorecard, validatePresentation } from "../lib/report-presentation.ts";

const documented = [{ category: "FUTILITY", decision: "DOCUMENTED", scope: "TRIAL", supportingClaimIds: ["registry-stop"], contradictingClaimIds: [] }];

test("presents a documented futility stop in the first-screen fields", () => {
  assert.equal(displayOutcome("TERMINATED", "futility"), "STOPPED_FOR_FUTILITY");
  assert.equal(primaryCategory(documented, true), "FUTILITY");
  assert.equal(evidenceStatus(true, documented), "DIRECTLY_DOCUMENTED");
});

test("shortens registry wording without losing the documented category", () => {
  assert.match(conciseFinding("This study was discontinued due to an interim analysis in this study, which indicated that Crenezumab was unlikely to meet its primary endpoint."), /interim analysis.*unlikely to meet its primary endpoint/i);
  assert.match(conciseFinding("MnSOD longer available during Phase II"), /intervention was no longer available/i);
});

test("does not present an ongoing trial as a failure", () => {
  assert.equal(displayOutcome("RECRUITING", "ongoing"), "ONGOING");
});

test("scores trial and program evidence independently without percentages", () => {
  const result = scorecard({ documented: true, explanations: documented, programEvidenceStrength: "INSUFFICIENT EVIDENCE", coverage: [{ applicable: true, searchCompleted: true, relevantRecordsUsed: 1 }], independentSources: 1, confirmedRelatedTrials: 0, highImpactGaps: 1 });
  assert.equal(result.trial, "ESTABLISHED");
  assert.equal(result.program, "UNKNOWN");
  assert.notEqual(result.trial, result.program);
});

test("presentation judge accepts a documented, scoped report", () => {
  const reason = "Interim analysis indicated the study was unlikely to meet its primary endpoint.";
  const issues = validatePresentation({
    documentedReason: reason, primaryFinding: reason, trialScore: "ESTABLISHED", programScore: "UNKNOWN",
    scoreLabels: ["ESTABLISHED", "UNKNOWN"], implications: [{ statement: "Assessment should account for the documented trial result.", supportingClaimIds: ["registry-stop"] }],
    visibleLabels: ["Evidence for the Trial Outcome", "Evidence for the Program Outcome"],
  });
  assert.deepEqual(issues, []);
});

test("presentation judge rejects unsupported UX content", () => {
  const issues = validatePresentation({
    documentedReason: "Safety stop", primaryFinding: "Insufficient evidence.", trialScore: "ESTABLISHED", programScore: "ESTABLISHED",
    scoreLabels: ["87% confidence"], implications: [{ statement: "A different dose would have succeeded.", supportingClaimIds: [] }],
    visibleLabels: ["Matrix A"],
  });
  assert.ok(issues.includes("DOCUMENTED_REASON_OMITTED_FROM_SUMMARY"));
  assert.ok(issues.includes("SUMMARY_LEADS_WITH_INSUFFICIENT_EVIDENCE"));
  assert.ok(issues.includes("TRIAL_PROGRAM_EXPLAINABILITY_MERGED"));
  assert.ok(issues.includes("UNSUPPORTED_NUMERIC_PROBABILITY"));
  assert.ok(issues.includes("UNSUPPORTED_ACTIONABLE_IMPLICATION"));
  assert.ok(issues.includes("TECHNICAL_LABEL_IN_PRIMARY_UX"));
});
