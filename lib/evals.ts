import fixture from "../data/evals.json" with { type: "json" };

export type EvalCase = (typeof fixture.cases)[number];
export type EvalCheck = {
  key: "trialState" | "category" | "hypotheses" | "insufficientEvidence" | "evidenceStrength" | "sources";
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
  scored: boolean;
};

export type EvalResult = {
  evalId: string;
  nctId: string;
  trialShortName: string;
  passed: boolean;
  requiresManualVerification: boolean;
  durationMs: number;
  runAt: string;
  expectedCategory: string;
  actualCategory: string;
  checks: EvalCheck[];
  error?: string;
};

type Investigation = {
  overview?: { status?: string };
  trialOutcome?: { classification?: string };
  bottomLine?: string;
  verdict?: string;
  hypotheses?: Array<{ label?: string; evidenceStrength?: string }>;
  sources?: Array<{ name?: string; detail?: string; url?: string }>;
  evidenceGraph?: { sources?: Array<{ name?: string; sourceType?: string; availability?: string }> };
  error?: string;
};

const STRENGTH_RANK: Record<string, number> = {
  "INSUFFICIENT EVIDENCE": 0,
  SPECULATIVE: 1,
  "LIMITED PUBLIC EVIDENCE": 2,
  "MODERATE PUBLIC EVIDENCE": 3,
  "STRONG PUBLIC EVIDENCE": 4,
  "DIRECTLY DOCUMENTED": 5,
};

export const evalFixture = fixture;
export const evalCases = fixture.cases;

export function findEvalCase(evalId: string) {
  return evalCases.find((item) => item.evalId === evalId);
}

export function evaluateInvestigation(testCase: EvalCase, investigation: Investigation, durationMs: number, responseStatus = 200): EvalResult {
  const isInvalidExpected = testCase.expectedTrialState === "INVALID";
  const invalidActual = responseStatus === 400 || Boolean(investigation.error);
  const hypotheses = investigation.hypotheses ?? [];
  const actualCategory = hypotheses[0]?.label?.toLowerCase() ?? inferNoHypothesisCategory(investigation);
  const actualStatus = investigation.overview?.status ?? (invalidActual ? "INVALID" : "Not returned");
  const actualOutcome = investigation.trialOutcome?.classification ?? "Not returned";
  const isInsufficient = /insufficient public evidence/i.test(investigation.bottomLine ?? "");
  const sourceFamilies = retrievedSourceFamilies(investigation);

  const checks: EvalCheck[] = [
    check(
      "trialState",
      "Trial state",
      isInvalidExpected ? invalidActual : matchesTrialState(testCase.expectedTrialState, actualStatus, actualOutcome, hypotheses.length > 0),
      testCase.expectedTrialState,
      isInvalidExpected && invalidActual ? "Validation error" : `${actualStatus} / ${actualOutcome}`,
    ),
    check(
      "category",
      "Failure category",
      isInvalidExpected ? invalidActual : matchesCategory(testCase.acceptedCategories, actualCategory, isInsufficient),
      testCase.expectedPrimaryCategory,
      actualCategory,
      !isInvalidExpected,
    ),
    check(
      "hypotheses",
      "Generate hypotheses",
      testCase.shouldGenerateHypotheses == null || (testCase.shouldGenerateHypotheses ? hypotheses.length > 0 : hypotheses.length === 0),
      testCase.shouldGenerateHypotheses == null ? "MAYBE" : testCase.shouldGenerateHypotheses ? "YES" : "NO",
      hypotheses.length > 0 ? `YES (${hypotheses.length})` : "NO",
      testCase.shouldGenerateHypotheses != null,
    ),
    check(
      "insufficientEvidence",
      "Insufficient evidence",
      testCase.shouldReturnInsufficientEvidence === isInsufficient,
      testCase.shouldReturnInsufficientEvidence ? "YES" : "NO",
      isInsufficient ? "YES" : "NO",
      !isInvalidExpected,
    ),
    check(
      "evidenceStrength",
      "Evidence strength",
      meetsEvidenceStrength(testCase.minimumEvidenceStrength, investigation.verdict),
      testCase.minimumEvidenceStrength,
      investigation.verdict ?? "Not returned",
      testCase.shouldGenerateHypotheses !== false && !isInvalidExpected,
    ),
    check(
      "sources",
      "Primary sources",
      testCase.expectedPrimarySources.every((source) => sourceFamilies.has(source)),
      testCase.expectedPrimarySources.join(", ") || "Validation error only",
      [...sourceFamilies].join(", ") || "None retrieved",
      testCase.expectedPrimarySources.length > 0 && !isInvalidExpected,
    ),
  ];

  return {
    evalId: testCase.evalId,
    nctId: testCase.nctId,
    trialShortName: testCase.trialShortName,
    passed: checks.filter((item) => item.scored).every((item) => item.passed),
    requiresManualVerification: testCase.verificationLevel === "Silver",
    durationMs,
    runAt: new Date().toISOString(),
    expectedCategory: testCase.expectedPrimaryCategory,
    actualCategory,
    checks,
    ...(investigation.error ? { error: investigation.error } : {}),
  };
}

