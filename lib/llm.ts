import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { CHAT_SYSTEM_PROMPT, buildTriageSystemPrompt, buildTriageUserMessage } from "./prompt";
import { TriageSchema, triageJsonSchema, type TriageResult, type TokenUsage } from "./schema";

/** The only module that talks to the provider. Server-side only: it reads the key. */

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type StructuredMode = "json_schema" | "prompt";

export class LlmInvalidOutputError extends Error {}
export class LlmConfigError extends Error {}

export type TriageCall = {
  result: TriageResult;
  usage: TokenUsage;
  model: string;
};

const TIMEOUT_MS = 30_000; // per attempt, not per operation
const MAX_RETRIES = 1; // SDK retries 429 / 5xx / network with backoff

let client: OpenAI | undefined;

function getConfig() {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseURL || !apiKey || !model) {
    throw new LlmConfigError("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set in .env.local");
  }
  const mode: StructuredMode =
    process.env.LLM_STRUCTURED_OUTPUT === "json_schema" ? "json_schema" : "prompt";
  return { baseURL, apiKey, model, mode };
}

function getClient() {
  const { baseURL, apiKey } = getConfig();
  client ??= new OpenAI({ baseURL, apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return client;
}

/** Activity 1-2: one answer for a conversation. The client resends the whole history. */
export async function chat(history: ChatTurn[]): Promise<string> {
  const { model } = getConfig();
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...history,
  ];
  const completion = await getClient().chat.completions.create({ model, messages });
  return completion.choices[0]?.message?.content ?? "";
}

/** Use 2 (CHECK), step 0: tolerate an optional ```json fence in prompt-only mode. */
function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text.trim();
}

/** Use 2 (CHECK): text -> unknown -> validated value. `as TriageResult` would check nothing. */
function parseTriage(text: string): TriageResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(text));
  } catch {
    throw new LlmInvalidOutputError("not JSON");
  }
  const parsed = TriageSchema.safeParse(raw);
  if (!parsed.success) throw new LlmInvalidOutputError("schema mismatch");
  return parsed.data;
}

async function triageOnce(ticket: string): Promise<TriageCall> {
  const { model, mode } = getConfig();
  const params: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: buildTriageSystemPrompt(mode) },
      { role: "user", content: buildTriageUserMessage(ticket) },
    ],
  };
  if (mode === "json_schema") {
    params.response_format = {
      type: "json_schema",
      json_schema: { name: "support_triage", strict: true, schema: triageJsonSchema },
    };
  }

  const completion = await getClient().chat.completions.create(params);
  const choice = completion.choices[0];
  if (!choice) throw new LlmInvalidOutputError("no choice returned");
  if (choice.finish_reason === "length") throw new LlmInvalidOutputError("cut off");
  const usage = completion.usage;
  return {
    result: parseTriage(choice.message.content ?? ""),
    usage: {
      input: usage?.prompt_tokens ?? 0,
      output: usage?.completion_tokens ?? 0,
      total: usage?.total_tokens ?? 0,
    },
    model,
  };
}

/** Activity 3-4: validated triage. Invalid output is retried once, and logged. */
export async function triage(ticket: string): Promise<TriageCall> {
  try {
    return await triageOnce(ticket);
  } catch (err) {
    if (!(err instanceof LlmInvalidOutputError)) throw err;
    console.warn(`[triage] invalid model output (${err.message}), retrying once`);
    return triageOnce(ticket);
  }
}

export type ApiError = { status: number; code: string; message: string };

/** The failure policy table: one status and one safe message per failure. */
export function toApiError(err: unknown): ApiError {
  // Log the detail on the server only. Never the key, never the ticket.
  console.error(
    "[llm] error:",
    err instanceof OpenAI.APIError ? `${err.name} status=${err.status}` : err instanceof Error ? err.name : "unknown",
    err instanceof Error ? err.message : "",
  );

  if (err instanceof LlmInvalidOutputError) {
    return { status: 502, code: "invalid_model_output", message: "The model returned an answer we could not use. Please try again." };
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return { status: 504, code: "triage_timeout", message: "The model took too long to answer. Please try again." };
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return { status: 502, code: "triage_unavailable", message: "The AI service is unreachable right now. Please try again." };
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      return { status: 429, code: "rate_limited", message: "Too many requests. Please wait a moment and try again." };
    }
    if (err.status !== undefined && err.status >= 500) {
      return { status: 502, code: "triage_unavailable", message: "The AI service is unavailable right now. Please try again." };
    }
  }
  // Wrong key / model / parameter (400/401/403/404), missing config, bugs: our problem, not the user's.
  return { status: 500, code: "internal_error", message: "Something went wrong on our side." };
}
