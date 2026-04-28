/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './app/**/*.{js,jsx,ts,tsx}',
      './components/**/*.{js,jsx,ts,tsx}',
    ],
    theme: {
      extend: {
        colors: {
          brand: '#E8590C',
          'brand-light': '#FFF4EE',
        },
      },
    },
    plugins: [],
  }