import { describe, expect, it } from 'vitest'
import anchorsFile from './anchors.gen.ts?raw'
import {
  HELP_PAGES,
  anchorsSource,
  escapeHtml,
  headingId,
  helpPath,
  parseHelpPage,
  pngSize,
  renderHelpPage,
  type HelpPageName,
  type ParsedHelpPage,
} from './helpText'

const sources = import.meta.glob<string>('./*.md', { query: '?raw', import: 'default', eager: true })
const htmlFiles = import.meta.glob<string>(['/help.html', '/help/*.html'], { query: '?raw', import: 'default', eager: true })
const pages = HELP_PAGES.map((name) => parseHelpPage(name, sources[`./${name}.md`]))

/** A page made up for a test, rendered against the real pages plus itself. */
function render(source: string, name: HelpPageName = 'data'): string {
  const page = parseHelpPage(name, source)
  return renderHelpPage(page, [...pages.filter((p) => p.name !== name), page])
}

describe('headingId', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(headingId('Lab batches')).toBe('lab-batches')
    expect(headingId('The Excel template and import')).toBe('the-excel-template-and-import')
  })

  it('drops apostrophes and turns other punctuation into one hyphen', () => {
    expect(headingId("Can't be built")).toBe('cant-be-built')
    expect(headingId('Couldn’t finish')).toBe('couldnt-finish')
    expect(headingId('The score: S1–S4')).toBe('the-score-s1-s4')
    expect(headingId('"Only the admin can do that"')).toBe('only-the-admin-can-do-that')
    expect(headingId('Print & CSV')).toBe('print-csv')
  })

  it('gives an empty id when nothing is left', () => {
    expect(headingId('—?!')).toBe('')
  })
})

describe('parseHelpPage', () => {
  it('reads the title and gives ## and ### headings ids from their text', () => {
    const page = parseHelpPage('data', '# Your data\n\nIntro.\n\n## Lab batches\n\n### *Batch* teachers\n')
    expect(page.title).toBe('Your data')
    expect(page.headings).toEqual([
      { depth: 2, text: 'Lab batches', id: 'lab-batches' },
      { depth: 3, text: 'Batch teachers', id: 'batch-teachers' },
    ])
  })

  it('takes an explicit {#id} and strips the marker from the output', () => {
    const html = render('# Data\n\n## Lab batches and batch teachers {#batches}\n\n## *Can’t be built* {#cant}\n')
    expect(html).toContain('<h2 id="batches">Lab batches and batch teachers</h2>')
    expect(html).toContain('<h2 id="cant"><em>Can’t be built</em></h2>')
    expect(html).not.toContain('{#')
  })

  it('throws on two headings with the same id, explicit or not', () => {
    expect(() => parseHelpPage('data', '# D\n\n## Rooms\n\n### Rooms\n')).toThrow('two headings have the id "rooms"')
    expect(() => parseHelpPage('data', '# D\n\n## Rooms\n\n## Labs {#rooms}\n')).toThrow('"rooms"')
  })

  it('throws on an id that is empty or badly formed', () => {
    expect(() => parseHelpPage('data', '# D\n\n## ???\n')).toThrow('has the id ""')
    expect(() => parseHelpPage('data', '# D\n\n## Labs {#Labs_1}\n')).toThrow('"Labs_1"')
    expect(() => parseHelpPage('data', '# D\n\n## Labs {#}\n')).toThrow('has the id ""')
  })

  it('needs one # title, first', () => {
    expect(() => parseHelpPage('data', 'Intro.\n\n## Rooms\n')).toThrow('start with a # title')
    expect(() => parseHelpPage('data', 'Intro.\n\n# Data\n')).toThrow('start with a # title')
    expect(() => parseHelpPage('data', '# Data\n\n# Again\n')).toThrow('more than one # title')
    expect(() => parseHelpPage('data', '# Data {#data}\n')).toThrow("can't set an id")
  })

  it('throws on an image without alt text and lists the ones with it', () => {
    expect(() => parseHelpPage('data', '# D\n\n![](/help/import.png)\n')).toThrow('/help/import.png has no alt text')
    expect(() => parseHelpPage('data', '# D\n\n- ![  ](/help/x.png)\n')).toThrow('no alt text')
    const page = parseHelpPage('data', '# D\n\n![The import dialog](/help/import.png)\n')
    expect(page.images).toEqual(['/help/import.png'])
    expect(renderHelpPage(page, pages)).toContain('<img src="/help/import.png" alt="The import dialog">')
  })

  it('gives an image its width and height when the size is known', () => {
    const page = parseHelpPage('data', '# D\n\n![The "Import" dialog](/help/import.png)\n\n![Other](/help/other.png)\n')
    const html = renderHelpPage(page, pages, { '/help/import.png': { width: 320, height: 180 } })
    expect(html).toContain('<img src="/help/import.png" alt="The &quot;Import&quot; dialog" width="320" height="180">')
    expect(html).toContain('<img src="/help/other.png" alt="Other">')
    // Rendering again without sizes drops them: the size isn't left behind on the parsed page.
    expect(renderHelpPage(page, pages)).toContain('alt="The &quot;Import&quot; dialog">')
  })
})

