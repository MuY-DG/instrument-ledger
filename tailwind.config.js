/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#fafafa",
          muted: "#f4f4f5",
        },
        obsidian: {
          950: "#09090b",
          900: "#111114",
          850: "#16161a",
          800: "#1c1c21",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
      },
      boxShadow: {
        hairline: "0 1px 2px 0 rgb(9 9 11 / 0.04)",
        surface:
          "0 1px 2px 0 rgb(9 9 11 / 0.03), 0 4px 16px -4px rgb(9 9 11 / 0.05)",
        elevated:
          "0 12px 32px -8px rgb(9 9 11 / 0.12), 0 2px 8px -2px rgb(9 9 11 / 0.06)",
        popover:
          "0 20px 50px -12px rgb(9 9 11 / 0.22), 0 0 0 1px rgb(9 9 11 / 0.06)",
      },
    },
  },
  plugins: [],
};
