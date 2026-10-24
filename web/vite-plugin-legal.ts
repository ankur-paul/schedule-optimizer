// Fills privacy.html and terms.html with the rendered policy text, in dev and in the build, so the pages need no
// JavaScript (Google's OAuth verification and crawlers fetch them). The header, footer and reload helpers are shared
// with the help pages (vite-plugin-help.ts).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { HmrContext, Plugin } from 'vite'
import { policyValues, renderLegal } from './src/legal/legalText.ts'

const LEGAL_DIR = path.resolve(import.meta.dirname, 'src/legal')
const PAGES: Record<string, string> = { 'privacy.html': 'privacy.md', 'terms.html': 'terms.md' }
const MARKER = '<!-- legal-text -->'
const HEADER_MARKER = '<!-- page-header -->'
const FOOTER_MARKER = '<!-- page-footer -->'

/** The Lattice header with *Back to Lattice*, for the plain pages next to the app (styles in src/legal/legal.css). */
export const PAGE_HEADER = `<header class="legal-header">
  <a href="/" class="legal-brand">
    <span class="legal-tile">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <g><rect x="1" y="1" width="6" height="6" rx="1.5" /><rect x="1" y="9" width="6" height="6" rx="1.5" /><rect x="1" y="17" width="6" height="6" rx="1.5" /><rect x="9" y="17" width="6" height="6" rx="1.5" /><rect x="17" y="17" width="6" height="6" rx="1.5" /></g>
        <g fill-opacity="0.3"><rect x="9" y="1" width="6" height="6" rx="1.5" /><rect x="17" y="1" width="6" height="6" rx="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" /><rect x="17" y="9" width="6" height="6" rx="1.5" /></g>
      </svg>
    </span>
    Lattice
  </a>
  <a href="/" class="legal-back">← Back to Lattice</a>
</header>`

export const PAGE_FOOTER =
  '<footer class="legal-footer"><a href="/help">Help</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>'

/** Swaps `marker` in `html` for `text`; a page without the marker fails the build instead of shipping empty. */
export function fillMarker(html: string, marker: string, text: string, filename: string): string {
  if (!html.includes(marker)) throw new Error(`${filename} has no ${marker} marker`)
  return html.replace(marker, () => text)
}

/** The markdown isn't a module, so editing it in dev needs a full reload to show. */
export function reloadOnMarkdown(dir: string) {
  return ({ file, server }: HmrContext) => {
    if (path.dirname(file) === dir && file.endsWith('.md')) {
      server.ws.send({ type: 'full-reload' })
      return []
    }
  }
}

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
        const text = readFileSync(path.join(LEGAL_DIR, source), 'utf8')
        const filled = fillMarker(html, MARKER, renderLegal(text, values), ctx.filename)
        return fillMarker(fillMarker(filled, HEADER_MARKER, PAGE_HEADER, ctx.filename), FOOTER_MARKER, PAGE_FOOTER, ctx.filename)
      },
    },
    handleHotUpdate: reloadOnMarkdown(LEGAL_DIR),
  }
}
