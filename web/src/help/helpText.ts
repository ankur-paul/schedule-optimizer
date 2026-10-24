// Turns src/help/*.md into the static /help pages at build time (see vite-plugin-help.ts), like legalText.ts does
// for /privacy and /terms. Headings get ids the app links to through helpHref (helpLinks.ts); anchors.gen.ts lists
// them. Every check here throws, so a broken page fails `npm run build` instead of shipping.
import { Marked, type Token, type Tokens } from 'marked'

/** The pages in the order the index lists them. `index` is /help itself; the rest are /help/<page>. */
export const HELP_PAGES = ['index', 'start', 'data', 'generate', 'timetable', 'online', 'troubleshooting'] as const
export type HelpPageName = (typeof HELP_PAGES)[number]

export interface HelpHeading {
  depth: number
  /** Plain text, without markdown or the {#id} marker. */
  text: string
  id: string
}

export interface ParsedHelpPage {
  name: HelpPageName
  title: string
  /** Every `##` and deeper heading, in page order. */
  headings: HelpHeading[]
  /** Every image src, so the plugin can check the files exist. */
  images: string[]
  tokens: Token[]
}

type HeadingWithId = Tokens.Heading & { id?: string }
type ImageWithSize = Tokens.Image & { size?: ImageSize }

/** The size an image is shown at, in CSS pixels. */
export interface ImageSize {
  width: number
  height: number
}

