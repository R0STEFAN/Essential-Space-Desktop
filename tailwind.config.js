/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        nothing: {
          black: '#000000',
          dark: '#0B0B0C',
          card: '#141416',
          hover: '#1D1D20',
          border: '#26262A',
          red: '#D71921',
          'red-hover': '#B8141B',
          gray: '#86868B',
          muted: '#86868B',
          light: '#E6E6E6',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        dot: ['NDot57', 'NDot55', 'NDotOriginal', 'ui-monospace', 'Courier New', 'monospace'],
        ndot: ['NDot57', 'NDot55', 'NDotOriginal', 'ui-monospace', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
