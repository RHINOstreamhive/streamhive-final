/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0b0e14",
        card: "#111723",
        stroke: "#1b2130",
        purple: "#7c3aed",
        cyan: "#22d3ee",
        green: "#10b981",
        magenta: "#ec4899"
      }
    }
  },
  plugins: []
};
