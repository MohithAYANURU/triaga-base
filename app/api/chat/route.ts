import { chat, toApiError, type ChatTurn } from "../../../lib/llm";
import { MAX_CHAT_MESSAGES, MAX_CHAT_MESSAGE_CHARS } from "../../../lib/schema";

function bad(message: string) {
  return Response.json({ error: "bad_request", message }, { status: 400 });
}

/** Accepts only user/assistant turns: the system message is ours, never the client's. */
function parseHistory(body: unknown): ChatTurn[] | string {
  if (typeof body !== "object" || body === null || !("messages" in body) || !Array.isArray(body.messages)) {
    return "Please provide a non-empty messages array.";
  }
  const turns: ChatTurn[] = [];
  for (const m of body.messages as unknown[]) {
    if (typeof m !== "object" || m === null) return "Invalid message.";
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return "Only 'user' and 'assistant' roles are allowed.";
    if (typeof content !== "string" || !content.trim()) return "Each message needs non-empty text.";
    if (content.length > MAX_CHAT_MESSAGE_CHARS) return "A message is too long.";
    turns.push({ role, content });
  }
  if (turns.length === 0 || turns.length > MAX_CHAT_MESSAGES) return "Invalid number of messages.";
  if (turns[turns.length - 1].role !== "user") return "The last message must come from the user.";
  return turns;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body.");
  }

  const history = parseHistory(body);
  if (typeof history === "string") return bad(history);

  try {
    const answer = await chat(history);
    return Response.json({ answer });
  } catch (err) {
    const { status, code, message } = toApiError(err);
    return Response.json({ error: code, message }, { status });
  }
}
