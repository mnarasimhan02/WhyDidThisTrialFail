import fs from "node:fs/promises";

import fixture from "../data/evals.json" with { type: "json" };

const baseUrl = (process.env.EVAL_BASE_URL ?? "").replace(/\/$/, "");
const token = process.env.EVAL_ADMIN_TOKEN ?? "";
const outputPath = process.env.EVAL_OUTPUT_PATH ?? "artifacts/eval-results.json";

if (!baseUrl) throw new Error("EVAL_BASE_URL is required.");
if (!token) throw new Error("EVAL_ADMIN_TOKEN is required.");

const results = [];
const failures = [];

for (let index = 0; index < fixture.cases.length; index += 3) {
  const batch = fixture.cases.slice(index, index + 3);
  const response = await fetch(`${baseUrl}/api/admin/evals/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-eval-admin-token": token },
    body: JSON.stringify({ evalIds: batch.map((item) => item.evalId) }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Evaluation batch failed with ${response.status}.`);
  results.push(...payload.results);
  failures.push(...payload.results.filter((result) => !result.passed));
  console.log(`Completed ${Math.min(index + 3, fixture.cases.length)}/${fixture.cases.length}`);
}

const report = {
  datasetVersion: fixture.datasetVersion,
  deploymentUrl: baseUrl,
  runAt: new Date().toISOString(),
  summary: {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: failures.length,
    silverRequiringReview: results.filter((result) => result.requiresManualVerification).length,
  },
  results,
};

await fs.mkdir(outputPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Evaluation report written to ${outputPath}`);

if (failures.length > 0) {
  console.error(`${failures.length} evaluation case(s) failed.`);
  process.exitCode = 1;
}
