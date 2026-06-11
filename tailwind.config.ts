import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: "#0c0e14",
        panel: "#161a24",
        accent: "#e8b339",
      },
    },
  },
  plugins: [],
};

export default config;
