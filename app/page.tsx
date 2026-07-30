"use client";

import { useMemo, useRef, useState } from "react";
import { conciseFinding, displayOutcome, documentedCategory, evidenceStatus, primaryCategory, scorecard } from "../lib/report-presentation";

type InvestigationResponse = {
  nctId: string;
  fetchedAt: string;
  sourceTimestamp?: string;
  eligibility?: {
    outcome: string;
    reason: string;
    registryFacts: string[];
    shouldInvestigate: boolean;
  };
  overview: {
    title: string;
    status: string;
    phase: string;
    condition: string[];
    intervention: string[];
    sponsor: string;
    target: string;
    primaryObjective: string;
    startDate?: string;
    startDateType?: "ACTUAL" | "ESTIMATED" | "UNKNOWN";
    completionDate?: string;
    completionDateType?: "ACTUAL" | "ESTIMATED" | "UNKNOWN";
    locationsCount?: number;
  };
  programMap?: {
    assetNames: string[];
    sponsor: string;
    indication: string[];
    acronym: string | null;
    relatedTrialIds: string[];
  };
  trialOutcome?: { classification: string; statement: string };
  trialStoppingReason?: {
    status: string;
    reason: string;
    documented: boolean;
    evidenceStrength: "DIRECTLY DOCUMENTED" | "NOT DOCUMENTED";
    source: { name: string; url: string; detail: string };
  };
  programOutcome?: { classification: string; statement: string; evidenceStrength?: InvestigationResponse["verdict"] };
  publicEvidenceSummary?: string;
  knownFacts?: Array<{ fact: string; sourceName: string; url: string }>;
  unknowns?: Array<{ label: string; searchedSources: string[] }>;
  trialStoppingEvidence?: Array<{ claim: string; sourceName: string; url: string; evidenceStrength: string }>;
  bottomLine: string;
  verdict: "DIRECTLY DOCUMENTED" | "STRONG PUBLIC EVIDENCE" | "MODERATE PUBLIC EVIDENCE" | "LIMITED PUBLIC EVIDENCE" | "SPECULATIVE" | "INSUFFICIENT EVIDENCE";
  hypotheses: Array<{
    id: string;
    label: string;
    evidenceStrength: "DIRECTLY DOCUMENTED" | "STRONG PUBLIC EVIDENCE" | "MODERATE PUBLIC EVIDENCE" | "LIMITED PUBLIC EVIDENCE" | "SPECULATIVE" | "INSUFFICIENT EVIDENCE";
    statement: string;
    whyItMatters: string;
    evidence: Array<{
      category: "registry_fact" | "source_reported_fact" | "inference" | "hypothesis";
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
  }>;
  timeline: Array<{
    date: string;
    event: string;
    source: string;
    url: string;
    scope?: "trial" | "program";
    importance?: "MATERIAL" | "CONTEXTUAL" | "ADMINISTRATIVE";
    title?: string;
    beforeValue?: string;
    afterValue?: string;
  }>;
  allRegistryVersions?: InvestigationResponse["timeline"];
  explanationsConsidered?: Array<{
    category: string; decision: "DOCUMENTED" | "SUPPORTED" | "POSSIBLE" | "NOT_SUPPORTED" | "REJECTED" | "NOT_ASSESSABLE";
    evidenceStrength: string; supportingClaimIds: string[]; contradictingClaimIds: string[];
    missingExpectedEvidence: string[]; rationale: string; scope: "TRIAL" | "ASSET" | "PROGRAM";
    citations: Array<{ claimId: string; claim: string; source: string; url: string; relation: string }>;
    contradictions: Array<{ claimId: string; claim: string; url: string }>;
  }>;
  evidenceGaps?: Array<{
    id: string; question: string; category: string; expectedEvidence: string[]; sourceTypesSearched: string[];
    relevantEvidenceFound: boolean; unresolvedReason: string; impact: string; explanation: string;
  }>;
  evidenceBasedImplications?: Array<{
    id: string; implicationType: string; category: string; scope: string; title: string; statement: string;
    evidenceStrength: string; limitations: string[]; supportingClaimIds: string[];
  }>;
  sourceCoverage?: Array<{
    sourceType: string; applicable: boolean; searchAttempted: boolean; searchCompleted: boolean;
    recordsFound: number; relevantRecordsUsed: number; newestSourceDate?: string; searchQuerySummary?: string; note?: string;
  }>;
  provenanceSummary?: { independentSourceGroupsUsed: number; rawDocumentsUsed: number };
  judge?: { approved: boolean; issues: Array<{ type: string; severity: string; message: string; affectedSection: string }> };
  evidenceMatrix?: Array<{
    category: string;
    claimKind: string;
    evidenceStrength: InvestigationResponse["verdict"];
    directSupport: number;
    indirectSupport: number;
    contradictions: number;
    missingExpectedEvidence: number;
    sourceFamilies: number;
    decision?: "Accepted" | "Rejected" | "Insufficient";
  }>;
  programEvidenceMatrix?: InvestigationResponse["evidenceMatrix"];
  relatedTrials: Array<{
    nctId: string;
    title: string;
    relevance: string;
    status: string;
    phase?: string;
    indications?: string[];
    documentedOutcome?: string;
    mappingConfidence?: "CONFIRMED" | "SUPPORTED";
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
  limitations: string[];
  evidenceModel: {
    directFacts: number;
    derivedFacts: number;
    inferences: number;
    unsupportedClaims: number;
  };
  workflow: Array<{
    name: string;
    status: "done";
    summary: string;
    signals: string[];
  }>;
  agentSummary: string[];
  sources: Array<{
    name: string;
    detail: string;
    url: string;
  }>;
  registryFacts?: Array<{
    label: string;
    value: string;
  }>;
};

type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: InvestigationResponse };

const EXAMPLES = ["NCT02569398", "NCT04280705", "NCT02009449"];

const TRIALS = [
  {
    nctId: "NCT02569398",
    title: "Efficacy and Safety Study of Atabecestat",
    sponsor: "Janssen Research & Development, LLC",
    condition: "Preclinical Alzheimer's Disease",
  },
  {
    nctId: "NCT04280705",
    title: "Adaptive COVID-19 Treatment Trial (ACTT)",
    sponsor: "National Institute of Allergy and Infectious Diseases",
    condition: "COVID-19",
  },
  {
    nctId: "NCT02009449",
    title: "Phase 1 Study of Pegilodecakin in Advanced Solid Tumors",
    sponsor: "Eli Lilly and Company",
    condition: "Advanced solid tumors",
  },
] as const;

const TIERS = {
  fact: {
    label: "FACT",
    color: "#1F5C4B",
    bg: "#DCE8E1",
    desc: "Directly stated in a primary source.",
  },
  source_reported_fact: {
    label: "SOURCE",
    color: "#1F5C4B",
    bg: "#DCE8E1",
    desc: "Explicitly reported by a public source.",
  },
  inference: {
    label: "INFERENCE",
    color: "#8A6416",
    bg: "#EDE3C8",
    desc: "A reasonable read of two or more facts.",
  },
  hypothesis: {
    label: "HYPOTHESIS",
    color: "#8B3A22",
    bg: "#EDDCD1",
    desc: "Plausible, but not confirmed by the record.",
  },
} as const;

const STARTER_OVERVIEW = {
  status: "Terminated",
  condition: "Pulmonary Neoplasms",
  intervention: "Radiofrequency ablation of pulmonary neoplasms",
  sponsor: "Oncology Specialties, Alabama",
  start: "Oct 3, 2005",
  completion: "Not reported",
  dataAsOf: "Jan 11, 2007",
};

function confidenceClass(value: string) {
  if (value === "high") return "pill pill-high";
  if (value === "medium") return "pill pill-medium";
  if (value === "low") return "pill pill-low";
  return "pill";
}

function formatDate(value?: string) {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function tierStyle(key: keyof typeof TIERS, index: number) {
  const tier = TIERS[key];
  return {
    color: tier.color,
    background: tier.bg,
    transform: index === 1 ? "rotate(1.5deg)" : "rotate(-2deg)",
  };
}

function ConfBadge({ level }: { level: "high" | "medium" | "low" }) {
  const tier =
    level === "high"
      ? { label: "High confidence", color: "#1F5C4B", bg: "#DCE8E1" }
      : level === "medium"
        ? { label: "Medium confidence", color: "#8A6416", bg: "#EDE3C8" }
        : { label: "Low confidence", color: "#8B3A22", bg: "#EDDCD1" };

  return (
    <span
      className="mono inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: tier.bg,
        color: tier.color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tier.color }} />
      {tier.label}
    </span>
  );
}

