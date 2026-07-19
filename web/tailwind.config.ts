import type { Config } from "tailwindcss";

// Tokens copied 1:1 from the nexus-efos.html concept document's :root
// custom properties, so the working app matches the concept doc exactly.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#120a1f",
          900: "#1B0F35",
          850: "#221542",
          800: "#2A1B4D",
          700: "#3B2965",
        },
        gold: {
          300: "#F0CD8E",
          400: "#E8B563",
          500: "#D59535",
          600: "#B67B22",
        },
        paper: {
          0: "#FBFAF7",
          50: "#F5F1E9",
          100: "#ECE4D4",
        },
        green: { 600: "#4F8F6B", 100: "#E4EFE8" },
        rose: { 600: "#8B5A56", 100: "#F1E5E3" },
        violet: { 500: "#8B85A0" },
        text: {
          900: "#1B1530",
          700: "#403A57",
          500: "#655F78",
          muted: "#8C86A0",
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
    },
  },
  plugins: [],
};
export default config;
