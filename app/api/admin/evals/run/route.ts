import { NextResponse } from "next/server";

import { GET as investigate } from "../../../investigate/route";
import { authorizeEvalRun } from "../../../../../lib/eval-auth";
import { evaluateInvestigation, findEvalCase } from "../../../../../lib/evals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = authorizeEvalRun(request);
  if (!authorization.authorized) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await request.json().catch(() => ({}));
  const evalIds: string[] = Array.isArray(body.evalIds)
    ? [...new Set<string>(body.evalIds.map((value: unknown) => String(value)))].slice(0, 3)
    : [];
  if (evalIds.length === 0) return NextResponse.json({ error: "Provide one to three evalIds." }, { status: 400 });

  const results = [];
  for (const evalId of evalIds) {
    const testCase = findEvalCase(evalId);
    if (!testCase) {
      results.push({ evalId, passed: false, error: "Evaluation case not found." });
      continue;
    }

    const startedAt = Date.now();
    const response = await investigate(new Request(`https://internal/api/investigate?nctId=${testCase.nctId}`));
    const investigation = await response.json();
    results.push(evaluateInvestigation(testCase, investigation, Date.now() - startedAt, response.status));
  }

  return NextResponse.json({
    datasetVersion: "1.0.0",
    runAt: new Date().toISOString(),
    results,
  }, { headers: { "cache-control": "no-store" } });
}
