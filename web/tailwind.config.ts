import type { Config } from "tailwindcss";

// Tokens copied 1:1 from the nexus-efos.html concept document's :root
// custom properties (verified against source, 21 Jul 2026 — prior values
// had drifted: ink family was violet/purple instead of the doc's navy).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    screens: {
      sm: "640px",
      dt: "960px", // matches the concept doc's own shell breakpoint exactly
      lg: "1024px",
      xl: "1280px",
    },
    extend: {
      colors: {
        ink: {
          950: "#050d1a",
          900: "#050d1a", // pinned to match ink-950 exactly per GM directive — no
          850: "#0f2444", // navy variation anywhere in the app; login's own color
          800: "#163660", // is the single source of truth for the whole app's chrome.
          700: "#1a3a6b",
        },
        gold: {
          300: "#efdba3",
          400: "#e2c46a",
          500: "#C8A951",
          600: "#a98a3f",
        },
        paper: {
          0: "#FAF6EE",
          50: "#F6EDD9",
          100: "#efe0b8",
        },
        green: { 600: "#16613A", 100: "#E8F5EE" },
        rose: { 600: "#c97a1a", 100: "#FDF3DC" },
        violet: { 500: "#8BA3BC" },
        text: {
          900: "#08172E",
          700: "#33475c",
          500: "#4E6580",
          muted: "#8BA3BC",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "20px",
      },
      spacing: {
        "shell-top": "56px",
        tabbar: "64px",
      },
    },
  },
  plugins: [],
};
export default config;
