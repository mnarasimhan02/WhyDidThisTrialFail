"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { EvalCase, EvalResult } from "../../../lib/evals";
import styles from "./evals.module.css";

type Fixture = {
  schemaVersion: number;
  datasetName: string;
  datasetVersion: string;
  sourceWorkbook: string;
  notes: string[];
  qualityChecks: {
    rowLevelCounts: { total: number; gold: number; silver: number };
    workbookSummaryCounts: { total: number; gold: number; silver: number };
    warnings: string[];
  };
  cases: EvalCase[];
};

type StatusFilter = "all" | "not-run" | "pass" | "fail";

export default function EvalDashboard({ fixture }: { fixture: Fixture }) {
  const [results, setResults] = useState<Record<string, EvalResult>>({});
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [verification, setVerification] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [message, setMessage] = useState("");
  const stopRequested = useRef(false);

  useEffect(() => {
    const savedResults = window.localStorage.getItem("wdtf-eval-results-v1");
    const savedToken = window.sessionStorage.getItem("wdtf-eval-token");
    queueMicrotask(() => {
      if (savedResults) setResults(JSON.parse(savedResults));
      if (savedToken) setToken(savedToken);
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem("wdtf-eval-results-v1", JSON.stringify(results));
  }, [results]);

  const filteredCases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return fixture.cases.filter((testCase) => {
      const result = results[testCase.evalId];
      const matchesQuery = !needle || [testCase.evalId, testCase.nctId, testCase.trialShortName, testCase.therapeuticArea, testCase.expectedPrimaryCategory]
        .some((value) => value.toLowerCase().includes(needle));
      const matchesVerification = verification === "all" || testCase.verificationLevel === verification;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "not-run" && !result)
        || (statusFilter === "pass" && result?.passed)
        || (statusFilter === "fail" && result && !result.passed);
      return matchesQuery && matchesVerification && matchesStatus;
    });
  }, [fixture.cases, query, results, statusFilter, verification]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      passed: values.filter((result) => result.passed).length,
      failed: values.filter((result) => !result.passed).length,
      notRun: fixture.cases.length - values.length,
      gold: fixture.cases.filter((item) => item.verificationLevel === "Gold").length,
    };
  }, [fixture.cases, results]);

  async function runCases(cases: EvalCase[]) {
    if (running || cases.length === 0) return;
    setRunning(true);
    setMessage("");
    stopRequested.current = false;
    setProgress({ completed: 0, total: cases.length });
    window.sessionStorage.setItem("wdtf-eval-token", token);

    let completed = 0;
    try {
      for (let index = 0; index < cases.length; index += 3) {
        if (stopRequested.current) break;
        const batch = cases.slice(index, index + 3);
        const response = await fetch("/api/admin/evals/run", {
          method: "POST",
          headers: { "content-type": "application/json", "x-eval-admin-token": token },
          body: JSON.stringify({ evalIds: batch.map((item) => item.evalId) }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Evaluation batch failed.");
        setResults((current) => {
          const next = { ...current };
          for (const result of payload.results as EvalResult[]) next[result.evalId] = result;
          return next;
        });
        completed += batch.length;
        setProgress({ completed, total: cases.length });
      }
      setMessage(stopRequested.current ? `Stopped after ${completed} cases.` : `Completed ${completed} cases.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evaluation run failed.");
    } finally {
      setRunning(false);
    }
  }

  function exportResults() {
    const payload = {
      datasetVersion: fixture.datasetVersion,
      exportedAt: new Date().toISOString(),
      summary,
      results: Object.values(results),
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.download = `wdtf-evals-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>← WhyDidThisTrialFail</Link>
          <p className={styles.eyebrow}>HIDDEN VALIDATION WORKSPACE</p>
          <h1>Clinical reasoning regression dashboard</h1>
          <p className={styles.lede}>Runs the production investigation pipeline against {fixture.cases.length} golden NCT cases. Results are stored in this browser and can be exported as JSON.</p>
        </div>
        <div className={styles.datasetCard}>
          <span>Dataset</span>
          <strong>v{fixture.datasetVersion}</strong>
          <small>{fixture.sourceWorkbook}</small>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Evaluation summary">
        <Metric label="Pass" value={summary.passed} tone="pass" />
        <Metric label="Fail" value={summary.failed} tone="fail" />
        <Metric label="Not run" value={summary.notRun} />
        <Metric label="Gold anchors" value={summary.gold} />
      </section>

      <section className={styles.notice}>
        <strong>Interpretation rule</strong>
        <span>Gold cases are regression anchors. Silver cases are evaluated automatically but remain flagged for live clinical review before being treated as immutable ground truth.</span>
      </section>

      {fixture.qualityChecks.warnings.map((warning) => (
        <section className={styles.qualityWarning} key={warning}>
          <strong>Dataset quality check</strong>
          <span>{warning} The row-level data contains {fixture.qualityChecks.rowLevelCounts.gold} Gold and {fixture.qualityChecks.rowLevelCounts.silver} Silver cases.</span>
        </section>
      ))}

      <section className={styles.controls}>
        <label className={styles.tokenField}>
          <span>Admin token</span>
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="EVAL_ADMIN_TOKEN" autoComplete="off" />
        </label>
        <div className={styles.actions}>
          <button onClick={() => runCases(filteredCases)} disabled={running || filteredCases.length === 0}>Run filtered ({filteredCases.length})</button>
          <button onClick={() => runCases(fixture.cases)} disabled={running}>Run all 100</button>
          {running ? <button className={styles.stop} onClick={() => { stopRequested.current = true; }}>Stop after batch</button> : null}
          <button className={styles.secondary} onClick={exportResults} disabled={Object.keys(results).length === 0}>Export results</button>
          <button className={styles.secondary} onClick={() => setResults({})} disabled={running || Object.keys(results).length === 0}>Clear</button>
        </div>
        {running || message ? (
          <div className={styles.progress}>
            <div style={{ width: progress.total ? `${(progress.completed / progress.total) * 100}%` : "0%" }} />
            <span>{running ? `Running ${progress.completed} of ${progress.total}` : message}</span>
          </div>
        ) : null}
      </section>

      <section className={styles.filters}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search NCT ID, trial, category, or therapeutic area" />
        <select value={verification} onChange={(event) => setVerification(event.target.value)} aria-label="Verification level">
          <option value="all">All verification levels</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="Run status">
          <option value="all">All run statuses</option>
          <option value="not-run">Not run</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
      </section>

      <section className={styles.tableShell}>
        <div className={styles.tableHeader}>
          <span>{filteredCases.length} cases</span>
          <span>Pass requires every applicable check</span>
        </div>
        <div className={styles.rows}>
          {filteredCases.map((testCase) => (
            <EvalRow key={testCase.evalId} testCase={testCase} result={results[testCase.evalId]} onRun={() => runCases([testCase])} running={running} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "pass" | "fail" }) {
  return <div className={`${styles.metric} ${tone ? styles[tone] : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function EvalRow({ testCase, result, onRun, running }: { testCase: EvalCase; result?: EvalResult; onRun: () => void; running: boolean }) {
  return (
    <details className={styles.row}>
      <summary>
        <span className={styles.evalId}>{testCase.evalId}</span>
        <span className={styles.trial}><strong>{testCase.nctId}</strong><small>{testCase.trialShortName}</small></span>
        <span className={styles.category}>{testCase.expectedPrimaryCategory.replaceAll("_", " ")}</span>
        <span className={`${styles.level} ${testCase.verificationLevel === "Gold" ? styles.gold : styles.silver}`}>{testCase.verificationLevel}</span>
        <span className={`${styles.status} ${result ? (result.passed ? styles.statusPass : styles.statusFail) : styles.statusIdle}`}>{result ? (result.passed ? "PASS" : "FAIL") : "NOT RUN"}</span>
        <span className={styles.chevron}>⌄</span>
      </summary>
      <div className={styles.rowBody}>
        <div className={styles.expectation}>
          <div><span>Expected state</span><strong>{testCase.expectedTrialState}</strong></div>
          <div><span>Hypotheses</span><strong>{testCase.shouldGenerateHypotheses == null ? "MAYBE" : testCase.shouldGenerateHypotheses ? "YES" : "NO"}</strong></div>
          <div><span>Insufficient evidence</span><strong>{testCase.shouldReturnInsufficientEvidence ? "YES" : "NO"}</strong></div>
          <div><span>Primary sources</span><strong>{testCase.expectedPrimarySources.join(", ") || "Validation error only"}</strong></div>
        </div>
        <p className={styles.assertion}><strong>Key assertion:</strong> {testCase.keyAssertion}</p>
        {result ? (
          <div className={styles.checks}>
            {result.checks.map((checkItem) => (
              <div key={checkItem.key} className={`${styles.check} ${!checkItem.scored ? styles.unscored : checkItem.passed ? styles.checkPass : styles.checkFail}`}>
                <span>{!checkItem.scored ? "–" : checkItem.passed ? "✓" : "×"}</span>
                <div><strong>{checkItem.label}</strong><small>Expected: {checkItem.expected}</small><small>Actual: {checkItem.actual}</small></div>
              </div>
            ))}
          </div>
        ) : <p className={styles.muted}>Run this case to populate its verification checks.</p>}
        <div className={styles.rowActions}>
          <button onClick={(event) => { event.preventDefault(); onRun(); }} disabled={running}>Run case</button>
          <a href={testCase.clinicalTrialsGovUrl} target="_blank" rel="noreferrer">Open registry ↗</a>
          {result ? <span>{(result.durationMs / 1000).toFixed(1)}s · {new Date(result.runAt).toLocaleString()}</span> : null}
        </div>
      </div>
    </details>
  );
}
