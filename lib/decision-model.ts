import { CATEGORIES, PRIORITIES, type TriageResult } from "./schema";

export const DECISION_MODEL_NAME = "kestrel-rules-v1";

type DecisionTicket = { subject: string; body: string };

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function evaluateDecisionModel(ticket: DecisionTicket): TriageResult {
  const text = `${ticket.subject} ${ticket.body}`.toLowerCase();
  const category = hasAny(text, ["invoice", "billing", "charge", "payment", "refund", "po number"])
    ? "billing"
    : hasAny(text, ["password", "login", "log in", "access", "role", "permission", "account", "sign in"])
      ? "account"
      : hasAny(text, ["request", "would like", "please add", "feature", "support", "comments", "annotation"])
        ? "feature_request"
        : "technical_bug";

  const priority = hasAny(text, ["data loss", "security breach", "cannot access", "outage", "down", "all users", "production"])
    ? "high"
    : hasAny(text, ["failed", "error", "broken", "urgent", "blocked", "not working"])
      ? "medium"
      : "low";

  const categoryLabels: Record<(typeof CATEGORIES)[number], string> = {
    billing: "billing",
    technical_bug: "technical issue",
    account: "account access",
    feature_request: "feature request",
  };
  return {
    category,
    priority,
    summary: `${categoryLabels[category]} request classified by decision rules`,
    suggested_action: priority === "high" ? "Escalate to the support team immediately." : "Review the ticket and respond using the standard workflow.",
  };
}

export type DecisionModelComparison = {
  model: string;
  dataset: string;
  sampleSize: number;
  completed: number;
  categoryAccuracy: number | null;
  priorityAccuracy: number | null;
  latencyMs: number;
  cost: number;
};
