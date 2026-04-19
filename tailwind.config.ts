import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: "#f3f6fb",
        panel: "#ffffff",
        border: "#d7e0ed",
        ink: "#122339",
        accent: "#0c7ef2",
        accentSoft: "#e8f3ff",
        success: "#1e8f4d",
        warning: "#d97917",
        danger: "#c9372c"
      },
      boxShadow: {
        panel: "0 8px 30px rgba(18, 35, 57, 0.08)"
      },
      fontFamily: {
        sans: ["'Sora'", "'Segoe UI'", "sans-serif"],
        mono: ["'JetBrains Mono'", "'SF Mono'", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
