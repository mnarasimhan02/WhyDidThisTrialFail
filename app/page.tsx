"use client";

import { useMemo, useState } from "react";

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

const starterExamples = ["NCT01234567", "NCT03163767", "NCT04280705"];

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

function metricCard(value: string | number, label: string) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function sourceCard(name: string, detail: string, url: string) {
  return (
    <a className="source-card" href={url} target="_blank" rel="noreferrer">
      <span className="source-name">{name}</span>
      <p>{detail}</p>
      <span className="source-link">Open source</span>
    </a>
  );
}

export default function Home() {
  const [nctId, setNctId] = useState("NCT01234567");
  const [state, setState] = useState<ApiState>({ status: "idle" });

  const exampleLabel = useMemo(() => starterExamples.join(" · "), []);

  async function investigate() {
    const trimmed = nctId.trim().toUpperCase();
    if (!/^NCT\d{8}$/.test(trimmed)) {
      setState({
        status: "error",
        message: "Enter a valid NCT ID, for example NCT01234567.",
      });
      return;
    }

    setState({ status: "loading" });

    try {
      const response = await fetch(`/api/investigate?nctId=${encodeURIComponent(trimmed)}`);
      const payload = (await response.json()) as InvestigationResponse | { error?: string };
      const hasError = "error" in payload && typeof payload.error === "string";

      if (!response.ok || hasError) {
        throw new Error(
          hasError && payload.error ? payload.error : "The investigation service could not complete this request.",
        );
      }

      setState({ status: "success", data: payload as InvestigationResponse });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something unexpected happened while investigating the trial.";
      setState({ status: "error", message });
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow-row">
            <span className="eyebrow">Public-source trial intelligence</span>
            <span className="status-chip">No uploads required</span>
          </div>

          <h1>WhyDidThisTrialFail</h1>
          <p className="lede">
            Paste one NCT ID and get a source-backed investigation of the public
            record, the most plausible failure hypotheses, and the evidence behind
            each one.
          </p>
          <p className="sublede">Example IDs to try: {exampleLabel}</p>

          <div className="hero-metrics">
            {metricCard("1", "NCT ID is enough")}
            {metricCard("3-step", "agent workflow")}
            {metricCard("Public", "source-first reasoning")}
          </div>
        </div>

        <aside className="hero-panel">
          <div className="hero-panel-top">
            <div>
              <span className="panel-kicker">Start investigation</span>
              <h2>Enter one NCT ID</h2>
            </div>
            <span className={`badge ${state.status === "loading" ? "badge-warm" : "badge-cool"}`}>
              {state.status === "loading" ? "Investigating" : "Ready"}
            </span>
          </div>

          <label className="field-label" htmlFor="nctId">
            NCT ID
          </label>
          <div className="input-row">
            <input
              id="nctId"
              value={nctId}
              onChange={(event) => setNctId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  investigate();
                }
              }}
              placeholder="NCT01234567"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={investigate} disabled={state.status === "loading"}>
              {state.status === "loading" ? "Investigating..." : "Investigate"}
            </button>
          </div>
          <p className="fineprint">
            The app checks ClinicalTrials.gov, PubMed, and registry-derived trial context automatically.
          </p>
        </aside>
      </section>

      <section className="status-strip">
        <div className="status-card">
          <span className="card-label">Investigation status</span>
          <strong className={state.status === "error" ? "status-error" : ""}>
            {state.status === "idle" && "Ready"}
            {state.status === "loading" && "Gathering public sources and ranking hypotheses..."}
            {state.status === "error" && state.message}
            {state.status === "success" && `Investigation complete for ${state.data.nctId}.`}
          </strong>
        </div>
        <div className="status-card subtle">
          <span className="card-label">Guardrail</span>
          <strong>
            Facts, derived facts, and hypotheses are labeled separately so the app does not overstate causality.
          </strong>
        </div>
      </section>

      {state.status === "success" ? (
        <section className="results">
          <article className="result-hero">
            <div className="result-hero-copy">
              <span className="card-label">Bottom line</span>
              <h2>{state.data.overview.title}</h2>
              <p>{state.data.bottomLine}</p>
            </div>

            <div className="result-badges">
              <span className={`badge verdict-${state.data.verdict}`}>
                Likelihood: {state.data.verdict}
              </span>
              <span className="badge badge-cool">{state.data.overview.phase}</span>
              {state.data.sourceTimestamp ? (
                <span className="badge badge-muted">
                  Data current as of {formatDate(state.data.sourceTimestamp)}
                </span>
              ) : null}
            </div>
          </article>

          <div className="grid-two">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">Trial overview</span>
                  <h3>NCT {state.data.nctId}</h3>
                </div>
              </div>
              <dl className="definition-grid">
                <div>
                  <dt>Status</dt>
                  <dd>{state.data.overview.status}</dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>{state.data.overview.condition.join(", ") || "Not reported"}</dd>
                </div>
                <div>
                  <dt>Intervention</dt>
                  <dd>{state.data.overview.intervention.join(", ") || "Not reported"}</dd>
                </div>
                <div>
                  <dt>Sponsor</dt>
                  <dd>{state.data.overview.sponsor}</dd>
                </div>
                <div>
                  <dt>Target / pathway</dt>
                  <dd>{state.data.overview.target}</dd>
                </div>
                <div>
                  <dt>Primary objective</dt>
                  <dd>{state.data.overview.primaryObjective}</dd>
                </div>
                <div>
                  <dt>Start date</dt>
                  <dd>{formatDate(state.data.overview.startDate)}</dd>
                </div>
                <div>
                  <dt>Completion date</dt>
                  <dd>{formatDate(state.data.overview.completionDate)}</dd>
                </div>
                <div>
                  <dt>Locations</dt>
                  <dd>{state.data.overview.locationsCount?.toLocaleString("en-US") ?? "Not reported"}</dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">Timeline</span>
                  <h3>Public lifecycle events</h3>
                </div>
              </div>
              <div className="stack">
                {state.data.timeline.map((item) => (
                  <a className="stack-item timeline-item" href={item.url} target="_blank" rel="noreferrer" key={`${item.date}-${item.event}`}>
                    <span className="meta">
                      {formatDate(item.date)} · {item.source}
                    </span>
                    <strong>{item.event}</strong>
                  </a>
                ))}
              </div>
            </article>
          </div>

          <article className="panel panel-wide">
            <div className="panel-header">
              <div>
                <span className="card-label">Failure hypotheses</span>
                <h3>Ranked by evidence quality, not certainty</h3>
              </div>
            </div>
            <div className="stack">
              {state.data.hypotheses.map((hypothesis) => (
                <section className="hypothesis-card" key={hypothesis.id}>
                  <div className="hypothesis-top">
                    <div>
                      <span className="meta">{hypothesis.id}</span>
                      <h4>{hypothesis.label}</h4>
                    </div>
                    <span className={confidenceClass(hypothesis.confidence)}>
                      {hypothesis.confidence} confidence
                    </span>
                  </div>
                  <p className="hypothesis-statement">{hypothesis.statement}</p>
                  <p className="hypothesis-why">{hypothesis.whyItMatters}</p>

                  {hypothesis.evidence.length > 0 ? (
                    <div className="evidence-grid">
                      {hypothesis.evidence.map((item, index) => (
                        <a className="evidence-card" key={`${hypothesis.id}-e-${index}`} href={item.url} target="_blank" rel="noreferrer">
                          <span className="meta">
                            {item.sourceType} · {item.citation}
                          </span>
                          <strong>{item.claim}</strong>
                          <span className="source-link">Open supporting source</span>
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {hypothesis.counterevidence.length > 0 ? (
                    <div className="counter-block">
                      <span className="meta">Counterevidence</span>
                      <div className="evidence-grid">
                        {hypothesis.counterevidence.map((item, index) => (
                          <a className="evidence-card evidence-card-muted" key={`${hypothesis.id}-c-${index}`} href={item.url} target="_blank" rel="noreferrer">
                            <span className="meta">{item.citation}</span>
                            <strong>{item.claim}</strong>
                            <span className="source-link">Open source</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </article>

          <div className="grid-two">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">Related trials</span>
                  <h3>Comparator context</h3>
                </div>
              </div>
              <div className="stack">
                {state.data.relatedTrials.length > 0 ? (
                  state.data.relatedTrials.map((trial) => (
                    <a className="stack-item trial-card" key={trial.nctId} href={trial.url} target="_blank" rel="noreferrer">
                      <span className="meta">{trial.nctId} · {trial.status}</span>
                      <strong className="title">{trial.title}</strong>
                      <p>{trial.relevance}</p>
                    </a>
                  ))
                ) : (
                  <div className="empty-card">No public similar trials were found.</div>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">Public publications</span>
                  <h3>Linked from PubMed</h3>
                </div>
              </div>
              <div className="stack">
                {state.data.publications.length > 0 ? (
                  state.data.publications.map((publication) => (
                    <a className="stack-item trial-card" key={publication.pmid} href={publication.url} target="_blank" rel="noreferrer">
                      <span className="meta">
                        {publication.year} · {publication.journal} · PMID {publication.pmid}
                      </span>
                      <strong className="title">{publication.title}</strong>
                      {publication.abstract ? <p>{publication.abstract}</p> : null}
                    </a>
                  ))
                ) : (
                  <div className="empty-card">No PubMed record surfaced for this trial yet.</div>
                )}
              </div>
            </article>
          </div>

          <div className="grid-two">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">Evidence model</span>
                  <h3>How the app classifies claims</h3>
                </div>
              </div>
              <div className="metrics">
                {metricCard(state.data.evidenceModel.directFacts, "Direct facts")}
                {metricCard(state.data.evidenceModel.derivedFacts, "Derived facts")}
                {metricCard(state.data.evidenceModel.inferences, "Inferences")}
                {metricCard(state.data.evidenceModel.unsupportedClaims, "Rejected claims")}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">3-step agent flow</span>
                  <h3>Research, reasoning, judge</h3>
                </div>
              </div>
              <div className="stack">
                {state.data.workflow.map((step) => (
                  <div className="stack-item workflow-card" key={step.name}>
                    <span className="meta">{step.name}</span>
                    <strong>{step.summary}</strong>
                    <div className="signal-list">
                      {step.signals.map((signal) => (
                        <span key={signal} className="signal-pill">
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="grid-two">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">What is uncertain</span>
                  <h3>The app stays explicit about limits</h3>
                </div>
              </div>
              <ul className="bullet-list">
                {state.data.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <span className="card-label">Source map</span>
                  <h3>Public sources checked automatically</h3>
                </div>
              </div>
              <div className="source-grid">
                {state.data.sources.map((source) => sourceCard(source.name, source.detail, source.url))}
              </div>
            </article>
          </div>
        </section>
      ) : (
        <section className="results placeholder">
          <article className="panel panel-wide">
            <div className="panel-header">
              <div>
                <span className="card-label">What you’ll get</span>
                <h3>Clear, source-first trial intelligence</h3>
              </div>
            </div>
            <div className="placeholder-grid">
              <div className="placeholder-card">
                <strong>Bottom line</strong>
                <p>A concise explanation of the most likely failure story.</p>
              </div>
              <div className="placeholder-card">
                <strong>Hypotheses</strong>
                <p>Ranked explanations with confidence and counterevidence.</p>
              </div>
              <div className="placeholder-card">
                <strong>Evidence</strong>
                <p>ClinicalTrials.gov, PubMed, and public context links.</p>
              </div>
              <div className="placeholder-card">
                <strong>Guardrails</strong>
                <p>Clear separation between fact, inference, and speculation.</p>
              </div>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
