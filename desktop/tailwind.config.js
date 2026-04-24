/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0d0d0d',
        panel:   '#141414',
        border:  '#222222',
        accent:  '#7c3aed',
        muted:   '#666666',
      },
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] }
    }
  },
  plugins: []
}
