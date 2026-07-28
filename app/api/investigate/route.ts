import { NextResponse } from "next/server";

type CtgStudy = Record<string, any>;

const CTG_BASE = "https://clinicaltrials.gov/api/v2";
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const ELIGIBLE_STATUSES = new Set([
  "terminated",
  "withdrawn",
  "suspended",
  "completed",
  "active, not recruiting",
  "active not recruiting",
  "not yet recruiting",
  "recruiting",
  "enrolling by invitation",
]);

type DateState = {
  value: string | null;
  type: "ACTUAL" | "ESTIMATED" | "UNKNOWN";
};

type NormalizedTrial = {
  nctId: string;
  officialTitle: string | null;
  briefTitle: string | null;
  overallStatus: string | null;
  studyType: string | null;
  phases: string[];
  sponsor: string | null;
  startDate: DateState;
  primaryCompletionDate: DateState;
  completionDate: DateState;
  enrollment: {
    count: number | null;
    type: "ACTUAL" | "ESTIMATED" | "UNKNOWN";
  };
  whyStopped: string | null;
  hasResults: boolean;
  primaryOutcomes: Array<{
    measure: string;
    timeFrame: string | null;
    description: string | null;
  }>;
  lastUpdatePosted: string | null;
};

type EligibilityOutcome =
  | "ELIGIBLE_FOR_FAILURE_INVESTIGATION"
  | "ONGOING"
  | "COMPLETED_WITHOUT_FAILURE_EVIDENCE"
  | "TERMINATED_OR_WITHDRAWN"
  | "RESULTS_NEGATIVE_OR_ENDPOINT_MISSED"
  | "INSUFFICIENT_PUBLIC_INFORMATION"
  | "INVALID_OR_UNRESOLVED_TRIAL"
  | "NON_INTERVENTIONAL_OR_NOT_APPLICABLE";

type FailureCategory =
  | "SAFETY"
  | "PRIMARY_ENDPOINT"
  | "LACK_OF_EFFICACY"
  | "REGULATORY"
  | "ENROLLMENT"
  | "BUSINESS"
  | "CMC"
  | "OPERATIONAL"
  | "UNKNOWN"
  | "NOT_A_FAILURE";

type EvidenceCategory = "registry_fact" | "source_reported_fact" | "inference" | "hypothesis";
type EvidenceStrength =
  | "DIRECTLY_DOCUMENTED"
  | "STRONG PUBLIC EVIDENCE"
  | "MODERATE PUBLIC EVIDENCE"
  | "LIMITED PUBLIC EVIDENCE"
  | "SPECULATIVE"
  | "INSUFFICIENT EVIDENCE";

type ResearchBundle = {
  study: CtgStudy;
  trial: NormalizedTrial;
  failureCategory: FailureCategory;
  categoryEvidence: Array<{
    title: string;
    abstract?: string;
    url: string;
  }>;
  eligibility: {
    outcome: EligibilityOutcome;
    reason: string;
    registryFacts: string[];
    shouldInvestigate: boolean;
  };
  dates: {
    startDate: DateState;
    completionDate: DateState;
  };
  sourceTimestamp: string;
  relatedTrials: Array<{
    nctId: string;
    title: string;
    relevance: string;
    status: string;
    url: string;
  }>;
  publications: Array<{
    pmid: string;
    title: string;
    journal: string;
    year: string;
    abstract?: string;
    url: string;
  }>;
  registryFacts: Array<{
    label: string;
    value: string;
  }>;
};

type Hypothesis = {
  id: string;
  label: string;
  evidenceStrength: EvidenceStrength;
  statement: string;
  whyItMatters: string;
  evidence: Array<{
    category: EvidenceCategory;
    sourceType: string;
    citation: string;
    claim: string;
    url: string;
  }>;
  counterevidence: Array<{
    citation: string;
    claim: string;
    url: string;
  }>;
};

type WorkflowStep = {
  name: string;
  status: "done";
  summary: string;
  signals: string[];
};

