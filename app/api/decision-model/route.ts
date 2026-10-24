import labelledTickets from "../../../data/support_tickets_100_labelled.json";
import { DECISION_MODEL_NAME, evaluateDecisionModel, type DecisionModelComparison } from "../../../lib/decision-model";

export async function GET() {
  const started = Date.now();
  let categoryMatches = 0;
  let priorityMatches = 0;
  let completed = 0;
  for (const ticket of labelledTickets) {
    const result = evaluateDecisionModel(ticket);
    completed += 1;
    if (result.category === ticket.category) categoryMatches += 1;
    if (result.priority === ticket.priority) priorityMatches += 1;
  }
  const comparison: DecisionModelComparison = {
    model: DECISION_MODEL_NAME,
    dataset: "support_tickets_100_labelled",
    sampleSize: labelledTickets.length,
    completed,
    categoryAccuracy: categoryMatches / completed,
    priorityAccuracy: priorityMatches / completed,
    latencyMs: Date.now() - started,
    cost: 0,
  };
  return Response.json(comparison);
}
