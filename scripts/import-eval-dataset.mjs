import fs from "node:fs/promises";
import path from "node:path";

import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "data/evals.json";

if (!inputPath) {
  throw new Error("Usage: node scripts/import-eval-dataset.mjs <input.xlsx> [output.json]");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const evalSheet = workbook.worksheets.getItem("Eval Dataset");
const sourceSheet = workbook.worksheets.getItem("Source Links");
const summarySheet = workbook.worksheets.getItem("Summary");
const rows = evalSheet.getRange("A1:K101").values;
const sourceRows = sourceSheet.getRange("A1:D101").values;

const records = toObjects(rows);
const sources = new Map(toObjects(sourceRows).map((row) => [row.eval_id, row]));
const summaryRows = summarySheet.getRange("A3:B8").values;
const reportedSummary = Object.fromEntries(summaryRows.slice(1).map((row) => [String(row[0]), Number(row[1])]));

const cases = records.map((row) => {
  const category = String(row.expected_primary_category);
  const state = String(row.expected_trial_state);
  const assertion = String(row.key_assertion);
  const expectedSources = expectedSourceFamilies(category, state, assertion, String(row.verification_level));

  return {
    evalId: String(row.eval_id),
    nctId: String(row.nct_id),
    trialShortName: String(row.trial_short_name),
    therapeuticArea: String(row.therapeutic_area),
    phase: String(row.phase),
    expectedTrialState: state,
    expectedPrimaryCategory: category,
    acceptedCategories: acceptedCategories(category),
    shouldGenerateHypotheses: triState(row.should_generate_failure_analysis),
    shouldReturnInsufficientEvidence: shouldReturnInsufficient(category, String(row.minimum_evidence_strength)),
    minimumEvidenceStrength: String(row.minimum_evidence_strength),
    verificationLevel: String(row.verification_level),
    expectedPrimarySources: expectedSources,
    keyAssertion: assertion,
    clinicalTrialsGovUrl: String(sources.get(row.eval_id)?.clinicaltrials_gov_url ?? ""),
    verificationNote: String(sources.get(row.eval_id)?.verification_note ?? ""),
  };
});

const fixture = {
  schemaVersion: 1,
  datasetName: "WhyDidThisTrialFail Eval Dataset 100",
  datasetVersion: "1.0.0",
  sourceWorkbook: path.basename(inputPath),
  notes: [
    "Gold cases are regression anchors; Silver cases require live verification before immutable adjudication.",
    "Current ClinicalTrials.gov status and dates override stale static expectations.",
    "Expected source families are deterministic derivations from the workbook category, state, assertion, and verification level.",
  ],
  qualityChecks: {
    rowLevelCounts: {
      total: cases.length,
      gold: cases.filter((item) => item.verificationLevel === "Gold").length,
      silver: cases.filter((item) => item.verificationLevel === "Silver").length,
    },
    workbookSummaryCounts: {
      total: reportedSummary["Total records"],
      gold: reportedSummary["Gold records"],
      silver: reportedSummary["Silver records"],
    },
    warnings: cases.filter((item) => item.verificationLevel === "Gold").length === reportedSummary["Gold records"]
      ? []
      : ["The workbook Summary tab verification counts do not match the row-level Gold/Silver labels. Row-level labels are used."],
  },
  cases,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(`Imported ${cases.length} evaluation cases to ${outputPath}`);

function toObjects(matrix) {
  const [headers, ...data] = matrix;
  return data.map((row) => Object.fromEntries(headers.map((header, index) => [String(header), row[index]])));
}

function triState(value) {
  if (value === "YES") return true;
  if (value === "NO") return false;
  return null;
}

function shouldReturnInsufficient(category, strength) {
  if (/NOT_A_FAILURE|LIVE_STATUS_REQUIRED|INVALID/.test(category)) return false;
  return strength === "INSUFFICIENT_EVIDENCE" || /INSUFFICIENT|UNKNOWN|UNRESOLVED/.test(category);
}

function acceptedCategories(category) {
  const values = new Set();
  const add = (...items) => items.forEach((item) => values.add(item));

  if (/SAFETY|MORTALITY|INFERIOR_OUTCOME/.test(category)) add("safety");
  if (/BENEFIT_RISK/.test(category)) add("benefit-risk", "safety");
  if (/PRIMARY_ENDPOINT/.test(category)) add("primary endpoint");
  if (/EFFICACY/.test(category)) add("efficacy", "primary endpoint");
  if (/FUTILITY/.test(category)) add("futility", "efficacy", "primary endpoint");
  if (/REGULATORY/.test(category)) add("regulatory");
  if (/BUSINESS/.test(category)) add("commercial strategy", "funding", "portfolio prioritization");
  if (/STRATEG/.test(category)) add("commercial strategy", "portfolio prioritization");
  if (/FUND/.test(category)) add("funding");
  if (/PARTNER/.test(category)) add("partner decision");
  if (/PORTFOLIO/.test(category)) add("portfolio prioritization");
  if (/ENROLLMENT|FEASIBILITY/.test(category)) add("enrollment", "operational");
  if (/NOT_A_FAILURE/.test(category)) add("not a failure");
  if (/UNKNOWN|INSUFFICIENT|UNRESOLVED|LIVE_STATUS|PROGRAM_LEVEL/.test(category)) add("unknown", "not a failure");
  if (values.size === 0) add(category.toLowerCase().replaceAll("_", " "));

  return [...values];
}

function expectedSourceFamilies(category, state, assertion, verificationLevel) {
  const values = new Set();
  if (!/INVALID/.test(state)) values.add("ClinicalTrials.gov");

  const publicationCase = /PRIMARY_ENDPOINT|EFFICACY|FUTILITY|CONFLICTING|MORTALITY/.test(category)
    || /COMPLETED_(NEGATIVE|CONFLICTING)/.test(state);
  if (publicationCase && verificationLevel === "Gold") values.add("PubMed");

  if (/BUSINESS|STRATEG|FUND|PORTFOLIO|PARTNER|BENEFIT_RISK/.test(category)) {
    values.add("Sponsor announcement");
  }

  if (/REGULATORY|CMC/.test(category) || /clinical hold|FDA/i.test(assertion)) values.add("FDA");
  return [...values];
}
