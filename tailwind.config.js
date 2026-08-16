/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // "Calm Premium Healthcare": one professional sans everywhere.
        display: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        // Token NAMES kept across rethemes (mist/ink/brand/sage/good/warn/coral);
        // values are the Carelune "Calm Premium Healthcare" system.
        mist: { DEFAULT: "#F6F8F9", 100: "#EEF3F4", 200: "#E5EAEC" }, // app bg / subtle surfaces
        ink: "#172126", // primary text — charcoal-navy
        line: "#DCE4E7", // subtle grey-blue border
        // PRIMARY = calm sky blue (theme: sky-blue + charcoal + white/soft-grey).
        // Token NAME kept as `brand` so every primary surface flips here in one place.
        // 600 = vibrant primary for graphics/heroes/rings; 800/900 = AA-safe button fills.
        brand: {
          50: "#F0F6FE", // accent tint
          100: "#DDEBFB",
          200: "#BFD9F7",
          300: "#93BFF0",
          400: "#5E9DE6",
          500: "#3B82D9",
          600: "#2A6FC7", // primary action / luminous clinical blue
          700: "#215AA6",
          800: "#1C4A85", // primary button fill (white text, AA)
          900: "#183C6B", // button hover / strongest
        },
        // Secondary text starts at sage-600 (#526168). sage-400 is border/icon only.
        // 500 nudged darker (#6B7A80→#667379) to clear WCAG AA (4.5:1) as caption
        // text on white; 400 stays for borders/icons/decorative only (not text).
        sage: { 400: "#90A0A6", 500: "#667379", 600: "#526168", 700: "#3A464B" },
        good: { 100: "#DDEDE4", 300: "#8CC7AC", 500: "#2C8761", 600: "#216E4E" }, // success / normal
        warn: { 100: "#F5ECD9", 300: "#DEC489", 500: "#A66E08", 600: "#8A5A00" }, // caution
        coral: { 100: "#FBEAE8", 200: "#F3CDC8", 500: "#C4392C", 600: "#B42318" }, // critical
        // Phase-2 premium clinical system — calm sky blue on white/soft-grey/near-black.
        sky: {
          50: "#F0F6FE",
          100: "#DDEBFB",
          200: "#BFD9F7",
          300: "#93BFF0",
          400: "#5E9DE6",
          500: "#3B82D9",
          600: "#2A6FC7", // primary action / luminous clinical blue
          700: "#215AA6",
          800: "#1C4A85",
          900: "#183C6B",
        },
        // Doctor-experience authority surface — deep midnight/navy for heroes.
        midnight: {
          950: "#070C17",
          900: "#0A1120",
          800: "#0F1A2E",
          700: "#16243D",
          600: "#1E3050",
          500: "#294066",
          400: "#3A567F",
        },
        // On-navy text/lines tuned for AA contrast over midnight surfaces.
        haze: {
          100: "#EAF1FA", // near-white body on navy
          200: "#C7D6EC",
          300: "#9DB2D2", // secondary on navy
          400: "#6E86AC", // muted / captions on navy
        },
      },
      borderRadius: {
        // Soft rounded "sheets" — friendly but not oversized (reference-inspired).
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        // Soft, diffuse elevation — calm, never heavy or coloured.
        card: "0 1px 3px 0 rgba(23,33,38,0.05), 0 1px 2px -1px rgba(23,33,38,0.04)",
        lift: "0 2px 6px -1px rgba(23,33,38,0.06), 0 12px 28px -14px rgba(23,33,38,0.14)",
        // Composed premium surface — used sparingly on the signature screens.
        panel: "0 1px 2px rgba(16,26,46,0.04), 0 8px 24px -12px rgba(16,26,46,0.10)",
        // Elevation over the midnight hero.
        hero: "0 24px 60px -30px rgba(7,12,23,0.55)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Progressive-disclosure reveal — a little more travel than fade-up.
        reveal: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Recovery-trajectory line draw.
        draw: {
          "0%": { "stroke-dashoffset": "var(--dash, 300)" },
          "100%": { "stroke-dashoffset": "0" },
        },
        // Quiet processing shimmer for the AI journey.
        breathe: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.2s ease-out both",
        reveal: "reveal 0.45s cubic-bezier(0.16,1,0.3,1) both",
        draw: "draw 0.9s cubic-bezier(0.16,1,0.3,1) both",
        breathe: "breathe 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