function check(key: EvalCheck["key"], label: string, passed: boolean, expected: string, actual: string, scored = true): EvalCheck {
  return { key, label, passed, expected, actual, scored };
}

function matchesCategory(accepted: string[], actual: string, insufficient: boolean) {
  if (insufficient && accepted.some((item) => item === "unknown" || item === "not a failure")) return true;
  return accepted.some((item) => actual === item || actual.includes(item) || item.includes(actual));
}

function inferNoHypothesisCategory(investigation: Investigation) {
  if (/no confirmed trial failure/i.test(investigation.bottomLine ?? "")) return "not a failure";
  if (/insufficient public evidence/i.test(investigation.bottomLine ?? "")) return "unknown";
  return investigation.trialOutcome?.classification?.toLowerCase() ?? "unknown";
}

function matchesTrialState(expected: string, status: string, outcome: string, hasAnalysis: boolean) {
  const value = `${status} ${outcome}`.toUpperCase().replaceAll(" ", "_");
  if (expected === "ONGOING") return /RECRUITING|ACTIVE|NOT_YET_RECRUITING|ENROLLING/.test(value);
  if (expected === "INVALID") return false;
  if (/ARM_STOPPED/.test(expected)) return /STOPPED|TERMINATED|SUSPENDED|COMPLETED/.test(value) && hasAnalysis;
  if (/WITHDRAWN/.test(expected) && /WITHDRAWN/.test(value)) return true;
  if (/TERMINATED|STOPPED/.test(expected) && /TERMINATED|SUSPENDED|WITHDRAWN|STOPPED|NEGATIVE_OUTCOME/.test(value)) return true;
  if (/COMPLETED_NEGATIVE|COMPLETED_CONFLICTING/.test(expected)) return /COMPLETED|NEGATIVE_OUTCOME/.test(value) && hasAnalysis;
  if (/COMPLETED_POSITIVE/.test(expected)) return /COMPLETED/.test(value) && !hasAnalysis;
  if (/ONGOING/.test(expected) && /RECRUITING|ACTIVE|NOT_YET_RECRUITING|ENROLLING/.test(value)) return true;
  if (/COMPLETED|CLOSED/.test(expected) && /COMPLETED|CLOSED/.test(value)) return true;
  return expected.split("_OR_").some((token) => value.includes(token));
}

function meetsEvidenceStrength(expected: string, actual?: string) {
  const expectedRank = STRENGTH_RANK[expected.replaceAll("_", " ")] ?? 0;
  const actualRank = STRENGTH_RANK[actual ?? "INSUFFICIENT EVIDENCE"] ?? 0;
  return actualRank >= expectedRank;
}

function retrievedSourceFamilies(investigation: Investigation) {
  const families = new Set<string>();
  const graphSources = investigation.evidenceGraph?.sources ?? [];
  for (const source of graphSources) {
    if (source.availability && source.availability !== "retrieved") continue;
    addSourceFamily(families, `${source.name ?? ""} ${source.sourceType ?? ""}`);
  }
  for (const source of investigation.sources ?? []) addSourceFamily(families, `${source.name ?? ""} ${source.detail ?? ""}`);
  return families;
}

function addSourceFamily(families: Set<string>, value: string) {
  if (/clinicaltrials|registry/i.test(value)) families.add("ClinicalTrials.gov");
  if (/pubmed|publication|journal/i.test(value)) families.add("PubMed");
  if (/fda|regulator/i.test(value)) families.add("FDA");
  if (/sponsor|announcement|press release|roche|janssen|astrazeneca/i.test(value)) families.add("Sponsor announcement");
  if (/sec|edgar|10-k|10-q|8-k|20-f|6-k/i.test(value)) families.add("SEC EDGAR");
}
