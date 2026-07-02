"use client";

/** Recharts-based visualizations: radar profile, grouped benchmark bars, metric
 *  bars (latency/cost), score-history line, and a model×benchmark heatmap. */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, pct } from "../lib/api";

export function RadarProfile({ categories, series }: { categories: string[]; series: { name: string; values: Record<string, number> }[] }) {
  const data = categories.map((c) => {
    const row: Record<string, number | string> = { category: c };
    for (const s of series) row[s.name] = Number(((s.values[c] ?? 0) * 100).toFixed(1));
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="hsl(var(--border))" />
        {series.map((s, i) => (
          <Radar key={s.name} name={s.name} dataKey={s.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.12} />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, keys, xKey, asPercent = true }: { data: Record<string, number | string>[]; keys: string[]; xKey: string; asPercent?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={asPercent ? [0, 100] : ["auto", "auto"]} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (asPercent ? `${v}%` : v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MetricBars({ data, dataKey, color = CHART_COLORS[0], format }: { data: Record<string, number | string>[]; dataKey: string; color?: string; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={format} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (format ? format(v) : v)} />
        <Bar dataKey={dataKey} radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreHistory({ data, models }: { data: Record<string, number | string>[]; models: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {models.map((m, i) => (
          <Line key={m} type="monotone" dataKey={m} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Heatmap({ rows, columns, values }: { rows: string[]; columns: string[]; values: Record<string, Record<string, number | undefined>> }) {
  const shade = (v: number | undefined): string => {
    if (v === undefined) return "hsl(var(--muted))";
    const hue = 140; // green
    const light = 92 - v * 52; // 0 → light, 1 → saturated
    return `hsl(${hue} 60% ${light}%)`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="p-1" />
            {columns.map((c) => (
              <th key={c} className="p-1 font-medium text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td className="whitespace-nowrap p-1 pr-2 text-right font-medium text-muted-foreground">{r}</td>
              {columns.map((c) => {
                const v = values[r]?.[c];
                return (
                  <td
                    key={c}
                    className="h-9 w-16 rounded text-center font-medium text-slate-900"
                    style={{ backgroundColor: shade(v) }}
                    title={`${r} · ${c}: ${v === undefined ? "—" : pct(v)}`}
                  >
                    {v === undefined ? "—" : pct(v, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;
