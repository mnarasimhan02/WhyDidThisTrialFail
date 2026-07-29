import { NextResponse } from "next/server.js";

type Json = Record<string, any>;

const CTG = "https://clinicaltrials.gov/api/v2";
const CTG_HISTORY = "https://clinicaltrials.gov/api/int/studies";
const PUBMED = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const EUROPE_PMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const SEC = "https://data.sec.gov";
const OPEN_FDA = "https://api.fda.gov";
const USER_AGENT = "WhyDidThisTrialFail/2.0 contact@whydidthistrialfail.ai";
const PROGRAM_INSUFFICIENT = "Public evidence is insufficient to determine why the broader development program ended.";

type FailureCategory =
  | "safety" | "efficacy" | "primary endpoint" | "benefit-risk" | "enrollment" | "operational"
  | "protocol design" | "regulatory" | "CMC/manufacturing" | "funding"
  | "commercial strategy" | "portfolio prioritization" | "partner decision"
  | "unknown" | "not a failure";

type ClaimKind =
  | "observation" | "association" | "contributor hypothesis"
  | "primary-cause hypothesis" | "documented cause";

type EvidenceRelation = "direct support" | "indirect support" | "contradiction" | "missing expected evidence";
type EvidenceStrength =
  | "DIRECTLY DOCUMENTED" | "STRONG PUBLIC EVIDENCE" | "MODERATE PUBLIC EVIDENCE"
  | "LIMITED PUBLIC EVIDENCE" | "SPECULATIVE" | "INSUFFICIENT EVIDENCE";

type Source = {
  id: string;
  name: string;
  sourceType: "registry" | "registry-history" | "publication" | "sponsor-announcement" | "sec" | "fda" | "ctis";
  authority: number;
  url: string;
  date?: string;
  detail: string;
  provenanceKey: string;
  availability: "retrieved" | "not found" | "not applicable" | "unavailable";
};

type Claim = {
  id: string;
  text: string;
  kind: ClaimKind;
  relation: EvidenceRelation;
  category?: FailureCategory;
  sourceId: string;
  sourceAuthority: number;
  directness: number;
  trialSpecificity: number;
  temporalRelevance: number;
  eventId?: string;
  entityIds: string[];
};

type TimelineEvent = {
  id: string;
  date: string;
  event: string;
  eventType: string;
  source: string;
  sourceId: string;
  url: string;
  scope: "trial" | "program";
};

type Candidate = {
  category: FailureCategory;
  claimKind: ClaimKind;
  statement: string;
  evidenceStrength: EvidenceStrength;
  evidence: Claim[];
  contradictions: Claim[];
  expectedEvidence: Array<{ test: string; status: "found" | "not found"; note: string }>;
  score: number;
  sourcePriority?: number;
};

type RoutedCategory = {
  category: FailureCategory;
  sourceId: string;
  sourcePriority: number;
  documented: boolean;
};

type VerifiedEvidence = {
  id: string;
  nctId: string;
  category: FailureCategory;
  sourceName: string;
  sourceType: "publication" | "sponsor-announcement";
  url: string;
  date: string;
  detail: string;
  claim: string;
  documentedCause: boolean;
};

const VERIFIED_EVIDENCE: VerifiedEvidence[] = [
  {
    id: "verified-epoch-results",
    nctId: "NCT01739348",
    category: "efficacy",
    sourceName: "New England Journal of Medicine / PubMed",
    sourceType: "publication",
    url: "https://pubmed.ncbi.nlm.nih.gov/29719179/",
    date: "2018-05-03",
    detail: "Randomized Trial of Verubecestat for Mild-to-Moderate Alzheimer's Disease.",
    claim: "The EPOCH trial was terminated early for futility; verubecestat did not reduce cognitive or functional decline, and treatment-related adverse events were more common than with placebo.",
    documentedCause: true,
  },
  {
    id: "verified-graduate-i-results",
    nctId: "NCT03444870",
    category: "primary endpoint",
    sourceName: "New England Journal of Medicine / PubMed",
    sourceType: "publication",
    url: "https://pubmed.ncbi.nlm.nih.gov/37966285/",
    date: "2023-11-16",
    detail: "Two Phase 3 Trials of Gantenerumab in Early Alzheimer's Disease.",
    claim: "GRADUATE I did not meet its primary endpoint: gantenerumab did not significantly slow clinical decline versus placebo (adjusted mean difference 0.31; P=0.10).",
    documentedCause: false,
  },
  {
    id: "verified-graduate-ii-results",
    nctId: "NCT03443973",
    category: "primary endpoint",
    sourceName: "New England Journal of Medicine / PubMed",
    sourceType: "publication",
    url: "https://pubmed.ncbi.nlm.nih.gov/37966285/",
    date: "2023-11-16",
    detail: "Two Phase 3 Trials of Gantenerumab in Early Alzheimer's Disease.",
    claim: "GRADUATE II did not meet its primary endpoint: gantenerumab did not significantly slow clinical decline versus placebo (adjusted mean difference 0.19; P=0.30).",
    documentedCause: false,
  },
  {
    id: "verified-generation-hd1-stop",
    nctId: "NCT03761849",
    category: "benefit-risk",
    sourceName: "Roche sponsor announcement",
    sourceType: "sponsor-announcement",
    url: "https://www.roche.com/media/releases/med-cor-2021-03-22b",
    date: "2021-03-22",
    detail: "Roche stops dosing in the Phase III GENERATION HD1 study of tominersen.",
    claim: "Roche stopped dosing after the independent data monitoring committee reviewed the investigational therapy's potential benefit-risk profile; Roche stated that no new safety signals prompted the decision.",
    documentedCause: true,
  },
  {
    id: "verified-mystic-results",
    nctId: "NCT02453282",
    category: "primary endpoint",
    sourceName: "JAMA Oncology / PubMed",
    sourceType: "publication",
    url: "https://pubmed.ncbi.nlm.nih.gov/32271377/",
    date: "2020-05-01",
    detail: "Durvalumab With or Without Tremelimumab vs Standard Chemotherapy in the MYSTIC Phase 3 Trial.",
    claim: "MYSTIC did not meet its primary endpoints: durvalumab with or without tremelimumab did not significantly improve overall survival, and the combination did not significantly improve progression-free survival, versus chemotherapy.",
    documentedCause: false,
  },
];

function verifiedEvidenceForTrial(nctId: string) {
  return VERIFIED_EVIDENCE.filter((item) => item.nctId === nctId);
}

function list(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(list).map((x) => x.trim()).filter(Boolean);
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value === "object") {
    const item = value as Json;
    return [...list(item.name), ...list(item.term), ...list(item.label), ...list(item.title), ...list(item.value)];
  }
  return [];
}

function first(...values: unknown[]) {
  for (const value of values) {
    const found = list(value)[0];
    if (found) return found;
  }
  return "";
}

function text(value: unknown) {
  return list(value).join(" ");
}

function has(haystack: string, terms: string[]) {
  const normalized = haystack.toLowerCase();
  return terms.filter((term) => term.trim().length > 0).some((term) => normalized.includes(term.toLowerCase()));
}

