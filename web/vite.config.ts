/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { legalPages } from './vite-plugin-legal.ts'
import { publishedPage } from './vite-plugin-published.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  return {
    plugins: [react(), tailwindcss(), legalPages(env.VITE_CONTACT_EMAIL), publishedPage()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    build: {
      // /privacy and /terms are plain pages next to the app; dev, preview and the host serve them without .html.
      // published.html is the public timetable page, served for /<handle>/<id> (vite-plugin-published.ts).
      rolldownOptions: {
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          privacy: path.resolve(import.meta.dirname, 'privacy.html'),
          terms: path.resolve(import.meta.dirname, 'terms.html'),
          published: path.resolve(import.meta.dirname, 'published.html'),
        },
      },
    },
    test: {
      environment: 'node',
    },
  }
})
