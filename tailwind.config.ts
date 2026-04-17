import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0d0c",
          2: "#13161a",
          3: "#1a1f1c",
        },
        ink: {
          DEFAULT: "#f5f1e8",
          dim: "#9a958a",
        },
        paper: "#ede6d3",
        lime: {
          DEFAULT: "#d4ff3a",
          deep: "#a8d400",
        },
        copper: "#d67846",
        plum: "#4a2d5a",
        line: {
          DEFAULT: "rgba(245, 241, 232, 0.12)",
          strong: "rgba(245, 241, 232, 0.28)",
        },
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-sora)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      animation: {
        "fade-up": "fadeUp 0.6s ease-out forwards",
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
        "slide-up": "slideUp 0.4s ease-out forwards",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.2)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