function Tag({ kind }: { kind: "registry_fact" | "source_reported_fact" | "inference" | "hypothesis" }) {
  const tier = kind === "registry_fact" ? TIERS.fact : TIERS[kind];

  return (
    <span
      className="mono inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        color: tier.color,
        background: tier.bg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      {tier.label}
    </span>
  );
}

function InfoTip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="info-tip">
      <summary aria-label={`Help: ${title}`} title={`How ${title.toLowerCase()} is calculated`}>
        <span aria-hidden="true">?</span>
      </summary>
      <div className="info-popover" role="note">
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </details>
  );
}

function strengthTone(level: InvestigationResponse["verdict"]) {
  if (level === "DIRECTLY DOCUMENTED" || level === "STRONG PUBLIC EVIDENCE") return "high";
  if (level === "MODERATE PUBLIC EVIDENCE") return "medium";
  return "low";
}

function strengthLabel(level: InvestigationResponse["verdict"]) {
  if (level === "DIRECTLY DOCUMENTED") return "Directly documented";
  if (level === "STRONG PUBLIC EVIDENCE") return "Strong public evidence";
  if (level === "MODERATE PUBLIC EVIDENCE") return "Moderate public evidence";
  if (level === "LIMITED PUBLIC EVIDENCE") return "Limited public evidence";
  if (level === "SPECULATIVE") return "Speculative";
  return "Insufficient evidence";
}

function programOutcomeLabel(value?: string) {
  const normalized = (value ?? "").toUpperCase();
  if (/CONTINU/.test(normalized)) return "CONTINUED";
  if (/ADVANC/.test(normalized)) return "ADVANCED";
  if (/REDESIGN/.test(normalized)) return "REDESIGNED";
  if (/DISCONTINU|ESTABLISHED/.test(normalized)) return /INSUFFICIENT|NOT ESTABLISHED/.test(normalized) ? "NOT_ESTABLISHED" : "DISCONTINUED";
  if (/DEPRIORIT/.test(normalized)) return "DEPRIORITIZED";
  return "NOT_ESTABLISHED";
}

