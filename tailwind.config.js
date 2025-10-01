/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // si usás tema oscuro por clase en <html> o <body>
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // si tenés monorepo / micro-apps:
    // '../apps/**/*.{js,ts,jsx,tsx}',
    // '../packages/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  // Si usás formularios o tipografías:
  // plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
  plugins: [],
  // Safelist útil si generás clases dinámicas (p. ej., por estado/permiso):
  // safelist: ['text-red-500','bg-green-500','col-span-3','grid-cols-12'],
}
