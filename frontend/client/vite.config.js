import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const imagesDir = path.resolve(__dirname, '../pages/images')

function resolveImagesPlugin() {
  return {
    name: 'resolve-images',
    resolveId(source) {
      if (source.endsWith('.png') || source.endsWith('.jpg') || source.endsWith('.jpeg') || source.endsWith('.svg') || source.endsWith('.webp')) {
        const basename = path.basename(source)
        const target = path.join(imagesDir, basename)
        if (fs.existsSync(target)) {
          return target
        }
      }
      return null
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), resolveImagesPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: './images', replacement: imagesDir },
      { find: '../images', replacement: imagesDir },
      { find: '@/images', replacement: imagesDir },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    fs: { allow: [path.resolve(__dirname, '..')] },
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
