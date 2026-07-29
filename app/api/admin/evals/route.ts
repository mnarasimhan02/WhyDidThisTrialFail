import { NextResponse } from "next/server";

import { evalFixture } from "../../../../lib/evals";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(evalFixture, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
