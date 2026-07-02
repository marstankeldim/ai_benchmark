import type { BenchmarkTask } from "@evalforge/shared";

/**
 * A representative MMLU sample spanning several subjects. `expected` is the gold
 * option letter; `metadata.subject` enables per-subject breakdowns. This is a
 * small illustrative slice — swap in the full HuggingFace dataset via a loader
 * for a real evaluation.
 */
export const MMLU_TASKS: BenchmarkTask[] = [
  { id: "mmlu-1", input: "What is 7 multiplied by 8?", choices: ["54", "56", "48", "64"], expected: "B", metadata: { subject: "elementary_mathematics" } },
  { id: "mmlu-2", input: "In what year was the American Declaration of Independence adopted?", choices: ["1774", "1775", "1776", "1789"], expected: "C", metadata: { subject: "high_school_us_history" } },
  { id: "mmlu-3", input: "Which planet is known as the Red Planet?", choices: ["Venus", "Mars", "Jupiter", "Saturn"], expected: "B", metadata: { subject: "astronomy" } },
  { id: "mmlu-4", input: "Which organelle is the primary site of ATP production in eukaryotic cells?", choices: ["Nucleus", "Ribosome", "Mitochondrion", "Golgi apparatus"], expected: "C", metadata: { subject: "college_biology" } },
  { id: "mmlu-5", input: "What is the capital city of Australia?", choices: ["Sydney", "Melbourne", "Canberra", "Perth"], expected: "C", metadata: { subject: "geography" } },
  { id: "mmlu-6", input: "What is the chemical symbol for gold?", choices: ["Gd", "Au", "Ag", "Go"], expected: "B", metadata: { subject: "high_school_chemistry" } },
  { id: "mmlu-7", input: "What is the SI unit of electric current?", choices: ["Volt", "Watt", "Ampere", "Ohm"], expected: "C", metadata: { subject: "high_school_physics" } },
  { id: "mmlu-8", input: "Which abstract data type follows first-in, first-out (FIFO) ordering?", choices: ["Stack", "Queue", "Tree", "Graph"], expected: "B", metadata: { subject: "college_computer_science" } },
  { id: "mmlu-9", input: "Who wrote the play 'Romeo and Juliet'?", choices: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"], expected: "B", metadata: { subject: "high_school_european_history" } },
  { id: "mmlu-10", input: "Which term describes a sustained general rise in the price level of goods and services?", choices: ["Deflation", "Recession", "Inflation", "Stagflation"], expected: "C", metadata: { subject: "high_school_macroeconomics" } },
];
