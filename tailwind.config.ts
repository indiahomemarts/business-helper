import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF9F6",
        surface: "#FFFFFF",
        ink: "#211A15",
        "ink-muted": "#6E6259",
        "ink-faint": "#9C9188",
        border: "#E7E0D6",
        cocoa: {
          DEFAULT: "#5C3A21",
          dark: "#3E2716",
          light: "#7A5233",
        },
        urgent: {
          DEFAULT: "#B3401D",
          bg: "#FBEAE3",
        },
        pending: {
          DEFAULT: "#96700F",
          bg: "#FAF1DD",
        },
        good: {
          DEFAULT: "#3F6B4A",
          bg: "#E9F2EA",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"SFMono-Regular"',
          "Menlo",
          "Consolas",
          '"Liberation Mono"',
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(33, 26, 21, 0.06), 0 1px 1px rgba(33, 26, 21, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