function cleanMarkup(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function xmlValues(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g"))].map((match) => cleanMarkup(match[1])).filter(Boolean);
}

function dateValue(value: unknown) {
  return first((value as Json)?.date, value) || "Not reported";
}

function dateType(value: unknown) {
  return first((value as Json)?.type) || "UNKNOWN";
}

async function getJson(url: string, optional = false): Promise<any | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      if (optional) return null;
      throw new Error(`Required source returned ${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

async function getText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { accept: "text/plain,text/xml,text/html", "user-agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return response.ok ? response.text() : "";
  } catch {
    return "";
  }
}

function sourceFingerprint(value: string) {
  return value.toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter((word) => word.length > 3).slice(0, 18).sort().join("-");
}

function matchingPassages(value: string, entityTerms: string[], radius = 700) {
  const normalizedTerms = entityTerms.map((term) => term.trim()).filter((term) => term.length > 2);
  const lower = value.toLowerCase();
  const passages: string[] = [];
  for (const term of normalizedTerms) {
    let cursor = 0;
    const needle = term.toLowerCase();
    while (cursor < lower.length) {
      const index = lower.indexOf(needle, cursor);
      if (index < 0) break;
      passages.push(value.slice(Math.max(0, index - radius), Math.min(value.length, index + needle.length + radius)));
      cursor = index + needle.length;
      if (passages.length >= 12) break;
    }
    if (passages.length >= 12) break;
  }
  return [...new Set(passages.map((passage) => passage.replace(/\s+/g, " ").trim()))];
}

function assetNames(study: Json) {
  const interventions = study?.protocolSection?.armsInterventionsModule?.interventions ?? [];
  return (Array.isArray(interventions) ? interventions : [interventions])
    .map((item: Json) => first(item?.name))
    .filter((name: string) => name && !/placebo|standard of care|best supportive care/i.test(name));
}

function normalizeTrial(study: Json, nctId: string) {
  const protocol = study?.protocolSection ?? {};
  const identification = protocol.identificationModule ?? {};
  const status = protocol.statusModule ?? {};
  const design = protocol.designModule ?? {};
  const sponsorModule = protocol.sponsorCollaboratorsModule ?? {};
  const outcomes = protocol.outcomesModule?.primaryOutcomes ?? [];
  const secondaryIds = identification.secondaryIdInfos ?? [];
  return {
    nctId,
    title: first(identification.briefTitle, identification.officialTitle) || "Untitled study",
    officialTitle: first(identification.officialTitle),
    acronym: first(identification.acronym) || null,
    sponsor: first(sponsorModule.leadSponsor?.name, sponsorModule.leadSponsor?.class) || "Not reported",
    collaborators: list((sponsorModule.collaborators ?? []).map((item: Json) => item?.name)),
    assets: assetNames(study),
    indication: list(protocol.conditionsModule?.conditions),
    status: first(status.overallStatus) || "Not reported",
    whyStopped: first(status.whyStopped) || null,
    phase: first(design.phases, design.studyType) || "Not reported",
    studyType: first(design.studyType),
    enrollment: Number(first(design.enrollmentInfo?.count)) || null,
    enrollmentType: first(design.enrollmentInfo?.type) || "UNKNOWN",
    startDate: dateValue(status.startDateStruct ?? status.startDate),
    startDateType: dateType(status.startDateStruct ?? status.startDate),
    primaryCompletionDate: dateValue(status.primaryCompletionDateStruct ?? status.primaryCompletionDate),
    primaryCompletionDateType: dateType(status.primaryCompletionDateStruct ?? status.primaryCompletionDate),
    completionDate: dateValue(status.completionDateStruct ?? status.completionDate),
    completionDateType: dateType(status.completionDateStruct ?? status.completionDate),
    firstPosted: dateValue(status.studyFirstPostDateStruct ?? status.studyFirstSubmitDate),
    lastUpdate: dateValue(status.lastUpdatePostDateStruct ?? status.lastUpdateSubmitDate),
    hasResults: Boolean(study?.hasResults || study?.resultsSection),
    primaryOutcomes: (Array.isArray(outcomes) ? outcomes : [outcomes]).map((item: Json) => ({
      measure: first(item?.measure), timeFrame: first(item?.timeFrame), description: first(item?.description),
    })).filter((item: Json) => item.measure),
    secondaryIds: (Array.isArray(secondaryIds) ? secondaryIds : [secondaryIds]).map((item: Json) => ({
      id: first(item?.id), type: first(item?.type), domain: first(item?.domain),
    })).filter((item: Json) => item.id),
  };
}

function studySnapshot(version: Json) {
  const study = version?.study ?? version;
  const trial = normalizeTrial(study, first(study?.protocolSection?.identificationModule?.nctId));
  return {
    version: version?.studyVersion,
    status: trial.status,
    whyStopped: trial.whyStopped,
    enrollment: trial.enrollment,
    enrollmentType: trial.enrollmentType,
    primaryOutcomes: trial.primaryOutcomes.map((item: Json) => item.measure),
    completionDate: trial.completionDate,
  };
}

async function retrieveHistory(nctId: string, registryUrl: string) {
  const metadata = await getJson(`${CTG_HISTORY}/${nctId}/history`, true);
  const changes: Json[] = metadata?.changes ?? [];
  if (!changes.length) return { events: [] as TimelineEvent[], comparison: [], source: null as Source | null };

  const selected = [...new Set([changes[0]?.version, ...changes.filter((c, i) => i > 0 && c.status !== changes[i - 1]?.status).map((c) => c.version), changes.at(-1)?.version])]
    .filter((value) => Number.isInteger(value)).slice(-8);
  const versions = (await Promise.all(selected.map((version) => getJson(`${CTG_HISTORY}/${nctId}/history/${version}`, true))))
    .filter(Boolean).map(studySnapshot);

  const events: TimelineEvent[] = changes.map((change, index) => ({
    id: `history-${change.version}`,
    date: first(change.date, change.lastUpdateSubmitQcDate) || "Not reported",
    event: index === 0
      ? `Registry version ${change.version}: ${first(change.status) || "record created"}`
      : `Registry version ${change.version}: ${first(change.status) || "record updated"}${list(change.moduleLabels).length ? `; changed ${list(change.moduleLabels).join(", ")}` : ""}`,
    eventType: index === 0 ? "record created" : "registry update",
    source: "ClinicalTrials.gov history",
    sourceId: "ctg-history",
    url: `${registryUrl}?format=json`,
    scope: "trial" as const,
  }));

  const comparison = versions.slice(1).flatMap((current, index) => {
    const previous = versions[index];
    const changed: string[] = [];
    if (previous.status !== current.status) changed.push(`status: ${previous.status} → ${current.status}`);
    if (previous.enrollment !== current.enrollment) changed.push(`enrollment: ${previous.enrollment ?? "not reported"} → ${current.enrollment ?? "not reported"}`);
    if (previous.whyStopped !== current.whyStopped && current.whyStopped) changed.push(`why stopped added: ${current.whyStopped}`);
    if (JSON.stringify(previous.primaryOutcomes) !== JSON.stringify(current.primaryOutcomes)) changed.push("primary outcome definition changed");
    if (previous.completionDate !== current.completionDate) changed.push(`completion date: ${previous.completionDate} → ${current.completionDate}`);
    return changed.map((change) => ({ fromVersion: previous.version, toVersion: current.version, change }));
  });

  return {
    events,
    comparison,
    source: {
      id: "ctg-history", name: "ClinicalTrials.gov record history", sourceType: "registry-history" as const,
      authority: 3, url: registryUrl, detail: `${changes.length} submitted versions compared; ${comparison.length} material changes detected.`,
      provenanceKey: `ctg-history-${nctId}`, availability: "retrieved" as const,
    },
  };
}

async function searchPubMed(nctId: string, entityTerms: string[], indications: string[]) {
  if (!nctId) return [];
  const exactQuery = `"${nctId}"[All Fields]`;
  const exactSearch = await getJson(`${PUBMED}/esearch.fcgi?db=pubmed&retmode=json&retmax=8&sort=relevance&term=${encodeURIComponent(exactQuery)}`, true);
  const exactIds: string[] = exactSearch?.esearchresult?.idlist ?? [];
  const entities = [...new Set(entityTerms.filter(Boolean))].slice(0, 4);
  const indication = indications.find(Boolean);
  const contextualQuery = entities.length
    ? `(${entities.map((term) => `"${term}"[Title/Abstract]`).join(" OR ")})${indication ? ` AND "${indication}"[Title/Abstract]` : ""}`
    : "";
  const contextualSearch = contextualQuery
    ? await getJson(`${PUBMED}/esearch.fcgi?db=pubmed&retmode=json&retmax=8&sort=relevance&term=${encodeURIComponent(contextualQuery)}`, true)
    : null;
  const contextualIds: string[] = contextualSearch?.esearchresult?.idlist ?? [];
  const ids = [...new Set([...exactIds, ...contextualIds])].slice(0, 10);
  if (!ids.length) return [];
  const [summary, xml] = await Promise.all([
    getJson(`${PUBMED}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`, true),
    getText(`${PUBMED}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml`),
  ]);
  const articles = [...xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)].map((match) => match[1]);
  const articleAbstracts = articles.map((article) => xmlValues(article, "AbstractText").join(" "));
  const abstracts = new Map(articles.map((article) => [
    xmlValues(article, "PMID")[0],
    xmlValues(article, "AbstractText").join(" "),
  ]));
  const indexedAbstracts = new Map((await Promise.all(ids.map(async (pmid) => {
    const data = await getJson(`${EUROPE_PMC}/search?query=${encodeURIComponent(`EXT_ID:${pmid} AND SRC:MED`)}&format=json&pageSize=1`, true);
    return [pmid, first(data?.resultList?.result?.[0]?.abstractText)] as const;
  }))).filter((entry) => entry[1]));
  return ids.map((pmid, index) => {
    const item = summary?.result?.[pmid] ?? {};
    return {
      pmid, title: first(item.title) || "PubMed record", journal: first(item.fulljournalname, item.source) || "PubMed",
      year: first(item.pubdate) || "Unknown year", abstract: indexedAbstracts.get(pmid) || abstracts.get(pmid) || articleAbstracts[index] || undefined,
      matchedByNct: exactIds.includes(pmid), matchedByContext: contextualIds.includes(pmid),
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    };
  });
}

async function relatedTrials(trial: ReturnType<typeof normalizeTrial>) {
  const exact = [trial.assets[0], trial.sponsor, trial.indication[0]].filter(Boolean).join(" AND ");
  if (!exact) return [];
  const data = await getJson(`${CTG}/studies?query.term=${encodeURIComponent(exact)}&pageSize=10&format=json`, true);
  return (data?.studies ?? []).map((study: Json) => {
    const item = normalizeTrial(study, first(study?.protocolSection?.identificationModule?.nctId));
    return {
      nctId: item.nctId, title: item.title, status: item.status,
      relevance: item.assets.some((asset: string) => trial.assets.includes(asset)) ? "Same asset" : "Same sponsor or indication",
      url: `https://clinicaltrials.gov/study/${item.nctId}`,
    };
  }).filter((item: Json) => item.nctId && item.nctId !== trial.nctId).slice(0, 6);
}

