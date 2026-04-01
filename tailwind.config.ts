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
        brass: {
          DEFAULT: "#b8933a",
          light: "#d4aa55",
          dark: "#9a7a2e",
        },
        panel: "#1A1A1D",
        hover: "#222226",
        sidebar: {
          bg: "#0B0B0C",
          text: "#c8c8c4",
          muted: "#7a7a74",
          border: "rgba(255,255,255,0.06)",
          hover: "#222226",
          active: "#1A1A1D",
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
