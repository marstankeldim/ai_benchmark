import type { BenchmarkTask, ToolDefinition } from "@evalforge/shared";

/**
 * Tool-use tasks: given a catalog of available functions and a user request, the
 * model must select the right function and produce exactly the right arguments.
 *
 * `expected` is the gold call as *canonical JSON* — keys sorted recursively, no
 * whitespace — matching what the benchmark's `parseOutput` produces, so grading
 * is a strict string comparison plus a schema-validity check.
 */

/** The function catalog offered on every task (choosing correctly is the test). */
export const TOOL_CATALOG: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get current weather for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string" }, units: { type: "string", enum: ["celsius", "fahrenheit"] } },
      required: ["city", "units"],
    },
  },
  {
    name: "search_flights",
    description: "Search one-way flights between two airports on a date.",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, date: { type: "string" } },
      required: ["from", "to", "date"],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a calendar event.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" }, date: { type: "string" }, time: { type: "string" } },
      required: ["title", "date", "time"],
    },
  },
  {
    name: "convert_currency",
    description: "Convert an amount between currencies.",
    parameters: {
      type: "object",
      properties: { amount: { type: "number" }, from: { type: "string" }, to: { type: "string" } },
      required: ["amount", "from", "to"],
    },
  },
  {
    name: "send_email",
    description: "Send an email.",
    parameters: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" } },
      required: ["to", "subject"],
    },
  },
  {
    name: "get_stock_price",
    description: "Get the latest price for a stock ticker symbol.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
];

export const TOOLUSE_TASKS: BenchmarkTask[] = [
  {
    id: "tool-1",
    input: "What's the weather like in Paris right now? Use celsius.",
    expected: '{"arguments":{"city":"Paris","units":"celsius"},"name":"get_weather"}',
  },
  {
    id: "tool-2",
    input: "Find me a flight from JFK to LHR on 2026-08-15.",
    expected: '{"arguments":{"date":"2026-08-15","from":"JFK","to":"LHR"},"name":"search_flights"}',
  },
  {
    id: "tool-3",
    input: 'Put a "Design review" on my calendar for 2026-07-10 at 14:00.',
    expected: '{"arguments":{"date":"2026-07-10","time":"14:00","title":"Design review"},"name":"create_calendar_event"}',
  },
  {
    id: "tool-4",
    input: "How much is 250 US dollars in euros?",
    expected: '{"arguments":{"amount":250,"from":"USD","to":"EUR"},"name":"convert_currency"}',
  },
  {
    id: "tool-5",
    input: 'Email dana@example.com with the subject "Quarterly report".',
    expected: '{"arguments":{"subject":"Quarterly report","to":"dana@example.com"},"name":"send_email"}',
  },
  {
    id: "tool-6",
    input: "What is NVDA trading at?",
    expected: '{"arguments":{"symbol":"NVDA"},"name":"get_stock_price"}',
  },
];
