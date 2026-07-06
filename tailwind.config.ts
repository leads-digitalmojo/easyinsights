import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        slate: {
          150: "#e8edf3",
          450: "#7c8ea6",
          850: "#162032",
          905: "#0d1520",
        },
        red: {
          150: "#fde4e4",
          350: "#f87575",
        },
        indigo: {
          150: "#dde4ff",
        },
        blue: {
          150: "#dbeafe",
        },
        emerald: {
          150: "#d1fae5",
        },
        orange: {
          150: "#ffedd5",
        },
      },
    },
  },
  plugins: [],
};
export default config;
