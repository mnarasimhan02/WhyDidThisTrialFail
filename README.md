# WhyDidThisTrialFail

WhyDidThisTrialFail is a public-source trial investigation app.

Paste one NCT ID and the app gathers registry data, publication context, and similar trial references to help explain why a program may have stalled or failed.

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
- Pulls public trial data automatically
- Searches PubMed for related publications
- Surfaces similar or related trials
- Ranks failure hypotheses with supporting and counter evidence
- Separates direct facts, inferences, and uncertainty

## How it works

The app uses a simple 3-step agent flow:

1. Research agent
   - pulls the ClinicalTrials.gov record
   - searches PubMed
   - finds related trials
2. Reasoning agent
   - turns the evidence into ranked failure hypotheses
   - builds the bottom-line explanation
3. Judge agent
   - checks for overclaiming
   - keeps the answer conservative when evidence is thin

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

### Registry-derived context

The app also uses trial-record context to:

- compare status updates over time
- generate a timeline
- rank hypotheses
- explain uncertainty

## Good examples to try

- `NCT01234567`
- `NCT03163767`
- `NCT04280705`

These IDs are useful demo starting points because they show the app flow, hypothesis ranking, and evidence cards.

## What you will see

Depending on the NCT ID, the app may return:

- a broad-enrollment hypothesis
- a target biology or exposure hypothesis
- an endpoint or comparator mismatch hypothesis
- related trial comparisons
- PubMed-linked publication context
- a conservative bottom line when the public trail is thin

## Screenshots

Preview renders are included below so the README shows the intended product shape even before deployment captures are available.

![Homepage](./screenshots/homepage.png)
![Investigation results](./screenshots/results.png)
![Mobile view](./screenshots/mobile.png)

Suggested captures for later:

- homepage before search
- loading or investigating state
- results page with hypotheses and evidence
- mobile view

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Hosting

This app is designed for Vercel deployment.

## Notes

- No document uploads are required.
- The app is designed for one NCT ID at a time.
- The output is evidence-ranked, not causal proof.
- If the publication trail is thin, the app stays conservative rather than overclaiming.
