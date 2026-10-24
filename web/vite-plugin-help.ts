// Fills help.html and help/<page>.html with the rendered pages from src/help/*.md, in dev and in the build, so /help
// reads without JavaScript like /privacy and /terms. Also keeps src/help/anchors.gen.ts in step with the headings.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import {
  HELP_PAGES,
  anchorsSource,
  escapeHtml,
  parseHelpPage,
  pngSize,
  renderHelpPage,
  type HelpPageName,
  type ImageSize,
} from './src/help/helpText.ts'
import { PAGE_FOOTER, PAGE_HEADER, fillMarker, reloadOnMarkdown } from './vite-plugin-legal.ts'

const ROOT = import.meta.dirname
const HELP_DIR = path.resolve(ROOT, 'src/help')
const ANCHORS_FILE = path.join(HELP_DIR, 'anchors.gen.ts')
const MARKER = '<!-- help-page -->'

/** The HTML file that serves each page: help.html for /help, help/<page>.html for the rest. */
export function helpHtmlFile(name: HelpPageName): string {
  return name === 'index' ? 'help.html' : `help/${name}.html`
}

/** Build inputs for vite.config.ts: `help` and `help-<page>`. */
export function helpInputs(): Record<string, string> {
  return Object.fromEntries(
    HELP_PAGES.map((name) => [name === 'index' ? 'help' : `help-${name}`, path.resolve(ROOT, helpHtmlFile(name))]),
  )
}

function parseAll() {
  return HELP_PAGES.map((name) => parseHelpPage(name, readFileSync(path.join(HELP_DIR, `${name}.md`), 'utf8')))
}

/** Rewrites anchors.gen.ts when the headings changed; leaves it alone otherwise, so dev doesn't loop on it. */
function writeAnchors(): void {
  const source = anchorsSource(parseAll())
  if (!existsSync(ANCHORS_FILE) || readFileSync(ANCHORS_FILE, 'utf8') !== source) writeFileSync(ANCHORS_FILE, source)
}

/** `/help/` would fall through to the app; send it to `/help`, as the host does. */
const redirectTrailingSlash: Connect.NextHandleFunction = (req, res, next) => {
  const [pathname, query] = (req.url ?? '').split(/\?(.*)/s, 2)
  if (pathname !== '/help/') return next()
  res.statusCode = 301
  res.setHeader('Location', query ? `/help?${query}` : '/help')
  res.end()
}

export function helpPages(): Plugin {
  let publicDir = ''
  const reload = reloadOnMarkdown(HELP_DIR)
  return {
    name: 'lattice-help-pages',
    configResolved(config) {
      publicDir = config.publicDir
    },
    buildStart() {
      writeAnchors()
    },
    configureServer(server) {
      server.middlewares.use(redirectTrailingSlash)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirectTrailingSlash)
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const file = path.relative(ROOT, ctx.filename).split(path.sep).join('/')
        const name = HELP_PAGES.find((n) => helpHtmlFile(n) === file)
        if (!name) return html
        const pages = parseAll()
        const page = pages.find((p) => p.name === name)!
        const sizes: Record<string, ImageSize> = {}
        for (const src of page.images) {
          const file = path.join(publicDir, src)
          if (!src.startsWith('/help/') || !existsSync(file)) {
            throw new Error(`${name}.md: the image ${src} isn't in public/help/`)
          }
          // Screenshots are taken at 2× (scripts/help-shots.ts), so they show at half their pixel size.
          const size = src.endsWith('.png') ? pngSize(readFileSync(file)) : null
          if (size) sizes[src] = { width: Math.round(size.width / 2), height: Math.round(size.height / 2) }
        }
        if (!/<title>[^<]*<\/title>/.test(html)) throw new Error(`${file} has no <title>`)
        const title = page.name === 'index' ? 'Help · Lattice' : `${page.title} · Lattice Help`
        const body = `${PAGE_HEADER}\n<main class="legal help">${renderHelpPage(page, pages, sizes)}</main>\n${PAGE_FOOTER}`
        return fillMarker(html, MARKER, body, file).replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
      },
    },
    handleHotUpdate(ctx) {
      if (path.dirname(ctx.file) === HELP_DIR && ctx.file.endsWith('.md')) {
        // A half-typed heading can break the page; the reload shows the error, so don't take the dev server down.
        try {
          writeAnchors()
        } catch (error) {
          ctx.server.config.logger.error(String(error))
        }
      }
      return reload(ctx)
    },
  }
}
