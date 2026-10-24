import { runSmokeTest, SmokeRequestSchema } from "../../../lib/smoke";
import { toApiError } from "../../../lib/llm";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = SmokeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request", message: parsed.error.issues[0]?.message ?? "Invalid smoke-test request." }, { status: 400 });
  }
  try {
    return Response.json(await runSmokeTest(parsed.data.dataset, parsed.data.sampleSize));
  } catch (error) {
    const { status, code, message } = toApiError(error);
    return Response.json({ error: code, message }, { status });
  }
}