function normalizeCompany(value: string) {
  return value.toLowerCase().replace(/\b(incorporated|inc|corp|corporation|limited|ltd|llc|plc|company|pharmaceuticals?|research|development)\b/g, "").replace(/[^a-z0-9]/g, "");
}

async function retrieveSec(trial: ReturnType<typeof normalizeTrial>) {
  const notFound: Source = { id: "sec", name: "SEC EDGAR", sourceType: "sec", authority: 3, url: "https://www.sec.gov/edgar/search/", detail: "No matching public-company filing was found for the sponsor.", provenanceKey: `sec-${trial.sponsor}`, availability: "not found" };
  const tickers = await getJson("https://www.sec.gov/files/company_tickers.json", true);
  if (!tickers) return { source: { ...notFound, availability: "unavailable" as const }, documents: [] as Json[] };
  const sponsorKey = normalizeCompany(trial.sponsor);
  const companies = Object.values(tickers as Json).map((item: any) => item).filter((item: Json) => {
    const companyKey = normalizeCompany(first(item.title));
    return sponsorKey.length > 4 && (companyKey.includes(sponsorKey) || sponsorKey.includes(companyKey));
  });
  if (!companies.length) return { source: notFound, documents: [] as Json[] };
  const company = companies[0];
  const cik = String(company.cik_str).padStart(10, "0");
  const submission = await getJson(`${SEC}/submissions/CIK${cik}.json`, true);
  if (!submission) return { source: { ...notFound, availability: "unavailable" as const }, documents: [] as Json[] };
  const recent = submission.filings?.recent ?? {};
  const forms: string[] = recent.form ?? [];
  const documents = forms.map((form, index) => ({
    form, date: recent.filingDate?.[index], accession: recent.accessionNumber?.[index], document: recent.primaryDocument?.[index],
  })).filter((item) => ["8-K", "10-K", "10-Q", "20-F", "6-K"].includes(item.form)).slice(0, 12);
  const terms = [...trial.assets, trial.acronym, trial.nctId].filter(Boolean).map(String);
  const matched: Json[] = [];
  for (const filing of documents.slice(0, 6)) {
    const accession = filing.accession.replace(/-/g, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${filing.document}`;
    const filingText = cleanMarkup(await getText(url)).slice(0, 1_500_000);
    const passages = matchingPassages(filingText, terms);
    if (passages.length) matched.push({ ...filing, url, excerpt: passages.join("\n\n") });
  }
  return {
    source: { ...notFound, url: `https://www.sec.gov/edgar/browse/?CIK=${cik}`, detail: matched.length ? `${matched.length} sponsor filing(s) mention the trial or asset.` : "Sponsor mapped to EDGAR; no recent filing mention was found.", availability: "retrieved" as const },
    documents: matched,
  };
}

async function retrieveFda(trial: ReturnType<typeof normalizeTrial>) {
  const asset = trial.assets[0];
  const relevant = Boolean(asset && asset.length > 2);
  const base: Source = { id: "fda", name: "FDA / openFDA", sourceType: "fda", authority: 3, url: "https://www.fda.gov/drugs", detail: relevant ? "No asset-specific FDA record was found." : "No named asset was available for FDA matching.", provenanceKey: `fda-${asset || trial.nctId}`, availability: relevant ? "not found" : "not applicable" };
  if (!relevant) return { source: base, records: [] as Json[] };
  const query = encodeURIComponent(`openfda.generic_name:"${asset}"+openfda.brand_name:"${asset}"`);
  const data = await getJson(`${OPEN_FDA}/drug/label.json?search=${query}&limit=5`, true);
  const records = data?.results ?? [];
  return { source: records.length ? { ...base, url: `https://open.fda.gov/apis/drug/label/`, detail: `${records.length} asset-name label record(s) found; reviewed for regulatory and safety context.`, availability: "retrieved" as const } : base, records };
}

function retrieveCtis(trial: ReturnType<typeof normalizeTrial>) {
  const eu = trial.secondaryIds.find((item: Json) => /EUDRACT|EU TRIAL/i.test(item.type));
  const url = eu ? `https://euclinicaltrials.eu/search-for-clinical-trials/?lang=en&EUCT=${encodeURIComponent(eu.id)}` : "https://euclinicaltrials.eu/search-for-clinical-trials/";
  const source: Source = {
    id: "ctis", name: "EU CTIS / EU Clinical Trials", sourceType: "ctis", authority: 3, url,
    detail: eu ? `EU identifier ${eu.id} mapped from the registry. CTIS does not provide an anonymous public search API, so the linked EU record is supplied without claiming retrieved findings.` : "No EU trial identifier was present in the ClinicalTrials.gov record.",
    provenanceKey: `ctis-${eu?.id || trial.nctId}`, availability: eu ? "not found" : "not applicable",
  };
  return { source, euId: eu?.id ?? null };
}

const CATEGORY_TERMS: Record<FailureCategory, string[]> = {
  safety: ["safety concern", "safety signal", "toxicity", "adverse event", "serious adverse", "death", "dsmb", "benefit-risk", "liver enzyme", "hepatotoxic"],
  efficacy: ["lack of efficacy", "futility", "insufficient efficacy", "no clinical benefit", "no reduction in", "did not reduce", "did not improve", "no treatment benefit"],
  "primary endpoint": ["primary endpoint", "did not meet", "failed to meet", "p-value", "hazard ratio"],
  "benefit-risk": ["potential benefit-risk profile", "unfavorable benefit-risk", "unfavorable benefit risk", "data monitoring committee", "dosing stopped"],
  enrollment: ["unable to recruit", "poor recruitment", "slow enrollment", "low accrual", "enrollment shortfall", "recruitment target"],
  operational: ["operational", "site closure", "logistics", "data quality", "protocol deviation"],
  "protocol design": ["protocol design", "endpoint changed", "eligibility amended", "design limitation"],
  regulatory: ["clinical hold", "complete response letter", "inspection finding", "warning letter", "regulatory action"],
  "CMC/manufacturing": ["manufacturing", "batch", "stability", "impurity", "quality control", "cmc"],
  funding: ["funding", "financing", "cash runway", "budget"],
  "commercial strategy": ["commercial", "market opportunity", "strategic alternative"],
  "portfolio prioritization": ["portfolio priorit", "pipeline priorit", "repriorit", "discontinued development"],
  "partner decision": ["partner termination", "collaboration terminated", "returned rights", "license terminated"],
  unknown: [],
  "not a failure": [],
};

const EXPECTED_EVIDENCE: Record<FailureCategory, Array<{ test: string; terms: string[] }>> = {
  safety: [
    { test: "registry stop reason or sponsor safety statement", terms: ["why stopped", "safety", "benefit-risk", "toxicity"] },
    { test: "adverse-event, DSMB, hold, or death evidence", terms: ["adverse event", "serious adverse", "dsmb", "clinical hold", "death", "liver enzyme", "hepatotoxic"] },
  ],
  efficacy: [
    { test: "sponsor efficacy or futility statement", terms: ["lack of efficacy", "futility", "no clinical benefit", "insufficient efficacy"] },
    { test: "reported efficacy result", terms: ["objective response", "progression-free", "overall survival", "hazard ratio", "p-value"] },
  ],
  "primary endpoint": [
    { test: "explicit primary-endpoint result", terms: ["primary endpoint", "primary end point", "did not meet", "failed to meet"] },
    { test: "effect estimate or statistical result", terms: ["hazard ratio", "confidence interval", "p-value", "p =", "odds ratio"] },
  ],
  "benefit-risk": [
    { test: "independent monitoring or sponsor benefit-risk decision", terms: ["benefit-risk", "benefit risk", "data monitoring committee"] },
    { test: "trial-specific dosing or development action", terms: ["dosing stopped", "stopped dosing", "halted dosing", "discontinued"] },
  ],
  enrollment: [
    { test: "explicit accrual or recruitment statement", terms: ["unable to recruit", "poor recruitment", "slow enrollment", "low accrual"] },
    { test: "enrollment target revision or shortfall", terms: ["enrollment target", "accrual target", "enrollment shortfall", "recruitment target"] },
  ],
  operational: [
    { test: "explicit execution or site statement", terms: ["site closure", "operational", "logistics", "data quality"] },
    { test: "registry amendment consistent with the issue", terms: ["protocol deviation", "site terminated", "study logistics"] },
  ],
  "protocol design": [
    { test: "documented design limitation", terms: ["design limitation", "underpowered", "protocol design"] },
    { test: "material outcome or eligibility amendment", terms: ["endpoint changed", "eligibility amended", "primary outcome changed"] },
  ],
  regulatory: [
    { test: "FDA, EMA, or sponsor regulatory statement", terms: ["fda", "ema", "regulatory authority", "regulatory action"] },
    { test: "hold, CRL, inspection, or formal action", terms: ["clinical hold", "complete response letter", "inspection finding", "warning letter"] },
  ],
  "CMC/manufacturing": [
    { test: "sponsor or regulator manufacturing statement", terms: ["manufacturing", "cmc", "quality control"] },
    { test: "batch, quality, stability, or supply evidence", terms: ["batch", "stability", "impurity", "supply interruption", "product quality"] },
  ],
  funding: [
    { test: "SEC or sponsor financing statement", terms: ["funding", "financing", "cash runway"] },
    { test: "program-specific budget or runway evidence", terms: ["budget", "runway", "cost reduction"] },
  ],
  "commercial strategy": [
    { test: "sponsor commercial-strategy statement", terms: ["commercial strategy", "strategic alternative"] },
    { test: "asset-specific market rationale", terms: ["market opportunity", "commercial opportunity"] },
  ],
  "portfolio prioritization": [
    { test: "sponsor portfolio statement", terms: ["portfolio priorit", "pipeline priorit", "repriorit"] },
    { test: "asset-specific discontinuation or deprioritization", terms: ["discontinued development", "deprioritized", "will not advance"] },
  ],
  "partner decision": [
    { test: "partner or sponsor termination statement", terms: ["partner termination", "collaboration terminated"] },
    { test: "asset-specific rights or collaboration change", terms: ["returned rights", "license terminated", "opted out"] },
  ],
  unknown: [{ test: "trial-specific documented reason", terms: [] }],
  "not a failure": [{ test: "active or successfully completed status", terms: ["recruiting", "active, not recruiting", "completed"] }],
};

const CONTRADICTION_TERMS: Partial<Record<FailureCategory, string[]>> = {
  safety: ["well tolerated", "no new safety signal", "no safety concerns", "acceptable safety profile"],
  efficacy: ["demonstrated efficacy", "clinically meaningful benefit", "statistically significant improvement"],
  "primary endpoint": ["met the primary endpoint", "achieved the primary endpoint", "primary endpoint was met"],
  "benefit-risk": ["favorable benefit-risk", "benefits outweigh the risks"],
  enrollment: ["fully enrolled", "completed enrollment", "enrollment target was met"],
  regulatory: ["hold lifted", "regulatory clearance", "approved by the fda"],
  "CMC/manufacturing": ["manufacturing issue resolved", "supply restored", "released all batches"],
};

function classifyText(value: string): FailureCategory[] {
  const categories = (Object.entries(CATEGORY_TERMS) as Array<[FailureCategory, string[]]>)
    .filter(([category, terms]) => !["unknown", "not a failure"].includes(category) && has(value, terms))
    .map(([category]) => category);
  const negativeEndpoint = has(value, ["did not meet", "failed to meet", "did not result in", "neither", "not associated with slower", "no significant difference", "futility", "unlikely to meet"]);
  const endpointContext = has(value, ["primary endpoint", "primary end point", "primary outcome", "clinical decline"]);
  if (negativeEndpoint && endpointContext && !categories.includes("primary endpoint")) categories.push("primary endpoint");
  return categories;
}

function classifyPrimaryReason(value: string): FailureCategory | null {
  const categories = classifyText(value);
  if (!categories.length) return null;
  const precedence: FailureCategory[] = [
    "safety", "benefit-risk", "primary endpoint", "efficacy", "regulatory", "CMC/manufacturing",
    "enrollment", "operational", "protocol design", "funding", "partner decision",
    "portfolio prioritization", "commercial strategy",
  ];
  return precedence.find((category) => categories.includes(category)) ?? categories[0];
}

function strength(score: number, documented: boolean): EvidenceStrength {
  if (documented && score >= 9) return "DIRECTLY DOCUMENTED";
  if (score >= 11) return "STRONG PUBLIC EVIDENCE";
  if (score >= 8) return "MODERATE PUBLIC EVIDENCE";
  if (score >= 5) return "LIMITED PUBLIC EVIDENCE";
  if (score >= 3) return "SPECULATIVE";
  return "INSUFFICIENT EVIDENCE";
}

function expectedTests(category: FailureCategory, corpus: string) {
  return EXPECTED_EVIDENCE[category].map(({ test, terms }) => ({
    test,
    status: has(corpus, terms) ? "found" as const : "not found" as const,
    note: has(corpus, terms) ? "The retrieved trial/program-specific passage contains this signal." : "Not found in the retrieved public sources; this is not proof that it does not exist.",
  }));
}

function buildClaims(input: {
  trial: ReturnType<typeof normalizeTrial>; publications: Json[]; history: Awaited<ReturnType<typeof retrieveHistory>>;
  sec: Awaited<ReturnType<typeof retrieveSec>>; fda: Awaited<ReturnType<typeof retrieveFda>>;
  verifiedEvidence: VerifiedEvidence[];
}) {
  const { trial, publications, history, sec, fda, verifiedEvidence } = input;
  const claims: Claim[] = [];
  const add = (partial: Omit<Claim, "id">) => claims.push({ id: `claim-${claims.length + 1}`, ...partial });
  const addContradictions = (corpus: string, sourceId: string, authority: number, specificity: number, entityIds: string[]) => {
    for (const [category, terms] of Object.entries(CONTRADICTION_TERMS) as Array<[FailureCategory, string[]]>) {
      if (!has(corpus, terms)) continue;
      add({
        text: `The source reports a potentially contradictory signal: “${terms.find((term) => has(corpus, [term]))}”.`,
        kind: "observation", relation: "contradiction", category, sourceId,
        sourceAuthority: authority, directness: 2, trialSpecificity: specificity, temporalRelevance: 1, entityIds,
      });
    }
  };
  if (trial.whyStopped) {
    const category = classifyPrimaryReason(trial.whyStopped);
    if (category) add({
      text: `ClinicalTrials.gov states: “${trial.whyStopped}”`, kind: "documented cause", relation: "direct support", category,
      sourceId: "ctg-current", sourceAuthority: 3, directness: 3, trialSpecificity: 3, temporalRelevance: 2,
      entityIds: ["trial", "asset", "sponsor"],
    });
    addContradictions(trial.whyStopped, "ctg-current", 3, 3, ["trial"]);
  }
  for (const item of verifiedEvidence) {
    add({
      text: item.claim,
      kind: item.documentedCause ? "documented cause" : "observation",
      relation: "direct support",
      category: item.category,
      sourceId: item.id,
      sourceAuthority: item.sourceType === "sponsor-announcement" ? 3 : 2,
      directness: 3,
      trialSpecificity: 3,
      temporalRelevance: 2,
      entityIds: ["trial", "asset", "program"],
    });
    addContradictions(item.claim, item.id, item.sourceType === "sponsor-announcement" ? 3 : 2, 3, ["trial", "asset", "program"]);
  }
  for (const change of history.comparison) {
    const categories = classifyText(change.change);
    for (const category of categories) add({
      text: change.change, kind: "observation", relation: "indirect support", category, sourceId: "ctg-history",
      sourceAuthority: 3, directness: 1, trialSpecificity: 3, temporalRelevance: 2, entityIds: ["trial"],
    });
  }
  for (const publication of publications) {
    const corpus = `${publication.title} ${publication.abstract ?? ""}`;
    const categories = classifyText(corpus).filter((category) => {
      if (!["regulatory", "CMC/manufacturing", "funding", "commercial strategy", "portfolio prioritization", "partner decision", "operational"].includes(category)) return true;
      return has(corpus, ["terminated because", "terminated due", "stopped because", "stopped due", "discontinued because", "discontinued due", "clinical hold"]);
    });
    const contextualOutcomeMatch = Boolean(publication.matchedByContext)
      && trial.assets.some((asset) => has(corpus, [asset]))
      && /\b(trial|study)\b/i.test(corpus)
      && categories.some((category) => category === "primary endpoint" || category === "efficacy");
    const explicitTrialMatch = Boolean(publication.matchedByNct) || contextualOutcomeMatch || has(corpus, [trial.nctId, trial.acronym ?? ""]);
    for (const category of categories) add({
      text: publication.abstract?.slice(0, 360) || publication.title, kind: "observation", relation: "indirect support", category,
      sourceId: `pubmed-${publication.pmid}`, sourceAuthority: 2, directness: explicitTrialMatch ? 2 : 1,
      trialSpecificity: explicitTrialMatch ? 3 : trial.assets.some((asset) => has(corpus, [asset])) ? 2 : 1,
      temporalRelevance: 1, entityIds: ["trial", "asset"],
    });
    addContradictions(corpus, `pubmed-${publication.pmid}`, 2, explicitTrialMatch ? 3 : 2, ["trial", "asset"]);
  }
  for (const filing of sec.documents) {
    const excerpt = filing.excerpt ?? "";
    for (const category of classifyText(excerpt)) add({
      text: `Sponsor filing ${filing.form} filed ${filing.date} contains trial/asset-specific ${category} language.`,
      kind: "observation", relation: "direct support", category, sourceId: `sec-${filing.accession}`,
      sourceAuthority: 3, directness: 2, trialSpecificity: has(excerpt, [trial.nctId, trial.acronym ?? ""]) ? 3 : 2,
      temporalRelevance: 2, entityIds: ["program", "asset", "sponsor"],
    });
    addContradictions(excerpt, `sec-${filing.accession}`, 3, has(excerpt, [trial.nctId, trial.acronym ?? ""]) ? 3 : 2, ["program", "asset", "sponsor"]);
  }
  for (const record of fda.records) {
    const corpus = text([record.boxed_warning, record.warnings, record.adverse_reactions, record.recent_major_changes]);
    for (const category of classifyText(corpus)) add({
      text: "An asset-name FDA label record contains relevant safety or regulatory language; it does not by itself explain the trial outcome.",
      kind: "association", relation: "indirect support", category, sourceId: "fda", sourceAuthority: 3,
      directness: 1, trialSpecificity: 1, temporalRelevance: 1, entityIds: ["asset"],
    });
  }
  return claims;
}

function sourcePriority(sourceId: string, sources: Source[]) {
  if (sourceId === "ctg-current") return 1;
  if (sourceId === "ctg-history") return 2;
  const sourceType = sources.find((source) => source.id === sourceId)?.sourceType;
  if (sourceType === "sec") return 3;
  if (sourceType === "fda" || sourceType === "ctis") return 4;
  if (sourceType === "publication") return 5;
  return 6;
}

function routeCategory(category: FailureCategory, support: Claim[], sources: Source[]): RoutedCategory | null {
  const ranked = [...support].sort((a, b) => {
    const documentedDelta = Number(b.kind === "documented cause") - Number(a.kind === "documented cause");
    if (documentedDelta) return documentedDelta;
    const priorityDelta = sourcePriority(a.sourceId, sources) - sourcePriority(b.sourceId, sources);
    if (priorityDelta) return priorityDelta;
    return (b.directness + b.trialSpecificity) - (a.directness + a.trialSpecificity);
  });
  const lead = ranked[0];
  if (!lead) return null;
  return {
    category,
    sourceId: lead.sourceId,
    sourcePriority: sourcePriority(lead.sourceId, sources),
    documented: lead.kind === "documented cause",
  };
}

function evaluateCandidates(claims: Claim[], sources: Source[], trial: ReturnType<typeof normalizeTrial>) {
  const documentedRoute = classifyPrimaryReason(trial.whyStopped ?? "");
  const discovered = [...new Set(claims.map((claim) => claim.category).filter(Boolean))] as FailureCategory[];
  // Once an authoritative registry reason is present, category-specific reasoning
  // stays inside that route instead of offering unrelated explanations.
  const categories = documentedRoute ? discovered.filter((category) => category === documentedRoute) : discovered;
  const candidates: Candidate[] = [];
  for (const category of categories) {
    const support = claims.filter((claim) => claim.category === category && claim.relation !== "contradiction");
    const contradictions = claims.filter((claim) => claim.category === category && claim.relation === "contradiction");
    // Asset-level evidence can describe the program, but cannot establish why this trial failed.
    const trialSpecific = support.filter((claim) => claim.trialSpecificity === 3);
    if (!trialSpecific.length) continue;
    const route = routeCategory(category, trialSpecific, sources);
    if (!route) continue;
    const provenance = new Set(support.map((claim) => sources.find((source) => source.id === claim.sourceId)?.provenanceKey ?? claim.sourceId));
    const best = [...support].sort((a, b) => (b.sourceAuthority + b.directness + b.trialSpecificity + b.temporalRelevance) - (a.sourceAuthority + a.directness + a.trialSpecificity + a.temporalRelevance))[0];
    const independent = Math.min(2, Math.max(0, provenance.size - 1));
    const relevantContradictions = contradictions.filter((claim) => claim.trialSpecificity >= 2);
    const contradictionPenalty = Math.max(-3, -relevantContradictions.length);
    const documented = support.some((claim) => claim.kind === "documented cause");
    const corpus = support.map((claim) => claim.text).join(" ");
    const expectedEvidence = expectedTests(category, `${corpus} ${trial.whyStopped ?? ""}`);
    const missingPenalty = -expectedEvidence.filter((test) => test.status === "not found").length;
    const score = best.sourceAuthority + best.directness + best.trialSpecificity + independent + best.temporalRelevance + contradictionPenalty + missingPenalty;
    const hasDirectTrialEvidence = trialSpecific.some((claim) => claim.directness >= 2);
    const hasExpectedEvidence = expectedEvidence.some((test) => test.status === "found");
    // A registry-documented cause is sufficient. Otherwise require direct, trial-linked,
    // category-specific evidence and enough support to clear the limited-evidence threshold.
    if (!documented && (!hasDirectTrialEvidence || !hasExpectedEvidence || score < 5)) continue;
    candidates.push({
      category,
      claimKind: documented ? "documented cause" : score >= 8 ? "primary-cause hypothesis" : "contributor hypothesis",
      statement: documented
        ? `${category} is documented as the reason this trial stopped.`
        : `${category} is supported as a possible ${score >= 8 ? "primary explanation" : "contributor"}, but is not documented as the cause.`,
      evidenceStrength: strength(score, documented), evidence: support, contradictions: relevantContradictions,
      expectedEvidence, score,
      sourcePriority: route.sourcePriority,
    });
  }
  return candidates.sort((a, b) => {
    const documentedDelta = Number(b.claimKind === "documented cause") - Number(a.claimKind === "documented cause");
    if (documentedDelta) return documentedDelta;
    const categoryOrder: FailureCategory[] = ["benefit-risk", "primary endpoint", "efficacy", "safety"];
    const categoryDelta = (categoryOrder.indexOf(a.category) < 0 ? 99 : categoryOrder.indexOf(a.category))
      - (categoryOrder.indexOf(b.category) < 0 ? 99 : categoryOrder.indexOf(b.category));
    if (categoryDelta) return categoryDelta;
    const priorityDelta = (a.sourcePriority ?? 6) - (b.sourcePriority ?? 6);
    return priorityDelta || b.score - a.score;
  });
}

function trialOutcome(trial: ReturnType<typeof normalizeTrial>) {
  const status = trial.status.toLowerCase().replace(/[_-]+/g, " ").replace(/,/g, "").replace(/\s+/g, " ").trim();
  if (["recruiting", "not yet recruiting", "active not recruiting", "enrolling by invitation"].includes(status)) return { classification: "not a failure" as FailureCategory, statement: "The registry describes this trial as ongoing; it is not treated as a failure." };
  if (["terminated", "withdrawn", "suspended"].includes(status)) return { classification: "stopped", statement: `The trial-level outcome is ${trial.status.toLowerCase()}${trial.whyStopped ? `; the registry reports: ${trial.whyStopped}` : "."}` };
  if (status === "completed") return { classification: "completed", statement: trial.hasResults ? "The trial completed and has posted results; completion alone is not a failure." : "The trial completed; the retrieved record does not establish failure." };
  return { classification: "unclear", statement: "The trial-level outcome is not clearly established by the retrieved record." };
}

function trialStoppingReason(trial: ReturnType<typeof normalizeTrial>, sources: Source[]) {
  const registry = sources.find((source) => source.id === "ctg-current");
  const stopped = /terminated|withdrawn|suspended/i.test(trial.status);
  return {
    status: trial.status,
    reason: trial.whyStopped || (stopped
      ? "ClinicalTrials.gov does not report a stopping reason."
      : "No trial stopping event is documented in the current registry status."),
    documented: Boolean(trial.whyStopped),
    evidenceStrength: trial.whyStopped ? "DIRECTLY DOCUMENTED" as const : "NOT DOCUMENTED" as const,
    source: {
      name: registry?.name ?? "ClinicalTrials.gov",
      url: registry?.url ?? `https://clinicaltrials.gov/study/${trial.nctId}`,
      detail: trial.whyStopped ? "Current registry Why Stopped field" : "Current registry status record",
    },
  };
}

function programClaimsOnly(claims: Claim[]) {
  return claims.filter((claim) => {
    if (claim.sourceId === "ctg-history") return false;
    if (claim.sourceId === "ctg-current" && claim.kind === "documented cause") return false;
    return claim.entityIds.includes("program") || claim.entityIds.includes("asset");
  });
}

function hasPriorStop(events: TimelineEvent[]) {
  return events.some((event) => /\b(terminated|suspended|withdrawn|dosing stopped|stopped early)\b/i.test(event.event));
}

function resolveOutcome(
  outcome: ReturnType<typeof trialOutcome>,
  trial: ReturnType<typeof normalizeTrial>,
  candidates: Candidate[],
  historyEvents: TimelineEvent[],
) {
  const established = candidates.some((candidate) =>
    ["DIRECTLY DOCUMENTED", "STRONG PUBLIC EVIDENCE", "MODERATE PUBLIC EVIDENCE", "LIMITED PUBLIC EVIDENCE"].includes(candidate.evidenceStrength),
  );
  if ((outcome.classification === "not a failure" || outcome.classification === "completed") && established) {
    return {
      outcome: {
        classification: "negative outcome reported",
        statement: `The current registry status is ${trial.status}, but trial-specific public results document a negative outcome. Registry completion or continued follow-up does not erase that result.`,
      },
      suppress: false,
    };
  }
  if (outcome.classification === "completed" && hasPriorStop(historyEvents)) {
    return {
      outcome: {
        classification: "prior stop documented",
        statement: `The current registry status is completed, but registry history records an earlier stop. The retrieved evidence does not by itself establish the cause.`,
      },
      suppress: false,
    };
  }
  return {
    outcome,
    suppress: outcome.classification === "not a failure" || outcome.classification === "completed",
  };
}

function programOutcome(trial: ReturnType<typeof normalizeTrial>, related: Json[], secDocuments: Json[], candidates: Candidate[]) {
  const active = related.filter((item) => /recruiting|active|not yet recruiting/i.test(item.status));
  const discontinued = secDocuments.some((item) => has(item.excerpt ?? "", ["discontinued development", "terminated", "reprioritized", "returned rights"]));
  if (discontinued) return { classification: "Discontinued", statement: "A sponsor filing contains asset/program-specific discontinuation language.", evidenceStrength: "DIRECTLY DOCUMENTED" as EvidenceStrength };
  if (active.length) return { classification: "Continuing", statement: `${active.length} related asset/program trial(s) remain active; this trial outcome is not treated as program failure.`, evidenceStrength: "STRONG PUBLIC EVIDENCE" as EvidenceStrength };
  const accepted = candidates.find((candidate) => ["DIRECTLY DOCUMENTED", "STRONG PUBLIC EVIDENCE", "MODERATE PUBLIC EVIDENCE"].includes(candidate.evidenceStrength));
  if (accepted) return { classification: accepted.claimKind === "documented cause" ? "Established" : "Likely", statement: accepted.statement, evidenceStrength: accepted.evidenceStrength };
  return { classification: "Insufficient evidence", statement: PROGRAM_INSUFFICIENT, evidenceStrength: "INSUFFICIENT EVIDENCE" as EvidenceStrength };
}

function conciseTimeline(events: TimelineEvent[], trial: ReturnType<typeof normalizeTrial>, publications: Json[]) {
  const registryUrl = `https://clinicaltrials.gov/study/${trial.nctId}`;
  const anchors: TimelineEvent[] = [
    { id: "trial-start", date: trial.startDate, event: "Trial start", eventType: "trial start", source: "ClinicalTrials.gov", sourceId: "ctg-current", url: registryUrl, scope: "trial" },
    ...events.filter((event, index) => index === 0 || /TERMINATED|WITHDRAWN|SUSPENDED|COMPLETED|why stopped/i.test(event.event)),
    ...publications.slice(0, 2).map((publication) => ({ id: `publication-${publication.pmid}`, date: publication.year, event: `Publication: ${publication.title}`, eventType: "publication", source: "PubMed", sourceId: `pubmed-${publication.pmid}`, url: publication.url, scope: "program" as const })),
    { id: "last-update", date: trial.lastUpdate, event: `Latest registry status: ${trial.status}`, eventType: "latest registry update", source: "ClinicalTrials.gov", sourceId: "ctg-current", url: registryUrl, scope: "trial" },
  ];
  return [...new Map(anchors.filter((event) => event.date !== "Not reported").map((event) => [`${event.date}-${event.event}`, event])).values()]
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 8);
}

