/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx}','./src/components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple:'#534AB7', purple_l:'#EEEDFE',
          teal:'#1D9E75',   teal_l:'#E1F5EE',
          amber:'#BA7517',  amber_l:'#FAEEDA',
          coral:'#993C1D',  coral_l:'#FAECE7',
          blue:'#185FA5',   blue_l:'#E6F1FB',
          green:'#3B6D11',  green_l:'#EAF3DE',
          gray:'#888780',   gray_l:'#F5F4EF',
          border:'#D3D1C7', dark:'#1A1A1A',
        },
      },
      fontFamily: { sans:['Inter','system-ui','sans-serif'] },
    },
  },
  plugins: [],
};
