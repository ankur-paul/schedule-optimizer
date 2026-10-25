// Writes version.txt, the commit the build came from, into the build (T50). The deploy polls
// https://uselattice.app/version.txt until it shows the commit just pushed (scripts/smoke.sh wait-web).
import { execFileSync } from 'node:child_process'
import type { Plugin } from 'vite'
import { buildCommit } from './src/deploy/version.ts'

export function versionFile(): Plugin {
  return {
    name: 'lattice-version-file',
    apply: 'build',
    generateBundle() {
      const sha = buildCommit(process.env, () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }))
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: `${sha}\n` })
    },
  }
}
