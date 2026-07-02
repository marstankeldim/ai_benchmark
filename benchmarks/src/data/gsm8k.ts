import type { BenchmarkTask } from "@evalforge/shared";

/**
 * GSM8K — grade-school math word problems. `expected` is the final numeric
 * answer; `reference` shows the worked solution (usable by an LLM judge or for
 * display). These are canonical GSM8K-style items.
 */
export const GSM8K_TASKS: BenchmarkTask[] = [
  { id: "gsm8k-1", input: "Natalia sold clips to 48 of her friends in April, and then she sold half as many clips in May. How many clips did she sell altogether in April and May?", expected: "72", reference: "April: 48. May: 48/2 = 24. Total: 48 + 24 = 72." },
  { id: "gsm8k-2", input: "A robe takes 2 bolts of blue fiber and half that much white fiber. How many bolts does it take in total?", expected: "3", reference: "Blue: 2. White: 2/2 = 1. Total: 3." },
  { id: "gsm8k-3", input: "Weng earns $12 an hour for babysitting. Yesterday, she just did 50 minutes of babysitting. How many dollars did she earn?", expected: "10", reference: "12 * (50/60) = 12 * 5/6 = 10." },
  { id: "gsm8k-4", input: "Betty is saving for a $100 wallet. She has half of the money she needs. Her parents give her $15, and her grandparents give her twice as much as her parents. How much more money does Betty need?", expected: "5", reference: "Has 50. +15 (parents) +30 (grandparents) = 95. Needs 100 - 95 = 5." },
  { id: "gsm8k-5", input: "James runs 3 sprints 3 times a week. Each sprint is 60 meters. How many total meters does he run per week?", expected: "540", reference: "3 sprints * 3 days = 9 sprints. 9 * 60 = 540 meters." },
  { id: "gsm8k-6", input: "There are 15 trees in the grove. Grove workers will plant trees today so that afterward there are 21 trees. How many trees did the workers plant?", expected: "6", reference: "21 - 15 = 6." },
  { id: "gsm8k-7", input: "If there are 3 cars in the parking lot and 2 more cars arrive, how many cars are in the parking lot?", expected: "5", reference: "3 + 2 = 5." },
  { id: "gsm8k-8", input: "Leah had 32 chocolates and her sister had 42. If they ate 35 in total, how many pieces do they have left altogether?", expected: "39", reference: "32 + 42 = 74. 74 - 35 = 39." },
];
