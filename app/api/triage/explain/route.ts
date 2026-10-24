import { explain, toApiError } from "../../../../lib/llm";
import { TriageRequestSchema, TriageSchema } from "../../../../lib/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticket = TriageRequestSchema.parse({ ticket: body.ticket }).ticket;
    const triage = TriageSchema.parse(body.triage);
    const stream = await explain(ticket, triage);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
  } catch (error) {
    const { status, code, message } = toApiError(error);
    return Response.json({ error: code, message }, { status });
  }
}
