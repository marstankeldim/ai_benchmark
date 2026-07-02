import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "EvalForge — LLM Benchmarking",
  description: "Compare LLMs across rigorous benchmarks with statistically honest results.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="text-lg">⚒</span>
              <span>EvalForge</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Leaderboard</Link>
              <Link href="/runs" className="hover:text-foreground">Runs</Link>
              <a href="https://github.com" className="hover:text-foreground">Docs</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
          EvalForge — reproducible LLM evaluation with confidence intervals and significance tests.
        </footer>
      </body>
    </html>
  );
}
