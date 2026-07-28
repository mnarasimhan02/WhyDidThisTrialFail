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

test("does not classify completion alone as a failure", () => {
  const outcome = reasoningTestApi.trialOutcome({ ...trial, status: "COMPLETED", hasResults: true });
  assert.equal(outcome.classification, "completed");
  assert.match(outcome.statement, /not a failure/i);
});
