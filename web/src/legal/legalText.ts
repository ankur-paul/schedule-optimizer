// Turns privacy.md and terms.md into HTML at build time (see vite-plugin-legal.ts), so /privacy and /terms read
// without JavaScript. The markdown holds {{NAME}} placeholders, filled from policy.ts and VITE_CONTACT_EMAIL.
import { Marked } from 'marked'
import { OPERATOR_NAME, POLICY_EFFECTIVE_DATE, POLICY_VERSION } from './policy.ts'

export const CONTACT_FALLBACK = '(contact address not set)'

export function policyValues(contactEmail: string | undefined): Record<string, string> {
  return {
    OPERATOR_NAME,
    CONTACT_EMAIL: contactEmail?.trim() || CONTACT_FALLBACK,
    POLICY_VERSION: String(POLICY_VERSION),
    EFFECTIVE_DATE: formatDate(POLICY_EFFECTIVE_DATE),
  }
}

/** '2026-10-24' → '24 October 2026'. */
export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`Not a date: ${isoDate}`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Replaces every {{NAME}}. An unknown name throws, so a typo in the markdown fails the build. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(.*?)\}\}/g, (_, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Unknown placeholder {{${name}}}`)
    return values[name]
  })
}

// GFM gives the privacy table and turns the bare contact address into a mailto link.
const markdown = new Marked({ gfm: true, async: false })

export function renderLegal(text: string, values: Record<string, string>): string {
  return markdown.parse(fillPlaceholders(text, values)) as string
}
