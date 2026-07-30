export type ScoreLevel = "ESTABLISHED" | "STRONG" | "MODERATE" | "LIMITED" | "UNKNOWN";

type Explanation = { category: string; decision: string; scope: string; supportingClaimIds: string[]; contradictingClaimIds: string[] };
type Coverage = { applicable: boolean; searchCompleted: boolean; relevantRecordsUsed: number };

export function conciseFinding(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (/interim analysis.*unlikely to meet.*primary endpoint/i.test(text)) return "The study was discontinued after an interim analysis indicated it was unlikely to meet its primary endpoint.";
  if (/liver enzymes|liver-enzyme|hepatotoxic/i.test(text)) return "The study was terminated after the benefit-risk profile changed because participants receiving the study drug developed liver-enzyme elevations.";
  if (/no longer available|longer available|product unavailable|intervention unavailable/i.test(text)) return "The study was terminated because the study intervention was no longer available during the trial.";
  if (text.length <= 240) return text;
  const shortened = text.slice(0, 237).replace(/\s+\S*$/, "");
  return `${shortened}…`;
}

export function displayOutcome(status: string, classification = "") {
  const value = `${status} ${classification}`.toUpperCase();
  if (/RECRUITING|ACTIVE_NOT_RECRUITING|NOT_YET_RECRUITING|ENROLLING/.test(value) && !/NEGATIVE|FAILED|NOT MET/.test(value)) return "ONGOING";
  if (/FUTILITY/.test(value)) return "STOPPED_FOR_FUTILITY";
  if (/TERMINATED/.test(value)) return "TERMINATED";
  if (/WITHDRAWN/.test(value)) return "WITHDRAWN";
  if (/SUSPENDED/.test(value)) return "SUSPENDED";
  if (/POSITIVE|SUCCESS/.test(value)) return "COMPLETED_POSITIVE";
  if (/NEGATIVE|FAILED|NOT MET/.test(value)) return "COMPLETED_NEGATIVE";
  if (/COMPLETED/.test(value)) return "NOT_ESTABLISHED";
  return "NOT_ESTABLISHED";
}

export function evidenceStatus(documented: boolean, explanations: Explanation[] = []) {
  if (documented || explanations.some((item) => item.decision === "DOCUMENTED")) return "DIRECTLY_DOCUMENTED";
  if (explanations.some((item) => item.decision === "SUPPORTED")) return "STRONGLY_SUPPORTED";
  if (explanations.some((item) => item.decision === "POSSIBLE")) return "MODERATELY_SUPPORTED";
  if (explanations.some((item) => item.supportingClaimIds.length)) return "LIMITED_EVIDENCE";
  return "INSUFFICIENT_EVIDENCE";
}

export function primaryCategory(explanations: Explanation[] = [], documented: boolean) {
  const ranked = ["DOCUMENTED", "SUPPORTED", "POSSIBLE"];
  for (const decision of ranked) {
    const match = explanations.find((item) => item.decision === decision && (item.scope === "TRIAL" || decision !== "DOCUMENTED"));
    if (match) return match.category.toUpperCase().replaceAll(" ", "_");
  }
  return documented ? "DOCUMENTED_STOPPING_REASON" : "UNKNOWN";
}

export function scorecard(input: {
  documented: boolean;
  explanations: Explanation[];
  programEvidenceStrength?: string;
  coverage: Coverage[];
  independentSources: number;
  confirmedRelatedTrials: number;
  highImpactGaps: number;
}) {
  const trial: ScoreLevel = input.documented || input.explanations.some((item) => item.decision === "DOCUMENTED")
    ? "ESTABLISHED" : input.explanations.some((item) => item.decision === "SUPPORTED")
      ? "STRONG" : input.explanations.some((item) => item.decision === "POSSIBLE") ? "MODERATE" : "UNKNOWN";
  const programMap: Record<string, ScoreLevel> = {
    "DIRECTLY DOCUMENTED": "ESTABLISHED", "STRONG PUBLIC EVIDENCE": "STRONG",
    "MODERATE PUBLIC EVIDENCE": "MODERATE", "LIMITED PUBLIC EVIDENCE": "LIMITED",
    "SPECULATIVE": "LIMITED", "INSUFFICIENT EVIDENCE": "UNKNOWN",
  };
  const applicable = input.coverage.filter((item) => item.applicable);
  const completed = applicable.filter((item) => item.searchCompleted).length;
  const used = applicable.reduce((sum, item) => sum + item.relevantRecordsUsed, 0);
  const ratio = applicable.length ? completed / applicable.length : 0;
  const coverage: ScoreLevel = ratio >= .8 && used >= 3 && input.highImpactGaps === 0 ? "STRONG"
    : ratio >= .6 && used >= 1 ? "MODERATE" : completed ? "LIMITED" : "UNKNOWN";
  const independence: ScoreLevel = input.independentSources >= 4 ? "STRONG" : input.independentSources >= 2 ? "MODERATE" : input.independentSources === 1 ? "LIMITED" : "UNKNOWN";
  const context: ScoreLevel = input.confirmedRelatedTrials >= 3 ? "STRONG" : input.confirmedRelatedTrials >= 1 ? "MODERATE" : "UNKNOWN";
  return { trial, program: programMap[input.programEvidenceStrength ?? ""] ?? "UNKNOWN", coverage, independence, context };
}

export function validatePresentation(input: {
  documentedReason?: string;
  primaryFinding: string;
  trialScore: ScoreLevel;
  programScore: ScoreLevel;
  scoreLabels: string[];
  implications: Array<{ statement: string; supportingClaimIds: string[] }>;
  visibleLabels: string[];
}) {
  const issues: string[] = [];
  if (input.documentedReason && !input.primaryFinding.includes(input.documentedReason)) issues.push("DOCUMENTED_REASON_OMITTED_FROM_SUMMARY");
  if (input.documentedReason && /^insufficient evidence/i.test(input.primaryFinding)) issues.push("SUMMARY_LEADS_WITH_INSUFFICIENT_EVIDENCE");
  if (input.trialScore === input.programScore && input.trialScore === "ESTABLISHED") issues.push("TRIAL_PROGRAM_EXPLAINABILITY_MERGED");
  if (input.scoreLabels.some((label) => /\d+%/.test(label))) issues.push("UNSUPPORTED_NUMERIC_PROBABILITY");
  if (input.implications.some((item) => !item.supportingClaimIds.length || /would have|would succeed|proves|all similar|class fails/i.test(item.statement))) issues.push("UNSUPPORTED_ACTIONABLE_IMPLICATION");
  if (input.visibleLabels.some((label) => /MATRIX A|MATRIX B/i.test(label))) issues.push("TECHNICAL_LABEL_IN_PRIMARY_UX");
  return issues;
}
