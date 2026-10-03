/** @type {import('tailwindcss').Config} */
// Dark "guild hall" palette. Token roles match the other apps in this series:
// deep = surfaces (950 page, 900 card, 600 borders), mist = text (100 strongest),
// beacon = accent (gold: rewards and primary actions), jade = success,
// amber = pending/warning, ember = rejected/destructive.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: { 950: "#0E1120", 900: "#141828", 850: "#191E32", 800: "#20263D", 700: "#2E3652", 600: "#434C6E" },
        mist: { 100: "#F4EFE4", 200: "#DDD7C9", 400: "#A4A8BC", 500: "#7F849D", 600: "#5C617A" },
        beacon: { 200: "#FBE6B0", 300: "#F5D27A", 400: "#F2C14E", 500: "#D4A53A", 600: "#A9811F" },
        jade: { 400: "#6DD3A5", 500: "#4FBF8E", 600: "#3A9C74" },
        amber: { 300: "#F7A972", 400: "#F28F4F", 500: "#D9733A" },
        ember: { 400: "#F0786A", 500: "#E0584A", 600: "#B8433A" },
      },
      fontFamily: {
        display: ["'Young Serif'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        sheet: "0 1px 0 0 rgba(244,239,228,0.05) inset, 0 18px 36px -22px rgba(0,0,0,0.65)",
        tag: "0 1px 0 0 rgba(244,239,228,0.06) inset, 0 22px 40px -24px rgba(0,0,0,0.8)",
      },
      backgroundImage: {
        grain: "radial-gradient(circle at 1px 1px, rgba(244,239,228,0.045) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};