function ScoreMeter({ label, value, explanation }: { label: string; value: string; explanation: string }) {
  const levels = ["UNKNOWN", "LIMITED", "MODERATE", "STRONG", "ESTABLISHED"];
  const active = Math.max(0, levels.indexOf(value));
  return (
    <details className="score-item">
      <summary>
        <span>{label}</span>
        <span className="score-value">{value}</span>
        <span className="score-segments" aria-label={`${label}: ${value}`}>
          {levels.map((level, index) => <i className={index <= active ? "active" : ""} key={level} />)}
        </span>
      </summary>
      <p>{explanation}</p>
    </details>
  );
}

function ExpertSection({ id, title, help, warning, children }: { id: string; title: string; help: React.ReactNode; warning?: string; children: React.ReactNode }) {
  return (
    <details className="folder grain result-panel-shell expert-section" id={id}>
      <summary>
        <span className="mono panel-kicker">{title}</span>
        {warning ? <span className="critical-warning">{warning}</span> : null}
        <span className="disclosure-label">Open details</span>
      </summary>
      <div className="expert-content">
        <div className="section-title-row"><span /><InfoTip title={title}>{help}</InfoTip></div>
        {children}
      </div>
    </details>
  );
}

export default function Home() {
  const [nctId, setNctId] = useState(EXAMPLES[0]);
  const [searchText, setSearchText] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [data, setData] = useState<InvestigationResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showMethod, setShowMethod] = useState(true);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return TRIALS;

    return TRIALS.filter((trial) => {
      return [trial.nctId, trial.title, trial.sponsor, trial.condition].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [searchText]);

  const presentation = useMemo(() => {
    if (!data) return null;
    const explanations = data.explanationsConsidered ?? [];
    const confirmedRelated = data.relatedTrials.filter((trial) => trial.relevance === "Same asset");
    const scores = scorecard({
      documented: Boolean(data.trialStoppingReason?.documented), explanations,
      programEvidenceStrength: data.programOutcome?.evidenceStrength,
      coverage: data.sourceCoverage ?? [],
      independentSources: data.provenanceSummary?.independentSourceGroupsUsed ?? 0,
      confirmedRelatedTrials: confirmedRelated.length,
      highImpactGaps: (data.evidenceGaps ?? []).filter((gap) => /high|material|critical/i.test(gap.impact)).length,
    });
    const stoppingReason = data.trialStoppingReason?.reason;
    const primaryFinding = conciseFinding(data.trialStoppingReason?.documented && stoppingReason
      ? stoppingReason
      : data.trialOutcome?.statement ?? data.publicEvidenceSummary ?? data.bottomLine);
    const category = data.trialStoppingReason?.documented && stoppingReason
      ? documentedCategory(stoppingReason)
      : primaryCategory(explanations, false);
    return {
      trialResult: displayOutcome(data.overview.status, `${data.trialOutcome?.classification ?? ""} ${category}`),
      primaryFinding,
      category,
      evidence: evidenceStatus(Boolean(data.trialStoppingReason?.documented), explanations),
      program: programOutcomeLabel(data.programOutcome?.classification),
      scores, confirmedRelated,
      importantUnknowns: (data.unknowns ?? []).slice(0, 2),
      topEvidence: (data.knownFacts ?? []).slice(0, 5),
    };
  }, [data]);

  function resolveTrialId(value: string) {
    const query = value.trim();
    if (!query) return null;

    const normalized = query.toUpperCase();
    if (/^NCT\d{8}$/.test(normalized)) return normalized;

    const matches = TRIALS.filter((trial) =>
      [trial.nctId, trial.title, trial.sponsor, trial.condition].some((field) =>
        field.toLowerCase().includes(query.toLowerCase()),
      ),
    );

    return matches.length === 1 ? matches[0].nctId : null;
  }

  async function runInvestigation() {
    const resolvedId = resolveTrialId(searchText) ?? resolveTrialId(nctId);
    const trimmed = (resolvedId ?? searchText.trim()).toUpperCase();
    if (!/^NCT\d{8}$/.test(trimmed)) {
      setShake(true);
      setError(`Search by NCT ID, sponsor, or title. Try ${TRIALS[0].nctId}.`);
      setStatus("error");
      setTimeout(() => setShake(false), 420);
      return;
    }

    setNctId(trimmed);
    setSearchText(trimmed);
    setError("");
    setStatus("loading");

    try {
      const response = await fetch(`/api/investigate?nctId=${encodeURIComponent(trimmed)}`);
      const payload = (await response.json()) as InvestigationResponse | { error?: string };
      const hasError = "error" in payload && typeof payload.error === "string";

      if (!response.ok || hasError) {
        throw new Error("The investigation service could not complete this request.");
      }

      const resolved = payload as InvestigationResponse;
      setData(resolved);
      setExpanded(
        resolved.hypotheses.reduce<Record<string, boolean>>(
          (acc, item, index) => ({
            ...acc,
            [item.id]: index === 0,
          }),
          {},
        ),
      );
      setShowMethod(true);
      setStatus("done");
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (caught) {
      setError("The investigation service could not complete this request.");
      setStatus("error");
    }
  }

  return (
    <div className="wdtf-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      `}</style>

      <div className="page-wrap">
        <header className="masthead">
          <div className="brand">
            <span className="brand-mark">WTF</span>
            <div>
              <div className="brand-title">WhyDidThisTrialFail</div>
              <div className="brand-subtitle">Public-source trial investigation</div>
            </div>
          </div>
          <div className="masthead-copy">One NCT ID. No uploads. Source-backed reasoning.</div>
        </header>

        <div className="tab mono">
          PUBLIC-SOURCE TRIAL INVESTIGATION · NO UPLOADS REQUIRED
        </div>

        <section className="folder grain hero-card">
          <div className="hero-copy">
            <h1 className="stampfont hero-title">
              <span className="hero-title-compact">WhyDidThisTrialFail</span>
              <span className="hero-title-expanded">Why Did This Trial Fail?</span>
            </h1>
            <p className="lede">
              Enter one NCT ID to see what happened, what the public evidence supports,
              what remains unknown, and what the result may mean for the broader
              development program.
            </p>

            <div className={`search-shell ${shake ? "shake" : ""}`}>
              <div className="search-row">
                <input
                  className="nct-input"
                  placeholder="Search by NCT ID, sponsor, or trial title"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runInvestigation();
                    }
                  }}
                  aria-label="NCT search"
                  list="trial-search-suggestions"
                />
                <button className="go-btn" onClick={runInvestigation} disabled={status === "loading"}>
                  {status === "loading" ? "INVESTIGATING..." : "INVESTIGATE"}
                </button>
              </div>

              <datalist id="trial-search-suggestions">
                {TRIALS.map((trial) => (
                  <option
                    key={trial.nctId}
                    value={trial.nctId}
                    label={`${trial.sponsor} · ${trial.title}`}
                  />
                ))}
              </datalist>

              <div className="search-help">
                {suggestions.slice(0, 4).map((trial) => (
                  <button
                    key={trial.nctId}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setNctId(trial.nctId);
                      setSearchText(trial.nctId);
                      runInvestigation();
                    }}
                  >
                    <span className="chip-top">{trial.nctId}</span>
                    <span className="chip-bottom">{trial.sponsor} · {trial.title}</span>
                  </button>
                ))}
              </div>

              <div className="examples">
                <span className="mono examples-label">TRY:</span>
                {EXAMPLES.map((id) => (
                  <button
                    key={id}
                    className="chip"
                    onClick={() => {
                      setNctId(id);
                      setSearchText(id);
                    }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {status !== "done" ? (
          <>
            <section className="status-band">
              <div className="status-card">
                <div className="mono status-label">Investigation status</div>
                <div className={`status-text ${status === "error" ? "status-error" : ""}`}>
                  {status === "idle" && "Ready"}
                  {status === "loading" && "Checking sources..."}
                  {status === "error" && error}
                </div>
              </div>
              <div className="status-card">
                <div className="mono status-label">Guardrail</div>
                <div className="status-text subtle">
                  The app labels facts, inferences, and hypotheses separately so it does
                  not overstate causality.
                </div>
              </div>
            </section>

            <section className="what-youll-get">
              <div className="mono section-label">WHAT YOU&apos;LL GET</div>
              <div className="feature-grid">
                {[
                  {
                    title: "Answer",
                    body: "A concise explanation of the documented trial outcome and its evidence strength.",
                  },
                  {
                    title: "Program Context",
                    body: "See how the study fits into the broader asset-development history.",
                  },
                  {
                    title: "Evidence Audit",
                    body: "Review supporting, contradicting, and missing evidence with source-level citations.",
                  },
                  {
                    title: "Guardrails",
                    body: "Facts, interpretations, and unresolved questions remain clearly separated.",
                  },
                ].map((item) => (
                  <article className="feature-card" key={item.title}>
                    <div className="stampfont feature-title">{item.title}</div>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {status === "done" && data ? (
          <div ref={resultRef} className="result-stack">
            <div className="folder grain result-shell">
              <div className="result-meta-line mono">
                <span>{data.nctId}</span>
                <span>·</span>
                <span>{data.overview.status.toUpperCase()}</span>
                <span>·</span>
                <span>DATA AS OF {formatDate(data.sourceTimestamp) === "Not reported" ? STARTER_OVERVIEW.dataAsOf.toUpperCase() : formatDate(data.sourceTimestamp).toUpperCase()}</span>
              </div>
              <h1 className="result-title">
                {data.overview.title || "Trial investigation"}
              </h1>
            </div>

            <nav className="report-nav mono" aria-label="Report sections">
              <a href="#summary">Summary</a><a href="#meaning">Meaning</a><a href="#evidence">Evidence</a><a href="#history">History</a><a href="#sources">Sources</a>
            </nav>

            {presentation ? <>
              <section className="folder grain result-panel-shell executive-summary" id="summary">
                <div className="section-title-row"><div className="mono panel-kicker">EXECUTIVE INVESTIGATION SUMMARY</div><InfoTip title="Executive summary">Trial and program outcomes are assessed independently. The primary finding uses the strongest trial-specific evidence and never turns timing or missing evidence into causality.</InfoTip></div>
                <div className="executive-grid">
                  <div className="primary-finding">
                    <span className="summary-label">Primary finding</span>
                    <p>{presentation.primaryFinding}</p>
                    {data.trialStoppingReason?.documented ? <details className="exact-source"><summary>View exact source and registry wording</summary><blockquote>{data.trialStoppingReason.reason}</blockquote><a href={data.trialStoppingReason.source.url} target="_blank" rel="noreferrer">{data.trialStoppingReason.source.name}</a></details> : null}
                  </div>
                  <div className="summary-stat"><span>Trial result</span><strong>{presentation.trialResult}</strong></div>
                  <div className="summary-stat"><span>Stopping category</span><strong>{presentation.category}</strong></div>
                  <div className="summary-stat"><span>Evidence status</span><strong>{presentation.evidence}</strong></div>
                  <div className="summary-stat program-stat"><span>Program outcome</span><strong>{presentation.program}</strong><small>{data.programOutcome?.statement}</small></div>
                  <div className="summary-unknown"><span>Most important unknown</span>{presentation.importantUnknowns.length ? presentation.importantUnknowns.map((item) => <p key={item.label}>{item.label}</p>) : <p>No material trial-level uncertainty was identified.</p>}</div>
                </div>
                <div className="evidence-base mono">{data.evidenceModel.directFacts} direct observations · {data.provenanceSummary?.independentSourceGroupsUsed ?? 0} independent source groups · {data.timeline.length} material events · {presentation.confirmedRelated.length} confirmed related trials</div>
              </section>

              <section className="folder grain result-panel-shell scorecard-section">
                <div className="section-title-row"><div className="mono panel-kicker">INVESTIGATION SCORECARD</div><InfoTip title="Investigation scorecard">Each dimension is scored independently from deterministic retrieval and evidence inputs. These labels are evidence states, not probabilities.</InfoTip></div>
                <div className="score-grid">
                  <ScoreMeter label="Trial-level explanation" value={presentation.scores.trial} explanation="Based on explicit trial-level statements, supporting sources, contradictions, and trial specificity. A primary-source stopping reason establishes this dimension." />
                  <ScoreMeter label="Program-level explanation" value={presentation.scores.program} explanation="Uses program-specific evidence only and never inherits the trial-level result. Sponsor or regulator evidence would strengthen it." />
                  <ScoreMeter label="Evidence coverage" value={presentation.scores.coverage} explanation="Based on applicable searches completed, relevant records used, and unresolved high-impact evidence gaps." />
                  <ScoreMeter label="Source independence" value={presentation.scores.independence} explanation="Counts canonical source groups rather than multiple articles repeating one announcement." />
                  <ScoreMeter label="Cross-trial context" value={presentation.scores.context} explanation="Based only on confirmed same-asset related trials. Approximate sponsor or indication matches do not increase this score." />
                </div>
              </section>

              <section className="folder grain result-panel-shell meaning-section" id="meaning">
                <div className="section-title-row"><div className="mono panel-kicker">WHAT WE KNOW</div><InfoTip title="Practical interpretation">These statements remain within the trial, asset, and population scope supported by cited evidence. They are not retrospective protocol recommendations or causal overclaims.</InfoTip></div>
                <div className="meaning-grid">
                  <div><h3>Practical interpretation</h3><ul><li>{data.trialStoppingReason?.documented ? `The trial-level stopping reason is directly documented as ${presentation.category.toLowerCase().replaceAll("_", " ")}.` : "The retrieved public record does not directly document a trial-level stopping reason."}</li><li>{data.programOutcome?.statement ?? "The broader program outcome is not established."}</li></ul></div>
                  <div><h3>Evidence-based implications</h3>{data.evidenceBasedImplications?.length ? data.evidenceBasedImplications.slice(0, 3).map((item) => <article className="meaning-implication" key={item.id}><strong>{item.title}</strong><p>{item.statement}</p><small>{item.scope} · {item.evidenceStrength.replaceAll("_", " ")} · Supported by {item.supportingClaimIds.join(", ")}</small><em>{item.limitations.join(" ")}</em></article>) : <p>The public evidence establishes the trial outcome but does not support a responsible development implication beyond the documented stopping reason.</p>}</div>
                  <div><h3>What evidence would change the conclusion?</h3>{data.evidenceGaps?.length ? <ul>{data.evidenceGaps.slice(0, 3).map((gap) => <li key={gap.id}><a href="#evidence-gaps">{gap.question}</a></li>)}</ul> : <p>No specific high-impact evidence requirement was identified.</p>}</div>
                </div>
              </section>

              <section className="folder grain result-panel-shell top-evidence" id="evidence">
                <div className="section-title-row"><div className="mono panel-kicker">WHAT PUBLIC EVIDENCE SUPPORTS</div><InfoTip title="Top evidence">The first view is limited to decisive, directly sourced observations. Use Show all evidence for the complete fact ledger.</InfoTip></div>
                <div className="fact-list">{(showAllEvidence ? data.knownFacts ?? [] : presentation.topEvidence).map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={`${item.fact}-${index}`}><span className="evidence-number">{index + 1}</span><span>{item.fact}<small>{item.sourceName}</small></span></a>)}</div>
                {(data.knownFacts?.length ?? 0) > presentation.topEvidence.length ? <button className="text-control mono" onClick={() => setShowAllEvidence((value) => !value)}>{showAllEvidence ? "Show top evidence" : "Show all evidence"}</button> : null}
              </section>
            </> : null}

            <section className="folder grain result-panel-shell unknown-section">
              <div className="section-title-row"><div className="mono panel-kicker">WHAT REMAINS UNKNOWN</div><InfoTip title="What remains unknown">“Not found” means the retrieved public sources did not establish the answer. It does not mean the event or evidence does not exist.</InfoTip></div>
              {data.unknowns?.length ? <div className="unknown-list">{data.unknowns.map((item, index) => <div className="unknown-row" key={index}><span className="ledger-icon ledger-unknown" aria-hidden="true">?</span><div><p>{item.label}</p><small>Not established in: {item.searchedSources.join(", ")}</small></div></div>)}</div> : <p className="muted-copy">No material unknowns were identified in the displayed findings.</p>}
            </section>

            {presentation?.confirmedRelated.length ? (
            <ExpertSection id="program-context" title="PROGRAM CONTEXT" help="Only exact same-asset registry mappings are included. Sponsor- or indication-only similarities are excluded from this summary.">
                <div className="program-context-grid">
                  <div><span>Asset</span><strong>{data.programMap?.assetNames[0] ?? data.overview.target}</strong></div>
                  <div><span>Sponsor</span><strong>{data.programMap?.sponsor ?? data.overview.sponsor}</strong></div>
                  <div><span>Confirmed related trials</span><strong>{presentation.confirmedRelated.length}</strong></div>
                  <div><span>Development phase</span><strong>{data.overview.phase || "Not reported"}</strong></div>
                  <div><span>Indications represented</span><strong>{data.programMap?.indication.join(", ") || "Not reported"}</strong></div>
                  <div><span>Mapping confidence</span><strong>CONFIRMED</strong></div>
                  <div className="program-conclusion"><span>Program conclusion</span><strong>{data.programOutcome?.statement ?? "The broader program outcome is not established."}</strong></div>
                </div>
                <div className="related-card-grid">{presentation.confirmedRelated.map((trial) => <article className="related-trial-card" key={trial.nctId}><a href={trial.url} target="_blank" rel="noreferrer">{trial.nctId}</a><h3>{trial.title}</h3><p>{trial.status} · {trial.phase || "Phase not reported"}</p><small>{trial.documentedOutcome || "No documented outcome was extracted for this related record."}</small><span className="decision decision-supported">CONFIRMED MAP</span></article>)}</div>
                {presentation.confirmedRelated.length >= 2 ? <div className="program-pattern"><strong>Program pattern</strong><p>{presentation.confirmedRelated.length} confirmed same-asset trials provide cross-trial context. Their individual outcomes must be reviewed before drawing any asset-level conclusion; this does not establish a mechanism-wide result.</p></div> : null}
              </ExpertSection>
            ) : null}

            <ExpertSection id="explanations" title="EXPLANATIONS CONSIDERED" warning={data.explanationsConsidered?.some((item) => item.contradictions.length) ? "Contradiction present" : undefined} help="Every explanation is assessed independently. Rejected requires contradictory evidence; not supported means no trial-specific support was found in completed searches.">
              <div className="section-subcopy">Competing explanations are evaluated independently instead of being blended into one narrative.</div>
              <div className="audit-card-stack">
                {data.explanationsConsidered?.map((item) => (
                  <details className="audit-card" key={item.category}>
                    <summary>
                      <span><strong>{item.category.replaceAll("_", " ")}</strong><small>{item.scope}</small></span>
                      <span className={`decision decision-${item.decision.toLowerCase()}`}>{item.decision}</span>
                    </summary>
                    <div className="audit-card-body">
                      <p>{item.rationale}</p>
                      {item.citations.length ? <div><div className="mono audit-label">SUPPORTING EVIDENCE</div>{item.citations.map((citation) => <a className="audit-citation" href={citation.url} target="_blank" rel="noreferrer" key={citation.claimId}>{citation.claim}<small>{citation.source} · {citation.claimId}</small></a>)}</div> : null}
                      {item.contradictions.length ? <div><div className="mono audit-label">CONTRADICTING EVIDENCE</div>{item.contradictions.map((citation) => <a className="audit-citation" href={citation.url} target="_blank" rel="noreferrer" key={citation.claimId}>{citation.claim}<small>{citation.claimId}</small></a>)}</div> : null}
                      {item.missingExpectedEvidence.length ? <div><div className="mono audit-label">EXPECTED EVIDENCE NOT FOUND</div><ul>{item.missingExpectedEvidence.map((value) => <li key={value}>{value}</li>)}</ul></div> : null}
                      <span className="mono audit-strength">{item.evidenceStrength.replaceAll("_", " ")}</span>
                    </div>
                  </details>
                ))}
              </div>
            </ExpertSection>

            <ExpertSection id="evidence-gaps" title="WHAT WOULD CHANGE THE CONCLUSION" help="These are precise evidence requirements that could change or refine the assessment. They differ from unknowns by stating what source or evidence would resolve the question.">
              {data.evidenceGaps?.length ? <div className="gap-list">{data.evidenceGaps.map((gap) => <details className="gap-card" key={gap.id}><summary><span>{gap.question}</span><span className="mono impact-chip">{gap.impact.replaceAll("_", " ")}</span></summary><div><p>{gap.explanation}</p><strong>Evidence that would resolve it</strong><ul>{gap.expectedEvidence.map((item) => <li key={item}>{item}</li>)}</ul><small>Searched: {gap.sourceTypesSearched.join(", ") || "No completed applicable search"} · {gap.unresolvedReason.replaceAll("_", " ")}</small></div></details>)}</div> : <p className="muted-copy">No specific evidence gap met the display criteria.</p>}
            </ExpertSection>

            <ExpertSection id="implications" title="EVIDENCE-BASED IMPLICATION DETAILS" help="Implications require supporting claim IDs, use the narrowest defensible scope, and cannot claim that another dose, population, endpoint, or protocol would have prevented the outcome.">
              {data.evidenceBasedImplications?.length ? <div className="implication-list">{data.evidenceBasedImplications.map((item) => <article className="implication-card" key={item.id}><div className="implication-head"><span className="mono">{item.implicationType.replaceAll("_", " ")} · {item.scope}</span><span>{item.category.replaceAll("_", " ")}</span></div><h3>{item.title}</h3><p>{item.statement}</p><div className="limitation"><strong>Limitation</strong> {item.limitations.join(" ")}</div><small>Supported by {item.supportingClaimIds.join(", ")}</small></article>)}</div> : <p className="muted-copy">No evidence-based development implication can be responsibly generated from the available public record.</p>}
            </ExpertSection>

            <ExpertSection id="history" title="TRIAL TIMELINE" help="This deterministic timeline combines registry versions, status changes, study dates, and publications. It establishes what happened and when. Timing alone is never treated as proof that one event caused another.">
              <div className="section-subcopy">Sequence is shown for context and is not treated as causal proof.</div>
              <button className="history-toggle mono" onClick={() => setShowAllVersions((value) => !value)}>{showAllVersions ? "SHOW MATERIAL CHANGES" : "SHOW ALL REGISTRY VERSIONS"}</button>
              <div className="timeline-list">
                {(showAllVersions ? data.allRegistryVersions ?? [] : data.timeline).map((item, index) => (
                  <a className="timeline-item" href={item.url} target="_blank" rel="noreferrer" key={`${item.date}-${index}`}>
                    <span className="timeline-dot" />
                    <span className="mono timeline-date">{formatDate(item.date)}</span>
                    <span className="timeline-copy">{item.beforeValue !== undefined || item.afterValue !== undefined ? <><strong>{item.title}</strong><span className="timeline-diff"><span>{item.beforeValue ?? "Not provided"}</span><b>→</b><span>{item.afterValue ?? "Not provided"}</span></span></> : item.event}</span>
                    <span className="mono timeline-scope">{item.importance ?? item.scope ?? "trial"}</span>
                  </a>
                ))}
              </div>
            </ExpertSection>

            <ExpertSection id="trial-evidence" title="EVIDENCE FOR THE TRIAL OUTCOME" help="This evidence is deterministic. It shows the registry status and any explicit Why Stopped statement without adding an inferred cause.">
              <div className="compact-evidence-list">{data.trialStoppingEvidence?.map((row, index) => <a href={row.url} target="_blank" rel="noreferrer" key={index}><strong>{row.evidenceStrength}</strong><span>{row.claim}</span><small>{row.sourceName}</small></a>)}</div>
            </ExpertSection>

            <ExpertSection id="program-evidence" title="EVIDENCE FOR THE PROGRAM OUTCOME" help="Program-level explanations are scored separately using direct support, contradiction, missing expected evidence, source authority, trial specificity, independent provenance, and temporal relevance. The result is an evidence label, not a probability.">
              <div className="section-subcopy">Repeated coverage of one underlying announcement counts once. Unsupported candidates remain insufficient or are rejected.</div>
              {data.programEvidenceMatrix?.length ? (
                <div className="matrix-scroll">
                  <table className="evidence-matrix">
                    <thead><tr><th>Category</th><th>Support</th><th>Against</th><th>Expected not found</th><th>Strength</th><th>Decision</th></tr></thead>
                    <tbody>
                      {data.programEvidenceMatrix.map((row) => (
                        <tr key={row.category}>
                          <td className="matrix-category">{row.category}</td>
                          <td>{row.directSupport} direct · {row.indirectSupport} indirect</td><td>{row.contradictions}</td><td>{row.missingExpectedEvidence}</td>
                          <td><span className={`badge badge-${strengthTone(row.evidenceStrength)}`}>{strengthLabel(row.evidenceStrength)}</span></td><td>{row.decision ?? "Insufficient"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted-copy">No trial-specific causal hypothesis met the evidence threshold.</p>}
            </ExpertSection>

            <section className="folder grain result-panel-shell legacy-hypotheses" aria-hidden="true">
              <div className="section-title-row">
                <button className="row-btn" onClick={() => setShowMethod((s) => !s)}>
                  {showMethod ? "▾" : "▸"} [HYPOTHESES]
                </button>
                <InfoTip title="How hypotheses are generated">
                  A category router checks documented stop reasons and authoritative sources first. Candidate explanations must have trial-specific support, pass expected-evidence checks, survive contradiction review, and avoid duplicate source counting. Facts, interpretations, and hypotheses remain separate. Unsupported generic explanations are rejected.
                </InfoTip>
              </div>
            <div className="section-subcopy">Ordered by evidence quality, not certainty.</div>
              {showMethod && (
                <div className="hypothesis-stack">
                  {data.hypotheses.map((hypothesis, index) => {
                    const tierKey =
                      hypothesis.evidenceStrength === "DIRECTLY DOCUMENTED"
                        ? "fact"
                        : hypothesis.evidenceStrength === "STRONG PUBLIC EVIDENCE" || hypothesis.evidenceStrength === "MODERATE PUBLIC EVIDENCE"
                          ? "inference"
                          : "hypothesis";
                    const tier = TIERS[tierKey];
                    const isOpen = expanded[hypothesis.id] ?? index === 0;
                    return (
                      <div key={hypothesis.id} className="hypothesis-card">
                        <button
                          className="hypothesis-trigger"
                          onClick={() => setExpanded((stateMap) => ({ ...stateMap, [hypothesis.id]: !isOpen }))}
                        >
                          <div className="hypothesis-heading">
                            <span className="mono hypothesis-index">H{index + 1}</span>
                            <div>
                              <div className="hypothesis-title">{hypothesis.label}</div>
                              <div className="hypothesis-claim">{hypothesis.statement}</div>
                            </div>
                          </div>
                          <div className="hypothesis-meta">
                            <span className="mono tier-chip" style={{ color: tier.color, borderColor: `${tier.color}66` }}>
                              {tier.label}
                            </span>
                            <span className={`badge badge-${strengthTone(hypothesis.evidenceStrength)}`}>
                              {strengthLabel(hypothesis.evidenceStrength)}
                            </span>
                            <span className="toggle-mark">{isOpen ? "▾" : "▸"}</span>
                          </div>
                        </button>

                        {isOpen ? (
                          <div className="hypothesis-body">
                            <div className="evidence-label-row">
                              <span className="mono label-text">EVIDENCE</span>
                            </div>
                            {hypothesis.evidence.map((item, evidenceIndex) => (
                              <div key={`${hypothesis.id}-${evidenceIndex}`} className="evidence-row">
                                <Tag kind={item.category} />
                                <div className="evidence-copy">
                                  <div className="evidence-source">{item.sourceType}</div>
                                  <div className="evidence-text">{item.claim}</div>
                                </div>
                              </div>
                            ))}
                            <div className="evidence-row counter-row">
                              <span className="mono counter-chip">COUNTER</span>
                              <div className="evidence-copy">{hypothesis.counterevidence[0]?.claim ?? "No strong counterevidence surfaced in the public record."}</div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <ExpertSection id="sources" title="WHERE THE EVIDENCE CAME FROM" help="A source is marked searched only when its retrieval operation completed. Raw documents that repeat the same upstream announcement share one canonical provenance group and count once for corroboration.">
              <div className="coverage-summary"><strong>{data.provenanceSummary?.independentSourceGroupsUsed ?? 0}</strong><span>independent source groups used</span><strong>{data.provenanceSummary?.rawDocumentsUsed ?? 0}</strong><span>raw documents used</span></div>
              <div className="matrix-scroll">
                <table className="evidence-matrix coverage-table">
                  <thead><tr><th>Source</th><th>Status</th><th>Found</th><th>Used</th><th>Latest</th></tr></thead>
                  <tbody>{data.sourceCoverage?.map((source) => {
                    const status = !source.applicable ? "Not applicable" : source.searchCompleted ? "Searched" : source.searchAttempted ? "Unavailable" : "Not searched";
                    return <tr key={source.sourceType}><td className="matrix-category">{source.sourceType.replaceAll("_", " ")}</td><td>{status}</td><td>{source.searchCompleted ? source.recordsFound : "—"}</td><td>{source.searchCompleted ? source.relevantRecordsUsed : "—"}</td><td>{source.newestSourceDate ? formatDate(source.newestSourceDate) : "—"}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="source-columns evidence-source-columns">
                    <div>
                      <div className="mono source-heading">RELATED TRIALS</div>
                      {data.relatedTrials.length > 0 ? data.relatedTrials.map((trial) => (
                        <div key={trial.nctId} className="source-row">
                          <span className="source-mark">↗</span>
                          <div>
                            <a className="src-link" href={trial.url} target="_blank" rel="noreferrer">{trial.title}</a>
                            <div className="mono source-meta">{trial.nctId} · {trial.status}</div>
                          </div>
                        </div>
                      )) : <div className="muted-copy">No related trials found.</div>}
                    </div>
                    <div>
                      <div className="mono source-heading">PUBLICATIONS</div>
                      {data.publications.length > 0 ? data.publications.map((publication) => (
                        <div key={publication.pmid} className="source-row">
                          <span className="source-mark">↗</span>
                          <div>
                            <a className="src-link" href={publication.url} target="_blank" rel="noreferrer">{publication.title}</a>
                            <div className="mono source-meta">{publication.journal} · {publication.year} · PMID {publication.pmid}</div>
                          </div>
                        </div>
                      )) : <div className="muted-copy">No PubMed record surfaced for this trial yet.</div>}
                    </div>
              </div>
            </ExpertSection>

            <ExpertSection id="audit-trail" title="AUDIT TRAIL" help="These details are useful when a user wants to inspect the underlying registry row and the generation method, but they are not the first thing the page should ask them to read.">
              <div className="audit-trail-grid">
                <div className="audit-mini-card">
                  <div className="mono audit-mini-label">CURRENT REGISTRY RECORD</div>
                  <div className="detail-grid">
                    <div><span>Condition</span><strong>{data.overview.condition.join(", ") || "Not reported"}</strong></div>
                    <div><span>Intervention</span><strong>{data.overview.intervention.join(", ") || "Not reported"}</strong></div>
                    <div><span>Sponsor</span><strong>{data.overview.sponsor}</strong></div>
                    <div><span>Status</span><strong>{data.overview.status}</strong></div>
                    <div><span>Start date</span><strong>{formatDate(data.overview.startDate)} {data.overview.startDateType ? `(${data.overview.startDateType})` : ""}</strong></div>
                    <div><span>Completion date</span><strong>{formatDate(data.overview.completionDate)} {data.overview.completionDateType ? `(${data.overview.completionDateType})` : ""}</strong></div>
                  </div>
                </div>
                <div className="audit-mini-card">
                  <div className="mono audit-mini-label">HOW THIS WAS GENERATED</div>
                  <div className="method-copy">The temporal agent compares ClinicalTrials.gov record versions and creates a deterministic event sequence. The evidence agent maps the trial to its asset and program and checks registry, PubMed, SEC, FDA, and relevant EU identifiers. The evidence judge deduplicates repeated announcements, runs category-specific expected-evidence tests, and suppresses any hypothesis without trial-specific support.</div>
                </div>
              </div>
            </ExpertSection>
          </div>
        ) : null}

        <div className="footer-note mono">ONE ID IS ENOUGH · NO ACCOUNT, NO UPLOAD</div>
      </div>
    </div>
  );
}
