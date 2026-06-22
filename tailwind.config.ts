import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0E0E10",
        surface: "#1A1A1E",
        surface2: "#26262C",
        accent: "#7C5CFC",
        "accent-hover": "#6B4EE6",
        speaking: "#22C55E",
        muted: "#EF4444",
        warning: "#F59E0B",
        "text-primary": "#F4F4F5",
        "text-secondary": "#A1A1AA",
        border: "rgba(255,255,255,0.08)",
      },
      borderRadius: {
        DEFAULT: "8px",
        card: "12px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