describe('pngSize', () => {
  const png = (width: number, height: number) => {
    const bytes = new Uint8Array(33)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    const view = new DataView(bytes.buffer)
    view.setUint32(16, width)
    view.setUint32(20, height)
    return bytes
  }

  it('reads the size from the header', () => {
    expect(pngSize(png(1180, 1020))).toEqual({ width: 1180, height: 1020 })
  })

  it('reads a slice of a bigger buffer', () => {
    const padded = new Uint8Array(40)
    padded.set(png(70000, 3), 4)
    expect(pngSize(padded.subarray(4))).toEqual({ width: 70000, height: 3 })
  })

  it("is null for anything that isn't a PNG", () => {
    expect(pngSize(new Uint8Array(0))).toBeNull()
    expect(pngSize(png(10, 10).subarray(0, 20))).toBeNull()
    expect(pngSize(new TextEncoder().encode('GIF89a and some more bytes here'))).toBeNull()
  })
})

describe('renderHelpPage', () => {
  it('puts the contents list of ## sections after the intro', () => {
    const html = render('# Your data\n\nIntro.\n\n## Rooms\n\n### Labs\n\n## Lunch candidates\n')
    const intro = html.indexOf('<p>Intro.</p>')
    const nav = html.indexOf('<nav class="help-contents"')
    expect(intro).toBeGreaterThan(html.indexOf('<h1>Your data</h1>'))
    expect(nav).toBeGreaterThan(intro)
    expect(nav).toBeLessThan(html.indexOf('<h2 id="rooms">'))
    expect(html).toContain('<li><a href="#rooms">Rooms</a></li><li><a href="#lunch-candidates">Lunch candidates</a></li>')
    expect(html).not.toContain('href="#labs"')
  })

  it('links back to the index from a page, not from the index', () => {
    expect(render('# D\n')).toContain('<a href="/help">Help</a>')
    expect(renderHelpPage(pages[0], pages)).not.toContain('help-crumb')
  })

  it('leaves out the contents list on a page without sections', () => {
    expect(render('# D\n\nJust text.\n')).not.toContain('help-contents')
  })

  it('escapes heading text in the contents list', () => {
    expect(render('# D\n\n## Rooms & labs < 3\n')).toContain('<a href="#rooms-labs-3">Rooms &amp; labs &lt; 3</a>')
  })

  it('accepts links to help pages and sections that exist', () => {
    const html = render('# D\n\n## Here\n\nSee [labs](/help/data#here), [generate](/help/generate#partial), [home](/help) and [up](#here).\n')
    expect(html).toContain('<a href="/help/generate#partial">generate</a>')
  })

  it('throws on a link to a missing help page or section', () => {
    expect(() => render('# D\n\n[x](/help/nope)\n')).toThrow('no help page at /help/nope')
    expect(() => render('# D\n\n[x](/help/generate#nope)\n')).toThrow("generate.md doesn't have")
    expect(() => render('# D\n\n[x](#nope)\n')).toThrow("data.md doesn't have")
    expect(() => render('# D\n\n[x](/help#nope)\n')).toThrow("index.md doesn't have")
  })

  it('leaves links outside help alone', () => {
    expect(render('# D\n\n[a](/privacy) [b](https://example.org/help/x)\n')).toContain('<a href="/privacy">a</a>')
  })

  it('lists every other page on the index with its intro and sections', () => {
    const html = renderHelpPage(pages[0], pages)
    expect(html).toContain('<h1>Help</h1>')
    for (const page of pages.slice(1)) {
      expect(html).toContain(`<h2><a href="${helpPath(page.name)}">${escapeHtml(page.title)}</a></h2>`)
      for (const h of page.headings.filter((h) => h.depth === 2)) expect(html).toContain(`href="${helpPath(page.name)}#${h.id}"`)
    }
    expect(html).not.toContain('<a href="/help/index"')
  })
})

describe('the help pages', () => {
  it.each(pages.map((p) => [p.name, p] as [string, ParsedHelpPage]))('%s.md renders with its title', (_, page) => {
    expect(page.title).not.toBe('')
    expect(renderHelpPage(page, pages)).toContain(`<h1>${escapeHtml(page.title)}</h1>`)
  })

  it('has a markdown file for every page and no stray ones', () => {
    expect(Object.keys(sources).sort()).toEqual(HELP_PAGES.map((n) => `./${n}.md`).sort())
  })

  it('has an HTML entry with the marker for every page', () => {
    const expected = HELP_PAGES.map((n) => (n === 'index' ? '/help.html' : `/help/${n}.html`))
    expect(Object.keys(htmlFiles).sort()).toEqual(expected.sort())
    for (const html of Object.values(htmlFiles)) expect(html).toContain('<!-- help-page -->')
  })

  it('anchors.gen.ts matches the headings (run `npm run dev` or `npm run build` to rewrite it)', () => {
    expect(anchorsFile).toBe(anchorsSource(pages))
  })
})

describe('helpPath', () => {
  it('serves the index at /help and the rest under it', () => {
    expect(helpPath('index')).toBe('/help')
    expect(helpPath('troubleshooting')).toBe('/help/troubleshooting')
  })
})
