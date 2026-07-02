import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "./parse/csv.js";
import { parseJsonl } from "./parse/jsonl.js";
import { toTask, toTasks } from "./mapping.js";
import {
  loadCsvTasks,
  loadHuggingFace,
  loadJsonTasks,
  loadJsonlTasks,
} from "./loaders.js";
import { applyLoadOptions, buildDataset, hashTasks } from "./dataset.js";

describe("csv parser (RFC 4180)", () => {
  it("handles quotes, commas, and newlines inside fields", () => {
    const csv = 'id,prompt\n1,"hello, world"\n2,"line1\nline2"';
    const records = toRecords(parseCsv(csv));
    expect(records).toHaveLength(2);
    expect(records[0]!.prompt).toBe("hello, world");
    expect(records[1]!.prompt).toBe("line1\nline2");
  });

  it("unescapes doubled quotes", () => {
    const rows = parseCsv('a\n"say ""hi"""');
    expect(rows[1]![0]).toBe('say "hi"');
  });
});

describe("jsonl parser", () => {
  it("skips blanks and reports the bad line number", () => {
    expect(parseJsonl('{"a":1}\n\n{"a":2}')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(() => parseJsonl('{"a":1}\nnot json')).toThrow(/line 2/);
  });
});

describe("field mapping", () => {
  it("applies defaults and collects rest into metadata", () => {
    const task = toTask({ id: "q1", prompt: "2+2?", expected: "4", topic: "math" });
    expect(task.id).toBe("q1");
    expect(task.input).toBe("2+2?");
    expect(task.expected).toBe("4");
    expect(task.metadata).toEqual({ topic: "math" });
  });

  it("falls back to positional ids and input field", () => {
    const tasks = toTasks([{ input: "hi" }, { input: "bye" }]);
    expect(tasks.map((t) => t.id)).toEqual(["task-0", "task-1"]);
  });

  it("honors a custom mapping", () => {
    const task = toTask(
      { qid: "7", question: "Q?", answer: "A" },
      { idField: "qid", promptField: "question", expectedField: "answer", metadata: false },
    );
    expect(task.id).toBe("7");
    expect(task.input).toBe("Q?");
    expect(task.expected).toBe("A");
    expect(task.metadata).toBeUndefined();
  });
});

describe("loaders", () => {
  it("loads JSON arrays and wrapped objects identically", () => {
    const arr = loadJsonTasks('[{"id":"a","prompt":"x","expected":"y"}]');
    const wrapped = loadJsonTasks('{"tasks":[{"id":"a","prompt":"x","expected":"y"}]}');
    expect(arr).toEqual(wrapped);
    expect(arr[0]!.expected).toBe("y");
  });

  it("loads JSONL and CSV", () => {
    const jsonl = loadJsonlTasks('{"id":"1","prompt":"p"}\n{"id":"2","prompt":"q"}');
    expect(jsonl).toHaveLength(2);
    const csv = loadCsvTasks("id,prompt,expected\n1,p,e");
    expect(csv[0]).toMatchObject({ id: "1", input: "p", expected: "e" });
  });

  it("loads from a mock HuggingFace datasets-server", async () => {
    const fetchImpl = (async (url: string | URL) => {
      expect(String(url)).toContain("datasets-server.huggingface.co/rows");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rows: [
            { row: { id: "h1", question: "Q1", answer: "A1" } },
            { row: { id: "h2", question: "Q2", answer: "A2" } },
          ],
        }),
      };
    }) as unknown as typeof fetch;

    const tasks = await loadHuggingFace({
      dataset: "acme/demo",
      split: "test",
      limit: 2,
      fetchImpl,
      mapping: { promptField: "question", expectedField: "answer" },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ id: "h1", input: "Q1", expected: "A1" });
  });
});

describe("dataset build + load options", () => {
  it("content hash is stable and content-sensitive", () => {
    const t = [toTask({ id: "1", prompt: "a", expected: "b" })];
    const h1 = hashTasks(t);
    const h2 = hashTasks([toTask({ id: "1", prompt: "a", expected: "b" })]);
    const h3 = hashTasks([toTask({ id: "1", prompt: "a", expected: "CHANGED" })]);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("metadata changes do not change the fingerprint", () => {
    const a = [toTask({ id: "1", prompt: "a", expected: "b", note: "x" })];
    const b = [toTask({ id: "1", prompt: "a", expected: "b", note: "y" })];
    expect(hashTasks(a)).toBe(hashTasks(b));
  });

  it("buildDataset fills a version and hash", () => {
    const ds = buildDataset({ id: "d", name: "D", tasks: [toTask({ id: "1", prompt: "p" })] });
    expect(ds.version).toBe("1.0.0");
    expect(ds.contentHash).toHaveLength(16);
  });

  it("applyLoadOptions filters, shuffles deterministically, and limits", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => toTask({ id: String(i), prompt: `p${i}` }));
    const limited = applyLoadOptions(tasks, { limit: 3 });
    expect(limited).toHaveLength(3);

    const s1 = applyLoadOptions(tasks, { shuffle: true, seed: 5, limit: 4 });
    const s2 = applyLoadOptions(tasks, { shuffle: true, seed: 5, limit: 4 });
    expect(s1.map((t) => t.id)).toEqual(s2.map((t) => t.id));

    const filtered = applyLoadOptions(tasks, { filter: (t) => Number(t.id) % 2 === 0 });
    expect(filtered.every((t) => Number(t.id) % 2 === 0)).toBe(true);
  });
});