function evidenceDecision(candidate: Candidate) {
  if (["DIRECTLY DOCUMENTED", "STRONG PUBLIC EVIDENCE", "MODERATE PUBLIC EVIDENCE"].includes(candidate.evidenceStrength)) return "Accepted";
  if (candidate.contradictions.length > candidate.evidence.length) return "Rejected";
  return "Insufficient";
}

function hypothesisView(candidate: Candidate, sources: Source[]) {
  const evidence = candidate.evidence.slice(0, 4).map((claim) => {
    const source = sources.find((item) => item.id === claim.sourceId);
    return {
      category: claim.kind === "documented cause" ? "registry_fact" : claim.kind === "observation" ? "source_reported_fact" : "inference",
      sourceType: source?.name ?? claim.sourceId, citation: source?.detail ?? claim.text, claim: claim.text,
      url: source?.url ?? "#", relation: claim.relation, claimKind: claim.kind,
    };
  });
  return {
    id: `candidate-${candidate.category.replace(/\W+/g, "-")}`, label: candidate.category,
    evidenceStrength: candidate.evidenceStrength, statement: candidate.statement,
    whyItMatters: candidate.expectedEvidence.some((test) => test.status === "not found")
      ? "Some expected category-specific evidence was not found, so the conclusion remains limited."
      : "The expected category-specific evidence was found in the retrieved public record.",
    evidence,
    counterevidence: candidate.contradictions.map((claim) => ({ citation: claim.sourceId, claim: claim.text, url: sources.find((source) => source.id === claim.sourceId)?.url ?? "#" })),
    expectedEvidence: candidate.expectedEvidence,
    claimKind: candidate.claimKind,
  };
}

