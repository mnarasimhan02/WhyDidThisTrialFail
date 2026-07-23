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

function classForConfidence(value: string) {
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

export default function Home() {
  const [nctId, setNctId] = useState("NCT01234567");
  const [state, setState] = useState<ApiState>({ status: "idle" });

  const exampleLabel = useMemo(
    () => starterExamples.join(" · "),
    [],
  );

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
      const payload = (await response.json()) as
        | InvestigationResponse
        | { error?: string };
      const isErrorPayload = "error" in payload && typeof payload.error === "string";

      if (!response.ok || isErrorPayload) {
        const message = isErrorPayload && payload.error
          ? payload.error
          : "The investigation service could not complete this request.";
        throw new Error(message);
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
    <main className="page-shell">
      <section className="hero">
        <div className="badge-row">
          <span className="eyebrow">Public-source trial investigation</span>
          <span className="status-chip">No uploads required</span>
        </div>

        <div className="hero-copy">
          <div className="hero-text">
            <h1>WhyDidThisTrialFail</h1>
            <p className="lede">
              Paste one NCT ID and get a source-backed investigation of the public
              record, the most plausible failure hypotheses, and the evidence behind
              each one.
            </p>
            <p className="sublede">
              Example IDs to try: {exampleLabel}
            </p>
          </div>

          <div className="input-card" aria-label="Trial search">
            <label htmlFor="nctId">NCT ID</label>
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
              One ID is enough. The app automatically checks ClinicalTrials.gov,
              PubMed, and registry-derived trial context.
            </p>
          </div>
        </div>
      </section>

      <section className="status-band">
        <div>
          <div className="label">Investigation status</div>
          <div className={`status ${state.status === "error" ? "status-error" : ""}`}>
            {state.status === "idle" && "Ready"}
            {state.status === "loading" && "Gathering public sources and ranking hypotheses..."}
            {state.status === "error" && state.message}
            {state.status === "success" && `Investigation complete for ${state.data.nctId}.`}
          </div>
        </div>
        <div>
          <div className="label">Guardrail</div>
          <div className="status subtle">
            The app labels facts, inferences, and hypotheses separately so it does
            not overstate causality.
          </div>
        </div>
      </section>

      {state.status === "success" ? (
        <section className="results">
          <article className="summary-card">
            <div className="summary-top">
              <div>
                <div className="label">Bottom line</div>
                <h2>{state.data.overview.title}</h2>
              </div>
              <div className="badge-stack">
                <span className={`score score-${state.data.verdict}`}>
                  Likelihood: {state.data.verdict}
                </span>
                <span className="score score-muted">{state.data.overview.phase}</span>
                {state.data.sourceTimestamp ? (
                  <span className="score score-muted">
                    Data current as of {formatDate(state.data.sourceTimestamp)}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="summary-text">{state.data.bottomLine}</p>
          </article>

          <div className="grid-two">
            <article className="panel">
              <div className="panel-head">
                <h3>Trial overview</h3>
                <p>NCT {state.data.nctId}</p>
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
                  <dd>
                    {state.data.overview.locationsCount?.toLocaleString("en-US") ?? "Not reported"}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h3>Timeline</h3>
                <p>Public lifecycle events</p>
              </div>
              <div className="stack">
                {state.data.timeline.map((item) => (
                  <div className="stack-item" key={`${item.date}-${item.event}`}>
                    <div className="meta">
                      {formatDate(item.date)} · {item.source}
                    </div>
                    <div>{item.event}</div>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="panel">
            <div className="panel-head">
              <h3>Failure hypotheses</h3>
              <p>Ranked by evidence quality, not by certainty</p>
            </div>
            <div className="stack">
              {state.data.hypotheses.map((hypothesis) => (
                <section className="stack-item hypothesis" key={hypothesis.id}>
                  <div className="hypothesis-head">
                    <h4>{hypothesis.label}</h4>
                    <span className={classForConfidence(hypothesis.confidence)}>
                      {hypothesis.confidence} confidence
                    </span>
                  </div>
                  <p className="hypothesis-statement">{hypothesis.statement}</p>
                  <p className="hypothesis-why">{hypothesis.whyItMatters}</p>

                  {hypothesis.evidence.length > 0 ? (
                    <div className="evidence-grid">
                      {hypothesis.evidence.map((item, index) => (
                        <div className="evidence-card" key={`${hypothesis.id}-e-${index}`}>
                          <div className="meta">
                            {item.sourceType} · {item.citation}
                          </div>
                          <div>{item.claim}</div>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            Open supporting source
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {hypothesis.counterevidence.length > 0 ? (
                    <div className="counter-block">
                      <div className="meta">Counterevidence</div>
                      <div className="evidence-grid">
                        {hypothesis.counterevidence.map((item, index) => (
                          <div className="evidence-card evidence-card-muted" key={`${hypothesis.id}-c-${index}`}>
                            <div>{item.citation}</div>
                            <div>{item.claim}</div>
                            <a href={item.url} target="_blank" rel="noreferrer">
                              Open source
                            </a>
                          </div>
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
              <div className="panel-head">
                <h3>Related trials</h3>
                <p>Similar programs and comparator context</p>
              </div>
              <div className="stack">
                {state.data.relatedTrials.length > 0 ? (
                  state.data.relatedTrials.map((trial) => (
                    <div className="stack-item" key={trial.nctId}>
                      <div className="meta">{trial.nctId}</div>
                      <div className="related-title">{trial.title}</div>
                      <p>{trial.relevance}</p>
                      <div className="meta">{trial.status}</div>
                      <a href={trial.url} target="_blank" rel="noreferrer">
                        Open source
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="stack-item">No public similar trials were found.</div>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h3>Public publications</h3>
                <p>Linked from PubMed</p>
              </div>
              <div className="stack">
                {state.data.publications.length > 0 ? (
                  state.data.publications.map((publication) => (
                    <div className="stack-item" key={publication.pmid}>
                      <div className="meta">
                        {publication.year} · {publication.journal} · PMID {publication.pmid}
                      </div>
                      <div className="pub-title">{publication.title}</div>
                      {publication.abstract ? <p>{publication.abstract}</p> : null}
                      <a href={publication.url} target="_blank" rel="noreferrer">
                        Open PubMed
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="stack-item">No PubMed record surfaced for this trial yet.</div>
                )}
              </div>
            </article>
          </div>

          <div className="grid-two">
            <article className="panel">
              <div className="panel-head">
                <h3>Evidence model</h3>
                <p>How the app classifies claims</p>
              </div>
              <div className="metrics">
                <div>
                  <strong>{state.data.evidenceModel.directFacts}</strong>
                  <span>Direct facts</span>
                </div>
                <div>
                  <strong>{state.data.evidenceModel.derivedFacts}</strong>
                  <span>Derived facts</span>
                </div>
                <div>
                  <strong>{state.data.evidenceModel.inferences}</strong>
                  <span>Inferences</span>
                </div>
                <div>
                  <strong>{state.data.evidenceModel.unsupportedClaims}</strong>
                  <span>Rejected claims</span>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h3>3-step agent flow</h3>
                <p>Research, reasoning, then judge</p>
              </div>
              <div className="stack">
                {state.data.workflow.map((step) => (
                  <div className="stack-item" key={step.name}>
                    <div className="meta">{step.name}</div>
                    <div>{step.summary}</div>
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
              <div className="panel-head">
                <h3>What is uncertain</h3>
                <p>The app says this plainly</p>
              </div>
              <ul className="bullet-list">
                {state.data.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-head">
                <h3>Source map</h3>
                <p>What the app checked automatically</p>
              </div>
              <div className="source-grid">
                {state.data.sources.map((source) => (
                  <div className="stack-item" key={source.name}>
                    <div className="related-title">{source.name}</div>
                    <p>{source.detail}</p>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : (
        <section className="results placeholder">
          <article className="panel">
            <h3>What you’ll get</h3>
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
