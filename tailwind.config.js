/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          subtle: '#eef2ff',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f9fafb',
          subtle: '#f3f4f6',
        },
        border: {
          DEFAULT: '#e5e7eb',
          strong: '#d1d5db',
        },
        text: {
          DEFAULT: '#111827',
          muted: '#6b7280',
          subtle: '#9ca3af',
        },
        danger: {
          DEFAULT: '#dc2626',
          subtle: '#fef2f2',
        },
        warning: {
          DEFAULT: '#d97706',
          subtle: '#fffbeb',
        },
        success: {
          DEFAULT: '#16a34a',
          subtle: '#f0fdf4',
        },
        info: {
          DEFAULT: '#0284c7',
          subtle: '#f0f9ff',
        },
        accent: {
          warm: '#f59e0b',
          cool: '#06b6d4',
          purple: '#8b5cf6',
          heat: {
            50: '#fff7ed',
            100: '#ffedd5',
            300: '#fdba74',
            500: '#f97316',
            700: '#c2410c',
            900: '#7c2d12',
          },
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px 0 rgba(0,0,0,0.04)',
        cardHover: '0 4px 12px 0 rgba(0,0,0,0.08)',
      },
      borderRadius: {
        card: '12px',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans JP', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
