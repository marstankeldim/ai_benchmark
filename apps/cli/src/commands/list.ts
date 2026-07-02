/** `evalforge list` — show stored runs (most recent first). */

import { pct } from "@evalforge/reporting";
import { bold, dim, green, table } from "../console.js";
import { getStore } from "../store.js";

export async function listCommand(): Promise<number> {
  const runs = await getStore().listRuns();
  if (runs.length === 0) {
    console.log(dim("No runs yet. Try:  evalforge run --benchmark gsm8k --model mock:balanced"));
    return 0;
  }

  console.log(bold(`\n${runs.length} run(s)\n`));
  console.log(
    table(
      [
        { header: "Run ID" },
        { header: "Date" },
        { header: "Status" },
        { header: "Benchmarks", align: "right" },
        { header: "Models", align: "right" },
        { header: "Top score", align: "right" },
      ],
      runs.map((r) => {
        const top = r.summary ? [...r.summary.byModel].sort((a, b) => b.overall - a.overall)[0] : undefined;
        return [
          r.runId,
          r.createdAt.slice(0, 19).replace("T", " "),
          r.status,
          String(r.config.benchmarks.length),
          String(r.config.models.length),
          top ? green(pct(top.overall)) : "—",
        ];
      }),
    ),
  );
  console.log("");
  return 0;
}
