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

const EXAMPLES = ["NCT01234567", "NCT03163767", "NCT04280705"];

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

export default function Home() {
  const [nctId, setNctId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [data, setData] = useState<InvestigationResponse | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const exampleLabel = useMemo(() => EXAMPLES.join(" · "), []);

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

              <p className="supporting">
                Example IDs to try: <span>{exampleLabel}</span>
              </p>
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
          <section ref={resultRef} className="folder grain result-file">
            <div className="result-top">
              <div className="mono result-label">CASE FILE - {data.nctId}</div>
              <div className="result-stamp stampfont">
                SAMPLE OUTPUT · ILLUSTRATIVE, NOT LIVE DATA
              </div>
            </div>

            <div className="result-summary">
              <div className="stampfont result-heading">Bottom line</div>
              <p>{data.bottomLine}</p>
            </div>

            <hr className="dotted-rule" />

            <div className="result-columns">
              <div className="result-panel">
                <div className="stampfont result-heading">Trial overview</div>
                <dl className="overview-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>{data.overview.status}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{data.overview.phase}</dd>
                  </div>
                  <div>
                    <dt>Condition</dt>
                    <dd>{data.overview.condition.join(", ") || "Not reported"}</dd>
                  </div>
                  <div>
                    <dt>Intervention</dt>
                    <dd>{data.overview.intervention.join(", ") || "Not reported"}</dd>
                  </div>
                  <div>
                    <dt>Sponsor</dt>
                    <dd>{data.overview.sponsor}</dd>
                  </div>
                  <div>
                    <dt>Target / pathway</dt>
                    <dd>{data.overview.target}</dd>
                  </div>
                  <div>
                    <dt>Start date</dt>
                    <dd>{formatDate(data.overview.startDate)}</dd>
                  </div>
                  <div>
                    <dt>Completion date</dt>
                    <dd>{formatDate(data.overview.completionDate)}</dd>
                  </div>
                </dl>
              </div>

              <div className="result-panel">
                <div className="stampfont result-heading">Timeline</div>
                <div className="timeline-list">
                  {data.timeline.map((item) => (
                    <a key={`${item.date}-${item.event}`} className="timeline-row" href={item.url} target="_blank" rel="noreferrer">
                      <span className="timeline-date">
                        {formatDate(item.date)} · {item.source}
                      </span>
                      <span>{item.event}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <hr className="dotted-rule" />

            <div className="stampfont result-heading">Hypotheses, ranked</div>
            <div className="hypothesis-list">
              {data.hypotheses.map((hypothesis, index) => {
                const tierKey = hypothesis.confidence === "high" ? "fact" : hypothesis.confidence === "medium" ? "inference" : "hypothesis";
                const tier = TIERS[tierKey];
                return (
                  <article key={hypothesis.id} className="hypothesis-row">
                    <div className="hypothesis-head">
                      <div className="hypothesis-meta">
                        <span className="mono row-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="row-title">{hypothesis.label}</span>
                        <span className="mono tier-tag" style={{ color: tier.color, background: tier.bg }}>
                          {tier.label}
                        </span>
                      </div>
                      <div className="confidence-wrap">
                        <div className="conf-track">
                          <div className="conf-fill" style={{ width: `${hypothesis.confidence === "high" ? 78 : hypothesis.confidence === "medium" ? 46 : 24}%`, background: tier.color }} />
                        </div>
                        <span className="mono confidence-label">{hypothesis.confidence}</span>
                      </div>
                    </div>

                    <p className="evidence-line">
                      <span className="mono evidence-label">EVIDENCE</span>
                      {hypothesis.evidence[0]?.claim ?? hypothesis.statement}
                    </p>
                    <p className="counter-line">
                      <span className="mono evidence-label">COUNTER</span>
                      {hypothesis.counterevidence[0]?.claim ?? "No strong counterevidence surfaced in the public record."}
                    </p>
                  </article>
                );
              })}
            </div>

            <hr className="dotted-rule" />

            <div className="sources-footer mono">
              SOURCES CHECKED - ClinicalTrials.gov study record · PubMed citation search · sponsor public filings.
              This sample was generated to preview the format; a real investigation pulls current data for the ID you enter.
            </div>
          </section>
        ) : null}

        <div className="footer-note mono">ONE ID IS ENOUGH · NO ACCOUNT, NO UPLOAD</div>
      </div>
    </div>
  );
}
