export function authorizeEvalRun(request: Request) {
  const expected = process.env.EVAL_ADMIN_TOKEN;
  if (!expected) {
    return process.env.NODE_ENV !== "production"
      ? { authorized: true as const }
      : { authorized: false as const, status: 503, error: "Evaluation runner is not configured. Set EVAL_ADMIN_TOKEN in Vercel." };
  }

  const provided = request.headers.get("x-eval-admin-token") ?? bearerToken(request.headers.get("authorization"));
  return provided === expected
    ? { authorized: true as const }
    : { authorized: false as const, status: 401, error: "A valid evaluation admin token is required." };
}

function bearerToken(value: string | null) {
  return value?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}
