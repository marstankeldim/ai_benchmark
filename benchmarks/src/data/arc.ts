import type { BenchmarkTask } from "@evalforge/shared";

/** AI2 Reasoning Challenge (ARC) — grade-school science multiple choice (sample). */
export const ARC_TASKS: BenchmarkTask[] = [
  { id: "arc-1", input: "Which of these is a renewable resource?", choices: ["Coal", "Natural gas", "Sunlight", "Crude oil"], expected: "C" },
  { id: "arc-2", input: "Which gas do plants absorb from the atmosphere during photosynthesis?", choices: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], expected: "B" },
  { id: "arc-3", input: "Which state of matter has a definite volume but no definite shape?", choices: ["Solid", "Liquid", "Gas", "Plasma"], expected: "B" },
  { id: "arc-4", input: "What force pulls objects toward the center of the Earth?", choices: ["Magnetism", "Friction", "Gravity", "Tension"], expected: "C" },
  { id: "arc-5", input: "In most plants, which structure carries out the majority of photosynthesis?", choices: ["Roots", "Stem", "Leaves", "Flowers"], expected: "C" },
  { id: "arc-6", input: "What is the primary source of energy that drives Earth's weather and climate?", choices: ["The Moon", "The Sun", "Geothermal heat", "Ocean currents"], expected: "B" },
  { id: "arc-7", input: "Which of the following animals is a mammal?", choices: ["Shark", "Frog", "Dolphin", "Eagle"], expected: "C" },
  { id: "arc-8", input: "What generally happens to the volume of most materials when they are heated?", choices: ["They contract", "They expand", "They stay exactly the same", "They freeze"], expected: "B" },
];
