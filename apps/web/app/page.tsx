"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  api,
  CHART_COLORS,
  LEADERBOARD_DIMENSIONS,
  modelName,
  pct,
  type Dimension,
  type LeaderboardEntry,
  type RunListItem,
  type RunSummary,
} from "../lib/api";
import { Badge, Card, CardContent, CardHeader, CardTitle, ErrorState, Spinner, Table, Tabs, Td, Th } from "../components/ui";
import { MetricBars, ScoreHistory } from "../components/charts";

export default function LeaderboardPage() {
  const [dimension, setDimension] = useState<Dimension>("overall");
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [summaries, setSummaries] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.leaderboard(dimension).then(setBoard).catch((e: Error) => setError(e.message));
  }, [dimension]);

  useEffect(() => {
    api
      .runs()
      .then(async (list) => {
        setRuns(list);
        const withSummary = list.filter((r) => r.hasSummary).slice(0, 12);
        const loaded = await Promise.all(withSummary.map((r) => api.run(r.runId).catch(() => null)));
        setSummaries(loaded.filter((s): s is RunSummary => s !== null));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const isRate = dimension !== "latency" && dimension !== "cost";
  const barData = useMemo(
    () => (board ?? []).map((e) => ({ name: e.model, score: isRate ? Number((e.score * 100).toFixed(1)) : Number(e.score.toFixed(4)) })),
    [board, isRate],
  );

  const { historyData, historyModels } = useMemo(() => buildHistory(summaries), [summaries]);

  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Ranked across all stored runs. Every score is a real sample — not a single point estimate.</p>
      </div>

      <Tabs options={LEADERBOARD_DIMENSIONS} value={dimension} onChange={(v) => setDimension(v as Dimension)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ranking — {dimension}</CardTitle></CardHeader>
          <CardContent>
            {!board ? (
              <Spinner />
            ) : board.length === 0 ? (
              <EmptyRuns />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th><Th>Model</Th><Th>Provider</Th>
                    <Th right>Score</Th><Th right>Samples</Th><Th right>Runs</Th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((e, i) => (
                    <tr key={e.model}>
                      <Td>{e.rank}</Td>
                      <Td className="font-medium">{e.model}</Td>
                      <Td><Badge tone="muted">{e.provider}</Badge></Td>
                      <Td right className="font-semibold">{formatScore(e.score, dimension)}</Td>
                      <Td right>{e.samples}</Td>
                      <Td right>{e.runs}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{isRate ? "Score" : dimension} by model</CardTitle></CardHeader>
          <CardContent>
            {!board ? <Spinner /> : board.length === 0 ? <EmptyRuns /> : (
              <MetricBars
                data={barData}
                dataKey="score"
                format={(v) => (isRate ? `${v}%` : dimension === "cost" ? `$${v}` : `${v}ms`)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {historyModels.length > 0 && historyData.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Overall score over time</CardTitle></CardHeader>
          <CardContent><ScoreHistory data={historyData} models={historyModels} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? <EmptyRuns /> : (
            <Table>
              <thead>
                <tr><Th>Run</Th><Th>Date</Th><Th>Status</Th><Th>Benchmarks</Th><Th right>Models</Th><Th /></tr>
              </thead>
              <tbody>
                {runs.slice(0, 10).map((r) => (
                  <tr key={r.runId}>
                    <Td className="font-mono text-xs">{r.runId.slice(0, 16)}…</Td>
                    <Td>{r.createdAt.slice(0, 19).replace("T", " ")}</Td>
                    <Td><Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "muted"}>{r.status}</Badge></Td>
                    <Td className="text-xs">{r.config.benchmarks.join(", ")}</Td>
                    <Td right>{r.config.models.length}</Td>
                    <Td right>{r.hasSummary && <Link href={`/runs/${r.runId}`} className="text-primary hover:underline">View →</Link>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatScore(score: number, dimension: string): string {
  if (dimension === "latency") return `${Math.round(score)}ms`;
  if (dimension === "cost") return `$${score.toFixed(4)}`;
  return pct(score);
}

function buildHistory(summaries: RunSummary[]): { historyData: Record<string, number | string>[]; historyModels: string[] } {
  const sorted = [...summaries].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const models = new Set<string>();
  const historyData = sorted.map((s) => {
    const row: Record<string, number | string> = { date: s.createdAt.slice(5, 16).replace("T", " ") };
    for (const m of s.byModel) {
      const name = modelName(m.model);
      models.add(name);
      row[name] = Number((m.overall * 100).toFixed(1));
    }
    return row;
  });
  return { historyData, historyModels: [...models] };
}

function EmptyRuns() {
  return (
    <div className="py-6 text-sm text-muted-foreground">
      No runs yet. Seed some with <code className="rounded bg-muted px-1">npm run seed</code>, or run one via the API / CLI.
      <span className="ml-1 text-xs" style={{ color: CHART_COLORS[0] }}>●</span>
    </div>
  );
}
