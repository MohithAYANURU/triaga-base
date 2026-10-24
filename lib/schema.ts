import { z } from "zod";

export const CATEGORIES = ["billing", "technical_bug", "account", "feature_request"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const MAX_TICKET_CHARS = 5000;
export const MAX_CHAT_MESSAGE_CHARS = 4000;
export const MAX_CHAT_MESSAGES = 40;

/** The triage contract, written once. Used to ASK (JSON Schema) and to CHECK (safeParse). */
export const TriageSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().min(1).max(300),
  suggested_action: z.string().min(1).max(500),
});

export type TriageResult = z.infer<typeof TriageSchema>;

export const TriageRequestSchema = z.object({
  ticket: z.string().trim().min(1, "Please provide a non-empty ticket string.").max(MAX_TICKET_CHARS),
});

export const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const TriageResponseSchema = z.object({
  triage: TriageSchema,
  usage: TokenUsageSchema,
  model: z.string().min(1),
  prompt_version: z.string().min(1),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type TriageResponse = z.infer<typeof TriageResponseSchema>;

export const triageRequestJsonSchema = z.toJSONSchema(TriageRequestSchema);
export const triageResponseJsonSchema = z.toJSONSchema(TriageResponseSchema);

/** Use 1 (ASK): the same contract as JSON Schema, sent to the provider. */
export const triageJsonSchema = (() => {
  const { $schema, ...rest } = z.toJSONSchema(TriageSchema);
  void $schema;
  return rest;
})();
