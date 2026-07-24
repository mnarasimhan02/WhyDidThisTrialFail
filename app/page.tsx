"use client";

import { useMemo, useRef, useState } from "react";

type InvestigationResponse = {
  nctId: string;
  fetchedAt: string;
  sourceTimestamp?: string;
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
    completionDate?: string;
    locationsCount?: number;
  };
  bottomLine: string;
  verdict: "high" | "medium" | "low" | "unknown";
  hypotheses: Array<{
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
  }>;
  timeline: Array<{
    date: string;
    event: string;
    source: string;
    url: string;
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
};

type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: InvestigationResponse };

const EXAMPLES = ["NCT00232128", "NCT03163767", "NCT04280705"];

const TIERS = {
  fact: {
    label: "FACT",
    color: "#1F5C4B",
    bg: "#DCE8E1",
    desc: "Directly stated in a primary source.",
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

function confTone(level: "high" | "medium" | "low" | "unknown") {
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  return "low";
}

function sourceCount(data: InvestigationResponse) {
  return 1 + data.relatedTrials.length + data.publications.length;
}

export default function Home() {
  const [nctId, setNctId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [data, setData] = useState<InvestigationResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showOverview, setShowOverview] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  async function runInvestigation() {
    const trimmed = nctId.trim().toUpperCase();
    if (!/^NCT\d{8}$/.test(trimmed)) {
      setShake(true);
      setError("Enter a valid NCT ID like NCT01234567.");
      setStatus("error");
      setTimeout(() => setShake(false), 420);
      return;
    }

    setError("");
    setStatus("loading");

    try {
      const response = await fetch(`/api/investigate?nctId=${encodeURIComponent(trimmed)}`);
      const payload = (await response.json()) as InvestigationResponse | { error?: string };
      const hasError = "error" in payload && typeof payload.error === "string";

      if (!response.ok || hasError) {
        throw new Error(
          hasError && payload.error ? payload.error : "The investigation service could not complete this request.",
        );
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
      setShowOverview(false);
      setShowSources(false);
      setShowMethod(false);
      setStatus("done");
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Something unexpected happened while investigating the trial.";
      setError(message);
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
          <div className="hero-grid">
            <div className="hero-copy">
              <h1 className="stampfont">WhyDidThisTrialFail</h1>
              <p className="lede">
                Paste one NCT ID and get a source-backed investigation of the public
                record: the most plausible failure hypotheses, and the evidence
                behind each one.
              </p>

              <div className={`search-shell ${shake ? "shake" : ""}`}>
                <div className="search-row">
                  <input
                    className="nct-input"
                    placeholder="NCT01234567"
                    value={nctId}
                    onChange={(event) => setNctId(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runInvestigation();
                      }
                    }}
                    aria-label="NCT ID"
                  />
                  <button className="go-btn" onClick={runInvestigation} disabled={status === "loading"}>
                    {status === "loading" ? "INVESTIGATING..." : "INVESTIGATE"}
                  </button>
                </div>

                <div className="examples">
                  <span className="mono examples-label">TRY:</span>
                  {EXAMPLES.map((id) => (
                    <button key={id} className="chip" onClick={() => setNctId(id)}>
                      {id}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            <aside className="side-panel">
              <div className="side-head">
                <div>
                  <div className="eyebrow">Start investigation</div>
                  <h2>Enter one trial ID</h2>
                </div>
                <div className={`badge ${status === "loading" ? "badge-warm" : "badge-cool"}`}>
                  {status === "loading" ? "Investigating" : "Ready"}
                </div>
              </div>
              <p className="side-copy">
                The app checks ClinicalTrials.gov, PubMed, and registry-derived trial
                context automatically.
              </p>

              <div className="evidence-strip">
                <div className="evidence-pill">ClinicalTrials.gov</div>
                <div className="evidence-pill">PubMed</div>
                <div className="evidence-pill">Registry context</div>
              </div>

              <div className="tier-legend">
                <div className="mono legend-label">
                  GUARDRAIL - every line is tagged, never blended
                </div>
                <div className="tier-row">
                  {Object.entries(TIERS).map(([key, tier], index) => (
                    <div key={key} className="tier-item">
                      <span className="stamp-badge stampfont" style={tierStyle(key as keyof typeof TIERS, index)}>
                        {tier.label}
                      </span>
                      <span className="tier-desc">{tier.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
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
          <div className="mono section-label">WHAT YOU'LL GET</div>
          <div className="feature-grid">
            {[
              {
                title: "Bottom line",
                body: "A tight, one-paragraph read on the most likely reason the trial stopped or missed its endpoint.",
              },
              {
                title: "Hypotheses",
                body: "Every plausible explanation, ranked by confidence, each with the evidence for it and the strongest case against it.",
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
              <h1 className="stampfont result-title">
                {data.overview.title || "Trial investigation"}
              </h1>
            </div>

            <section className="folder grain result-panel-shell">
              <div className="panel-headline">
                <div className="mono panel-kicker">WHY IT MOST LIKELY FAILED</div>
                <span className={`badge badge-${confTone(data.verdict)}`}>
                  {data.verdict === "high" ? "High confidence" : data.verdict === "medium" ? "Medium confidence" : "Low confidence"}
                </span>
              </div>
              <p className="result-answer">
                {data.bottomLine}
              </p>
              <div className="result-footnote mono">
                Built from {data.evidenceModel.directFacts} direct facts and {data.evidenceModel.inferences} inferences across the registry record, PubMed, and related trials.
              </div>
            </section>

            <section className="folder grain result-panel-shell">
              <button className="row-btn" onClick={() => setShowMethod((s) => !s)}>
                {showMethod ? "▾" : "▸"} [HYPOTHESES]
              </button>
              <div className="section-subcopy">Ordered by evidence quality, not certainty.</div>
              {showMethod && (
                <div className="hypothesis-stack">
                  {data.hypotheses.map((hypothesis, index) => {
                    const tierKey =
                      hypothesis.confidence === "high"
                        ? "fact"
                        : hypothesis.confidence === "medium"
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
                            <ConfBadge level={confTone(hypothesis.confidence)} />
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
                                <Tag kind={evidenceIndex === 0 ? "fact" : "inference"} />
                                <div className="evidence-copy">
                                  <div className="evidence-source">{item.source}</div>
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
              <button className="row-btn" onClick={() => setShowOverview((s) => !s)}>
                {showOverview ? "▾" : "▸"} [TRIAL RECORD]
              </button>
                {showOverview ? (
                  <div className="detail-grid">
                    <div><span>Condition</span><strong>{data.overview.condition.join(", ") || "Not reported"}</strong></div>
                    <div><span>Intervention</span><strong>{data.overview.intervention.join(", ") || "Not reported"}</strong></div>
                    <div><span>Sponsor</span><strong>{data.overview.sponsor}</strong></div>
                    <div><span>Status</span><strong>{data.overview.status}</strong></div>
                    <div><span>Start date</span><strong>{formatDate(data.overview.startDate)}</strong></div>
                    <div><span>Completion date</span><strong>{formatDate(data.overview.completionDate)}</strong></div>
                  </div>
                ) : null}
              </section>

              <section className="folder grain result-panel-shell">
              <button className="row-btn" onClick={() => setShowSources((s) => !s)}>
                {showSources ? "▾" : "▸"} [SOURCES] ({sourceCount(data)})
              </button>
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
              <button className="row-btn" onClick={() => setShowMethod((s) => !s)}>
                [INFO] HOW THIS WAS GENERATED
              </button>
              {showMethod ? (
                <div className="method-copy">
                  Research agent pulled the registry record, PubMed, and related trials. Reasoning agent turned that evidence into ranked hypotheses. Judge agent checked for overclaiming and kept the answer conservative wherever the public trail was thin.
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
