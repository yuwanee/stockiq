/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f1117',
        panel: '#1a1d27',
        border: '#2a2d3a',
        accent: '#3b82f6',
        bull: '#22c55e',
        bear: '#ef4444',
        neutral: '#eab308',
      },
    },
  },
  plugins: [],
}
