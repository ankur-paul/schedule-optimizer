// Fills privacy.html and terms.html with the rendered policy text, in dev and in the build, so the pages need no
// JavaScript (Google's OAuth verification and crawlers fetch them).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { policyValues, renderLegal } from './src/legal/legalText.ts'

const LEGAL_DIR = path.resolve(import.meta.dirname, 'src/legal')
const PAGES: Record<string, string> = { 'privacy.html': 'privacy.md', 'terms.html': 'terms.md' }
const MARKER = '<!-- legal-text -->'

export function legalPages(contactEmail: string | undefined): Plugin {
  const values = policyValues(contactEmail)
  return {
    name: 'lattice-legal-pages',
    configResolved(config) {
      // Build only: in dev the page itself shows the fallback, and the test runner shouldn't nag.
      if (config.command === 'build' && !contactEmail?.trim()) {
        config.logger.warn('VITE_CONTACT_EMAIL is not set: /privacy and /terms will say "(contact address not set)".')
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const source = PAGES[path.basename(ctx.filename)]
        if (!source) return html
        if (!html.includes(MARKER)) throw new Error(`${ctx.filename} has no ${MARKER} marker`)
        const text = readFileSync(path.join(LEGAL_DIR, source), 'utf8')
        return html.replace(MARKER, () => renderLegal(text, values))
      },
    },
    // The markdown isn't a module, so editing it in dev needs a reload to show.
    handleHotUpdate({ file, server }) {
      if (path.dirname(file) === LEGAL_DIR && file.endsWith('.md')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}
