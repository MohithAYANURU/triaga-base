import { triage, toApiError } from "../../../lib/llm";
import { PROMPT_VERSION } from "../../../lib/prompt";
import { TriageRequestSchema, TriageResponseSchema } from "../../../lib/schema";

function bad(message: string) {
  return Response.json({ error: "bad_request", message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const parsedRequest = TriageRequestSchema.safeParse(body);
  if (!parsedRequest.success) return bad(parsedRequest.error.issues[0]?.message ?? "Invalid triage request.");

  try {
    const call = await triage(parsedRequest.data.ticket);
    const response = TriageResponseSchema.parse({
      triage: call.result,
      usage: call.usage,
      model: call.model,
      prompt_version: PROMPT_VERSION,
    });
    return Response.json(response);
  } catch (err) {
    const { status, code, message } = toApiError(err);
    return Response.json({ error: code, message }, { status });
  }
}
