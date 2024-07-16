import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/primereact/**/*.{js,ts,jsx,tsx}',
  ],
  important: '#root',
  theme: {
    extend: {
      animation: {
        spin: 'spin 0.8s linear infinite',
        'spin-ease': 'spin 0.8s ease infinite',
        'fade-in': 'fade-in 0.3s ease-in-out forwards',
      },
      boxShadow: {
        'revert-md':
          'box-shadow: 0 -4px 6px -1px rgb(0 0 0 / 0.1), 0 -2px 4px -2px rgb(0 0 0 / 0.1);',
      },
    },
    colors: {
      transparent: 'transparent',
      inherit: 'inherit',
      currentColor: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      'palette-vivid-red': '#d72124',
      'palette-bright-orange': '#f16b00',
      'palette-deep-green': '#007453',
      'palette-soft-coral': '#e79484',
      'palette-dark-purple': '#6b2a76',
      'palette-ocean-blue': '#586f7c',
      error: {
        light: '#FFA48D',
        main: '#FF4842',
        dark: '#B72136',
      },
      warning: {
        light: '#f8bf6e',
        main: '#ff9800',
        dark: '#a97702',
      },
      success: {
        light: '#AAF27F',
        main: '#43a047',
        dark: '#27652b',
      },
      info: {
        light: '#74CAFF',
        main: '#2196f3',
        dark: '#0C53B7',
      },
      'gray-50': '#f9fafb',
      'gray-100': '#f3f4f6',
      'gray-200': '#e5e7eb',
      'gray-300': '#d1d5db',
      'gray-400': '#9ca3af',
      'gray-500': '#6b7280',
      'gray-600': '#4b5563',
      'gray-700': '#374151',
      'gray-800': '#1f2937',
      'gray-900': '#111827',
      'gray-950': '#030712',
    },
    fontFamily: {
      display:
        '-apple-system, Verdana, PingFang, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      sans: '-apple-system, Verdana, PingFang, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      mono: ['ui-monospace', 'Roboto Mono', 'Courier Prime', 'monospace'],
    },
    screens: {
      sm: '640px',
      // => @media (min-width: 640px) { ... }

      md: '768px',
      pad: '768px',
      // => @media (min-width: 768px) { ... }

      lg: '1024px',
      // => @media (min-width: 1024px) { ... }

      xl: '1280px',
      desktop: '1280px',
      // => @media (min-width: 1280px) { ... }

      '2xl': '1366px',
      // => @media (min-width: 1366px) { ... }

      '3xl': '1536px',
      // => @media (min-width: 1536px) { ... }
    },
  },
  plugins: [],
} satisfies Config;
