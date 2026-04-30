/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      './app/**/*.{js,jsx,ts,tsx}',
      './components/**/*.{js,jsx,ts,tsx}',
    ],
    theme: {
      extend: {
        colors: {
          brand: '#D85A30',
          'brand-light': '#FBF0EB',
        },
      },
    },
    plugins: [],
  }