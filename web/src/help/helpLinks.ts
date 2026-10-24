// Every link from the app into /help goes through helpHref, so the page and section are checked: by the types,
// which come from the headings in src/help/*.md (anchors.gen.ts), and by helpLinks.test.ts.
import { HELP_ANCHORS } from './anchors.gen'

export type HelpPage = keyof typeof HELP_ANCHORS
export type HelpAnchor<P extends HelpPage> = (typeof HELP_ANCHORS)[P][number]

/** `helpHref('data', 'lab-batches')` → `/help/data#lab-batches`; `helpHref('index')` → `/help`. */
export function helpHref<P extends HelpPage>(page: P, anchor?: HelpAnchor<P>): string {
  const path = page === 'index' ? '/help' : `/help/${page}`
  return anchor ? `${path}#${anchor}` : path
}
