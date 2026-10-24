import { describe, expect, it } from 'vitest'
import { helpHref } from './helpLinks'
import { HELP_PAGES, parseHelpPage } from './helpText'

describe('helpHref', () => {
  it('builds the page link, with the section when given', () => {
    expect(helpHref('index')).toBe('/help')
    expect(helpHref('data')).toBe('/help/data')
    expect(helpHref('data', 'lab-batches')).toBe('/help/data#lab-batches')
    expect(helpHref('troubleshooting', 'solver-offline')).toBe('/help/troubleshooting#solver-offline')
  })
})

// The types already refuse a wrong page or anchor. This checks the calls with plain string arguments again, against the
// headings in the markdown rather than anchors.gen.ts, so a stale generated list can't hide a broken link. Calls with
// other arguments rely on the types.
const sources = import.meta.glob<string>('./*.md', { query: '?raw', import: 'default', eager: true })
const anchors = new Map(
  HELP_PAGES.map((name) => [name as string, parseHelpPage(name, sources[`./${name}.md`]).headings.map((h) => h.id)]),
)
const sourceFiles = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/help/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const CALL = /helpHref\(\s*([^)]*)\)/g
const LITERAL_ARGS = /^'([^']*)'\s*(?:,\s*'([^']*)'\s*)?,?$/

/** Every `helpHref('page', 'anchor')` call in the app, with the file it's in. */
function calls(): { file: string; page: string; anchor?: string }[] {
  return Object.entries(sourceFiles).flatMap(([file, text]) =>
    [...text.replace(/"/g, "'").matchAll(CALL)].flatMap((m) => {
      const args = LITERAL_ARGS.exec(m[1].trim())
      return args ? [{ file, page: args[1], anchor: args[2] }] : []
    }),
  )
}

describe('help links in the app', () => {
  it('finds the calls', () => {
    expect(calls().length).toBeGreaterThan(0)
  })

  it.each(calls().map((c) => [`${c.file}: helpHref('${c.page}', '${c.anchor ?? ''}')`, c] as const))(
    '%s names a page and section that exist',
    (_, { page, anchor }) => {
      expect([...anchors.keys()]).toContain(page)
      if (anchor !== undefined) expect(anchors.get(page)).toContain(anchor)
    },
  )
})
