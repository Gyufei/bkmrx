/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#FAFAF9",
          sidebar: "#F5F5F4",
          card: "#FFFFFF",
          dark: "#1C1917",
          "dark-sidebar": "#292524",
          "dark-card": "#292524",
        },
        border: {
          DEFAULT: "#E7E5E4",
          dark: "#44403C",
        },
        text: {
          primary: "#1C1917",
          secondary: "#78716C",
          "dark-primary": "#FAFAF9",
          "dark-secondary": "#A8A29E",
        },
        accent: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          "dark": "#60A5FA",
          "bg": "#EFF6FF",
          "dark-bg": "#1E3A5F",
        },
        danger: {
          DEFAULT: "#DC2626",
          dark: "#F87171",
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"',
          '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'sans-serif',
        ],
      },
      borderRadius: {
        card: "8px",
        chip: "6px",
        btn: "6px",
        input: "8px",
        modal: "12px",
      },
    },
  },
  plugins: [],
};
