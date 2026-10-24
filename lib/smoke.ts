import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import labelledTickets from "../data/support_tickets_100_labelled.json";
import unlabelledTickets from "../data/support_tickets_500.json";
import { triage } from "./llm";
import { CATEGORIES, PRIORITIES } from "./schema";

export const SmokeRequestSchema = z.object({
  dataset: z.enum(["labelled100", "unlabelled500"]),
  sampleSize: z.number().int().min(1).max(500),
});

const SmokeTicketSchema = z.object({
  ticket_id: z.string(),
  subject: z.string(),
  body: z.string(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
});

export const SmokeRunSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  dataset: z.enum(["labelled100", "unlabelled500"]),
  sampleSize: z.number().int(),
  model: z.string(),
  outcomeCounts: z.object({
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    categoryMismatches: z.number().int().nonnegative(),
    priorityMismatches: z.number().int().nonnegative(),
  }),
  accuracy: z.object({
    category: z.number().min(0).max(1).nullable(),
    priority: z.number().min(0).max(1).nullable(),
  }),
  latencyMs: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  results: z.array(z.object({
    ticketId: z.string(),
    subject: z.string(),
    predicted: z.object({ category: z.string(), priority: z.string() }).nullable(),
    expected: z.object({ category: z.string(), priority: z.string() }).nullable(),
    usage: z.object({ input: z.number(), output: z.number(), total: z.number() }).nullable(),
    error: z.string().optional(),
  })),
});

export type SmokeRun = z.infer<typeof SmokeRunSchema>;
type SmokeTicket = z.infer<typeof SmokeTicketSchema>;

const logPath = path.join(process.cwd(), "data", "smoke-runs.json");

async function readRuns(): Promise<SmokeRun[]> {
  try {
    return SmokeRunSchema.array().parse(JSON.parse(await readFile(logPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getSmokeRuns() {
  return readRuns();
}

export async function logSmokeRun(run: SmokeRun) {
  const runs = await readRuns();
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify([...runs, run], null, 2)}\n`, "utf8");
}

function sample<T>(items: T[], size: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, size);
}

function ticketText(ticket: SmokeTicket) {
  return `${ticket.subject}\n\n${ticket.body}`;
}

function costFor(input: number, output: number) {
  const inputRate = Number(process.env.LLM_INPUT_COST_PER_1K ?? 0);
  const outputRate = Number(process.env.LLM_OUTPUT_COST_PER_1K ?? 0);
  return (input * inputRate + output * outputRate) / 1000;
}

export async function runSmokeTest(dataset: "labelled100" | "unlabelled500", sampleSize: number) {
  const source = dataset === "labelled100" ? labelledTickets : unlabelledTickets;
  const tickets = source.map((ticket) => SmokeTicketSchema.parse(ticket));
  const selected = sample(tickets, Math.min(sampleSize, tickets.length));
  const startedAt = new Date();
  const results: SmokeRun["results"] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const ticket of selected) {
    try {
      const call = await triage(ticketText(ticket));
      inputTokens += call.usage.input;
      outputTokens += call.usage.output;
      results.push({
        ticketId: ticket.ticket_id,
        subject: ticket.subject,
        predicted: { category: call.result.category, priority: call.result.priority },
        expected: ticket.category && ticket.priority
          ? { category: ticket.category, priority: ticket.priority }
          : null,
        usage: call.usage,
      });
    } catch (error) {
      results.push({
        ticketId: ticket.ticket_id,
        subject: ticket.subject,
        predicted: null,
        expected: ticket.category && ticket.priority
          ? { category: ticket.category, priority: ticket.priority }
          : null,
        usage: null,
        error: error instanceof Error ? error.message : "The ticket could not be triaged.",
      });
    }
  }

  const labelledResults = results.filter((result) => result.expected);
  const categoryMismatches = labelledResults.filter(
    (result) => !result.predicted || result.predicted.category !== result.expected?.category,
  ).length;
  const priorityMismatches = labelledResults.filter(
    (result) => !result.predicted || result.predicted.priority !== result.expected?.priority,
  ).length;
  const completed = results.filter((result) => result.predicted).length;
  const completedAt = new Date();
  const run: SmokeRun = {
    id: `smoke-${Date.now()}`,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    dataset,
    sampleSize: selected.length,
    model: process.env.LLM_MODEL ?? "configured model",
    outcomeCounts: {
      completed,
      failed: selected.length - completed,
      categoryMismatches,
      priorityMismatches,
    },
    accuracy: {
      category: labelledResults.length ? (labelledResults.length - categoryMismatches) / labelledResults.length : null,
      priority: labelledResults.length ? (labelledResults.length - priorityMismatches) / labelledResults.length : null,
    },
    latencyMs: completedAt.getTime() - startedAt.getTime(),
    cost: costFor(inputTokens, outputTokens),
    results,
  };
  await logSmokeRun(run);
  return run;
}
