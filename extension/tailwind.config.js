/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./sidebar.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "../shared/src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1e293b',
        }
      }
    },
  },
  plugins: [],
}
