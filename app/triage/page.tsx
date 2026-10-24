"use client";

import { useState, type FormEvent } from "react";

type Triage = {
  category: string;
  priority: string;
  summary: string;
  suggested_action: string;
};

type Usage = { input: number; output: number; total: number };
type SmokeRun = {
  id: string;
  dataset: string;
  sampleSize: number;
  model: string;
  outcomeCounts: { completed: number; failed: number; categoryMismatches: number; priorityMismatches: number };
  accuracy: { category: number | null; priority: number | null };
  latencyMs: number;
  cost: number;
  results: Array<{
    ticketId: string;
    subject: string;
    predicted: { category: string; priority: string } | null;
    expected: { category: string; priority: string } | null;
    usage: Usage | null;
    error?: string;
  }>;
};

export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<Triage | null>(null);
  const [promptVersion, setPromptVersion] = useState("");
  const [model, setModel] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smokeDataset, setSmokeDataset] = useState("labelled100");
  const [sampleSize, setSampleSize] = useState("10");
  const [smokeRun, setSmokeRun] = useState<SmokeRun | null>(null);
  const [isRunningSmoke, setIsRunningSmoke] = useState(false);
  const [smokeError, setSmokeError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending || !(subject.trim() || body.trim())) return;

    setIsSending(true);
    setError(null);
    setResult(null);

    try {
      // The ticket text is subject + "\n\n" + body.
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: `${subject}\n\n${body}` }),
      });
      const data = (await response.json()) as {
        triage?: Triage;
        prompt_version?: string;
        usage?: Usage;
        model?: string;
        message?: string;
      };
      if (!response.ok || !data.triage) {
        throw new Error(data.message ?? "Unable to triage this ticket. Please try again.");
      }
      setResult(data.triage);
      setPromptVersion(data.prompt_version ?? "");
      setModel(data.model ?? "");
      setUsage(data.usage ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to triage this ticket. Please try again.");
    } finally {
      setIsSending(false);
    }

  }

  async function runSmokeTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRunningSmoke(true);
    setSmokeError(null);
    setSmokeRun(null);
    try {
      const response = await fetch("/api/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: smokeDataset, sampleSize: Number(sampleSize) }),
      });
      const data = (await response.json()) as SmokeRun & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to run smoke test.");
      setSmokeRun(data);
    } catch (err) {
      setSmokeError(err instanceof Error ? err.message : "Unable to run smoke test.");
    } finally {
      setIsRunningSmoke(false);
    }
  }

  return (
    <main className="chat">
      <h1>Ticket triage</h1>
      <p>
        Paste a customer ticket. <a href="/">← Back to chat</a> · <a href="/admin">Admin logs</a>
      </p>
      <form onSubmit={submit} aria-busy={isSending}>
        <label htmlFor="subject">Subject</label>
        <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isSending} />
        <label htmlFor="body">Body</label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} disabled={isSending} />
        <button type="submit" disabled={isSending || !(subject.trim() || body.trim())}>
          {isSending ? "Analysing..." : "Triage"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>

      {result && (
        <section aria-label="Triage result">
          <h2>Result</h2>
          <dl>
            <dt>Category</dt>
            <dd>{result.category}</dd>
            <dt>Priority</dt>
            <dd>{result.priority}</dd>
            <dt>Summary</dt>
            <dd>{result.summary}</dd>
            <dt>Suggested action</dt>
            <dd>{result.suggested_action}</dd>
          </dl>
          <small>prompt {promptVersion} · model {model || "configured model"}</small>
          {usage && <p>Tokens: {usage.input} input · {usage.output} output · {usage.total} total</p>}
        </section>
      )}

      <section aria-label="Smoke test">
        <h2>Smoke test</h2>
        <p>Sample tickets and compare predictions with the labelled dataset.</p>
        <form onSubmit={runSmokeTest} aria-busy={isRunningSmoke}>
          <label htmlFor="dataset">Dataset</label>
          <select id="dataset" value={smokeDataset} onChange={(event) => setSmokeDataset(event.target.value)} disabled={isRunningSmoke}>
            <option value="labelled100">Labelled 100 tickets</option>
            <option value="unlabelled500">Unlabelled 500 tickets</option>
          </select>
          <label htmlFor="sample-size">Tickets to sample</label>
          <input id="sample-size" type="number" min="1" max={smokeDataset === "labelled100" ? 100 : 500} value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} disabled={isRunningSmoke} />
          <button type="submit" disabled={isRunningSmoke}>{isRunningSmoke ? "Running..." : "Run smoke test"}</button>
          {smokeError && <p role="alert">{smokeError}</p>}
        </form>
        {smokeRun && (
          <div className="smoke-results">
            <p>{smokeRun.outcomeCounts.completed} completed, {smokeRun.outcomeCounts.failed} failed · {smokeRun.latencyMs} ms · cost ${smokeRun.cost.toFixed(4)}</p>
            {smokeRun.accuracy.category !== null && <p>Category accuracy: {(smokeRun.accuracy.category * 100).toFixed(1)}% · mismatches: {smokeRun.outcomeCounts.categoryMismatches}</p>}
            {smokeRun.accuracy.priority !== null && <p>Priority accuracy: {(smokeRun.accuracy.priority * 100).toFixed(1)}% · mismatches: {smokeRun.outcomeCounts.priorityMismatches}</p>}
            <ul>
              {smokeRun.results.map((item) => (
                <li key={item.ticketId}>
                  <strong>{item.ticketId}</strong> {item.subject}:{" "}
                  {item.predicted ? `${item.predicted.category} / ${item.predicted.priority}` : item.error}
                  {item.expected && ` (expected ${item.expected.category} / ${item.expected.priority})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
