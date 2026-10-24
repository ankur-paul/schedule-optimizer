/**
 * "Learn more" at the end of a dialog's text or a hint, opening a help section in a new tab. Pass the href from
 * `helpHref` (e.g. `helpHref("online", "versions")`), so helpLinks.test.ts checks the section exists.
 */
export function LearnMore({ href, children = "Learn more" }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline">
      {children}
    </a>
  );
}