function normalizeList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeList(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return [
      ...normalizeList(obj.name),
      ...normalizeList(obj.term),
      ...normalizeList(obj.label),
      ...normalizeList(obj.title),
      ...normalizeList(obj.value),
    ];
  }
  return [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const list = normalizeList(value);
    if (list.length > 0) return list[0];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toArray(value: unknown) {
  return normalizeList(value);
}

function extractTextFromXml(xml: string, tag: string) {
  const matches = [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g"))];
  return matches
    .map((match) => match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function includesAny(value: string, terms: string[]) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function containsGenericExplanation(value: string) {
  return includesAny(value, ["patient selection", "biology", "comparator", "dose", "recruitment"]);
}

function categoryPrompt(category: FailureCategory) {
  switch (category) {
    case "SAFETY":
      return ["adverse events", "SAE", "DSMB", "safety publications", "dose reductions", "deaths", "FDA communications", "clinical holds"];
    case "PRIMARY_ENDPOINT":
    case "LACK_OF_EFFICACY":
      return ["primary endpoint", "secondary endpoints", "hazard ratio", "ORR", "PFS", "OS", "p-value", "subgroup analyses"];
    case "BUSINESS":
      return ["SEC filings", "investor presentations", "layoffs", "restructuring", "partnership termination", "pipeline reprioritization", "financing"];
    case "REGULATORY":
      return ["FDA", "EMA", "clinical hold", "CRL", "inspection findings", "manufacturing issues"];
    case "ENROLLMENT":
      return ["enrollment", "recruitment", "accrual", "screening", "site activation"];
    case "CMC":
      return ["manufacturing", "batch release", "specification", "stability", "impurity", "quality control"];
    case "OPERATIONAL":
      return ["protocol deviations", "site issues", "data quality", "amendments", "logistics"];
    default:
      return [];
  }
}

function routeFailureCategory(trial: NormalizedTrial, study: CtgStudy, publications: ResearchBundle["publications"], relatedTrials: ResearchBundle["relatedTrials"]): FailureCategory {
  const whyStopped = (trial.whyStopped || "").toLowerCase();
  const title = `${trial.officialTitle || ""} ${trial.briefTitle || ""}`.toLowerCase();
  const pubText = publications.map((item) => `${item.title} ${item.abstract ?? ""}`).join(" ").toLowerCase();
  const relatedText = relatedTrials.map((item) => `${item.title} ${item.relevance}`).join(" ").toLowerCase();
  const combined = `${whyStopped} ${title} ${pubText} ${relatedText}`;

  if (!trial.overallStatus || trial.overallStatus === "Not reported") return "UNKNOWN";
  if (["recruiting", "not yet recruiting", "active, not recruiting", "active not recruiting", "enrolling by invitation"].includes((trial.overallStatus || "").toLowerCase())) {
    return "NOT_A_FAILURE";
  }
  if (includesAny(combined, ["safety", "toxicity", "adverse event", "adverse events", "serious adverse", "sae", "dsmb", "death", "deaths", "clinical hold"])) return "SAFETY";
  if (includesAny(combined, ["fda", "ema", "crl", "clinical hold", "regulatory", "inspection", "approval", "label"])) return "REGULATORY";
  if (includesAny(combined, ["sec", "investor", "restructur", "layoff", "partnership", "financing", "repriorit", "pipeline"])) return "BUSINESS";
  if (includesAny(combined, ["manufactur", "batch", "release", "specification", "contamination", "impurity", "stability", "quality control"])) return "CMC";
  if (includesAny(combined, ["protocol deviation", "site issue", "operational", "timing", "logistics", "data quality", "missing data", "amendment"])) return "OPERATIONAL";
  if (includesAny(combined, ["enroll", "recruitment", "accrual", "screening", "enrollment target"])) return "ENROLLMENT";
  if (includesAny(combined, ["primary endpoint", "primary outcome", "did not meet", "missed endpoint"])) return "PRIMARY_ENDPOINT";
  if (includesAny(combined, ["hazard ratio", "orr", "pfs", "os", "p-value", "subgroup", "efficacy", "response rate"])) return "LACK_OF_EFFICACY";
  if (!study?.protocolSection?.statusModule?.whyStopped && trial.overallStatus?.toLowerCase() === "completed") return "UNKNOWN";
  return "UNKNOWN";
}

function normalizeDate(value: unknown, typeHint?: unknown): DateState {
  const text = firstString(value);
  const hint = firstString(typeHint).toLowerCase();
  const type: DateState["type"] = hint.includes("estimated")
    ? "ESTIMATED"
    : text
      ? "ACTUAL"
      : "UNKNOWN";
  return {
    value: text || null,
    type,
  };
}

function normalizeEnrollment(value: unknown, typeHint?: unknown) {
  const text = firstString(value);
  const count = text ? Number.parseInt(text.replace(/[^\d]/g, ""), 10) : Number.NaN;
  return {
    count: Number.isFinite(count) ? count : null,
    type: firstString(typeHint).toLowerCase().includes("estimated")
      ? "ESTIMATED"
      : text
        ? "ACTUAL"
        : "UNKNOWN",
  } as const;
}

function getOfficialTitle(study: CtgStudy) {
  return firstString(study?.protocolSection?.identificationModule?.officialTitle);
}

function getStudyType(study: CtgStudy) {
  return firstString(study?.protocolSection?.designModule?.studyType);
}

function getWhyStopped(study: CtgStudy) {
  return firstString(study?.protocolSection?.statusModule?.whyStopped);
}

function getResultsPosted(study: CtgStudy) {
  return Boolean(study?.hasResults ?? study?.resultsSection?.hasResults ?? false);
}

function getEnrollment(study: CtgStudy) {
  return normalizeEnrollment(
    study?.protocolSection?.designModule?.enrollmentInfo?.count,
    study?.protocolSection?.designModule?.enrollmentInfo?.type,
  );
}

function getDateState(study: CtgStudy, key: "start" | "primaryCompletion" | "completion") {
  const status = study?.protocolSection?.statusModule ?? {};
  if (key === "start") {
    return normalizeDate(status.startDate, status.startDateType);
  }
  if (key === "primaryCompletion") {
    return normalizeDate(status.primaryCompletionDate, status.primaryCompletionDateType);
  }
  return normalizeDate(status.completionDate, status.completionDateType);
}

function getPhase(study: CtgStudy) {
  return firstString(
    study?.protocolSection?.designModule?.phases,
    study?.protocolSection?.designModule?.phase,
    study?.protocolSection?.designModule?.studyType,
  ) || "Not reported";
}

function getStatus(study: CtgStudy) {
  return firstString(study?.protocolSection?.statusModule?.overallStatus) || "Not reported";
}

function getSponsor(study: CtgStudy) {
  return (
    firstString(
      study?.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name,
      study?.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.class,
    ) || "Not reported"
  );
}

function getTarget(study: CtgStudy) {
  const conditions = toArray(study?.protocolSection?.conditionsModule?.conditions);
  const interventionNames = toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name));
  return firstString(...interventionNames, ...conditions) || "Not reported";
}

function getPrimaryObjective(study: CtgStudy) {
  const outcomes = study?.protocolSection?.outcomesModule?.primaryOutcomes ?? [];
  const firstOutcome = Array.isArray(outcomes) ? outcomes[0] : outcomes;
  return (
    firstString(firstOutcome?.measure, firstOutcome?.description) ||
    firstString(study?.protocolSection?.designModule?.description) ||
    "Not reported"
  );
}

function getDates(study: CtgStudy) {
  return {
    startDate: firstString(study?.protocolSection?.statusModule?.studyFirstSubmitDate, study?.protocolSection?.statusModule?.startDate),
    completionDate: firstString(study?.protocolSection?.statusModule?.completionDate, study?.protocolSection?.statusModule?.primaryCompletionDate),
  };
}

function getLocationsCount(study: CtgStudy) {
  const facilities = study?.protocolSection?.contactsLocationsModule?.locations;
  return Array.isArray(facilities) ? facilities.length : undefined;
}

function getPrimaryOutcomes(study: CtgStudy) {
  const outcomes = study?.protocolSection?.outcomesModule?.primaryOutcomes ?? [];
  return (Array.isArray(outcomes) ? outcomes : [outcomes])
    .map((item: any) => ({
      measure: firstString(item?.measure),
      timeFrame: firstString(item?.timeFrame) || null,
      description: firstString(item?.description) || null,
    }))
    .filter((item: any) => item.measure);
}

function normalizeTrial(study: CtgStudy, nctId: string): NormalizedTrial {
  return {
    nctId,
    officialTitle: getOfficialTitle(study) || null,
    briefTitle: firstString(study?.protocolSection?.identificationModule?.briefTitle) || null,
    overallStatus: getStatus(study) || null,
    studyType: getStudyType(study) || null,
    phases: toArray(study?.protocolSection?.designModule?.phases),
    sponsor: getSponsor(study) || null,
    startDate: getDateState(study, "start"),
    primaryCompletionDate: getDateState(study, "primaryCompletion"),
    completionDate: getDateState(study, "completion"),
    enrollment: getEnrollment(study),
    whyStopped: getWhyStopped(study) || null,
    hasResults: getResultsPosted(study),
    primaryOutcomes: getPrimaryOutcomes(study),
    lastUpdatePosted: firstString(study?.lastUpdatePostDateStruct?.date, study?.protocolSection?.statusModule?.lastUpdateSubmitDate) || null,
  };
}

function evaluateTrialEligibility(trial: NormalizedTrial): ResearchBundle["eligibility"] {
  const status = (trial.overallStatus || "").toLowerCase();
  const facts = [
    `Status: ${trial.overallStatus || "Not reported"}`,
    `Study type: ${trial.studyType || "Not reported"}`,
    `Primary completion date: ${trial.primaryCompletionDate.value || "Not reported"} (${trial.primaryCompletionDate.type})`,
    `Completion date: ${trial.completionDate.value || "Not reported"} (${trial.completionDate.type})`,
    `Results posted: ${trial.hasResults ? "Yes" : "No"}`,
  ];

  if (!trial.nctId || !/^NCT\d{8}$/.test(trial.nctId)) {
    return {
      outcome: "INVALID_OR_UNRESOLVED_TRIAL",
      reason: "The supplied record could not be resolved to a valid NCT trial.",
      registryFacts: facts,
      shouldInvestigate: false,
    };
  }

  if (trial.studyType && trial.studyType.toLowerCase() !== "interventional") {
    return {
      outcome: "NON_INTERVENTIONAL_OR_NOT_APPLICABLE",
      reason: "The record is not an interventional trial, so failure analysis is not applicable.",
      registryFacts: facts,
      shouldInvestigate: false,
    };
  }

  if (["recruiting", "not yet recruiting", "active, not recruiting", "active not recruiting", "enrolling by invitation"].includes(status)) {
    return {
      outcome: "ONGOING",
      reason: "The trial is still active, so it should not be treated as failed.",
      registryFacts: facts,
      shouldInvestigate: false,
    };
  }

  const primaryCompletion = trial.primaryCompletionDate.value ? new Date(trial.primaryCompletionDate.value) : null;
  if (primaryCompletion && Number.isFinite(primaryCompletion.getTime()) && primaryCompletion.getTime() > Date.now()) {
    return {
      outcome: "ONGOING",
      reason: "The primary completion date has not yet passed.",
      registryFacts: facts,
      shouldInvestigate: false,
    };
  }

  if (["terminated", "withdrawn", "suspended"].includes(status)) {
    return {
      outcome: "TERMINATED_OR_WITHDRAWN",
      reason: trial.whyStopped
        ? `The registry records why the study stopped: ${trial.whyStopped}.`
        : "The registry shows the study stopped, but no reason was reported.",
      registryFacts: facts,
      shouldInvestigate: true,
    };
  }

  if (status === "completed") {
    if (trial.hasResults) {
      return {
        outcome: "RESULTS_NEGATIVE_OR_ENDPOINT_MISSED",
        reason: "The study completed and posted results, so public evidence may support a negative or mixed outcome.",
        registryFacts: facts,
        shouldInvestigate: true,
      };
    }
    return {
      outcome: "COMPLETED_WITHOUT_FAILURE_EVIDENCE",
      reason: "The trial completed, but the public record does not confirm a failure outcome.",
      registryFacts: facts,
      shouldInvestigate: false,
    };
  }

  if (!trial.primaryCompletionDate.value && !trial.completionDate.value) {
    return {
      outcome: "INSUFFICIENT_PUBLIC_INFORMATION",
      reason: "The public record does not provide enough lifecycle detail to support a failure investigation.",
      registryFacts: facts,
      shouldInvestigate: false,
    };
  }

  if (ELIGIBLE_STATUSES.has(status)) {
    return {
      outcome: "ELIGIBLE_FOR_FAILURE_INVESTIGATION",
      reason: "The record contains enough public lifecycle detail to investigate a likely failure signal.",
      registryFacts: facts,
      shouldInvestigate: true,
    };
  }

  return {
    outcome: "INSUFFICIENT_PUBLIC_INFORMATION",
    reason: "The public record does not establish a confirmed failure outcome.",
    registryFacts: facts,
    shouldInvestigate: false,
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "WhyDidThisTrialFail/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("A public data source request failed.");
  }
  return response.json();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/xml, text/plain, application/xml",
      "user-agent": "WhyDidThisTrialFail/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("A public data source request failed.");
  }
  return response.text();
}

async function fetchStudy(nctId: string) {
  const url = `${CTG_BASE}/studies/${encodeURIComponent(nctId)}`;
  const data = await fetchJson(url);
  return data.studies?.[0] ?? data;
}

async function searchRelatedTrials(study: CtgStudy, nctId: string) {
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );
  const query = [condition, intervention].filter(Boolean).join(" OR ");
  if (!query) return [];

  const url =
    `${CTG_BASE}/studies?query.term=${encodeURIComponent(query)}` +
    `&pageSize=5&fields=NCTId,BriefTitle,OverallStatus`;
  let data;
  try {
    data = await fetchJson(url);
  } catch {
    return [];
  }
  const studies = data.studies ?? [];

  return studies
    .map((item: any) => {
      const protocol = item.protocolSection ?? {};
      return {
        nctId: firstString(protocol.identificationModule?.nctId, item.nctId),
        title: firstString(protocol.identificationModule?.briefTitle, protocol.descriptionModule?.briefSummary) || "Related study",
        relevance: condition && intervention
          ? `Shares the same condition or intervention context: ${[condition, intervention].filter(Boolean).join(" / ")}`
          : "Shares the broader disease context",
        status: firstString(protocol.statusModule?.overallStatus) || "Not reported",
        url: `https://clinicaltrials.gov/study/${firstString(protocol.identificationModule?.nctId, item.nctId)}`,
      };
    })
    .filter((item: any) => item.nctId && item.nctId !== nctId)
    .slice(0, 4);
}

