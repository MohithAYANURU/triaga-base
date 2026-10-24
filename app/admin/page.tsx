"use client";

import { useEffect, useState } from "react";

type Run = {
  id: string;
  startedAt: string;
  dataset: string;
  sampleSize: number;
  model: string;
  outcomeCounts: { completed: number; failed: number; categoryMismatches: number; priorityMismatches: number };
  accuracy: { category: number | null; priority: number | null };
  latencyMs: number;
  cost: number;
};

export default function AdminPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/runs")
      .then(async (response) => {
        const data = (await response.json()) as { runs?: Run[]; message?: string };
        if (!response.ok || !data.runs) throw new Error(data.message ?? "Unable to load logs.");
        setRuns(data.runs.reverse());
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load logs."));
  }, []);

  return (
    <main className="chat">
      <h1>Smoke-test admin</h1>
      <p><a href="/triage">← Back to triage</a></p>
      {error && <p role="alert">{error}</p>}
      {!error && runs.length === 0 && <p>No smoke tests have been logged yet.</p>}
      {runs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Run</th><th>Dataset</th><th>Model</th><th>Accuracy</th><th>Outcomes</th><th>Latency</th><th>Cost</th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{run.dataset} ({run.sampleSize})</td>
                  <td>{run.model}</td>
                  <td>{run.accuracy.category === null || run.accuracy.priority === null ? "n/a" : `${(run.accuracy.category * 100).toFixed(1)}% category, ${(run.accuracy.priority * 100).toFixed(1)}% priority`}</td>
                  <td>{run.outcomeCounts.completed} ok / {run.outcomeCounts.failed} failed<br />{run.outcomeCounts.categoryMismatches} category / {run.outcomeCounts.priorityMismatches} priority mismatches</td>
                  <td>{run.latencyMs} ms</td>
                  <td>${run.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
