// Lance l'API (port 3000) et le front Vite (port 5173) en parallèle.
import { spawn } from 'node:child_process'

const processes = [
  ['api', ['run', 'dev', '-w', 'apps/api']],
  ['web', ['run', 'dev', '-w', 'apps/web']],
].map(([name, args]) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const prefix = name === 'api' ? '\x1b[33m[api]\x1b[0m ' : '\x1b[36m[web]\x1b[0m '
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => process.stdout.write(chunk.toString().replace(/^(?=.)/gm, prefix)))
  }
  child.on('exit', (code) => {
    console.log(`${prefix}arrêté (code ${code})`)
    shutdown()
  })
  return child
})

function shutdown() {
  for (const child of processes) child.kill('SIGTERM')
  process.exit()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