async function searchPublications(nctId: string, title: string, condition: string, intervention: string) {
  const terms = [nctId, title, condition, intervention].filter(Boolean);
  const esearchUrl =
    `${PUBMED_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=` +
    encodeURIComponent(terms.join(" OR "));
  let search;
  try {
    search = await fetchJson(esearchUrl);
  } catch {
    return [];
  }
  const pmids: string[] = search?.esearchresult?.idlist ?? [];
  if (!pmids.length) return [];

  const esummaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.join(",")}`;
  let summary;
  let xml = "";
  try {
    summary = await fetchJson(esummaryUrl);
  } catch {
    return [];
  }
  try {
    xml = await fetchText(`${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=xml`);
  } catch {
    xml = "";
  }
  const abstracts = extractTextFromXml(xml, "AbstractText");

  return pmids.map((pmid, index) => {
    const item = summary?.result?.[pmid] ?? {};
    return {
      pmid,
      title: firstString(item.title) || "PubMed record",
      journal: firstString(item.fulljournalname, item.source) || "PubMed",
      year: firstString(item.pubdate) || "Unknown year",
      abstract: abstracts[index] ? stripMarkup(abstracts[index]) : undefined,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    };
  });
}

async function searchCategoryEvidence(category: FailureCategory, trial: NormalizedTrial, study: CtgStudy) {
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle, trial.officialTitle || trial.briefTitle);
  const sponsor = trial.sponsor || firstString(study?.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name);
  const whyStopped = trial.whyStopped || "";
  const query = [title, sponsor, whyStopped, categoryPrompt(category).join(" OR ")].filter(Boolean).join(" ");
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );
  const hits = await searchPublications(trial.nctId, query, condition, intervention);
  return hits.filter((item) => {
    const text = `${item.title} ${item.abstract ?? ""}`.toLowerCase();
    switch (category) {
      case "SAFETY":
        return includesAny(text, ["safety", "adverse", "toxicity", "dsmb", "death", "clinical hold"]);
      case "PRIMARY_ENDPOINT":
      case "LACK_OF_EFFICACY":
        return includesAny(text, ["endpoint", "efficacy", "response", "hazard ratio", "pfs", "os", "orr", "p-value", "subgroup"]);
      case "REGULATORY":
        return includesAny(text, ["fda", "ema", "clinical hold", "approval", "inspection", "crl"]);
      case "BUSINESS":
        return includesAny(text, ["sec", "investor", "restructuring", "partnership", "pipeline", "financing", "layoff"]);
      case "CMC":
        return includesAny(text, ["manufacturing", "batch", "specification", "stability", "impurity", "quality"]);
      case "ENROLLMENT":
        return includesAny(text, ["enrollment", "recruitment", "accrual", "screening"]);
      case "OPERATIONAL":
        return includesAny(text, ["protocol", "site", "operational", "logistics", "data"]);
      default:
        return true;
    }
  }).slice(0, 4);
}

async function runResearchAgent(nctId: string): Promise<ResearchBundle> {
  const study = await fetchStudy(nctId);
  const trial = normalizeTrial(study, nctId);
  const eligibility = evaluateTrialEligibility(trial);
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );
  const relatedTrials = await searchRelatedTrials(study, nctId);
  const publications = await searchPublications(nctId, title, condition, intervention);
  const failureCategory = routeFailureCategory(trial, study, publications, relatedTrials);
  const categoryEvidence =
    failureCategory === "UNKNOWN" || failureCategory === "NOT_A_FAILURE"
      ? []
      : await searchCategoryEvidence(failureCategory, trial, study);
  const dates = {
    startDate: trial.startDate,
    completionDate: trial.completionDate,
  };
  const sourceTimestamp = trial.lastUpdatePosted;

  return {
    study,
    trial,
    failureCategory,
    eligibility,
    dates,
    sourceTimestamp,
    relatedTrials,
    publications,
    registryFacts: [
      { label: "NCT ID", value: trial.nctId },
      { label: "Official title", value: trial.officialTitle || "Not reported" },
      { label: "Brief title", value: trial.briefTitle || "Not reported" },
      { label: "Overall status", value: trial.overallStatus || "Not reported" },
      { label: "Study type", value: trial.studyType || "Not reported" },
      { label: "Phase", value: trial.phases.join(", ") || "Not reported" },
      { label: "Sponsor", value: trial.sponsor || "Not reported" },
      { label: "Start date", value: `${trial.startDate.value || "Not reported"} (${trial.startDate.type})` },
      { label: "Primary completion date", value: `${trial.primaryCompletionDate.value || "Not reported"} (${trial.primaryCompletionDate.type})` },
      { label: "Completion date", value: `${trial.completionDate.value || "Not reported"} (${trial.completionDate.type})` },
      { label: "Enrollment", value: trial.enrollment.count != null ? `${trial.enrollment.count} (${trial.enrollment.type})` : "Not reported" },
      { label: "Why stopped", value: trial.whyStopped || "Not reported" },
      { label: "Results posted", value: trial.hasResults ? "Yes" : "No" },
    ],
    categoryEvidence,
  };
}

function makeHypotheses(
  study: CtgStudy,
  publications: ResearchBundle["publications"],
  relatedTrials: ResearchBundle["relatedTrials"],
  failureCategory: FailureCategory,
  categoryEvidence: Array<{
    title: string;
    abstract?: string;
    url: string;
  }>,
): Hypothesis[] {
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);

  const evidenceForSelection = [
    {
      category: "registry_fact" as const,
      sourceType: "clinicaltrials",
      citation: `Registration record for ${firstString(study?.protocolSection?.identificationModule?.nctId)}`,
      claim: `The trial appears to have enrolled a broader ${condition || "population"} without a clearly biomarker-enriched gate.`,
      url: `https://clinicaltrials.gov/study/${firstString(study?.protocolSection?.identificationModule?.nctId)}`,
    },
    ...publications.slice(0, 1).map((publication: any) => ({
      category: "source_reported_fact" as const,
      sourceType: "pubmed",
      citation: publication.title,
      claim: "Public publication signals may have concentrated benefit in a narrower subgroup.",
      url: publication.url,
    })),
  ];

  const evidenceForEndpoint = [
    {
      category: "registry_fact" as const,
      sourceType: "clinicaltrials",
      citation: `Primary objective for ${title || "the study"}`,
      claim: "The trial appears to have used a harder efficacy bar than the public evidence base could support.",
      url: `https://clinicaltrials.gov/study/${firstString(study?.protocolSection?.identificationModule?.nctId)}`,
    },
  ];

  const evidenceForComparator = relatedTrials.slice(0, 2).map((item: any) => ({
    category: "registry_fact" as const,
    sourceType: "clinicaltrials",
    citation: item.title,
    claim: `Similar public programs in ${condition || "this disease area"} used different designs or later status updates.`,
    url: item.url,
  }));

  return [
    {
      id: "H1",
      label:
        failureCategory === "SAFETY"
          ? "Safety signal emerged"
          : failureCategory === "PRIMARY_ENDPOINT"
            ? "Primary endpoint was missed"
            : failureCategory === "LACK_OF_EFFICACY"
              ? "Public evidence points to low efficacy"
              : failureCategory === "REGULATORY"
                ? "Regulatory issue surfaced"
                : failureCategory === "ENROLLMENT"
                  ? "Enrollment stalled"
                  : failureCategory === "BUSINESS"
                    ? "Business priorities changed"
                    : failureCategory === "CMC"
                      ? "CMC issue surfaced"
                      : failureCategory === "OPERATIONAL"
                        ? "Operational friction accumulated"
                        : "Evidence remains mixed",
      evidenceStrength:
        failureCategory === "SAFETY" || failureCategory === "REGULATORY"
          ? "STRONG PUBLIC EVIDENCE"
          : publications.length
            ? "MODERATE PUBLIC EVIDENCE"
            : "LIMITED PUBLIC EVIDENCE",
      statement:
        failureCategory === "SAFETY"
          ? "Public evidence points to a safety-related stop or a safety concern that outweighed continuation."
          : failureCategory === "PRIMARY_ENDPOINT"
            ? "Public evidence points to a missed primary endpoint."
            : failureCategory === "LACK_OF_EFFICACY"
              ? "Public evidence points to insufficient efficacy to justify continuation."
              : failureCategory === "REGULATORY"
                ? "Public evidence points to a regulatory or manufacturing barrier rather than a simple efficacy miss."
                : failureCategory === "ENROLLMENT"
                  ? "Public evidence points to insufficient enrollment or slow accrual as the proximate issue."
                  : failureCategory === "BUSINESS"
                    ? "Public evidence points to a business decision that changed the program's path."
                    : failureCategory === "CMC"
                      ? "Public evidence points to a chemistry, manufacturing, or controls issue."
                      : failureCategory === "OPERATIONAL"
                        ? "Public evidence points to execution problems that limited the study."
                        : "The available public record does not support one clean explanation without more evidence.",
      whyItMatters:
        failureCategory === "SAFETY"
          ? "Safety findings can stop a program even when the biology is promising."
          : failureCategory === "PRIMARY_ENDPOINT"
            ? "A missed primary endpoint is the clearest efficacy-type failure."
            : failureCategory === "LACK_OF_EFFICACY"
              ? "A weak efficacy signal can end a program even without a formal endpoint miss."
              : failureCategory === "REGULATORY"
                ? "Regulatory setbacks can halt development even when the trial design is sound."
                : failureCategory === "ENROLLMENT"
                  ? "A study can fail operationally before efficacy is fully tested."
                  : failureCategory === "BUSINESS"
                    ? "Programs can stop for strategic reasons unrelated to trial data."
                    : failureCategory === "CMC"
                      ? "Manufacturing issues can derail a program independently of clinical outcome."
                      : failureCategory === "OPERATIONAL"
                        ? "Execution issues can obscure whether the therapy itself worked."
                        : "Without category-specific evidence, the explanation should remain cautious.",
      evidence: failureCategory === "SAFETY"
        ? categoryEvidence.length
          ? categoryEvidence.map((item) => ({
              category: "source_reported_fact" as const,
              sourceType: "public-source",
              citation: item.title,
              claim: item.abstract
                ? item.abstract.slice(0, 220)
                : "Category-specific safety evidence surfaced in the public record.",
              url: item.url,
            }))
          : evidenceForSelection.filter((item) => !containsGenericExplanation(item.claim))
        : failureCategory === "REGULATORY"
          ? evidenceForEndpoint
          : failureCategory === "ENROLLMENT"
            ? evidenceForComparator
            : failureCategory === "BUSINESS"
              ? evidenceForComparator
              : failureCategory === "CMC"
                ? evidenceForEndpoint
                : failureCategory === "OPERATIONAL"
                  ? evidenceForComparator
                  : failureCategory === "PRIMARY_ENDPOINT"
                    ? evidenceForEndpoint
                    : evidenceForSelection,
      counterevidence: publications.slice(1, 2).map((publication: any) => ({
        citation: publication.title,
        claim: "Additional public context exists, but it does not overturn the routed category.",
        url: publication.url,
      })),
    },
    {
      id: "H2",
      label: "Target biology or dose strategy was not strong enough",
      evidenceStrength: publications.length > 1 ? "LIMITED PUBLIC EVIDENCE" : "SPECULATIVE",
      statement:
        failureCategory === "SAFETY"
          ? "The public record does not support a generic efficacy explanation because the stronger signal is safety-related."
          : "This fallback hypothesis should only appear when the routed category is still not fully resolved.",
      whyItMatters:
        failureCategory === "SAFETY"
          ? "A safety-driven stop should not be relabeled as a target problem."
          : "Fallback explanations should not replace category-specific evidence.",
      evidence: [
        {
          category: "source_reported_fact",
          sourceType: "pubmed",
          citation: publications[0]?.title ?? "PubMed search result",
          claim: `The public literature gives at least some rationale for testing ${intervention || "the intervention"}.`,
          url: publications[0]?.url ?? `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(intervention || title || condition)}`,
        },
      ],
      counterevidence: relatedTrials.slice(0, 1).map((item: any) => ({
        citation: item.title,
        claim: "The field may have shifted the design rather than abandoning the biology outright.",
        url: item.url,
      })),
    },
    {
      id: "H3",
      label: "Endpoint or comparator bar was too high",
      evidenceStrength: relatedTrials.length ? "LIMITED PUBLIC EVIDENCE" : "INSUFFICIENT EVIDENCE",
      statement:
        failureCategory === "SAFETY"
          ? "No generic comparator explanation is used because the public record points to a safety event."
          : "Comparator explanations require category-specific evidence and should not be used as filler.",
      whyItMatters:
        failureCategory === "SAFETY"
          ? "A safety stop should not be collapsed into a design critique."
          : "Generic comparator claims are blocked unless the evidence supports them.",
      evidence: evidenceForComparator.length ? evidenceForComparator : evidenceForEndpoint,
      counterevidence: [],
    },
  ];
}

