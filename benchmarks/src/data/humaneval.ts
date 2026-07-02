import type { BenchmarkTask } from "@evalforge/shared";

/**
 * HumanEval-style Python coding tasks. Each task carries:
 *  - `input`: the prompt shown to the model (signature + docstring),
 *  - `reference`: the test harness (assertions) appended after the candidate,
 *  - `metadata.solution`: a canonical passing implementation, used by the mock
 *    provider to simulate a correct submission (real models get only `input`).
 */
export const HUMANEVAL_TASKS: BenchmarkTask[] = [
  {
    id: "he-1",
    input:
      "Complete this Python function:\n\nfrom typing import List\n\ndef has_close_elements(numbers: List[float], threshold: float) -> bool:\n    \"\"\"Return True if any two numbers in the list are closer to each other than the given threshold.\"\"\"",
    reference:
      "assert has_close_elements([1.0, 2.0, 3.0], 0.5) == False\nassert has_close_elements([1.0, 2.8, 3.0, 4.0, 5.0, 2.0], 0.3) == True\nprint('ok')",
    metadata: {
      entryPoint: "has_close_elements",
      solution:
        "def has_close_elements(numbers, threshold):\n    for i in range(len(numbers)):\n        for j in range(i + 1, len(numbers)):\n            if abs(numbers[i] - numbers[j]) < threshold:\n                return True\n    return False",
    },
  },
  {
    id: "he-2",
    input:
      "Complete this Python function:\n\ndef sum_list(numbers):\n    \"\"\"Return the sum of a list of numbers. The sum of an empty list is 0.\"\"\"",
    reference: "assert sum_list([1, 2, 3, 4]) == 10\nassert sum_list([]) == 0\nprint('ok')",
    metadata: { entryPoint: "sum_list", solution: "def sum_list(numbers):\n    return sum(numbers)" },
  },
  {
    id: "he-3",
    input:
      "Complete this Python function:\n\ndef is_palindrome(s):\n    \"\"\"Return True if the string s reads the same forwards and backwards.\"\"\"",
    reference:
      "assert is_palindrome('racecar') == True\nassert is_palindrome('hello') == False\nassert is_palindrome('') == True\nprint('ok')",
    metadata: { entryPoint: "is_palindrome", solution: "def is_palindrome(s):\n    return s == s[::-1]" },
  },
  {
    id: "he-4",
    input:
      "Complete this Python function:\n\ndef factorial(n):\n    \"\"\"Return n! (the factorial of a non-negative integer n). factorial(0) == 1.\"\"\"",
    reference: "assert factorial(5) == 120\nassert factorial(0) == 1\nassert factorial(1) == 1\nprint('ok')",
    metadata: {
      entryPoint: "factorial",
      solution:
        "def factorial(n):\n    result = 1\n    for i in range(2, n + 1):\n        result *= i\n    return result",
    },
  },
  {
    id: "he-5",
    input:
      "Complete this Python function:\n\ndef count_vowels(s):\n    \"\"\"Return the number of vowels (a, e, i, o, u) in the string s, case-insensitive.\"\"\"",
    reference:
      "assert count_vowels('hello') == 2\nassert count_vowels('XYZ') == 0\nassert count_vowels('AeIoU') == 5\nprint('ok')",
    metadata: {
      entryPoint: "count_vowels",
      solution: "def count_vowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')",
    },
  },
  {
    id: "he-6",
    input:
      "Complete this Python function:\n\ndef gcd(a, b):\n    \"\"\"Return the greatest common divisor of two positive integers a and b.\"\"\"",
    reference: "assert gcd(48, 18) == 6\nassert gcd(7, 13) == 1\nassert gcd(100, 10) == 10\nprint('ok')",
    metadata: {
      entryPoint: "gcd",
      solution: "def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a",
    },
  },
];