const EXPLICIT_ID = /\s*\{#([^}]*)\}\s*$/
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function helpPath(name: HelpPageName): string {
  return name === 'index' ? '/help' : `/help/${name}`
}

/** `Lab batches` → `lab-batches`, `Can't be built` → `cant-be-built`, `S1–S4` → `s1-s4`. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function plainText(tokens: Token[]): string {
  return tokens
    .map((t) => {
      if ('tokens' in t && t.tokens) return plainText(t.tokens)
      if (t.type === 'html') return ''
      return 'text' in t ? t.text : ''
    })
    .join('')
}

const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: {
    heading(token) {
      const { id } = token as HeadingWithId
      const attr = id ? ` id="${id}"` : ''
      return `<h${token.depth}${attr}>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`
    },
    image(token) {
      const { size } = token as ImageWithSize
      if (!size) return false
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}"${title} width="${size.width}" height="${size.height}">`
    },
  },
})

/** A PNG's pixel size from its IHDR chunk, or `null` when the bytes aren't a PNG. */
export function pngSize(bytes: Uint8Array): ImageSize | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Takes `{#id}` off the end of a heading, from its text and its last inline token. */
function takeExplicitId(heading: Tokens.Heading): string | undefined {
  const match = EXPLICIT_ID.exec(heading.text)
  if (!match) return undefined
  heading.text = heading.text.slice(0, match.index)
  const last = heading.tokens.at(-1)
  if (last?.type === 'text') {
    last.text = last.text.replace(EXPLICIT_ID, '')
    last.raw = last.raw.replace(EXPLICIT_ID, '')
    if (!last.text) heading.tokens.pop()
  }
  return match[1]
}

/** Lexes one page, gives its headings ids and checks it: one `#` title first, unique ids, alt text on images. */
export function parseHelpPage(name: HelpPageName, source: string): ParsedHelpPage {
  const file = `${name}.md`
  const tokens = markdown.lexer(source)
  const headings: HelpHeading[] = []
  const images: string[] = []
  const seen = new Set<string>()
  let title: string | undefined

  markdown.walkTokens(tokens, (token) => {
    if (token.type === 'image') {
      if (!token.text.trim()) throw new Error(`${file}: the image ${token.href} has no alt text`)
      images.push(token.href)
    }
    if (token.type !== 'heading') return
    const heading = token as HeadingWithId
    const explicit = takeExplicitId(heading)
    const text = plainText(heading.tokens).trim()
    if (heading.depth === 1) {
      if (title !== undefined) throw new Error(`${file}: more than one # title`)
      if (explicit !== undefined) throw new Error(`${file}: the # title can't set an id`)
      title = text
      return
    }
    const id = explicit ?? headingId(text)
    if (!ID.test(id)) throw new Error(`${file}: "${text}" has the id "${id}"; use a-z, 0-9 and single hyphens`)
    if (seen.has(id)) throw new Error(`${file}: two headings have the id "${id}"; give one its own with {#id}`)
    seen.add(id)
    heading.id = id
    headings.push({ depth: heading.depth, text, id })
  })

  const first = tokens.find((t) => t.type !== 'space')
  if (!title || first?.type !== 'heading' || first.depth !== 1) throw new Error(`${file}: start with a # title`)
  return { name, title, headings, images, tokens }
}

/** Checks a link that points into help: the page exists, and so does the anchor on it. */
function checkLink(href: string, from: ParsedHelpPage, pages: ParsedHelpPage[]): void {
  const [pathPart, anchor] = href.split('#', 2)
  const target = pathPart === '' ? from : pages.find((p) => helpPath(p.name) === pathPart)
  if (!target) {
    if (pathPart === '/help' || pathPart.startsWith('/help/')) throw new Error(`${from.name}.md: no help page at ${href}`)
    return
  }
  if (anchor !== undefined && !target.headings.some((h) => h.id === anchor)) {
    throw new Error(`${from.name}.md: the link ${href} names a section that ${target.name}.md doesn't have`)
  }
}

function linkList(items: { href: string; text: string }[], className: string): string {
  const li = items.map((i) => `<li><a href="${i.href}">${escapeHtml(i.text)}</a></li>`).join('')
  return `<ul class="${className}">${li}</ul>`
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The text under the title, up to the first `##`: the page's one-line summary on the index. */
function leadTokens(page: ParsedHelpPage): Token[] {
  const start = page.tokens.findIndex((t) => t.type === 'heading' && t.depth === 1) + 1
  const end = page.tokens.findIndex((t) => t.type === 'heading' && t.depth === 2)
  return page.tokens.slice(start, end === -1 ? undefined : end)
}

/**
 * The page's `<main>` content. A page gets a contents list of its `##` sections after its lead text; the index gets
 * the list of pages, each with its lead and its sections. Links into /help are checked against `pages`. An image
 * found in `imageSizes` gets that width and height, so it shows at that size and the page doesn't jump as it loads.
 */
export function renderHelpPage(page: ParsedHelpPage, pages: ParsedHelpPage[], imageSizes: Record<string, ImageSize> = {}): string {
  markdown.walkTokens(page.tokens, (token) => {
    if (token.type === 'link') checkLink(token.href, page, pages)
    if (token.type === 'image') (token as ImageWithSize).size = imageSizes[token.href]
  })
  const titleAt = page.tokens.findIndex((t) => t.type === 'heading' && t.depth === 1)
  const lead = leadTokens(page)
  const rest = page.tokens.slice(titleAt + 1 + lead.length)
  const parts = [
    page.name === 'index' ? '' : `<p class="help-crumb"><a href="/help">Help</a></p>`,
    markdown.parser(page.tokens.slice(0, titleAt + 1 + lead.length)),
  ]
  if (page.name === 'index') {
    parts.push(renderIndexList(pages))
  } else {
    const sections = page.headings.filter((h) => h.depth === 2)
    if (sections.length > 0) {
      const list = linkList(sections.map((h) => ({ href: `#${h.id}`, text: h.text })), 'help-contents-list')
      parts.push(`<nav class="help-contents" aria-label="On this page"><p>On this page</p>${list}</nav>`)
    }
  }
  parts.push(markdown.parser(rest))
  return parts.join('')
}

function renderIndexList(pages: ParsedHelpPage[]): string {
  const items = pages
    .filter((p) => p.name !== 'index')
    .map((p) => {
      const href = helpPath(p.name)
      const sections = p.headings
        .filter((h) => h.depth === 2)
        .map((h) => ({ href: `${href}#${h.id}`, text: h.text }))
      return (
        `<li><h2><a href="${href}">${escapeHtml(p.title)}</a></h2>` +
        markdown.parser(leadTokens(p)) +
        (sections.length > 0 ? linkList(sections, 'help-index-sections') : '') +
        '</li>'
      )
    })
  return `<ul class="help-index">${items.join('')}</ul>`
}

/** The source of anchors.gen.ts: every page's heading ids, which type helpHref's arguments. */
export function anchorsSource(pages: ParsedHelpPage[]): string {
  const lines = pages.map((p) => {
    const ids = p.headings.map((h) => `'${h.id}'`).join(', ')
    return `  ${p.name}: [${ids}],`
  })
  return [
    '// Generated from src/help/*.md by vite-plugin-help.ts when `npm run dev` or `npm run build` starts. Do not edit.',
    'export const HELP_ANCHORS = {',
    ...lines,
    '} as const',
    '',
  ].join('\n')
}
