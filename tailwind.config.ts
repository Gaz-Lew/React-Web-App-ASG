import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Instrument Sans", "system-ui", "sans-serif"],
        display: ["Syne", "system-ui", "sans-serif"],
      },
      colors: {
        gold: "#c9a84c",
        navy: "#1a1a2e",
        brass: {
          DEFAULT: "#b8933a",
          light: "#d4aa55",
          dark: "#9a7a2e",
        },
        panel: "#1A1A1D",
        hover: "#222226",
        sidebar: {
          bg: "#1A1A1D",
          text: "#c8c8c4",
          muted: "#7a7a74",
          border: "rgba(255,255,255,0.06)",
          hover: "rgba(255,255,255,0.06)",
          active: "rgba(184,147,58,0.12)",
        },
      },
      animation: {
        "slide-in-from-right-4": "slideInFromRight 0.3s ease-out",
        marquee: "marquee 25s linear infinite",
      },
      keyframes: {
        slideInFromRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
