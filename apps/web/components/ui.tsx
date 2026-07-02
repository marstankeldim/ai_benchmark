/** Minimal shadcn/ui-style primitives (Card, Badge, Table, Tabs) built on the
 *  Tailwind token setup in globals.css. Kept dependency-free and small. */

import type { ReactNode } from "react";

export function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>{children}</div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pt-4 pb-2", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold text-muted-foreground", className)}>{children}</h3>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "danger" | "muted" }) {
  const tones: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    danger: "bg-red-500/15 text-red-600 dark:text-red-400",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return (
    <th className={cn("border-b px-3 py-2 font-medium text-muted-foreground", right ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

export function Td({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("border-b px-3 py-2", right ? "text-right tabular-nums" : "text-left", className)}>{children}</td>;
}

export function Tabs({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-md px-3 py-1 text-sm capitalize transition-colors",
            value === opt ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <span className="h-3 w-3 animate-ping rounded-full bg-primary" />
      {label}
    </div>
  );
}

export function ErrorState({ error }: { error: string }) {
  return (
    <Card className="border-red-500/30">
      <CardContent>
        <p className="pt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Is the API running? Start it with <code className="rounded bg-muted px-1">npm run dev:api</code>.
        </p>
      </CardContent>
    </Card>
  );
}
