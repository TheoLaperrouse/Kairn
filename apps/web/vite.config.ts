/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: { include: ['src/**/*.test.ts'] },
})
