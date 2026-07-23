# WhyDidThisTrialFail

Single-page MVP for investigating a clinical trial from one NCT ID.

## What is included

- One-screen UI with a single NCT input
- Investigation-style results layout
- Ranked failure hypotheses
- Evidence log, timeline, related-trials panel, and uncertainty panel
- Guardrails that keep the app from sounding like it has causal proof

## How to run

Open `index.html` in a browser.

For a local server, serve the folder with any static file server and open the page in the browser.

## Demo data

This build currently uses an embedded demo library for a few sample NCT IDs:

- `NCT01234567`
- `NCT03163767`

Other NCT IDs still render a safe fallback that explains the production behavior.

## Next production step

Wire the mock investigation layer to public source retrieval from:

- ClinicalTrials.gov
- PubMed
- Sponsor press releases
- Optional regulatory sources