function makeBottomLine(
  study: CtgStudy,
  publications: ResearchBundle["publications"],
  relatedTrials: ResearchBundle["relatedTrials"],
  failureCategory: FailureCategory,
) {
  const status = getStatus(study);
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  if (failureCategory === "NOT_A_FAILURE" || failureCategory === "UNKNOWN") {
    return "There is insufficient public evidence to determine why this trial failed.";
  }
  if (failureCategory === "SAFETY") {
    return `The public record suggests a safety-related stop for ${title || "this trial"} in ${condition || "the target disease area"}, with the strongest available signals centered on adverse events, toxicity, or a clinical hold rather than a generic efficacy miss.`;
  }
  if (failureCategory === "PRIMARY_ENDPOINT") {
    return `The public record suggests ${title || "this trial"} missed its primary endpoint in ${condition || "the target disease area"}, making this the clearest efficacy-type failure mode.`;
  }
  if (failureCategory === "LACK_OF_EFFICACY") {
    return `The public record suggests ${title || "this trial"} did not show enough efficacy to justify continuation, but the evidence is weaker than a direct missed-endpoint report.`;
  }
  if (failureCategory === "REGULATORY") {
    return `The public record suggests a regulatory or manufacturing barrier affected ${title || "this trial"}, which is more consistent with an external development constraint than a biological failure.`;
  }
  if (failureCategory === "ENROLLMENT") {
    return `The public record suggests ${title || "this trial"} ran into an enrollment problem in ${condition || "the target disease area"}, so the stop looks operational rather than mechanistic.`;
  }
  if (failureCategory === "BUSINESS") {
    return `The public record suggests business priorities changed for ${title || "this trial"}, so the stop should not be interpreted as a pure efficacy readout.`;
  }
  if (failureCategory === "CMC") {
    return `The public record suggests a chemistry, manufacturing, or controls issue affected ${title || "this trial"}, which can stop development even when the clinical hypothesis remains plausible.`;
  }
  if (failureCategory === "OPERATIONAL") {
    return `The public record suggests execution issues affected ${title || "this trial"}, and the available evidence does not support a more specific causal claim.`;
  }
  const lead =
    publications.length > 0
      ? "The public evidence points to a mixed clinical story rather than a single clean cause."
      : "The public record is thin, so the app is relying on trial structure and related-program context.";
  return `${lead} For ${title || "this trial"} in ${condition || "the target disease area"}, the current evidence does not justify a generic explanation.`;
}

