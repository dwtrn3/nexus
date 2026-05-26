/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          500: '#4F6AF0',
          600: '#3D56D9',
          700: '#2E42C2',
          900: '#1a2a7f'
        }
      }
    }
  },
  plugins: []
}
