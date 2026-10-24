import { describe, expect, it } from 'vitest'
import { CONTACT_FALLBACK, fillPlaceholders, formatDate, policyValues, renderLegal } from './legalText'
import { OPERATOR_NAME, POLICY_CHANGES, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from './policy'
import privacy from './privacy.md?raw'
import terms from './terms.md?raw'

const values = policyValues('privacy@example.org')

describe('fillPlaceholders', () => {
  it('replaces every placeholder, repeated ones too', () => {
    const text = '{{OPERATOR_NAME}} runs it, v{{POLICY_VERSION}} from {{EFFECTIVE_DATE}}. Mail {{CONTACT_EMAIL}} or {{CONTACT_EMAIL}}.'
    const out = fillPlaceholders(text, values)
    expect(out).toBe(
      `${OPERATOR_NAME} runs it, v${POLICY_VERSION} from ${formatDate(POLICY_EFFECTIVE_DATE)}. Mail privacy@example.org or privacy@example.org.`,
    )
    expect(out).not.toContain('{{')
  })

  it('throws on an unknown placeholder, naming it', () => {
    expect(() => fillPlaceholders('Hello {{OPERATOR}}', values)).toThrow('{{OPERATOR}}')
    expect(() => fillPlaceholders('{{ CONTACT_EMAIL }}', values)).toThrow('Unknown placeholder')
    expect(() => fillPlaceholders('{{}}', values)).toThrow('Unknown placeholder')
  })

  it("doesn't treat inherited object keys as placeholders", () => {
    expect(() => fillPlaceholders('{{toString}}', values)).toThrow('Unknown placeholder')
  })

  it('leaves text without placeholders alone', () => {
    expect(fillPlaceholders('No braces { here }', values)).toBe('No braces { here }')
  })
})

describe('policyValues', () => {
  it('fills the operator, version and a readable date', () => {
    expect(values).toEqual({
      OPERATOR_NAME,
      CONTACT_EMAIL: 'privacy@example.org',
      POLICY_VERSION: String(POLICY_VERSION),
      EFFECTIVE_DATE: formatDate(POLICY_EFFECTIVE_DATE),
    })
  })

  it('shows the fallback when the contact address is missing or blank', () => {
    expect(policyValues(undefined).CONTACT_EMAIL).toBe(CONTACT_FALLBACK)
    expect(policyValues('').CONTACT_EMAIL).toBe(CONTACT_FALLBACK)
    expect(policyValues('   ').CONTACT_EMAIL).toBe(CONTACT_FALLBACK)
  })

  it('trims the contact address', () => {
    expect(policyValues(' a@b.org ').CONTACT_EMAIL).toBe('a@b.org')
  })
})

describe('formatDate', () => {
  it('writes the day, month name and year', () => {
    expect(formatDate('2026-10-24')).toBe('24 October 2026')
    expect(formatDate('2027-01-01')).toBe('1 January 2027')
  })

  it('throws on a bad date', () => {
    expect(() => formatDate('soon')).toThrow('Not a date')
  })
})

describe('policy', () => {
  it('has a change list for every version up to the current one', () => {
    for (let v = 1; v <= POLICY_VERSION; v++) expect(POLICY_CHANGES[v]?.length).toBeGreaterThan(0)
  })
})

describe.each([
  ['privacy.md', privacy, 'Privacy Policy'],
  ['terms.md', terms, 'Terms of Use'],
])('%s', (_, text, title) => {
  const html = renderLegal(text, values)

  it('renders with its title as the heading', () => {
    expect(html).toContain(`<h1>${title}</h1>`)
    expect(html).toContain('<h2>')
  })

  it('has every placeholder filled and no open review notes', () => {
    expect(html).not.toContain('{{')
    expect(text).not.toContain('[check:')
    expect(html).toContain(`Version ${POLICY_VERSION} · effective ${formatDate(POLICY_EFFECTIVE_DATE)}`)
  })

  it('links the contact address', () => {
    expect(html).toContain('<a href="mailto:privacy@example.org">privacy@example.org</a>')
  })

  it('shows the fallback text when the contact address is not set', () => {
    expect(renderLegal(text, policyValues(undefined))).toContain(CONTACT_FALLBACK)
  })
})

describe('privacy.md', () => {
  it('renders the data table', () => {
    expect(renderLegal(privacy, values)).toMatch(/<table>[\s\S]*<th>Data<\/th>/)
  })
})

describe('terms.md', () => {
  it('links the privacy policy page', () => {
    expect(renderLegal(terms, values)).toContain('<a href="/privacy">Privacy Policy</a>')
  })
})
