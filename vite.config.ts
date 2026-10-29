import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // POST /api/token -> https://accounts.spotify.com/api/token
      '/api/token': {
        target: 'https://accounts.spotify.com',
        changeOrigin: true,
      },
    },
  },
})
