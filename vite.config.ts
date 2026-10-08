import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Caminhos relativos: o app funciona em qualquer hospedagem estática,
  // na raiz ou em subpasta.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icone-180.png', 'marca/*.png'],
      manifest: {
        name: 'Viva Noz Consignado',
        short_name: 'Viva Noz',
        description: 'Controle de estoque, visitas e acertos da Viva Noz.',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: './',
        background_color: '#F4EBDD',
        theme_color: '#26351F',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // Subir o Postgres em memória e aplicar todas as migrações leva alguns segundos.
  test: { include: ['tests/**/*.test.ts'], hookTimeout: 60_000, testTimeout: 30_000 },
})
