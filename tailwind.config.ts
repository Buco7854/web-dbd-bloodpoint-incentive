import type { Config } from 'tailwindcss';

/**
 * Dead by Daylight theme: dark, grungy, crimson accents, bone-coloured text.
 * The warm -> hot scale (`bonus-*`) drives the per-card colour ramp as the
 * incentive percentage climbs.
 */
const config: Config = {
  content: ['./src/web/index.html', './src/web/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Backgrounds: deep charcoal with a faint warm tint (just off black).
        void: {
          900: '#0b0a0e',
          800: '#100f15',
          700: '#18151c',
          600: '#201d24',
          500: '#28242e',
        },
        // The Entity's crimson.
        blood: {
          50: '#fff1f1',
          200: '#ffb3b3',
          400: '#f0444c',
          500: '#e01e2b',
          600: '#c1121f',
          700: '#8b0000',
          800: '#5e0a0e',
          900: '#3a0608',
        },
        // Bone / ash text.
        bone: {
          100: '#f5f1ea',
          200: '#e8e3da',
          300: '#cfc7b8',
          400: '#b8b0a3',
          500: '#938b7e',
          600: '#6b6459',
        },
        // Warm ramp for the bonus scale.
        ember: {
          400: '#ffd166',
          500: '#ff9f1c',
          600: '#ff6b1c',
        },
        // Survivor / killer accents.
        survivor: '#36c2a6',
        killer: '#e01e2b',
      },
      fontFamily: {
        display: ['Oswald', 'system-ui', 'sans-serif'],
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(224, 30, 43, 0.55)',
        'glow-soft': '0 0 18px -6px rgba(255, 107, 28, 0.5)',
        card: '0 10px 30px -12px rgba(0, 0, 0, 0.8)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 14px -6px rgba(224,30,43,0.45)' },
          '50%': { boxShadow: '0 0 28px -2px rgba(224,30,43,0.8)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '41%': { opacity: '1' },
          '42%': { opacity: '0.55' },
          '43%': { opacity: '1' },
          '88%': { opacity: '1' },
          '89%': { opacity: '0.7' },
          '90%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
        flicker: 'flicker 6s linear infinite',
      },
      backgroundImage: {
        'grunge-radial':
          'radial-gradient(1200px 600px at 50% -10%, rgba(193,18,31,0.16), transparent 60%)',
        'card-sheen':
          'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 40%)',
      },
    },
  },
  plugins: [],
};

export default config;
