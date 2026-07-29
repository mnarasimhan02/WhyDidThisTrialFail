import assert from "node:assert/strict";
import test from "node:test";

import { reasoningTestApi } from "../app/api/investigate/route.ts";

const trial = {
  nctId: "NCT00000001",
  title: "Example trial",
  acronym: "EXAMPLE",
  assets: ["Examplemab"],
  whyStopped: null,
};

test("routes a documented safety stop to safety", () => {
  assert.equal(
    reasoningTestApi.classifyPrimaryReason("Stopped after liver enzyme elevations changed the benefit-risk profile"),
    "safety",
  );
});

test("routes an explicit endpoint miss before general efficacy", () => {
  assert.equal(
    reasoningTestApi.classifyPrimaryReason("The study did not meet its primary endpoint and showed no clinical benefit"),
    "primary endpoint",
  );
});

test("rejects the old generic answer vocabulary", () => {
  assert.deepEqual(
    reasoningTestApi.classifyText("Patient selection was broad, target biology was weak, dose was low, and the comparator bar was high."),
    [],
  );
});

test("does not treat the phrase safety and efficacy as a documented safety cause", () => {
  assert.notEqual(
    reasoningTestApi.classifyPrimaryReason("A pre-planned analysis of safety and efficacy was completed."),
    "safety",
  );
});

test("recognizes trial-specific negative primary-outcome language", () => {
  assert.equal(
    reasoningTestApi.classifyPrimaryReason("The primary outcome was not associated with slower clinical decline."),
    "primary endpoint",
  );
});

test("recognizes a published lack-of-efficacy result", () => {
  assert.equal(
    reasoningTestApi.classifyPrimaryReason("Treatment produced no reduction in cognitive or functional decline."),
    "efficacy",
  );
});

test("recognizes did-not-reduce efficacy language", () => {
  assert.equal(
    reasoningTestApi.classifyPrimaryReason("The treatment did not reduce cognitive or functional decline."),
    "efficacy",
  );
});

test("recognizes paired-trial negative endpoint language", () => {
  assert.equal(
    reasoningTestApi.classifyPrimaryReason("Neither dose resulted in significantly slower clinical decline than placebo."),
    "primary endpoint",
  );
});

test("does not route a bare FDA mention as a regulatory cause", () => {
  assert.notEqual(
    reasoningTestApi.classifyPrimaryReason("The outcome measure was reviewed in an FDA guidance document."),
    "regulatory",
  );
});

test("evaluates expected evidence independently", () => {
  const tests = reasoningTestApi.expectedTests("safety", "The sponsor reported a safety concern but no adverse-event details.");
  assert.equal(tests[0].status, "found");
  assert.equal(tests[1].status, "not found");
});

test("suppresses asset-only associations as trial causes", () => {
  const claims = [{
    id: "claim-1",
    text: "An asset label mentions an adverse event.",
    kind: "association",
    relation: "indirect support",
    category: "safety",
    sourceId: "fda",
    sourceAuthority: 3,
    directness: 1,
    trialSpecificity: 1,
    temporalRelevance: 1,
    entityIds: ["asset"],
  }];
  const sources = [{
    id: "fda",
    name: "FDA",
    sourceType: "fda",
    authority: 3,
    url: "https://www.fda.gov/",
    detail: "Asset-level label",
    provenanceKey: "fda-examplemab",
    availability: "retrieved",
  }];
  assert.deepEqual(reasoningTestApi.evaluateCandidates(claims, sources, trial), []);
});

test("does not classify an ongoing trial as a failure", () => {
  const outcome = reasoningTestApi.trialOutcome({ ...trial, status: "RECRUITING" });
  assert.equal(outcome.classification, "not a failure");
});

test("normalizes ClinicalTrials.gov underscore statuses", () => {
  const outcome = reasoningTestApi.trialOutcome({ ...trial, status: "ACTIVE_NOT_RECRUITING" });
  assert.equal(outcome.classification, "not a failure");
});

test("keeps documented safety reasoning inside the safety route", () => {
  const routedTrial = {
    ...trial,
    whyStopped: "Stopped because liver enzyme elevations changed the benefit-risk profile.",
  };
  const claims = [
    {
      id: "claim-1", text: routedTrial.whyStopped, kind: "documented cause", relation: "direct support",
      category: "safety", sourceId: "ctg-current", sourceAuthority: 3, directness: 3,
      trialSpecificity: 3, temporalRelevance: 2, entityIds: ["trial"],
    },
    {
      id: "claim-2", text: "An unrelated filing mentions FDA regulatory activity.", kind: "observation",
      relation: "direct support", category: "regulatory", sourceId: "sec", sourceAuthority: 3,
      directness: 2, trialSpecificity: 3, temporalRelevance: 2, entityIds: ["program"],
    },
  ];
  const sources = [
    { id: "ctg-current", sourceType: "registry", provenanceKey: "registry" },
    { id: "sec", sourceType: "sec", provenanceKey: "sec" },
  ];
  const candidates = reasoningTestApi.evaluateCandidates(claims, sources, routedTrial);
  assert.deepEqual(candidates.map((candidate) => candidate.category), ["safety"]);
});

