/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./pages/**/*.{ts,tsx,js,jsx}",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#f97316",
          primaryHover: "#ea580c",
          bot: "#16a34a",
          botHover: "#15803d",
        },
      },
      borderColor: {
        subtle: "rgb(226 232 240 / 0.6)",
      },
      boxShadow: {
        card: "0 10px 20px -10px rgba(251,146,60,0.15)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      container: {
        center: true,
        padding: "1rem",
        screens: { "2xl": "1280px" },
      },
    },
  },
  
};
