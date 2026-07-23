const trialDatabase = {
  NCT01234567: {
    title: "A Study of Targeted Therapy in Advanced Solid Tumors",
    phase: "Phase II",
    status: "Completed",
    condition: ["NSCLC", "gastric cancer"],
    intervention: ["Targeted therapy X"],
    sponsor: "Example Biotech",
    targetOrPathway: "Pathway Y",
    primaryEndpoint: "Objective response rate",
    startDate: "2018-04-10",
    completionDate: "2021-09-18",
    bottomLine: "The public record suggests the program likely ran into a biology-plus-selection problem: the drug mechanism was plausible, but the enrolled population and biomarker strategy appear too broad to isolate a strong signal.",
    failureLikelihood: "high",
    timeline: [
      { date: "2018-04-10", event: "Trial started", source: "ClinicalTrials.gov", url: "https://clinicaltrials.gov/" },
      { date: "2019-08-01", event: "Conference abstract reported mixed activity", source: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/" },
      { date: "2021-09-18", event: "Trial completed", source: "ClinicalTrials.gov", url: "https://clinicaltrials.gov/" },
    ],
    hypotheses: [
      {
        id: "H1",
        label: "Patient selection was too broad",
        confidence: "high",
        statement: "The enrolled population likely diluted effect size because the trial did not appear to enrich strongly for biomarker-positive patients.",
        whyItMatters: "Broad enrollment often hides a real signal in only a subset of patients.",
        evidence: [
          {
            sourceType: "clinicaltrials",
            citation: "ClinicalTrials.gov record shows broad inclusion with no explicit biomarker enrichment.",
            claim: "Eligibility appears permissive rather than biomarker-driven.",
            url: "https://clinicaltrials.gov/",
          },
          {
            sourceType: "pubmed",
            citation: "A later abstract described activity concentrated in a small subgroup.",
            claim: "Observed benefit may have been confined to a narrower biology-defined subset.",
            url: "https://pubmed.ncbi.nlm.nih.gov/",
          },
        ],
        counterevidence: [],
      },
      {
        id: "H2",
        label: "Target biology was weaker than expected",
        confidence: "medium",
        statement: "The pathway may have been biologically relevant, but not sufficiently central to drive durable clinical benefit on its own.",
        whyItMatters: "A weak or redundant target usually produces limited effect even with good execution.",
        evidence: [
          {
            sourceType: "other",
            citation: "Public sponsor materials framed the drug as pathway-focused, but not as a validated standard of care.",
            claim: "The mechanism looks plausible but not fully de-risked.",
            url: "https://www.google.com/search?q=public+sponsor+materials+example",
          },
        ],
        counterevidence: [
          {
            citation: "Some preclinical and early clinical signals supported the target.",
            claim: "There was at least a credible rationale to test the drug.",
            url: "https://pubmed.ncbi.nlm.nih.gov/",
          },
        ],
      },
      {
        id: "H3",
        label: "Endpoint was too ambitious",
        confidence: "medium",
        statement: "The primary endpoint may have required a large, durable effect that the intervention was unlikely to achieve in this setting.",
        whyItMatters: "A mismatch between mechanism and endpoint can make a useful signal look like failure.",
        evidence: [
          {
            sourceType: "clinicaltrials",
            citation: "Primary endpoint was objective response rate in a heterogeneous population.",
            claim: "The study required a strong early efficacy signal.",
            url: "https://clinicaltrials.gov/",
          },
        ],
        counterevidence: [],
      },
    ],
    relatedTrials: [
      { nctId: "NCT03163767", similarityReason: "Same pathway, similar disease area, later-phase design", result: "More selective enrollment and clearer biomarker stratification", url: "https://clinicaltrials.gov/" },
      { nctId: "NCT04567890", similarityReason: "Same class, different combination strategy", result: "Observed stronger activity in a narrower population", url: "https://clinicaltrials.gov/" },
    ],
    limitations: [
      "No full protocol text is available in this demo.",
      "Failure hypotheses are evidence-ranked, not causal proof.",
      "Public abstracts may lag behind the actual trial execution details.",
    ],
    evidenceLog: [
      { source: "ClinicalTrials.gov", title: "Trial registration record", detail: "Primary source for design, dates, endpoints, eligibility, and status.", url: "https://clinicaltrials.gov/" },
      { source: "PubMed", title: "Linked publication / abstract search", detail: "Used to identify outcomes, subgroup signals, and follow-up analyses.", url: "https://pubmed.ncbi.nlm.nih.gov/" },
      { source: "Sponsor updates", title: "Public company or conference updates", detail: "Used only when publicly available to add context on program decisions.", url: "https://www.google.com/search?q=trial+sponsor+press+release" },
    ],
  },
  NCT03163767: {
    title: "Biomarker-Defined Therapy in Metastatic Cancer",
    phase: "Phase III",
    status: "Terminated",
    condition: ["Metastatic cancer"],
    intervention: ["Combination therapy Z"],
    sponsor: "Example Pharma",
    targetOrPathway: "Receptor Q",
    primaryEndpoint: "Progression-free survival",
    startDate: "2019-02-14",
    completionDate: "2022-03-03",
    bottomLine: "This program looks more like a biomarker strategy failure than a pure chemistry failure: the public record hints that the biomarker threshold was inconsistent across sources and the final population likely did not match the original hypothesis.",
    failureLikelihood: "high",
    timeline: [
      { date: "2019-02-14", event: "First patient in", source: "ClinicalTrials.gov", url: "https://clinicaltrials.gov/" },
      { date: "2020-11-20", event: "Interim presentation suggested weak separation", source: "Conference abstract", url: "https://pubmed.ncbi.nlm.nih.gov/" },
      { date: "2022-03-03", event: "Terminated", source: "ClinicalTrials.gov", url: "https://clinicaltrials.gov/" },
    ],
    hypotheses: [
      {
        id: "H1",
        label: "Biomarker threshold drift",
        confidence: "high",
        statement: "Different public sources appear to describe the biomarker definition inconsistently, which often signals an unstable enrichment strategy.",
        whyItMatters: "If biomarker thresholds move, the trial may no longer be testing the original biological hypothesis.",
        evidence: [
          { sourceType: "clinicaltrials", citation: "Registration record uses one biomarker definition.", claim: "The trial had a defined biomarker gate at registration.", url: "https://clinicaltrials.gov/" },
          { sourceType: "pubmed", citation: "Follow-up abstract uses a different threshold language.", claim: "Public reporting appears to shift the threshold framing.", url: "https://pubmed.ncbi.nlm.nih.gov/" },
        ],
        counterevidence: [],
      },
      {
        id: "H2",
        label: "Combination strategy underperformed",
        confidence: "medium",
        statement: "The trial may have required a partner regimen to unlock benefit, but the selected combination did not produce enough incremental activity.",
        whyItMatters: "Combination failure can mask a target that works only in the right context.",
        evidence: [
          { sourceType: "other", citation: "Later competitor studies pursued different combinations for the same target.", claim: "The field may have adjusted the combination strategy after this trial.", url: "https://clinicaltrials.gov/" },
        ],
        counterevidence: [],
      },
      {
        id: "H3",
        label: "Comparator or endpoint issue",
        confidence: "low",
        statement: "The endpoint may have been too hard to move in a late-line metastatic setting, especially if the comparator was active.",
        whyItMatters: "A good therapy can look weak against a strong control arm or a difficult endpoint.",
        evidence: [
          { sourceType: "clinicaltrials", citation: "Primary endpoint was progression-free survival in a late-stage setting.", claim: "The bar for success was high.", url: "https://clinicaltrials.gov/" },
        ],
        counterevidence: [],
      },
    ],
    relatedTrials: [
      { nctId: "NCT05500011", similarityReason: "Same receptor class, newer biomarker enrichment logic", result: "Still recruiting", url: "https://clinicaltrials.gov/" },
    ],
    limitations: [
      "This demo uses a small embedded library of illustrative cases.",
      "Only public-source logic is simulated here.",
      "The tool should never be read as proving why a program failed.",
    ],
    evidenceLog: [
      { source: "ClinicalTrials.gov", title: "Registration and status", detail: "Used to anchor trial design and lifecycle.", url: "https://clinicaltrials.gov/" },
      { source: "PubMed", title: "Abstract and publication search", detail: "Used to identify whether the signal moved or disappeared over time.", url: "https://pubmed.ncbi.nlm.nih.gov/" },
    ],
  },
};

const fallbackTrial = (nctId) => ({
  title: "Unknown trial in public-source mode",
  phase: "Unknown",
  status: "Not enough public evidence",
  condition: ["Unspecified"],
  intervention: ["Unspecified"],
  sponsor: "Unknown",
  targetOrPathway: "Unknown",
  primaryEndpoint: "Unknown",
  startDate: "Unknown",
  completionDate: "Unknown",
  bottomLine: "I could not find a curated case for this NCT ID in the demo library. In a production build, the app would query ClinicalTrials.gov, PubMed, and sponsor sources before generating hypotheses.",
  failureLikelihood: "unknown",
  timeline: [{ date: "Unknown", event: "No cached public-source case found", source: "Demo engine", url: "#" }],
  hypotheses: [{ id: "H1", label: "Insufficient public evidence", confidence: "low", statement: "This demo cannot infer a failure story without actual source retrieval. A production version should search public APIs before generating hypotheses.", whyItMatters: "Unsupported explanations are worse than no explanation.", evidence: [], counterevidence: [] }],
  relatedTrials: [],
  limitations: ["This NCT ID is not in the embedded demo set.", "Production mode should call public APIs.", "No causal conclusion can be made from the demo alone."],
  evidenceLog: [],
});

const statusText = document.getElementById("statusText");
const results = document.getElementById("results");
const investigateBtn = document.getElementById("investigateBtn");
const nctInput = document.getElementById("nctInput");

const elements = {
  trialTitle: document.getElementById("trialTitle"),
  failureBadge: document.getElementById("failureBadge"),
  phaseBadge: document.getElementById("phaseBadge"),
  bottomLine: document.getElementById("bottomLine"),
  overviewList: document.getElementById("overviewList"),
  timelineList: document.getElementById("timelineList"),
  hypotheses: document.getElementById("hypotheses"),
  relatedTrials: document.getElementById("relatedTrials"),
  limitations: document.getElementById("limitations"),
  evidenceLog: document.getElementById("evidenceLog"),
};

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function setStatus(message) { statusText.textContent = message; }
function renderTrial(trial, nctId) {
  results.classList.remove("hidden");
  elements.trialTitle.textContent = `${trial.title} (${nctId})`;
  elements.bottomLine.textContent = trial.bottomLine;
  elements.failureBadge.textContent = `Failure likelihood: ${trial.failureLikelihood}`;
  elements.phaseBadge.textContent = trial.phase;

  const overview = [
    ["Status", trial.status],
    ["Condition", trial.condition.join(", ")],
    ["Intervention", trial.intervention.join(", ")],
    ["Sponsor", trial.sponsor],
    ["Target / pathway", trial.targetOrPathway],
    ["Primary endpoint", trial.primaryEndpoint],
    ["Start date", trial.startDate],
    ["Completion date", trial.completionDate],
  ];

  elements.overviewList.innerHTML = overview.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  elements.timelineList.innerHTML = trial.timeline.map((item) => `<div class="timeline-item"><div class="date">${escapeHtml(item.date)} · ${escapeHtml(item.source)}</div><div>${escapeHtml(item.event)}</div></div>`).join("");
  elements.hypotheses.innerHTML = trial.hypotheses.map((item) => `<div class="hypothesis-item"><div class="hypothesis-title"><strong>${escapeHtml(item.label)}</strong><span class="pill ${escapeHtml(item.confidence)}">${escapeHtml(item.confidence)} confidence</span></div><div class="meta">${escapeHtml(item.statement)}</div><p>${escapeHtml(item.whyItMatters)}</p>${item.evidence.length ? `<div class="evidence">${item.evidence.map((ev) => `<div class="evidence-item"><div class="meta">${escapeHtml(ev.sourceType)} · ${escapeHtml(ev.citation)}</div><div>${escapeHtml(ev.claim)}</div><small><a href="${escapeHtml(ev.url)}" target="_blank" rel="noreferrer">Open source</a></small></div>`).join("")}</div>` : ""}</div>`).join("");
  elements.relatedTrials.innerHTML = trial.relatedTrials.length ? trial.relatedTrials.map((item) => `<div class="related-item"><div class="meta">${escapeHtml(item.nctId)}</div><div><strong>${escapeHtml(item.similarityReason)}</strong></div><p>${escapeHtml(item.result)}</p><small><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open source</a></small></div>`).join("") : `<div class="related-item">No related trials available in the embedded demo set.</div>`;
  elements.limitations.innerHTML = trial.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  elements.evidenceLog.innerHTML = trial.evidenceLog.length ? trial.evidenceLog.map((item) => `<div class="evidence-item"><div class="meta">${escapeHtml(item.source)}</div><div><strong>${escapeHtml(item.title)}</strong></div><div>${escapeHtml(item.detail)}</div><small><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open source</a></small></div>`).join("") : `<div class="evidence-item">No cached evidence log for this case.</div>`;
}

function investigate() {
  const nctId = nctInput.value.trim().toUpperCase();
  if (!/^NCT\d{8}$/.test(nctId)) {
    setStatus("Enter a valid NCT ID format like NCT01234567.");
    results.classList.add("hidden");
    return;
  }
  setStatus("Gathering public sources and ranking failure hypotheses...");
  investigateBtn.disabled = true;
  investigateBtn.textContent = "Investigating...";
  window.setTimeout(() => {
    const trial = trialDatabase[nctId] ?? fallbackTrial(nctId);
    renderTrial(trial, nctId);
    setStatus(`Investigation complete for ${nctId}.`);
    investigateBtn.disabled = false;
    investigateBtn.textContent = "Investigate";
  }, 650);
}

investigateBtn.addEventListener("click", investigate);
nctInput.addEventListener("keydown", (event) => { if (event.key === "Enter") investigate(); });
renderTrial(trialDatabase.NCT01234567, "NCT01234567");