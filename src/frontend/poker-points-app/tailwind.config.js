/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Primary green - based on #3F7602 (Gator green / Green family name)
        'poker-green': {
          DEFAULT: '#3F7602',
          50: '#f4f9ec',
          100: '#e6f2d4',
          200: '#cde5ad',
          300: '#acd37c',
          400: '#8bc053',
          500: '#3F7602',
          600: '#3F7602',
          700: '#345f05',
          800: '#2a4c04',
          900: '#1e3603',
        },
        'poker-felt': {
          DEFAULT: '#3F7602',
          light: '#5a9a1a',
          dark: '#2a4c04',
        },
        'poker-gold': {
          DEFAULT: '#f4c430',
          50: '#fef9e8',
          100: '#fdf0c5',
          200: '#fbe49e',
          300: '#f9d777',
          400: '#f6cb50',
          500: '#f4c430',
          600: '#daa520',
          700: '#b8860b',
          800: '#8b6914',
          900: '#5c4a0f',
        },
        // Accent colors
        'poker-red': '#dc2626',
        'poker-wood': {
          DEFAULT: '#8b4513',
          light: '#a0522d',
          dark: '#5d2f0c',
        },
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(244, 196, 48, 0.4)',
        'glow-green': '0 0 30px rgba(63, 118, 2, 0.5)',
        'card': '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 20px 40px -10px rgba(0, 0, 0, 0.4), 0 8px 16px -4px rgba(0, 0, 0, 0.3)',
        'table': 'inset 0 2px 30px rgba(0, 0, 0, 0.3), 0 10px 40px rgba(0, 0, 0, 0.4)',
        'inner-glow': 'inset 0 0 30px rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        'felt-texture': 'radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%)',
        'card-pattern': 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.03) 5px, rgba(255,255,255,0.03) 10px)',
        'shimmer': 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.1) 50%, transparent 75%)',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'text-glow': 'textGlow 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(244, 196, 48, 0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(244, 196, 48, 0.6)' },
        },
        textGlow: {
          '0%, 100%': { textShadow: '0 0 30px rgba(244, 196, 48, 0.9), 0 0 60px rgba(244, 196, 48, 0.6), 0 0 90px rgba(244, 196, 48, 0.3)' },
          '50%': { textShadow: '0 0 50px rgba(244, 196, 48, 1), 0 0 100px rgba(244, 196, 48, 0.7), 0 0 150px rgba(244, 196, 48, 0.4)' },
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
