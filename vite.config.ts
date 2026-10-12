/// <reference types="vitest/config" />
// Build and test configuration: React + Tailwind v4 plugins, and vitest in a plain Node environment
// (the domain is framework-free, so its tests need no DOM).
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the production build works on any path, including a GitHub Pages
  // project subpath (there is no client-side router, so relative asset URLs are enough).
  base: './',
  plugins: [react(), tailwindcss()],
  test: { environment: 'node' },
})
