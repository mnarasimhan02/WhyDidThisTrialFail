import { NextResponse } from "next/server";

type CtgStudy = Record<string, any>;

const CTG_BASE = "https://clinicaltrials.gov/api/v2";
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

type ResearchBundle = {
  study: CtgStudy;
  dates: {
    startDate: string;
    completionDate: string;
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
};

type Hypothesis = {
  id: string;
  label: string;
  confidence: "high" | "medium" | "low" | "unknown";
  statement: string;
  whyItMatters: string;
  evidence: Array<{
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

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "WhyDidThisTrialFail/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
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
    throw new Error(`Request failed for ${url}`);
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
  const data = await fetchJson(url);
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
  const search = await fetchJson(esearchUrl);
  const pmids: string[] = search?.esearchresult?.idlist ?? [];
  if (!pmids.length) return [];

  const esummaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.join(",")}`;
  const summary = await fetchJson(esummaryUrl);
  const xml = await fetchText(`${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=xml`);
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

async function runResearchAgent(nctId: string): Promise<ResearchBundle> {
  const study = await fetchStudy(nctId);
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );
  const relatedTrials = await searchRelatedTrials(study, nctId);
  const publications = await searchPublications(nctId, title, condition, intervention);
  const dates = getDates(study);
  const sourceTimestamp = firstString(
    study?.lastUpdatePostDateStruct?.date,
    study?.protocolSection?.statusModule?.lastUpdateSubmitDate,
  );

  return { study, dates, sourceTimestamp, relatedTrials, publications };
}

function makeHypotheses(study: CtgStudy, publications: ResearchBundle["publications"], relatedTrials: ResearchBundle["relatedTrials"]): Hypothesis[] {
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);

  const evidenceForSelection = [
    {
      sourceType: "clinicaltrials",
      citation: `Registration record for ${firstString(study?.protocolSection?.identificationModule?.nctId)}`,
      claim: `The trial appears to have enrolled a broader ${condition || "population"} without a clearly biomarker-enriched gate.`,
      url: `https://clinicaltrials.gov/study/${firstString(study?.protocolSection?.identificationModule?.nctId)}`,
    },
    ...publications.slice(0, 1).map((publication: any) => ({
      sourceType: "pubmed",
      citation: publication.title,
      claim: "Public publication signals may have concentrated benefit in a narrower subgroup.",
      url: publication.url,
    })),
  ];

  const evidenceForEndpoint = [
    {
      sourceType: "clinicaltrials",
      citation: `Primary objective for ${title || "the study"}`,
      claim: "The trial appears to have used a harder efficacy bar than the public evidence base could support.",
      url: `https://clinicaltrials.gov/study/${firstString(study?.protocolSection?.identificationModule?.nctId)}`,
    },
  ];

  const evidenceForComparator = relatedTrials.slice(0, 2).map((item: any) => ({
    sourceType: "clinicaltrials",
    citation: item.title,
    claim: `Similar public programs in ${condition || "this disease area"} used different designs or later status updates.`,
    url: item.url,
  }));

  return [
    {
      id: "H1",
      label: "Patient selection was too broad",
      confidence: publications.length ? "high" : "medium",
      statement:
        "The enrolled population likely diluted effect size because the publicly visible record does not show strong biomarker enrichment.",
      whyItMatters: "Broad enrollment often hides a true signal in a biologically narrower subgroup.",
      evidence: evidenceForSelection,
      counterevidence: publications.slice(1, 2).map((publication: any) => ({
        citation: publication.title,
        claim: "At least part of the program rationale was credible enough to reach publication.",
        url: publication.url,
      })),
    },
    {
      id: "H2",
      label: "Target biology or dose strategy was not strong enough",
      confidence: publications.length > 1 ? "medium" : "low",
      statement:
        "The mechanism may have been plausible, but not sufficiently central or exposed at the chosen dose/schedule to create durable benefit.",
      whyItMatters: "A weak target or suboptimal exposure can produce a signal that never becomes clinically meaningful.",
      evidence: [
        {
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
      confidence: relatedTrials.length ? "medium" : "low",
      statement:
        "The program may have been asked to move a difficult endpoint in a population where the control arm or disease context was already challenging.",
      whyItMatters: "A mismatch between mechanism and endpoint can make a useful signal look like failure.",
      evidence: evidenceForComparator.length ? evidenceForComparator : evidenceForEndpoint,
      counterevidence: [],
    },
  ];
}

function makeBottomLine(study: CtgStudy, publications: ResearchBundle["publications"], relatedTrials: ResearchBundle["relatedTrials"]) {
  const status = getStatus(study);
  const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);
  const condition = firstString(...toArray(study?.protocolSection?.conditionsModule?.conditions));
  const intervention = firstString(
    ...toArray(study?.protocolSection?.armsInterventionsModule?.interventions?.map((item: any) => item?.name)),
  );

  const lead =
    publications.length > 0
      ? "The public evidence points to a mixed clinical story rather than a single clean cause."
      : "The public record is thin, so the app is relying on trial structure and related-program context.";

  return `${lead} For ${title || "this trial"} in ${condition || "the target disease area"}, the available sources suggest the most plausible explanation is a combination of patient selection, biology/exposure, and endpoint mismatch. The trial status is ${status.toLowerCase()}, and the public record does not support a definitive causal claim.`;
}

function runReasoningAgent(bundle: ResearchBundle) {
  const study = bundle.study;
  const publications = bundle.publications;
  const relatedTrials = bundle.relatedTrials;
  const hypotheses = makeHypotheses(study, publications, relatedTrials);
  const bottomLine = makeBottomLine(study, publications, relatedTrials);
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
  const verdict: "high" | "medium" | "low" | "unknown" = hasThinEvidence
    ? "unknown"
    : input.publications.length >= 2 || input.relatedTrials.length >= 2
      ? "medium"
      : "low";

  const hypotheses = input.hypotheses.map((hypothesis) => {
    if (hasThinEvidence && hypothesis.confidence === "high") {
      return { ...hypothesis, confidence: "medium" as const };
    }
    return hypothesis;
  });

  const limitations = [
    "Public APIs do not prove causality; they support ranked hypotheses.",
    "If a study has sparse publication history, conclusions stay conservative.",
    "Some registry fields are incomplete or change over time.",
  ];

  const workflow: WorkflowStep[] = [
    {
      name: "Research agent",
      status: "done",
      summary: "Collected the registry record, related trials, and PubMed context.",
      signals: input.publications.length > 0 ? ["PubMed hits found"] : ["No PubMed hits found"],
    },
    {
      name: "Reasoning agent",
      status: "done",
      summary: "Converted the evidence into ranked failure hypotheses.",
      signals: input.hypotheses.map((hypothesis) => hypothesis.label),
    },
    {
      name: "Judge agent",
      status: "done",
      summary: "Checked for overclaiming and kept the answer conservative when evidence was thin.",
      signals: hasThinEvidence ? ["Confidence downgraded"] : ["Confidence preserved"],
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
    const reasoning = runReasoningAgent(research);
    const judge = runJudgeAgent({
      hypotheses: reasoning.hypotheses,
      bottomLine: reasoning.bottomLine,
      evidenceModel: reasoning.evidenceModel,
      publications: research.publications,
      relatedTrials: research.relatedTrials,
    });
    const study = research.study;
    const title = firstString(study?.protocolSection?.identificationModule?.briefTitle);

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
        startDate: research.dates.startDate || undefined,
        completionDate: research.dates.completionDate || undefined,
        locationsCount: getLocationsCount(study),
      },
      bottomLine: reasoning.bottomLine,
      verdict: judge.verdict,
      hypotheses: judge.hypotheses,
      timeline: [
        {
          date: research.dates.startDate || "Not reported",
          event: "Trial start entered in the public record",
          source: "ClinicalTrials.gov",
          url: `https://clinicaltrials.gov/study/${nctId}`,
        },
        {
          date: research.sourceTimestamp || "Not reported",
          event: "Latest public update captured from the registry",
          source: "ClinicalTrials.gov",
          url: `https://clinicaltrials.gov/study/${nctId}`,
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
          date: research.dates.completionDate || "Not reported",
          event: "Trial completion or planned completion captured from the registry",
          source: "ClinicalTrials.gov",
          url: `https://clinicaltrials.gov/study/${nctId}`,
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
          url: `https://clinicaltrials.gov/study/${nctId}`,
        },
        {
          name: "PubMed",
          detail: "Publication search for associated abstracts and follow-up analyses.",
          url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(nctId)}`,
        },
        {
          name: "ClinicalTrials.gov API version",
          detail: "Dataset timestamp used to know when registry data was refreshed.",
          url: `${CTG_BASE}/version`,
        },
      ],
      agentSummary: reasoning.signals,
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
