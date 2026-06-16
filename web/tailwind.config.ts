import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2980b9",
          dark: "#2471a3",
          light: "#ebf5fb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
