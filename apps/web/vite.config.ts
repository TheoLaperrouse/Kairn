/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const SERVICE_WORKER = resolve(import.meta.dirname, 'service-worker.js')
const PUBLIC_DIR = resolve(import.meta.dirname, 'public')
/** Font subsets other than Latin are only downloaded if a page ever needs them. */
const SKIPPED_FONT = /-(cyrillic|greek|vietnamese)(-ext)?-/

function serviceWorkerSource(caching: boolean, precache: string[], version: string): string {
  const header = `const CACHING = ${caching}\nconst VERSION = ${JSON.stringify(version)}\nconst PRECACHE = ${JSON.stringify(precache)}\n`
  return header + readFileSync(SERVICE_WORKER, 'utf8')
}

/**
 * Emits `/sw.js` with the list of build files to precache. Its content changes with every
 * build, which is how browsers detect a new version of the app.
 */
function serviceWorker(): Plugin {
  return {
    name: 'kairn-service-worker',
    configureServer(server) {
      server.middlewares.use('/sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript')
        response.end(serviceWorkerSource(false, [], 'dev'))
      })
    },
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.html') && !file.endsWith('.map') && !SKIPPED_FONT.test(file))
      const publicFiles = readdirSync(PUBLIC_DIR).filter((file) => /\.(png|svg|webmanifest)$/.test(file))
      const precache = [...built, ...publicFiles].map((file) => `/${file}`).sort()
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(true, precache, version) })
    },
  }
}

export default defineConfig({
  plugins: [vue(), serviceWorker()],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: { include: ['src/**/*.test.ts'] },
})