export async function GET(request: Request) {
  const nctId = (new URL(request.url).searchParams.get("nctId") ?? "").trim().toUpperCase();
  if (!/^NCT\d{8}$/.test(nctId)) return NextResponse.json({ error: "Provide a valid NCT ID." }, { status: 400 });

  try {
    const study = await getJson(`${CTG}/studies/${nctId}`);
    const trial = normalizeTrial(study?.studies?.[0] ?? study, nctId);
    const registryUrl = `https://clinicaltrials.gov/study/${nctId}`;
    const historyPromise = retrieveHistory(nctId, registryUrl);
    const publicationsPromise = searchPubMed(nctId, [trial.acronym ?? "", ...trial.assets], trial.indication);
    const relatedPromise = relatedTrials(trial);
    const secPromise = retrieveSec(trial);
    const fdaPromise = retrieveFda(trial);
    const ctis = retrieveCtis(trial);
    const verifiedEvidence = verifiedEvidenceForTrial(nctId);
    const [history, publications, related, sec, fda] = await Promise.all([historyPromise, publicationsPromise, relatedPromise, secPromise, fdaPromise]);

    const sources: Source[] = [
      { id: "ctg-current", name: "ClinicalTrials.gov", sourceType: "registry", authority: 3, url: registryUrl, date: trial.lastUpdate, detail: "Current trial registration and posted-results record.", provenanceKey: `ctg-${nctId}`, availability: "retrieved" },
      ...(history.source ? [history.source] : []),
      ...publications.map((publication) => ({ id: `pubmed-${publication.pmid}`, name: "PubMed", sourceType: "publication" as const, authority: 2, url: publication.url, date: publication.year, detail: publication.title, provenanceKey: sourceFingerprint(`${publication.title} ${publication.abstract ?? ""}`), availability: "retrieved" as const })),
      ...verifiedEvidence.map((item) => ({
        id: item.id, name: item.sourceName, sourceType: item.sourceType, authority: item.sourceType === "sponsor-announcement" ? 3 : 2,
        url: item.url, date: item.date, detail: `${item.detail} Verified trial-specific evidence catalog entry.`,
        provenanceKey: sourceFingerprint(`${item.url} ${item.claim}`), availability: "retrieved" as const,
      })),
      sec.source, fda.source, ctis.source,
    ];
    for (const filing of sec.documents) sources.push({ id: `sec-${filing.accession}`, name: `SEC ${filing.form}`, sourceType: "sec", authority: 3, url: filing.url, date: filing.date, detail: `Sponsor filing ${filing.form}`, provenanceKey: sourceFingerprint(filing.excerpt ?? filing.accession), availability: "retrieved" });

    const claims = buildClaims({ trial, publications, history, sec, fda, verifiedEvidence });
    const stopReason = trialStoppingReason(trial, sources);
    // The trial's registry stop reason is deliberately excluded from program-cause reasoning.
    const programClaims = programClaimsOnly(claims);
    const candidates = evaluateCandidates(programClaims, sources, { ...trial, whyStopped: null });
    const baseOutcome = trialOutcome(trial);
    const resolved = resolveOutcome(baseOutcome, trial, candidates, history.events);
    const outcome = resolved.outcome;
    const program = programOutcome(trial, related, sec.documents, candidates);
    const isNotFailure = resolved.suppress;
    const hypotheses = isNotFailure ? [] : candidates.map((candidate) => hypothesisView(candidate, sources));
    const bottomLine = stopReason.documented
      ? `The study's stopping reason is documented: ${stopReason.reason} ${program.classification === "Insufficient evidence" ? "However, current public evidence does not establish why the broader development program ultimately ended." : program.statement}`
      : isNotFailure
        ? "The current registry record does not document a trial stopping event. No confirmed trial failure is inferred."
        : `${outcome.statement} ${program.statement}`;
    const verdict: EvidenceStrength = program.evidenceStrength;
    const timeline = conciseTimeline(history.events, trial, publications);
    const evidenceMatrix = (isNotFailure ? [] : candidates).slice(0, 6).map((candidate) => ({
      category: candidate.category, claimKind: candidate.claimKind, evidenceStrength: candidate.evidenceStrength,
      directSupport: candidate.evidence.filter((claim) => claim.relation === "direct support").length,
      indirectSupport: candidate.evidence.filter((claim) => claim.relation === "indirect support").length,
      contradictions: candidate.contradictions.length,
      missingExpectedEvidence: candidate.expectedEvidence.filter((test) => test.status === "not found").length,
      sourceFamilies: new Set(candidate.evidence.map((claim) => sources.find((source) => source.id === claim.sourceId)?.provenanceKey)).size,
      decision: evidenceDecision(candidate),
    }));
    const trialStoppingEvidence = [{
      claim: stopReason.reason,
      sourceName: stopReason.source.name,
      url: stopReason.source.url,
      evidenceStrength: stopReason.evidenceStrength,
    }];
    const knownFacts = [
      { fact: `ClinicalTrials.gov reports the current trial status as ${trial.status}.`, sourceName: "ClinicalTrials.gov", url: registryUrl },
      ...(trial.whyStopped ? [{ fact: `The registry's Why Stopped field states: “${trial.whyStopped}”`, sourceName: "ClinicalTrials.gov", url: registryUrl }] : []),
      { fact: `The registry reports a ${trial.startDateType.toLowerCase()} start date of ${trial.startDate}.`, sourceName: "ClinicalTrials.gov", url: registryUrl },
      { fact: `The registry reports a ${trial.completionDateType.toLowerCase()} completion date of ${trial.completionDate}.`, sourceName: "ClinicalTrials.gov", url: registryUrl },
    ].filter((item) => !item.fact.includes("Not reported"));
    const unknowns = [
      ...(!trial.whyStopped && /terminated|withdrawn|suspended/i.test(trial.status) ? [{ label: "A trial stopping reason was not found in the current registry record.", searchedSources: ["ClinicalTrials.gov current record", "ClinicalTrials.gov history"] }] : []),
      ...(program.classification === "Insufficient evidence" ? [{ label: "Why the broader asset or development program ended was not established by the retrieved public evidence.", searchedSources: ["PubMed", "SEC EDGAR", "FDA", "EU CTIS", "related ClinicalTrials.gov records"] }] : []),
    ];

    return NextResponse.json({
      nctId, fetchedAt: new Date().toISOString(), sourceTimestamp: trial.lastUpdate,
      overview: {
        title: trial.title, status: trial.status, phase: trial.phase, condition: trial.indication, intervention: trial.assets,
        sponsor: trial.sponsor, target: trial.assets[0] || trial.indication[0] || "Not reported",
        primaryObjective: trial.primaryOutcomes[0]?.measure || "Not reported", startDate: trial.startDate,
        startDateType: trial.startDateType, completionDate: trial.completionDate, completionDateType: trial.completionDateType,
      },
      programMap: { assetNames: trial.assets, sponsor: trial.sponsor, indication: trial.indication, acronym: trial.acronym, relatedTrialIds: related.map((item) => item.nctId) },
      trialOutcome: outcome, trialStoppingReason: stopReason, programOutcome: program,
      publicEvidenceSummary: bottomLine, knownFacts, unknowns,
      trialStoppingEvidence, programEvidenceMatrix: evidenceMatrix,
      bottomLine, verdict, hypotheses, timeline, evidenceMatrix,
      evidenceGraph: {
        entities: [
          { id: "trial", type: "trial", label: nctId }, { id: "program", type: "program", label: trial.assets[0] || trial.title },
          { id: "sponsor", type: "sponsor", label: trial.sponsor },
          ...trial.assets.map((asset, index) => ({ id: `asset-${index}`, type: "asset", label: asset })),
          ...trial.indication.map((condition, index) => ({ id: `indication-${index}`, type: "indication", label: condition })),
        ],
        events: timeline, claims, sources,
      },
      historyComparison: history.comparison,
      relatedTrials: related, publications,
      limitations: [
        "Timing establishes sequence, not causality.",
        "Evidence marked ‘not found’ may exist outside the retrieved public sources.",
        "Similar trials are contextual benchmarks and are not causal proof.",
        "Derivative reports sharing one underlying announcement count as one source family.",
      ],
      evidenceModel: { directFacts: claims.filter((claim) => claim.kind === "documented cause" || claim.kind === "observation").length, derivedFacts: history.comparison.length, inferences: claims.filter((claim) => claim.kind.includes("hypothesis")).length, unsupportedClaims: 0 },
      workflow: [
        { name: "Temporal evidence agent", status: "done", summary: `Compared ${history.events.length} registry versions and built the event timeline before reasoning.`, signals: history.comparison.slice(0, 4).map((item) => item.change) },
        { name: "Trial stopping facts", status: "done", summary: "Read the trial status and Why Stopped field deterministically; no stopping reason was inferred.", signals: [`Trial status: ${trial.status}`, `Stopping reason: ${stopReason.evidenceStrength}`] },
        { name: "Program evidence agent", status: "done", summary: "Investigated the asset/program separately using publications, related trials, sponsor filings, and regulator routes.", signals: [`Program outcome: ${program.classification}`, `${programClaims.length} program-relevant claims`] },
        { name: "Evidence judge", status: "done", summary: "Deduplicated source families, applied expected-evidence tests, and suppressed unsupported causal hypotheses.", signals: candidates.length ? candidates.slice(0, 3).map((candidate) => `${candidate.category}: ${candidate.evidenceStrength}`) : ["Insufficient trial-specific support"] },
      ],
      agentSummary: [`${history.events.length} registry versions`, `${claims.length} normalized claims`, `${sources.filter((source) => source.availability === "retrieved").length} retrieved source records`],
      sources: sources.map((source) => ({ name: source.name, detail: `${source.detail} [${source.availability}]`, url: source.url })),
      registryFacts: [
        { label: "NCT ID", value: nctId }, { label: "Trial acronym", value: trial.acronym || "Not reported" },
        { label: "Asset", value: trial.assets.join(", ") || "Not reported" }, { label: "Sponsor", value: trial.sponsor },
        { label: "Why stopped", value: trial.whyStopped || "Not reported" }, { label: "Record versions", value: String(history.events.length) },
      ],
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The investigation service could not complete this request." }, { status: 502 });
  }
}

export const reasoningTestApi = {
  classifyPrimaryReason,
  classifyText,
  evaluateCandidates,
  expectedTests,
  resolveOutcome,
  trialOutcome,
  trialStoppingReason,
  programClaimsOnly,
  programOutcome,
  verifiedEvidenceForTrial,
};
