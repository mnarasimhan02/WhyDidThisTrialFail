"use client";

import { useMemo, useRef, useState } from "react";

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
  programOutcome?: { classification: string; statement: string };
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
  }>;
  evidenceMatrix?: Array<{
    category: string;
    claimKind: string;
    evidenceStrength: InvestigationResponse["verdict"];
    directSupport: number;
    indirectSupport: number;
    contradictions: number;
    missingExpectedEvidence: number;
    sourceFamilies: number;
  }>;
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
      <summary aria-label={`About ${title}`} title={`About ${title}`}>i</summary>
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

function sourceCount(data: InvestigationResponse) {
  return 1 + data.relatedTrials.length + data.publications.length;
}

export default function Home() {
  const [nctId, setNctId] = useState(EXAMPLES[0]);
  const [searchText, setSearchText] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [data, setData] = useState<InvestigationResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showOverview, setShowOverview] = useState(true);
  const [showSources, setShowSources] = useState(true);
  const [showMethod, setShowMethod] = useState(true);
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
      setShowOverview(true);
      setShowSources(true);
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
              Paste one NCT ID and get a source-backed investigation of the public
              record: the most plausible failure hypotheses, and the evidence
              behind each one.
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

        <section className="status-band">
          <div className="status-card">
            <div className="mono status-label">Investigation status</div>
            <div className={`status-text ${status === "error" ? "status-error" : ""}`}>
              {status === "idle" && "Ready"}
              {status === "loading" && "Checking sources..."}
              {status === "error" && error}
              {status === "done" && `Complete for ${data?.nctId ?? nctId ?? "this trial"}.`}
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
                title: "Bottom line",
                body: "A tight, one-paragraph read on the most likely reason the trial stopped or missed its endpoint.",
              },
              {
                title: "Hypotheses",
                body: "Every plausible explanation, ranked by evidence strength, each with the evidence for it and the strongest case against it.",
              },
              {
                title: "Evidence",
                body: "Direct links back to ClinicalTrials.gov records, PubMed abstracts, and other public registry context.",
              },
              {
                title: "Guardrails",
                body: "Fact, inference, and hypothesis are labeled separately, so you always know how much weight to put on a line.",
              },
            ].map((item) => (
              <article className="feature-card" key={item.title}>
                <div className="stampfont feature-title">{item.title}</div>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

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

            <section className="folder grain result-panel-shell">
              <div className="panel-headline">
                <div className="mono panel-kicker">WHY IT MOST LIKELY FAILED</div>
                <div className="panel-actions">
                  <span className={`badge badge-${strengthTone(data.verdict)}`}>
                    {strengthLabel(data.verdict)}
                  </span>
                  <InfoTip title="Bottom-line finding">
                    The app first verifies that a negative trial event occurred, then selects only explanations supported by trial-specific evidence. The label describes evidence strength, not a probability. If no explanation clears the threshold, the report says insufficient evidence.
                  </InfoTip>
                </div>
              </div>
              <p className="result-answer">
                {data.bottomLine}
              </p>
              <div className="result-footnote mono">
                Built from {data.evidenceModel.directFacts} direct observations and {data.evidenceModel.derivedFacts} temporal comparisons. Missing evidence is reported as not found, never as proof of absence.
              </div>
            </section>

            <section className="folder grain result-panel-shell outcome-section">
              <div className="section-title-row">
                <div className="mono panel-kicker">TRIAL ≠ PROGRAM</div>
                <InfoTip title="Trial versus program">
                  Trial outcome describes this NCT record. Program outcome looks across the asset, sponsor, indication, related trials, and sponsor disclosures. A stopped trial does not automatically mean the entire drug program failed.
                </InfoTip>
              </div>
              <div className="outcome-grid">
                <article>
                  <div className="mono outcome-label">TRIAL OUTCOME</div>
                  <strong>{data.trialOutcome?.classification ?? data.overview.status}</strong>
                  <p>{data.trialOutcome?.statement ?? "The registry record describes the individual trial outcome."}</p>
                </article>
                <article>
                  <div className="mono outcome-label">ASSET / PROGRAM OUTCOME</div>
                  <strong>{data.programOutcome?.classification ?? "not established"}</strong>
                  <p>{data.programOutcome?.statement ?? "The broader program outcome was not established."}</p>
                </article>
              </div>
            </section>

            <section className="folder grain result-panel-shell">
              <div className="panel-headline evidence-heading">
                <div>
                  <div className="mono panel-kicker">TEMPORAL RECORD</div>
                  <div className="section-subcopy">Sequence is shown for context and is not treated as causal proof.</div>
                </div>
                <InfoTip title="Temporal record">
                  This deterministic timeline combines registry versions, status changes, study dates, and publications. It establishes what happened and when. Timing alone is never treated as proof that one event caused another.
                </InfoTip>
              </div>
              <div className="timeline-list">
                {data.timeline.map((item, index) => (
                  <a className="timeline-item" href={item.url} target="_blank" rel="noreferrer" key={`${item.date}-${index}`}>
                    <span className="timeline-dot" />
                    <span className="mono timeline-date">{formatDate(item.date)}</span>
                    <span className="timeline-copy">{item.event}</span>
                    <span className="mono timeline-scope">{item.scope ?? "trial"}</span>
                  </a>
                ))}
              </div>
            </section>

            <section className="folder grain result-panel-shell">
              <div className="section-title-row">
                <div className="mono panel-kicker">EVIDENCE MATRIX</div>
                <InfoTip title="Evidence matrix">
                  Each row is a possible failure category. “Direct” is explicit trial-specific support; “Indirect” is relevant association; “Against” is contradictory evidence; and “Expected not found” counts category-specific evidence the system looked for but did not retrieve. Evidence strength also considers source authority, trial specificity, independent corroboration, and timing. The label is not a probability.
                </InfoTip>
              </div>
              <div className="section-subcopy">Only trial-specific candidates are shown. Repeated coverage of one announcement counts once.</div>
              {data.evidenceMatrix?.length ? (
                <div className="matrix-scroll">
                  <table className="evidence-matrix">
                    <thead><tr><th>Candidate</th><th>Claim level</th><th>Evidence</th><th>Direct</th><th>Indirect</th><th>Against</th><th>Expected not found</th></tr></thead>
                    <tbody>
                      {data.evidenceMatrix.map((row) => (
                        <tr key={row.category}>
                          <td className="matrix-category">{row.category}</td>
                          <td>{row.claimKind}</td>
                          <td><span className={`badge badge-${strengthTone(row.evidenceStrength)}`}>{strengthLabel(row.evidenceStrength)}</span></td>
                          <td>{row.directSupport}</td><td>{row.indirectSupport}</td><td>{row.contradictions}</td><td>{row.missingExpectedEvidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted-copy">No trial-specific causal hypothesis met the evidence threshold.</p>}
            </section>

            <section className="folder grain result-panel-shell">
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

            <div className="result-grid">
              <section className="folder grain result-panel-shell">
                <div className="section-title-row">
                  <button className="row-btn" onClick={() => setShowOverview((s) => !s)}>
                    {showOverview ? "▾" : "▸"} [TRIAL RECORD]
                  </button>
                  <InfoTip title="Trial record">
                    These fields come from the current ClinicalTrials.gov record. Dates retain their reported ACTUAL or ESTIMATED qualifier; UNKNOWN means the registry did not provide one.
                  </InfoTip>
                </div>
                {showOverview ? (
                  <div className="detail-grid">
                    <div><span>Condition</span><strong>{data.overview.condition.join(", ") || "Not reported"}</strong></div>
                    <div><span>Intervention</span><strong>{data.overview.intervention.join(", ") || "Not reported"}</strong></div>
                    <div><span>Sponsor</span><strong>{data.overview.sponsor}</strong></div>
                    <div><span>Status</span><strong>{data.overview.status}</strong></div>
                    <div><span>Start date</span><strong>{formatDate(data.overview.startDate)} {data.overview.startDateType ? `(${data.overview.startDateType})` : ""}</strong></div>
                    <div><span>Completion date</span><strong>{formatDate(data.overview.completionDate)} {data.overview.completionDateType ? `(${data.overview.completionDateType})` : ""}</strong></div>
                  </div>
                ) : null}
              </section>

              <section className="folder grain result-panel-shell">
                <div className="section-title-row">
                  <button className="row-btn" onClick={() => setShowSources((s) => !s)}>
                    {showSources ? "▾" : "▸"} [SOURCES] ({sourceCount(data)})
                  </button>
                  <InfoTip title="Sources">
                    Sources are linked for verification and prioritized by authority: registry and documented sponsor or regulator records before publications and contextual trials. Articles repeating the same underlying announcement count as one source family, not independent corroboration.
                  </InfoTip>
                </div>
                {showSources ? (
                  <div className="source-columns">
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
                ) : null}
              </section>
            </div>

            <section className="folder grain result-panel-shell">
              <div className="section-title-row">
                <button className="row-btn" onClick={() => setShowMethod((s) => !s)}>
                  [INFO] HOW THIS WAS GENERATED
                </button>
                <InfoTip title="Three-step investigation">
                  The temporal agent reconstructs the record, the evidence agent maps and retrieves trial and program sources, and the evidence judge scores support, contradictions, specificity, authority, corroboration, and temporal relevance before allowing a conclusion.
                </InfoTip>
              </div>
              {showMethod ? (
                <div className="method-copy">
                  First, the temporal agent compares ClinicalTrials.gov record versions and creates a deterministic event sequence. Next, the evidence agent maps the trial to its asset and program and checks registry, PubMed, SEC, FDA, and relevant EU identifiers. Finally, the judge deduplicates repeated announcements, runs category-specific expected-evidence tests, and suppresses any hypothesis without trial-specific support.
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        <div className="footer-note mono">ONE ID IS ENOUGH · NO ACCOUNT, NO UPLOAD</div>
      </div>
    </div>
  );
}
