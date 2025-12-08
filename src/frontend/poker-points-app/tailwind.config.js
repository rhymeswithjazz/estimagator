/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        'poker-green': '#1a5f2a',
        'poker-felt': '#2d8a4e',
        'poker-gold': '#d4af37',
      },
    },
  },
  plugins: [],
};
