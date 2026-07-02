import type { Config } from "tailwindcss";

/** shadcn/ui-style token setup driven by CSS variables (see globals.css). */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      fontFamily: { sans: ["ui-sans-serif", "system-ui", "sans-serif"], mono: ["ui-monospace", "monospace"] },
    },
  },
  plugins: [],
};

export default config;
