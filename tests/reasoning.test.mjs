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
