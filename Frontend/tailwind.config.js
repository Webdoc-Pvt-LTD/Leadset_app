/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        sidebar: {
          bg:     '#0f1117',
          card:   '#161922',
          border: '#1e2330',
          hover:  '#1c2135',
        }
      }
    },
  },
  plugins: [],
}