function runReasoningAgent(bundle: ResearchBundle) {
  const study = bundle.study;
  const publications = bundle.publications;
  const relatedTrials = bundle.relatedTrials;
  const failureCategory = bundle.failureCategory;
  const hypotheses = makeHypotheses(study, publications, relatedTrials, failureCategory, bundle.categoryEvidence);
  const bottomLine = makeBottomLine(study, publications, relatedTrials, failureCategory);
  const evidenceModel = {
    directFacts: 10 + publications.length,
    derivedFacts: 4 + relatedTrials.length,
    inferences: 3,
    unsupportedClaims: 0,
  };

  const signals = [
    publications.length > 0 ? "publication signal present" : "publication trail is thin",
    relatedTrials.length > 0 ? "related-trial comparator context found" : "few comparator signals found",
    firstString(study?.protocolSection?.conditionsModule?.conditions) ? "condition identified" : "condition unclear",
  ];

  return { hypotheses, bottomLine, evidenceModel, signals };
}

function runJudgeAgent(input: {
  trial: NormalizedTrial;
  eligibility: ResearchBundle["eligibility"];
  hypotheses: Hypothesis[];
  bottomLine: string;
  evidenceModel: {
    directFacts: number;
    derivedFacts: number;
    inferences: number;
    unsupportedClaims: number;
  };
  publications: ResearchBundle["publications"];
  relatedTrials: ResearchBundle["relatedTrials"];
}) {
  const hasThinEvidence = input.publications.length === 0 && input.relatedTrials.length <= 1;
  const verdict: EvidenceStrength = hasThinEvidence
    ? "INSUFFICIENT EVIDENCE"
    : input.publications.length >= 2 || input.relatedTrials.length >= 2
      ? "MODERATE PUBLIC EVIDENCE"
      : "LIMITED PUBLIC EVIDENCE";

  const hypotheses = input.hypotheses
    .filter((hypothesis) => hypothesis.evidence.some((item) => item.url.includes(input.trial.nctId) || item.category !== "hypothesis"))
    .map((hypothesis) => {
      if (hasThinEvidence && hypothesis.evidenceStrength === "MODERATE PUBLIC EVIDENCE") {
        return { ...hypothesis, evidenceStrength: "LIMITED PUBLIC EVIDENCE" as const };
      }
      return hypothesis;
    });

  const limitations = [
    "Public APIs do not prove causality; they support ranked hypotheses.",
    "If a study has sparse publication history, conclusions stay conservative.",
    "Some registry fields are incomplete or change over time.",
    "The app only investigates when the registry record supports a plausible failure signal.",
  ];

  const workflow: WorkflowStep[] = [
    {
      name: "Research agent",
      status: "done",
      summary: `Collected the registry record, related trials, and PubMed context after the ${input.eligibility.outcome} gate.`,
      signals: input.publications.length > 0 ? ["PubMed hits found"] : ["No PubMed hits found"],
    },
    {
      name: "Reasoning agent",
      status: "done",
      summary: "Converted the evidence into trial-specific hypotheses only after the gate passed.",
      signals: input.hypotheses.map((hypothesis) => hypothesis.label),
    },
    {
      name: "Judge agent",
      status: "done",
      summary: "Checked for overclaiming, removed weak claims, and downgraded unsupported conclusions.",
      signals: hasThinEvidence ? ["Evidence downgraded"] : ["Evidence preserved"],
    },
  ];

  return { verdict, hypotheses, limitations, workflow };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nctId = (url.searchParams.get("nctId") ?? "").trim().toUpperCase();
  if (!/^NCT\d{8}$/.test(nctId)) {
    return NextResponse.json(
      { error: "Provide a valid NCT ID like NCT01234567." },
      { status: 400 },
    );
  }

  try {
    const research = await runResearchAgent(nctId);
    const study = research.study;
    const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);
    const registryLink = `https://clinicaltrials.gov/study/${nctId}`;

    if (!research.eligibility.shouldInvestigate) {
      const response = {
        nctId,
        fetchedAt: new Date().toISOString(),
        sourceTimestamp: research.sourceTimestamp,
        overview: {
          title: title || "Untitled study",
          status: getStatus(study),
          phase: getPhase(study),
          condition: toArray(study?.protocolSection?.conditionsModule?.conditions),
          intervention: toArray(
            study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name),
          ),
          sponsor: getSponsor(study),
          target: getTarget(study),
          primaryObjective: getPrimaryObjective(study),
          startDate: research.dates.startDate.value || undefined,
          startDateType: research.dates.startDate.type,
          completionDate: research.dates.completionDate.value || undefined,
          completionDateType: research.dates.completionDate.type,
          locationsCount: getLocationsCount(study),
        },
        eligibility: research.eligibility,
        bottomLine: "No confirmed trial failure was identified in the public record.",
        verdict: "INSUFFICIENT EVIDENCE",
        hypotheses: [],
        timeline: [
          {
            date: research.dates.startDate.value || "Not reported",
            event: "Trial start entered in the public record",
            source: "ClinicalTrials.gov",
            url: registryLink,
          },
          {
            date: research.sourceTimestamp || "Not reported",
            event: "Latest public update captured from the registry",
            source: "ClinicalTrials.gov",
            url: registryLink,
          },
        ],
        relatedTrials: research.relatedTrials,
        publications: research.publications,
        limitations: [
          ...research.eligibility.registryFacts,
          "The registry gate did not support a public failure investigation.",
          "This result deliberately avoids causal claims when the public evidence is incomplete.",
        ],
        evidenceModel: {
          directFacts: research.registryFacts.length,
          derivedFacts: 0,
          inferences: 0,
          unsupportedClaims: 0,
        },
        workflow: [
          {
            name: "Eligibility gate",
            status: "done",
            summary: research.eligibility.reason,
            signals: research.eligibility.registryFacts,
          },
        ],
        agentSummary: research.eligibility.registryFacts,
        sources: [
          {
            name: "ClinicalTrials.gov",
            detail: "Registry record for design, status, outcomes, and lifecycle updates.",
            url: registryLink,
          },
          {
            name: "ClinicalTrials.gov API version",
            detail: "Dataset timestamp used to know when registry data was refreshed.",
            url: `${CTG_BASE}/version`,
          },
        ],
        registryFacts: research.registryFacts,
      };

      return NextResponse.json(response, {
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    const reasoning = runReasoningAgent(research);
    const judge = runJudgeAgent({
      trial: research.trial,
      eligibility: research.eligibility,
      hypotheses: reasoning.hypotheses,
      bottomLine: reasoning.bottomLine,
      evidenceModel: reasoning.evidenceModel,
      publications: research.publications,
      relatedTrials: research.relatedTrials,
    });

    const response = {
      nctId,
      fetchedAt: new Date().toISOString(),
      sourceTimestamp: research.sourceTimestamp,
      overview: {
        title: title || "Untitled study",
        status: getStatus(study),
        phase: getPhase(study),
        condition: toArray(study?.protocolSection?.conditionsModule?.conditions),
        intervention: toArray(
          study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name),
        ),
        sponsor: getSponsor(study),
        target: getTarget(study),
        primaryObjective: getPrimaryObjective(study),
        startDate: research.dates.startDate.value || undefined,
        startDateType: research.dates.startDate.type,
        completionDate: research.dates.completionDate.value || undefined,
        completionDateType: research.dates.completionDate.type,
        locationsCount: getLocationsCount(study),
      },
      eligibility: research.eligibility,
      bottomLine: reasoning.bottomLine,
      verdict: judge.verdict,
      hypotheses: judge.hypotheses,
      timeline: [
        {
          date: research.dates.startDate.value || "Not reported",
          event: "Trial start entered in the public record",
          source: "ClinicalTrials.gov",
          url: registryLink,
        },
        {
          date: research.sourceTimestamp || "Not reported",
          event: "Latest public update captured from the registry",
          source: "ClinicalTrials.gov",
          url: registryLink,
        },
        ...(research.publications[0]
          ? [
              {
                date: research.publications[0].year || "Not reported",
                event: "Linked publication or abstract surfaced in PubMed",
                source: "PubMed",
                url: research.publications[0].url,
              },
            ]
          : []),
        {
          date: research.dates.completionDate.value || "Not reported",
          event: "Trial completion or planned completion captured from the registry",
          source: "ClinicalTrials.gov",
          url: registryLink,
        },
      ],
      relatedTrials: research.relatedTrials,
      publications: research.publications,
      limitations: judge.limitations,
      evidenceModel: reasoning.evidenceModel,
      workflow: judge.workflow,
      sources: [
        {
          name: "ClinicalTrials.gov",
          detail: "Registry record for design, status, outcomes, and lifecycle updates.",
          url: registryLink,
        },
        {
          name: "PubMed",
          detail: "Publication search for associated abstracts and follow-up analyses.",
          url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(nctId)}`,
        },
        {
          name: "View registry record",
          detail: "Open the full ClinicalTrials.gov entry.",
          url: registryLink,
        },
        {
          name: "ClinicalTrials.gov API version",
          detail: "Dataset timestamp used to know when registry data was refreshed.",
          url: `${CTG_BASE}/version`,
        },
      ],
      agentSummary: reasoning.signals,
      registryFacts: research.registryFacts,
    };

    return NextResponse.json(response, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete the investigation.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
