import { spawnSync } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const entryPoint = fileURLToPath(
  new URL('./reported-regressions.test.ts', import.meta.url),
)
const outfile = join(tmpdir(), `auto-heading-regressions-${process.pid}.cjs`)

try {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent',
  })

  const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
} finally {
  unlinkSync(outfile)
}