test("does not classify completion alone as a failure", () => {
  const outcome = reasoningTestApi.trialOutcome({ ...trial, status: "COMPLETED", hasResults: true });
  assert.equal(outcome.classification, "completed");
  assert.match(outcome.statement, /not a failure/i);
});

test("does not suppress an ongoing record with established trial-specific negative results", () => {
  const outcome = reasoningTestApi.trialOutcome({ ...trial, status: "ACTIVE_NOT_RECRUITING" });
  const resolved = reasoningTestApi.resolveOutcome(outcome, { ...trial, status: "ACTIVE_NOT_RECRUITING" }, [{
    evidenceStrength: "STRONG PUBLIC EVIDENCE",
  }], []);
  assert.equal(resolved.suppress, false);
  assert.equal(resolved.outcome.classification, "negative outcome reported");
});

test("verified EPOCH evidence records futility and lack of efficacy", () => {
  const [evidence] = reasoningTestApi.verifiedEvidenceForTrial("NCT01739348");
  assert.equal(evidence.category, "efficacy");
  assert.equal(evidence.documentedCause, true);
  assert.match(evidence.claim, /terminated early for futility/i);
});

test("verified GRADUATE evidence preserves trial-specific endpoint results", () => {
  const graduateOne = reasoningTestApi.verifiedEvidenceForTrial("NCT03444870")[0];
  const graduateTwo = reasoningTestApi.verifiedEvidenceForTrial("NCT03443973")[0];
  assert.equal(graduateOne.category, "primary endpoint");
  assert.equal(graduateTwo.category, "primary endpoint");
  assert.match(graduateOne.claim, /GRADUATE I did not meet its primary endpoint/i);
  assert.match(graduateTwo.claim, /GRADUATE II did not meet its primary endpoint/i);
  assert.match(graduateOne.claim, /P=0\.10/);
  assert.match(graduateTwo.claim, /P=0\.30/);
});

test("verified GENERATION HD1 evidence records benefit-risk without inventing safety causality", () => {
  const [evidence] = reasoningTestApi.verifiedEvidenceForTrial("NCT03761849");
  assert.equal(evidence.category, "benefit-risk");
  assert.equal(evidence.documentedCause, true);
  assert.match(evidence.claim, /no new safety signals/i);
});

test("verified MYSTIC evidence preserves negative endpoints despite ongoing follow-up", () => {
  const [evidence] = reasoningTestApi.verifiedEvidenceForTrial("NCT02453282");
  assert.equal(evidence.category, "primary endpoint");
  assert.equal(evidence.documentedCause, false);
  assert.match(evidence.claim, /did not meet its primary endpoints/i);
  assert.match(evidence.claim, /overall survival/i);
  assert.match(evidence.claim, /progression-free survival/i);
});

test("keeps a registry stopping reason deterministic and source-linked", () => {
  const result = reasoningTestApi.trialStoppingReason(
    { ...trial, status: "TERMINATED", whyStopped: "Stopped after a safety review." },
    [{ id: "ctg-current", name: "ClinicalTrials.gov", url: "https://clinicaltrials.gov/study/NCT00000001" }],
  );
  assert.equal(result.documented, true);
  assert.equal(result.evidenceStrength, "DIRECTLY DOCUMENTED");
  assert.equal(result.reason, "Stopped after a safety review.");
});

test("does not invent a stopping reason for a terminated trial", () => {
  const result = reasoningTestApi.trialStoppingReason(
    { ...trial, status: "TERMINATED", whyStopped: null },
    [],
  );
  assert.equal(result.documented, false);
  assert.equal(result.evidenceStrength, "NOT DOCUMENTED");
  assert.match(result.reason, /does not report a stopping reason/i);
});

test("excludes the registry stop claim from program-cause reasoning", () => {
  const claims = [
    { id: "stop", sourceId: "ctg-current", kind: "documented cause", entityIds: ["trial", "asset", "program"] },
    { id: "publication", sourceId: "pubmed-1", kind: "observation", entityIds: ["trial", "asset", "program"] },
  ];
  assert.deepEqual(reasoningTestApi.programClaimsOnly(claims).map((claim) => claim.id), ["publication"]);
});

test("reports insufficient evidence when a stopped trial has no program evidence", () => {
  const result = reasoningTestApi.programOutcome(trial, [], [], []);
  assert.equal(result.classification, "Insufficient evidence");
  assert.match(result.statement, /broader development program ended/i);
});

test("reports a continuing program when related trials remain active", () => {
  const result = reasoningTestApi.programOutcome(trial, [{ status: "RECRUITING" }], [], []);
  assert.equal(result.classification, "Continuing");
  assert.match(result.statement, /not treated as program failure/i);
});
