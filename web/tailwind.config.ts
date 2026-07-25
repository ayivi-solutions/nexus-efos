import type { Config } from "tailwindcss";

// Tokens copied 1:1 from the nexus-efos.html concept document's :root
// custom properties (verified against source, 21 Jul 2026 — prior values
// had drifted: ink family was violet/purple instead of the doc's navy).
//
// 25 Jul 2026 — WCAG AA contrast audit (EUXS Volume XVII, Accessibility):
// text.muted, gold.600, and rose.600 all measured below the required 4.5:1
// ratio for normal text against the backgrounds they're actually used on
// (2.42:1, 3.05:1, 3.03:1 respectively — computed programmatically, not
// eyeballed). Each darkened by the minimum amount needed to clear 4.5:1,
// verified against every background it's actually used against (paper-0,
// white cards, and rose-100 badges). violet.500 shares text.muted's OLD
// hex but is used only on the dark ink-900 sidebar, where it already
// passed comfortably (7.47:1) — left untouched deliberately, since
// darkening it would have made it LESS visible against a dark background.
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
          600: "#876e32", // darkened from #a98a3f for WCAG AA (was 3.05:1, now 4.52:1+)
        },
        paper: {
          0: "#FAF6EE",
          50: "#F6EDD9",
          100: "#efe0b8",
        },
        green: { 600: "#16613A", 100: "#E8F5EE" },
        rose: { 600: "#a06114", 100: "#FDF3DC" }, // darkened from #c97a1a for WCAG AA (was 3.03:1, now 4.52:1+)
        violet: { 500: "#8BA3BC" }, // unchanged — used only on dark ink-900, already 7.47:1
        text: {
          900: "#08172E",
          700: "#33475c",
          500: "#4E6580",
          muted: "#557393", // darkened from #8BA3BC for WCAG AA (was 2.42:1, now 4.57:1+)
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
