import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#D85A30',
          dark: '#B8471F',
          light: '#FBF0EB',
          border: '#F5DDD4',
        },
        charcoal: {
          DEFAULT: '#2C2C2A',
          light: '#444441',
        },
        stone: {
          50: '#FAF5F0',
          100: '#F2EDE8',
          200: '#E8DDD4',
          300: '#E0D5CC',
          400: '#A8A29E',
          500: '#78716C',
        },
      },
    },
  },
}

export default config
