# WhyDidThisTrialFail

WhyDidThisTrialFail is a public-source trial investigation app.

Paste one NCT ID, or search by sponsor or trial title in the same box, and the app builds a temporal, source-traceable investigation of both the individual trial and the broader development program.

Live app: [whydidthistrialfail.ai](https://www.whydidthistrialfail.ai/)

## Iteration 2: stricter, trial-specific reasoning

Iteration 2 responds directly to early user feedback that a trial-investigation product must prefer a short `insufficient public evidence` result over a confident but generic explanation.

### What changed

- Added a source-priority failure router: current registry reason, registry history, sponsor/SEC evidence, regulator evidence, then trial-specific publications
- Normalized ClinicalTrials.gov statuses such as `ACTIVE_NOT_RECRUITING` before deciding whether failure reasoning should run
- Prevented recruiting, not-yet-recruiting, active-not-recruiting, and completed-without-documented-failure studies from entering the failure-hypothesis path
- Locked documented stop reasons to their category; for example, a documented safety stop cannot produce unrelated efficacy or regulatory explanations
- Replaced broad keyword promotion with independent, category-specific expected-evidence tests
- Required direct, trial-linked evidence before emitting any non-documented causal hypothesis
- Added contradiction detection for signals such as a reported endpoint miss versus positive endpoint messaging
- Applied contradiction and missing-evidence penalties to internal evidence ranking
- Restricted SEC analysis to passages surrounding the NCT ID, acronym, or asset name instead of scanning an entire filing as one claim
- Prevented asset-level FDA information from being presented as the cause of a specific trial outcome
- Rejected generic filler explanations such as patient selection, target biology, dose, comparator choice, or recruitment unless trial-specific evidence explicitly supports them
- Added automated reasoning regression tests and restored TypeScript and ESLint validation

### Verified Iteration 2 cases

| NCT ID | Public-record state | Expected app behavior |
| --- | --- | --- |
| `NCT02569398` | Terminated for a registry-documented safety/benefit-risk reason | Reports safety as directly documented and stays inside the safety route |
| `NCT06625320` | Active, not recruiting | Reports `not a failure` and generates no failure hypotheses |
| `NCT06850597` | Recruiting | Reports `not a failure` and generates no failure hypotheses |
| `NCT01900665` | Terminated after missing the primary endpoint | Reports primary-endpoint failure as directly documented and separates the continuing program |

The reasoning regression suite covers documented safety, explicit endpoint misses, generic-answer rejection, independent expected-evidence checks, asset-only evidence suppression, active-status normalization, category isolation, and completed-trial handling.

## Purpose

Clinical-trial outcomes are usually easy to summarize and hard to explain. This app is built for the harder part: taking one trial identifier and turning the public record into a structured, evidence-ranked investigation.

It answers:

- What was the trial trying to do?
- What does the public record say happened?
- What are the most plausible failure hypotheses?
- What evidence supports those hypotheses?
- What remains uncertain?

## What the app does

- Accepts a single NCT ID
- Supports simple search by NCT ID, sponsor, or trial title
- Compares ClinicalTrials.gov record-history versions
- Builds a deterministic event timeline before causal reasoning
- Maps the trial to its asset, sponsor, indication, acronym, and related trials
- Separates trial outcome from asset/program outcome
- Searches trial-level and program-level public evidence
- Builds a normalized evidence graph of entities, events, claims, and sources
- Deduplicates reports that repeat the same underlying announcement
- Runs failure-category-specific expected-evidence tests
- Suppresses hypotheses without trial-specific support
- Separates observations, associations, contributor hypotheses, primary-cause hypotheses, and documented causes

## How it works

The app uses a constrained 3-step agent flow:

1. Temporal evidence agent compares registry versions and produces a deterministic event timeline.
2. Trial + program evidence agent maps entities and searches ClinicalTrials.gov, PubMed, SEC EDGAR, FDA/openFDA, and relevant EU identifiers.
3. Evidence judge deduplicates source families, applies expected-evidence tests, scores internal support, and removes unsupported causal claims.

The failure router is deliberately conservative. It checks a documented registry stop reason first, then trial-linked registry history, sponsor/SEC evidence, regulator evidence, and finally trial-specific publications. Long filings are evaluated only in passages surrounding the NCT ID, acronym, or asset name. Active trials and completed records without a documented failure bypass failure hypothesis generation.

Generic explanations such as patient selection, target biology, dose, comparator choice, or recruitment are never inserted merely to complete a report. If a category lacks direct trial-specific evidence, the app returns `There is insufficient public evidence to determine why this trial failed.`

The internal score considers source authority, directness, trial specificity, independent corroboration, temporal relevance, and contradictions. The UI displays evidence-strength labels, never a probability.

## Iteration 3: trial stop is not program failure

The reasoning pipeline now treats two questions as separate investigations:

1. **Why did this trial stop?** This is deterministic. The app reports the current ClinicalTrials.gov status and explicit `Why Stopped` text, with a direct source link. It never invents a missing stopping reason.
2. **What happened to the broader program?** This is evaluated independently across trial-specific publications, related studies, sponsor disclosures, SEC EDGAR, FDA, and relevant EU routes. A terminated trial is not evidence that the asset or program failed.

The report now includes:

- `WHAT THE PUBLIC EVIDENCE SHOWS`, a concise facts-first summary
- separate Trial / Program evidence badges
- a cited `KNOWN FACTS` panel
- a `WHAT REMAINS UNKNOWN` panel where `not found` is never presented as `did not occur`
- a material-change timeline that does not use timing as causal proof
- Matrix A for deterministic trial-stopping evidence
- Matrix B for program-failure candidates, contradictions, missing expected evidence, strength, and decision

Program hypotheses are generated only when program-relevant evidence clears the configured threshold. Otherwise the system returns: `Public evidence is insufficient to determine why the broader development program ended.`

## Data sources

The app uses only public sources.

### ClinicalTrials.gov API v2

Used for:

- trial title
- status
- phase
- condition
- intervention
- sponsor
- start and completion dates
- primary objective or outcome
- location count
- related trial discovery

### ClinicalTrials.gov record history

Used to retrieve submitted record versions, compare status/enrollment/outcome changes, and construct the timeline before reasoning.

Endpoint:

- `https://clinicaltrials.gov/api/int/studies/{NCT_ID}/history`
- `https://clinicaltrials.gov/api/int/studies/{NCT_ID}/history/{VERSION}`

Endpoints:

- `https://clinicaltrials.gov/api/v2/studies/{NCT_ID}`
- `https://clinicaltrials.gov/api/v2/studies?query.term=...`

### PubMed E-utilities

Used for:

- publication lookup
- publication metadata
- abstract text when available

Endpoints:

- `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`
- `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`
- `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi`

### SEC EDGAR

For sponsors that map to public companies, the app searches company submissions and recent 8-K, 10-K, 10-Q, 20-F, and 6-K filings for trial- or asset-specific evidence about funding, strategy, portfolio prioritization, or partner decisions.

### FDA / openFDA

When a named asset is available, the app checks relevant public FDA label data for safety and regulatory context. Asset-level FDA evidence is not treated as proof of why a specific trial stopped.

### EU CTIS / EU Clinical Trials

When ClinicalTrials.gov contains an EudraCT or EU trial identifier, the app maps it to the public EU search route. CTIS does not provide an anonymous public search API, so the app labels unretrieved EU evidence as `not found` and does not invent findings.

### Registry-derived context

The app also uses trial-record context to:

- compare status updates over time
- generate a timeline
- rank hypotheses
- explain uncertainty

## Good examples to try

These IDs resolve to real ClinicalTrials.gov records and were tested against the public registry during development:

- `NCT02569398` — documented safety stop
- `NCT01900665` — documented primary-endpoint miss
- `NCT06625320` — active, not recruiting; must not be called a failure
- `NCT06850597` — recruiting; must not be called a failure
- `NCT00232128` — terminated without enough retrieved causal evidence

They are useful starting points because they exercise the app flow, hypothesis ranking, and evidence cards without relying on placeholder IDs.

## What you will see

Depending on the evidence, the app returns a documented cause, a carefully bounded contributor/primary-cause hypothesis, or: `There is insufficient public evidence to determine why this trial failed.`

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Validation

```bash
npm test
npm run lint
npm run build
```

## Hidden golden-dataset dashboard

The app includes a non-linked validation workspace at `/admin/evals`. It runs the same production investigation pipeline against the versioned 100-study fixture in `data/evals.json`.

For every trial, the dashboard stores and compares:

- expected live trial state
- expected failure-category family
- whether hypotheses should be generated
- whether the report should return `insufficient public evidence`
- minimum evidence strength
- expected primary source families
- calculated Pass/Fail status for each check and the overall case

Results are stored in the current browser so a long run can be resumed and exported as JSON. Gold rows are regression anchors. Silver rows are automatically evaluated but remain marked for live clinical review.

The supplied workbook has a source-data discrepancy: its Summary tab reports 48 Gold and 52 Silver cases, while the row-level labels contain 59 Gold and 41 Silver cases. The fixture and dashboard use the row-level labels and show a warning.

### Protecting the runner

Set `EVAL_ADMIN_TOKEN` in Vercel. Enter that same token in the dashboard when starting a run. The token is kept only in browser session storage.

### Automatic post-deployment regression

The GitHub Actions workflow `.github/workflows/evals-after-deploy.yml` runs after a successful Vercel Production deployment and uploads `eval-results.json` as a workflow artifact. Add a GitHub Actions repository secret named `EVAL_ADMIN_TOKEN` with the same value configured in Vercel.

The workflow can also be started manually with a deployment URL. It fails when any applicable evaluation check fails, while preserving the complete report artifact for review.

### Updating the fixture

The committed JSON fixture is generated from `WhyDidThisTrialFail_Eval_Dataset_100.xlsx` by `scripts/import-eval-dataset.mjs`. The import preserves workbook fields and deterministically derives accepted category families, insufficient-evidence behavior, and expected source families.

## Hosting

This app is designed for Vercel deployment.

## Notes

- No document uploads are required.
- The app is designed for one NCT ID at a time.
- The output is evidence-ranked, not causal proof.
- Timing alone is never treated as causality.
- Similar trials are contextual benchmarks, not causal proof.
- `Not found` means evidence was not retrieved, not that it does not exist.
